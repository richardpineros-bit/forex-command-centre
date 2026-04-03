// armed-validation-gate.js v1.0.0
// Per-alert validation gate: fires when FOMO 1hr gate expires.
// Forces 3-point chart confirmation before Pre-Trade access.
// Failure path: close without confirming = failure count++.
// Two failures same pair same day = 24h pair cooldown.
(function () {
    'use strict';

    var API_URL = '/api/storage-api.php';
    var STORAGE_KEY = 'armed-validation';

    // In-memory cache of validation state
    // Shape: { date: 'YYYY-MM-DD', pairs: { 'EURUSD': { alertKey, state, failures, cooldownUntil, sl, tp } } }
    var _state = { date: '', pairs: {} };
    var _loaded = false;

    // ─── Helpers ─────────────────────────────────────────────────────────────

    function getTodayAEST() {
        var now = new Date(Date.now() + 10 * 60 * 60 * 1000);
        return now.toISOString().slice(0, 10);
    }

    function getAlertKey(pair, timestamp) {
        // Unique key per alert occurrence: pair + hour bucket of timestamp
        var ts = timestamp ? new Date(timestamp) : new Date();
        var bucket = ts.toISOString().slice(0, 13); // "2024-01-15T14"
        return pair.replace('/', '') + ':' + bucket;
    }

    // ─── Persistence ─────────────────────────────────────────────────────────

    async function loadState() {
        try {
            var r = await fetch(API_URL + '?file=' + STORAGE_KEY);
            if (!r.ok) { _loaded = true; return; }
            var result = await r.json();
            if (result.success && result.data) {
                var d = result.data;
                var today = getTodayAEST();
                if (d.date === today) {
                    _state = d;
                } else {
                    // New day - reset everything except active cooldowns
                    _state = { date: today, pairs: {} };
                    // Carry over active cooldowns from yesterday
                    if (d.pairs) {
                        var now = Date.now();
                        Object.keys(d.pairs).forEach(function (pair) {
                            var pd = d.pairs[pair];
                            if (pd.cooldownUntil && new Date(pd.cooldownUntil).getTime() > now) {
                                _state.pairs[pair] = { state: 'COOLDOWN', failures: pd.failures, cooldownUntil: pd.cooldownUntil, alertKey: pd.alertKey };
                            }
                        });
                    }
                    await saveState();
                }
            }
        } catch (e) {
            console.warn('[ValidationGate] Load failed:', e);
        }
        _loaded = true;
    }

    async function saveState() {
        try {
            await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ file: STORAGE_KEY, data: _state })
            });
        } catch (e) {
            console.warn('[ValidationGate] Save failed:', e);
        }
    }

    // ─── State accessors ─────────────────────────────────────────────────────

    function getPairState(pair) {
        return _state.pairs[pair] || null;
    }

    function isInCooldown(pair) {
        var ps = getPairState(pair);
        if (!ps || ps.state !== 'COOLDOWN') return false;
        if (!ps.cooldownUntil) return false;
        return new Date(ps.cooldownUntil).getTime() > Date.now();
    }

    function getValidationStatus(pair, alertKey) {
        if (isInCooldown(pair)) return 'COOLDOWN';
        var ps = getPairState(pair);
        if (!ps) return 'PENDING';
        // If the stored alertKey doesn't match this alert, treat as new PENDING
        if (ps.alertKey && ps.alertKey !== alertKey) return 'PENDING';
        return ps.state || 'PENDING';
    }

    function getCooldownRemaining(pair) {
        var ps = getPairState(pair);
        if (!ps || !ps.cooldownUntil) return '';
        var remainMs = new Date(ps.cooldownUntil).getTime() - Date.now();
        if (remainMs <= 0) return '';
        var remainH = Math.ceil(remainMs / (1000 * 60 * 60));
        return remainH + 'h remaining';
    }

    // ─── State mutations ─────────────────────────────────────────────────────

    async function recordFailure(pair, alertKey) {
        _state.date = getTodayAEST();
        var ps = _state.pairs[pair] || { state: 'PENDING', failures: 0, alertKey: alertKey };
        ps.alertKey = alertKey;
        ps.failures = (ps.failures || 0) + 1;
        if (ps.failures >= 2) {
            ps.state = 'COOLDOWN';
            var until = new Date(Date.now() + 24 * 60 * 60 * 1000);
            ps.cooldownUntil = until.toISOString();
            _state.pairs[pair] = ps;
            await saveState();
            // Show prominent cooldown toast
            if (typeof showToast === 'function') {
                showToast(pair + ' locked out for 24h \u2014 two validation failures today.', 'error');
            }
        } else {
            ps.state = 'PENDING';
            _state.pairs[pair] = ps;
            await saveState();
            if (typeof showToast === 'function') {
                showToast(pair + ': validation skipped. One more failure = 24h cooldown.', 'warning');
            }
        }
        reprocessBadges();
    }

    async function recordConfirm(pair, alertKey, sl, tp) {
        _state.date = getTodayAEST();
        _state.pairs[pair] = {
            alertKey: alertKey,
            state: 'CONFIRMED',
            failures: (_state.pairs[pair] || {}).failures || 0,
            sl: sl,
            tp: tp,
            confirmedAt: new Date().toISOString()
        };
        await saveState();
        reprocessBadges();
        if (typeof showToast === 'function') {
            showToast(pair + ' validated \u2014 Pre-Trade unlocked.', 'success');
        }
        // Auto-navigate to Pre-Trade tab
        var preTadeBtn = document.querySelector('[data-tab="pre-trade"], [onclick*="pre-trade"], #tab-pre-trade');
        if (preTadeBtn && typeof preTadeBtn.click === 'function') preTadeBtn.click();
    }

    async function recordPass(pair, alertKey) {
        _state.date = getTodayAEST();
        var existing = _state.pairs[pair] || {};
        _state.pairs[pair] = {
            alertKey: alertKey,
            state: 'PASSED',
            failures: existing.failures || 0,
            passedAt: new Date().toISOString()
        };
        await saveState();
        reprocessBadges();
        if (typeof showToast === 'function') {
            showToast(pair + ': alert passed \u2014 no setup present. Pair remains tradeable.', 'info');
        }
    }

    // ─── Badge injection ─────────────────────────────────────────────────────

    function reprocessBadges() {
        if (!_loaded) return;
        var list = document.getElementById('armed-list');
        if (!list) return;

        // Find all active armed rows (not watchlist/dismissed)
        var rows = list.querySelectorAll('.armed-pair-row.armed-row-link');
        rows.forEach(function (row) {
            var wrapper = row.closest('.armed-pair-wrapper');
            if (!wrapper) return;

            // Skip watchlist items (no dismiss button = watchlist)
            var dismissBtn = wrapper.querySelector('.armed-dismiss-btn');
            if (!dismissBtn) return;

            var pairEl = row.querySelector('.armed-pair-name');
            if (!pairEl) return;
            var pair = pairEl.textContent.trim();

            var ageEl = row.querySelector('.armed-age');
            if (!ageEl) return;

            // Only intercept READY badges (not FOMO countdown, AGEING, EXPIRED)
            var readyBadge = ageEl.querySelector('.armed-ttl-fresh');
            if (!readyBadge) return;

            // Get alert key from data attribute (set by us below) or from armed data
            var alertKey = ageEl.dataset.alertKey || '';
            if (!alertKey) {
                // Try to resolve from _lastArmedData
                var armed = window._lastArmedData;
                if (armed && armed.pairs) {
                    var pd = armed.pairs.find(function (p) { return p.pair === pair; });
                    if (pd) {
                        alertKey = getAlertKey(pair, pd.timestamp);
                        ageEl.dataset.alertKey = alertKey;
                    }
                }
            }

            var status = getValidationStatus(pair, alertKey);
            injectStatusBadge(ageEl, pair, alertKey, status);
        });
    }

    function injectStatusBadge(ageEl, pair, alertKey, status) {
        var existing = ageEl.querySelector('.vgate-badge, .vgate-btn');
        if (existing) {
            // Update existing if status changed
            if (existing.dataset.vgateStatus === status) return;
            existing.remove();
        }

        var readyBadge = ageEl.querySelector('.armed-ttl-fresh');
        if (!readyBadge) return; // FOMO or other state - don't interfere

        if (status === 'CONFIRMED') {
            readyBadge.style.display = 'none';
            var badge = document.createElement('span');
            badge.className = 'vgate-badge';
            badge.dataset.vgateStatus = 'CONFIRMED';
            badge.style.cssText = 'background:var(--color-pass);color:#000;font-size:0.62rem;font-weight:700;padding:2px 6px;border-radius:3px;cursor:default;';
            badge.title = 'Validated \u2014 Pre-Trade unlocked';
            badge.innerHTML = '&#x2714; VALID';
            ageEl.appendChild(badge);
        } else if (status === 'PASSED') {
            readyBadge.style.display = 'none';
            var badge2 = document.createElement('span');
            badge2.className = 'vgate-badge';
            badge2.dataset.vgateStatus = 'PASSED';
            badge2.style.cssText = 'background:var(--bg-tertiary);color:var(--text-muted);font-size:0.62rem;font-weight:700;padding:2px 6px;border-radius:3px;cursor:default;border:1px solid var(--border-primary);';
            badge2.title = 'Alert passed \u2014 no valid setup identified';
            badge2.textContent = 'PASSED';
            ageEl.appendChild(badge2);
        } else if (status === 'COOLDOWN') {
            readyBadge.style.display = 'none';
            var badge3 = document.createElement('span');
            badge3.className = 'vgate-badge';
            badge3.dataset.vgateStatus = 'COOLDOWN';
            var rem = getCooldownRemaining(pair);
            badge3.style.cssText = 'background:var(--color-fail);color:#fff;font-size:0.62rem;font-weight:700;padding:2px 6px;border-radius:3px;cursor:default;';
            badge3.title = '24h cooldown \u2014 two validation failures today. ' + rem;
            badge3.textContent = 'COOLDOWN';
            ageEl.appendChild(badge3);
        } else {
            // PENDING - replace READY with VALIDATE button
            readyBadge.style.display = 'none';
            var btn = document.createElement('button');
            btn.className = 'vgate-btn';
            btn.dataset.vgateStatus = 'PENDING';
            btn.style.cssText = 'background:#f97316;color:#000;font-size:0.62rem;font-weight:700;padding:3px 7px;border-radius:3px;border:none;cursor:pointer;white-space:nowrap;';
            btn.title = 'FOMO gate expired \u2014 validate your setup before Pre-Trade';
            btn.textContent = 'VALIDATE \u2192';
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                e.preventDefault();
                openModal(pair, alertKey);
            });
            ageEl.appendChild(btn);
        }
    }

    // ─── Modal ───────────────────────────────────────────────────────────────

    function buildModalHTML() {
        return '<div id="vgate-overlay" style="' +
            'position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:9999;' +
            'display:flex;align-items:center;justify-content:center;padding:16px;">' +
            '<div id="vgate-card" style="' +
            'background:var(--bg-secondary);border:1px solid var(--border-primary);' +
            'border-radius:8px;max-width:520px;width:100%;padding:0;overflow:hidden;' +
            'box-shadow:0 20px 60px rgba(0,0,0,0.5);">' +

            // Header
            '<div id="vgate-header" style="' +
            'background:var(--bg-tertiary);border-bottom:2px solid #f97316;' +
            'padding:14px 18px;display:flex;align-items:center;justify-content:space-between;">' +
            '<div>' +
            '<div style="font-size:0.65rem;color:#f97316;font-weight:700;letter-spacing:0.08em;margin-bottom:2px;">VALIDATION GATE</div>' +
            '<div id="vgate-title" style="font-size:1rem;font-weight:700;color:var(--text-primary);">-</div>' +
            '</div>' +
            '<button id="vgate-close" style="' +
            'background:none;border:none;color:var(--text-muted);font-size:1.2rem;cursor:pointer;padding:4px 8px;' +
            'border-radius:4px;" title="Close (counts as failure)">&#x2716;</button>' +
            '</div>' +

            // Warning
            '<div style="background:#431407;border-bottom:1px solid #f97316;padding:10px 18px;">' +
            '<p style="margin:0;font-size:0.75rem;color:#fdba74;line-height:1.5;">' +
            '&#x26A0; FOMO gate has expired. Your brain is now primed to see setups that may not exist. ' +
            'Answer the three questions below based only on what you can see <strong>right now</strong> on the chart. ' +
            'Closing this window without confirming counts as a failure.' +
            '</p>' +
            '</div>' +

            // Body
            '<div style="padding:18px;">' +

            // Check 1
            '<label style="display:flex;align-items:flex-start;gap:12px;margin-bottom:16px;cursor:pointer;">' +
            '<input type="checkbox" id="vgate-check1" style="margin-top:3px;width:16px;height:16px;flex-shrink:0;">' +
            '<div>' +
            '<div style="font-size:0.8rem;font-weight:700;color:var(--text-primary);margin-bottom:2px;">' +
            'Price is currently AT my entry zone</div>' +
            '<div style="font-size:0.7rem;color:var(--text-muted);">' +
            'Not heading towards it, not close to it \u2014 actually at it right now.</div>' +
            '</div>' +
            '</label>' +

            // Check 2
            '<label style="display:flex;align-items:flex-start;gap:12px;margin-bottom:16px;cursor:pointer;">' +
            '<input type="checkbox" id="vgate-check2" style="margin-top:3px;width:16px;height:16px;flex-shrink:0;">' +
            '<div>' +
            '<div style="font-size:0.8rem;font-weight:700;color:var(--text-primary);margin-bottom:2px;">' +
            'EMA structure is confirmed LIVE on the chart</div>' +
            '<div style="font-size:0.7rem;color:var(--text-muted);">' +
            '9/21/50 alignment is present right now \u2014 not predicted, not historical.</div>' +
            '</div>' +
            '</label>' +

            // Check 3 with SL/TP fields
            '<label style="display:flex;align-items:flex-start;gap:12px;margin-bottom:10px;cursor:pointer;">' +
            '<input type="checkbox" id="vgate-check3" style="margin-top:3px;width:16px;height:16px;flex-shrink:0;">' +
            '<div style="flex:1;">' +
            '<div style="font-size:0.8rem;font-weight:700;color:var(--text-primary);margin-bottom:2px;">' +
            'I can state my exact levels right now</div>' +
            '<div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:8px;">' +
            'Before looking at any entry form, I know my stop and target.</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">' +
            '<div>' +
            '<div style="font-size:0.65rem;color:var(--text-muted);margin-bottom:3px;">Stop Loss</div>' +
            '<input id="vgate-sl" type="text" placeholder="e.g. 1.08420" style="' +
            'width:100%;background:var(--bg-tertiary);border:1px solid var(--border-primary);' +
            'color:var(--text-primary);padding:6px 8px;border-radius:4px;font-size:0.8rem;box-sizing:border-box;">' +
            '</div>' +
            '<div>' +
            '<div style="font-size:0.65rem;color:var(--text-muted);margin-bottom:3px;">Take Profit</div>' +
            '<input id="vgate-tp" type="text" placeholder="e.g. 1.09150" style="' +
            'width:100%;background:var(--bg-tertiary);border:1px solid var(--border-primary);' +
            'color:var(--text-primary);padding:6px 8px;border-radius:4px;font-size:0.8rem;box-sizing:border-box;">' +
            '</div>' +
            '</div>' +
            '</div>' +
            '</label>' +

            // Validation error
            '<div id="vgate-error" style="display:none;background:#431407;border:1px solid var(--color-fail);' +
            'border-radius:4px;padding:8px 12px;margin-bottom:12px;font-size:0.75rem;color:#fca5a5;"></div>' +

            // Buttons
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:16px;">' +

            '<button id="vgate-pass-btn" style="' +
            'background:var(--bg-tertiary);border:1px solid var(--border-primary);' +
            'color:var(--text-secondary);padding:10px 12px;border-radius:5px;' +
            'font-size:0.75rem;font-weight:600;cursor:pointer;line-height:1.3;' +
            'text-align:center;">' +
            '&#x23F8; NO VALID SETUP<br>' +
            '<span style="font-size:0.65rem;font-weight:400;color:var(--text-muted);">Pass this alert \u2014 no penalty</span>' +
            '</button>' +

            '<button id="vgate-confirm-btn" style="' +
            'background:#16a34a;border:none;color:#fff;padding:10px 12px;border-radius:5px;' +
            'font-size:0.75rem;font-weight:700;cursor:pointer;line-height:1.3;' +
            'text-align:center;opacity:0.5;" disabled>' +
            '&#x2714; CONFIRM &#x2014; UNLOCK PRE-TRADE<br>' +
            '<span style="font-size:0.65rem;font-weight:400;">All 3 checks + levels required</span>' +
            '</button>' +

            '</div>' +
            '</div>' + // body
            '</div>' + // card
            '</div>'; // overlay
    }

    var _currentPair = null;
    var _currentAlertKey = null;

    function openModal(pair, alertKey) {
        if (document.getElementById('vgate-overlay')) return; // already open
        _currentPair = pair;
        _currentAlertKey = alertKey;

        var container = document.createElement('div');
        container.innerHTML = buildModalHTML();
        document.body.appendChild(container.firstElementChild);

        // Populate title
        var title = document.getElementById('vgate-title');
        if (title) {
            // Get direction from armed data
            var dir = '';
            if (window._lastArmedData && window._lastArmedData.pairs) {
                var pd = window._lastArmedData.pairs.find(function (p) { return p.pair === pair; });
                if (pd) dir = ' \u2014 ' + (pd.direction || '').toUpperCase();
            }
            title.textContent = pair + dir;
        }

        // Wire checkboxes to enable confirm button
        var checks = ['vgate-check1', 'vgate-check2', 'vgate-check3'];
        var slEl = document.getElementById('vgate-sl');
        var tpEl = document.getElementById('vgate-tp');
        var confirmBtn = document.getElementById('vgate-confirm-btn');

        function updateConfirmState() {
            var allChecked = checks.every(function (id) {
                var el = document.getElementById(id);
                return el && el.checked;
            });
            var slFilled = slEl && slEl.value.trim().length > 0;
            var tpFilled = tpEl && tpEl.value.trim().length > 0;
            var ready = allChecked && slFilled && tpFilled;
            confirmBtn.disabled = !ready;
            confirmBtn.style.opacity = ready ? '1' : '0.5';
        }

        checks.forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.addEventListener('change', updateConfirmState);
        });
        if (slEl) slEl.addEventListener('input', updateConfirmState);
        if (tpEl) tpEl.addEventListener('input', updateConfirmState);

        // Close = failure
        document.getElementById('vgate-close').addEventListener('click', function () {
            closeModal();
            recordFailure(_currentPair, _currentAlertKey);
        });

        // Block overlay click-outside (no escape route)
        document.getElementById('vgate-overlay').addEventListener('click', function (e) {
            if (e.target === this) {
                showModalError('There is no escape route. Confirm your setup, pass the alert, or close with the X button (counts as failure).');
            }
        });

        // Pass button
        document.getElementById('vgate-pass-btn').addEventListener('click', function () {
            closeModal();
            recordPass(_currentPair, _currentAlertKey);
        });

        // Confirm button
        confirmBtn.addEventListener('click', function () {
            var sl = slEl ? slEl.value.trim() : '';
            var tp = tpEl ? tpEl.value.trim() : '';
            closeModal();
            recordConfirm(_currentPair, _currentAlertKey, sl, tp);
        });
    }

    function showModalError(msg) {
        var el = document.getElementById('vgate-error');
        if (!el) return;
        el.textContent = msg;
        el.style.display = 'block';
        setTimeout(function () { el.style.display = 'none'; }, 4000);
    }

    function closeModal() {
        var overlay = document.getElementById('vgate-overlay');
        if (overlay) overlay.remove();
        _currentPair = null;
        _currentAlertKey = null;
    }

    // ─── MutationObserver ─────────────────────────────────────────────────────

    function observeArmedList() {
        var list = document.getElementById('armed-list');
        if (!list) {
            setTimeout(observeArmedList, 500);
            return;
        }
        var observer = new MutationObserver(function () {
            // Slight delay to let armed-panel finish rendering
            setTimeout(reprocessBadges, 50);
        });
        observer.observe(list, { childList: true, subtree: false });
    }

    // ─── Init ─────────────────────────────────────────────────────────────────

    loadState().then(function () {
        observeArmedList();
        // Process immediately - armed-panel may have already rendered before we loaded
        reprocessBadges();
        // Re-process every 60s for cooldown countdown updates
        setInterval(reprocessBadges, 60000);
    });

    // Expose for debugging
    window.ValidationGate = {
        getState: function () { return _state; },
        reprocess: reprocessBadges,
        openModal: openModal
    };

})();
