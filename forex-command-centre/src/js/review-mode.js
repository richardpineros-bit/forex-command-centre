/**
 * ReviewMode — Side-panel trade reviewer
 * Forex Command Centre v5.7.0
 *
 * Reads from the same ftcc_trades localStorage key as journal-crud.
 * Writes grade, notes, lessons back to the same store via ServerStorage
 * (falls back to direct localStorage if ServerStorage unavailable).
 *
 * Public API:
 *   ReviewMode.open()               — open panel (all trades, no filter)
 *   ReviewMode.close()              — close panel
 *   ReviewMode.openFromTrade(id)    — open positioned at a specific trade
 *   ReviewMode.buildExpandHTML(t)   — returns expand-row inner HTML for a trade
 */
var ReviewMode = (function () {
    'use strict';

    var STORAGE_KEY = 'ftcc_trades';
    var GRADES = ['A+', 'A', 'B+', 'B', 'C', 'DIS'];
    var FILTERS = [
        { key: 'all',       label: 'All' },
        { key: 'ungraded',  label: 'Ungraded' },
        { key: 'win',       label: 'Wins' },
        { key: 'loss',      label: 'Losses' },
    ];

    /* Internal state */
    var _trades    = [];
    var _idx       = 0;
    var _filter    = 'all';
    var _dirty     = false;
    var _pendingGrade = null;
    var _pendingNotes = null;
    var _pendingLessons = null;

    /* =========================================
       INIT — build overlay DOM once
       ========================================= */
    function _ensureDOM() {
        if (document.getElementById('review-mode-overlay')) return;

        var html =
            '<div id="review-mode-overlay">' +
            '<div class="rm-panel">' +

            /* Header */
            '<div class="rm-header">' +
                '<div>' +
                    '<div class="rm-header-title">&#x1F4CB; Review Mode' +
                        '<span class="rm-dirty-dot" id="rm-dirty-dot"></span>' +
                    '</div>' +
                    '<div class="rm-header-subtitle" id="rm-header-sub">Post-session trade review</div>' +
                '</div>' +
                '<button class="rm-close-btn" onclick="ReviewMode.close()" title="Close">&#x2715;</button>' +
            '</div>' +

            /* Navigation */
            '<div class="rm-nav">' +
                '<button class="rm-nav-btn" id="rm-prev-btn" onclick="ReviewMode.prev()">&#x25C0; Prev</button>' +
                '<div class="rm-nav-counter" id="rm-counter">0 / 0</div>' +
                '<button class="rm-nav-btn" id="rm-next-btn" onclick="ReviewMode.next()">Next &#x25B6;</button>' +
            '</div>' +

            /* Filter chips */
            '<div class="rm-filter-row" id="rm-filter-row"></div>' +

            /* Body */
            '<div class="rm-body" id="rm-body"></div>' +

            /* Footer */
            '<div class="rm-footer">' +
                '<button class="rm-edit-full-btn" id="rm-full-edit-btn" onclick="ReviewMode.openFullEdit()">&#x270E; Full Edit</button>' +
                '<button class="rm-save-btn" onclick="ReviewMode.save()">&#x2713; Save</button>' +
            '</div>' +

            '</div>' + /* .rm-panel */
            '</div>';  /* #review-mode-overlay */

        document.body.insertAdjacentHTML('beforeend', html);

        /* Close on backdrop click */
        document.getElementById('review-mode-overlay').addEventListener('click', function (e) {
            if (e.target === this) ReviewMode.close();
        });

        /* Build filter chips */
        var filterRow = document.getElementById('rm-filter-row');
        FILTERS.forEach(function (f) {
            var btn = document.createElement('button');
            btn.className = 'rm-filter-chip' + (f.key === _filter ? ' active' : '');
            btn.textContent = f.label;
            btn.dataset.filter = f.key;
            btn.onclick = function () { ReviewMode.onFilterChange(f.key); };
            filterRow.appendChild(btn);
        });
    }

    /* =========================================
       DATA HELPERS
       ========================================= */
    function _loadAll() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        } catch (e) {
            return [];
        }
    }

    function _applyFilter(trades) {
        switch (_filter) {
            case 'ungraded':
                return trades.filter(function (t) { return !t.grade; });
            case 'win':
                return trades.filter(function (t) { return (t.rMultiple || t.rValue || 0) > 0; });
            case 'loss':
                return trades.filter(function (t) { return (t.rMultiple || t.rValue || 0) < 0; });
            default:
                return trades;
        }
    }

    function _refreshTrades() {
        var all = _loadAll();
        /* Reverse-chronological — newest first */
        all.sort(function (a, b) {
            return new Date(b.date || 0) - new Date(a.date || 0);
        });
        _trades = _applyFilter(all);
    }

    function _currentTrade() {
        return _trades[_idx] || null;
    }

    /* =========================================
       FORMATTERS
       ========================================= */
    function _fDate(val) {
        if (!val) return '—';
        try {
            var d = new Date(val);
            return ('0' + d.getDate()).slice(-2) + '/' +
                   ('0' + (d.getMonth() + 1)).slice(-2) + '/' +
                   String(d.getFullYear()).slice(-2) + ' ' +
                   ('0' + d.getHours()).slice(-2) + ':' +
                   ('0' + d.getMinutes()).slice(-2);
        } catch (e) { return String(val); }
    }

    function _fNum(val, dp) {
        var n = parseFloat(val);
        return isNaN(n) ? '—' : n.toFixed(dp !== undefined ? dp : 2);
    }

    function _dirClass(t) {
        var d = (t.direction || '').toLowerCase();
        if (d === 'long'  || d === 'buy')  return 'long';
        if (d === 'short' || d === 'sell') return 'short';
        return '';
    }

    function _rClass(r) {
        if (r > 0)  return 'win';
        if (r < 0)  return 'loss';
        return 'be';
    }

    /* =========================================
       RENDER
       ========================================= */
    function _render() {
        _ensureDOM();
        var t = _currentTrade();
        var body = document.getElementById('rm-body');
        var counter = document.getElementById('rm-counter');
        var prevBtn = document.getElementById('rm-prev-btn');
        var nextBtn = document.getElementById('rm-next-btn');
        var dirty   = document.getElementById('rm-dirty-dot');
        var sub     = document.getElementById('rm-header-sub');

        /* Nav state */
        counter.textContent = _trades.length === 0 ? '—' : (_idx + 1) + ' / ' + _trades.length;
        prevBtn.disabled = (_idx <= 0);
        nextBtn.disabled = (_idx >= _trades.length - 1);

        /* Dirty dot */
        if (dirty) {
            dirty.classList.toggle('visible', _dirty);
        }

        /* Subtitle */
        var ungradedCount = _loadAll().filter(function (x) { return !x.grade; }).length;
        sub.textContent = ungradedCount > 0
            ? ungradedCount + ' trade' + (ungradedCount > 1 ? 's' : '') + ' ungraded'
            : 'All trades reviewed';

        /* Filter chips */
        document.querySelectorAll('.rm-filter-chip').forEach(function (el) {
            el.classList.toggle('active', el.dataset.filter === _filter);
        });

        if (!t) {
            body.innerHTML = '<div class="rm-empty">No trades match this filter.</div>';
            return;
        }

        var rVal = parseFloat(t.rMultiple || t.rValue || 0);
        var dirCls = _dirClass(t);
        var dirLabel = dirCls === 'long' ? 'LONG' : dirCls === 'short' ? 'SHORT' : (t.direction || '—').toUpperCase();

        /* Grade buttons */
        var gradeBtns = GRADES.map(function (g) {
            var sel = (_pendingGrade !== null ? _pendingGrade : (t.grade || '')) === g;
            return '<button class="rm-grade-btn' + (sel ? ' selected' : '') + '" data-grade="' + g + '" onclick="ReviewMode._selectGrade(\'' + g + '\')">' + g + '</button>';
        }).join('');

        body.innerHTML =

            /* ---- Hero ---- */
            '<div class="rm-trade-hero">' +
                '<div class="rm-trade-hero-header">' +
                    '<span class="rm-pair">' + (t.pair || '—') + '</span>' +
                    '<span class="rm-dir-badge ' + dirCls + '">' + dirLabel + '</span>' +
                    '<span class="rm-date">' + _fDate(t.date) + '</span>' +
                '</div>' +
                '<div class="rm-stats-grid">' +
                    '<div class="rm-stat"><div class="rm-stat-label">R Multiple</div><div class="rm-stat-value ' + _rClass(rVal) + '">' + _fNum(rVal) + 'R</div></div>' +
                    '<div class="rm-stat"><div class="rm-stat-label">Entry</div><div class="rm-stat-value">' + (t.entry || '—') + '</div></div>' +
                    '<div class="rm-stat"><div class="rm-stat-label">Exit</div><div class="rm-stat-value">' + (t.exit || t.exitPrice || '—') + '</div></div>' +
                    '<div class="rm-stat"><div class="rm-stat-label">UTCC Score</div><div class="rm-stat-value">' + (t.trendScore || '—') + '</div></div>' +
                    '<div class="rm-stat"><div class="rm-stat-label">Zone</div><div class="rm-stat-value">' + (t.entryZone || '—') + '</div></div>' +
                    '<div class="rm-stat"><div class="rm-stat-label">Struct</div><div class="rm-stat-value">' + (t.structExt || t.struct_ext || '—') + '</div></div>' +
                '</div>' +
            '</div>' +

            /* ---- Context ---- */
            '<div class="rm-section">' +
                '<div class="rm-section-title">Context</div>' +
                _fieldRow('Session',    t.session)       +
                _fieldRow('Regime',     t.marketRegime)  +
                _fieldRow('Playbook',   t.playbook)      +
                _fieldRow('Alert Tier', t.alertType)     +
                _fieldRow('Permission', t.permissionState) +
            '</div>' +

            /* ---- Levels ---- */
            '<div class="rm-section">' +
                '<div class="rm-section-title">Levels</div>' +
                _fieldRow('Stop Loss', t.stopLoss || t.sl) +
                _fieldRow('Take Profit', t.takeProfit || t.tp) +
                _fieldRow('Risk Amount', t.riskAmount ? '$' + _fNum(t.riskAmount) : null) +
                _fieldRow('Slippage', t.slippage != null ? t.slippage + ' pips' : null) +
            '</div>' +

            /* ---- Grading ---- */
            '<div class="rm-section">' +
                '<div class="rm-section-title">Grade</div>' +
                '<div class="rm-grade-row">' + gradeBtns + '</div>' +
            '</div>' +

            /* ---- Notes ---- */
            '<div class="rm-section">' +
                '<div class="rm-section-title">Setup Notes</div>' +
                '<div class="rm-textarea-wrapper">' +
                    '<textarea class="rm-textarea" id="rm-notes-ta" oninput="ReviewMode._markDirty()" rows="3">' +
                        _esc(_pendingNotes !== null ? _pendingNotes : (t.notes || '')) +
                    '</textarea>' +
                '</div>' +
            '</div>' +

            /* ---- Lessons ---- */
            '<div class="rm-section">' +
                '<div class="rm-section-title">Lessons Learned</div>' +
                '<div class="rm-textarea-wrapper">' +
                    '<textarea class="rm-textarea" id="rm-lessons-ta" oninput="ReviewMode._markDirty()" rows="3">' +
                        _esc(_pendingLessons !== null ? _pendingLessons : (t.lessons || t.lessonsLearned || '')) +
                    '</textarea>' +
                '</div>' +
            '</div>' +

            /* ---- Review stamp ---- */
            (t.reviewedAt
                ? '<div class="rm-section"><div class="rm-field-row"><span class="rm-field-label">Last Reviewed</span><span class="rm-field-value">' + _fDate(t.reviewedAt) + '</span></div></div>'
                : '');
    }

    function _fieldRow(label, val) {
        var empty = !val;
        return '<div class="rm-field-row">' +
            '<span class="rm-field-label">' + label + '</span>' +
            '<span class="rm-field-value' + (empty ? ' empty' : '') + '">' + (val || 'Not set') + '</span>' +
        '</div>';
    }

    function _esc(s) {
        return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    /* =========================================
       PUBLIC ACTIONS
       ========================================= */
    function open() {
        _ensureDOM();
        _dirty = false;
        _pendingGrade = null;
        _pendingNotes = null;
        _pendingLessons = null;
        _refreshTrades();
        if (_idx >= _trades.length) _idx = Math.max(0, _trades.length - 1);
        _render();
        document.getElementById('review-mode-overlay').classList.add('rm-open');
        document.body.style.overflow = 'hidden';
    }

    function close() {
        if (_dirty) {
            if (!confirm('You have unsaved changes. Discard them?')) return;
        }
        var overlay = document.getElementById('review-mode-overlay');
        if (overlay) overlay.classList.remove('rm-open');
        document.body.style.overflow = '';
        _dirty = false;
        _pendingGrade = null;
        _pendingNotes = null;
        _pendingLessons = null;
    }

    function prev() {
        if (_dirty && !_confirmDiscard()) return;
        _clearPending();
        if (_idx > 0) { _idx--; _render(); }
    }

    function next() {
        if (_dirty && !_confirmDiscard()) return;
        _clearPending();
        if (_idx < _trades.length - 1) { _idx++; _render(); }
    }

    function _confirmDiscard() {
        var ok = confirm('Unsaved changes will be lost. Continue?');
        return ok;
    }

    function _clearPending() {
        _dirty = false;
        _pendingGrade = null;
        _pendingNotes = null;
        _pendingLessons = null;
    }

    function save() {
        var t = _currentTrade();
        if (!t) return;

        /* Read current textarea values */
        var notesTa   = document.getElementById('rm-notes-ta');
        var lessonsTa = document.getElementById('rm-lessons-ta');

        var grade   = _pendingGrade   !== null ? _pendingGrade   : (t.grade || null);
        var notes   = notesTa   ? notesTa.value   : (_pendingNotes !== null ? _pendingNotes : (t.notes || ''));
        var lessons = lessonsTa ? lessonsTa.value : (_pendingLessons !== null ? _pendingLessons : (t.lessons || ''));

        /* Write back to full trades array */
        var all = _loadAll();
        var found = false;
        for (var i = 0; i < all.length; i++) {
            if (all[i].id === t.id) {
                all[i].grade          = grade;
                all[i].notes          = notes;
                all[i].lessons        = lessons;
                all[i].lessonsLearned = lessons;
                all[i].reviewedAt     = new Date().toISOString();
                found = true;
                break;
            }
        }

        if (!found) {
            console.warn('[ReviewMode] Trade not found in store:', t.id);
            return;
        }

        /* Persist — try ServerStorage first, fall back to localStorage */
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
        } catch (e) {
            console.error('[ReviewMode] localStorage write failed:', e);
            return;
        }

        /* Also push to ServerStorage if available */
        if (typeof ServerStorage !== 'undefined' && ServerStorage.set) {
            try { ServerStorage.set(STORAGE_KEY, all); } catch (e) { /* non-fatal */ }
        }

        /* Reload & re-render */
        _clearPending();
        _refreshTrades();
        /* Try to stay on same trade */
        var newIdx = _trades.findIndex(function (x) { return x.id === t.id; });
        _idx = newIdx >= 0 ? newIdx : Math.min(_idx, _trades.length - 1);
        _render();

        /* Notify other modules */
        if (typeof loadTrades === 'function') { try { loadTrades(); } catch (e) {} }

        /* Toast */
        if (typeof showToast === 'function') {
            showToast('Trade review saved', 'success');
        }
    }

    function onFilterChange(key) {
        if (_dirty && !_confirmDiscard()) return;
        _clearPending();
        _filter = key;
        _idx = 0;
        _refreshTrades();
        _render();
    }

    function openFullEdit() {
        var t = _currentTrade();
        if (!t) return;
        close();
        if (typeof editTrade === 'function') {
            setTimeout(function () { editTrade(t.id); }, 50);
        }
    }

    function openFromTrade(tradeId) {
        open();
        var pos = _trades.findIndex(function (t) { return t.id === tradeId; });
        if (pos >= 0) { _idx = pos; _render(); }
    }

    /* Called by grade buttons rendered inside body */
    function _selectGrade(g) {
        _pendingGrade = g;
        _dirty = true;
        /* Re-render grade row only */
        var gradeRow = document.querySelector('.rm-grade-row');
        if (!gradeRow) return;
        gradeRow.querySelectorAll('.rm-grade-btn').forEach(function (btn) {
            btn.classList.toggle('selected', btn.dataset.grade === g);
        });
        var dot = document.getElementById('rm-dirty-dot');
        if (dot) dot.classList.add('visible');
    }

    function _markDirty() {
        _dirty = true;
        var dot = document.getElementById('rm-dirty-dot');
        if (dot) dot.classList.add('visible');
    }

    /* =========================================
       EXPAND ROW HTML (used by journal-crud)
       ========================================= */
    function buildExpandHTML(trade) {
        var t = trade;
        var rVal  = parseFloat(t.rMultiple || t.rValue || 0);

        function cell(label, val) {
            var empty = !val;
            return '<div class="trade-expand-cell">' +
                '<div class="trade-expand-label">' + label + '</div>' +
                '<div class="trade-expand-value' + (empty ? ' empty' : '') + '">' + (val || '—') + '</div>' +
            '</div>';
        }

        return '<div class="trade-expand-inner">' +
            cell('Session',      t.session)           +
            cell('Regime',       t.marketRegime)      +
            cell('Playbook',     t.playbook)          +
            cell('Permission',   t.permissionState)   +
            cell('UTCC Score',   t.trendScore)        +
            cell('Zone',         t.entryZone)         +
            cell('Struct',       t.structExt || t.struct_ext) +
            cell('Alert Tier',   t.alertType)         +
            cell('Stop Loss',    t.stopLoss || t.sl)  +
            cell('Take Profit',  t.takeProfit || t.tp)+
            cell('Risk Amt',     t.riskAmount ? '$' + parseFloat(t.riskAmount).toFixed(2) : null) +
            cell('Slippage',     t.slippage != null && t.slippage !== '' ? t.slippage + ' pips' : null) +
            cell('Notes',        t.notes ? t.notes.substring(0, 80) + (t.notes.length > 80 ? '...' : '') : null) +
            cell('Lessons',      (t.lessons || t.lessonsLearned) ? (t.lessons || t.lessonsLearned).substring(0, 80) : null) +

            /* Actions row */
            '<div class="trade-expand-actions">' +
                '<button class="rm-launch-btn" onclick="ReviewMode.openFromTrade(\'' + t.id + '\')">&#x1F50D; Review Mode</button>' +
                '<button class="rm-edit-btn"   onclick="editTrade(\'' + t.id + '\')">&#x270E; Full Edit</button>' +
                (t.reviewedAt
                    ? '<span class="trade-expand-reviewed-badge">&#x2713; Reviewed ' + _fDate(t.reviewedAt) + '</span>'
                    : '') +
            '</div>' +

        '</div>';
    }

    /* =========================================
       PUBLIC API
       ========================================= */
    return {
        open:           open,
        close:          close,
        prev:           prev,
        next:           next,
        save:           save,
        onFilterChange: onFilterChange,
        openFullEdit:   openFullEdit,
        openFromTrade:  openFromTrade,
        buildExpandHTML:buildExpandHTML,
        _selectGrade:   _selectGrade,
        _markDirty:     _markDirty
    };

})();
