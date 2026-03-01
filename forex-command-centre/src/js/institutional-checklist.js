// institutional-checklist.js - FCC Phase 3 extraction
// UTCC v2.5 institutional checklist
// v2.1.0: News Gate Module integration - displays news event verdicts before validation checks

// ============================================
// UTCC v2.5 INSTITUTIONAL CHECKLIST SYSTEM
// ============================================

function updateInstitutionalChecklist() {
    const pair = document.getElementById('val-pair')?.value || '';
    const direction = document.getElementById('val-direction')?.value || '';
    const rsiOverride = document.getElementById('rsi-override-confirm')?.checked || false;
    
    // ============================================
    // NEWS GATE ASSESSMENT (VETO LAYER)
    // ============================================
    if (pair && typeof window.NewsGateModule !== 'undefined') {
        updateNewsGateWarning(pair);
    }
    
    // ============================================
    // CHECK 1: UTCC Armed State (HARD)
    // ============================================
    const utccArmed = document.getElementById('check-utcc-armed')?.value || '';
    const check1Pass = utccArmed === 'armed_long' || utccArmed === 'armed_short';
    updateCheckStatus(1, check1Pass, 
        utccArmed === 'armed_long' ? 'PASS - \u2191 ARMED' :
        utccArmed === 'armed_short' ? 'PASS - \u2193 ARMED' :
        utccArmed === 'disarmed' ? 'FAIL - DISARMED' : 'PENDING');
    
    // ============================================
    // CHECK 2: 1H EMAs Stacked (HARD)
    // ============================================
    const emaStacked = document.getElementById('check-ema-stacked')?.checked || false;
    const check2Pass = emaStacked;
    updateCheckStatus(2, check2Pass, emaStacked ? 'PASS' : 'PENDING');
    
    // ============================================
    // CHECK 3: Price Acceptance/Rejection at EMA (HARD)
    // ============================================
    const emaReaction = document.getElementById('check-ema-reaction')?.value || '';
    const check3Pass = emaReaction === 'acceptance' || emaReaction === 'rejection';
    updateCheckStatus(3, check3Pass, 
        emaReaction === 'acceptance' ? 'PASS - Acceptance' :
        emaReaction === 'rejection' ? 'PASS - Rejection' :
        emaReaction === 'touch_only' ? 'FAIL - Just touch, no reaction' :
        emaReaction === 'none' ? 'FAIL - No interaction' : 'PENDING');
    
    // ============================================
    // CHECK 4: Price Failed Opposite Direction (HARD)
    // ============================================
    const failedOpposite = document.getElementById('check-failed-opposite')?.checked || false;
    const check4Pass = failedOpposite;
    updateCheckStatus(4, check4Pass, failedOpposite ? 'PASS - Reaction confirmed' : 'PENDING');
    
    // Update failed opposite label based on direction
    const failedLabel = document.getElementById('failed-opposite-label');
    if (failedLabel && direction) {
        failedLabel.textContent = direction === 'long' 
            ? 'Price failed to break lower (bulls defended)'
            : 'Price failed to break higher (bears defended)';
    }
    
    // ============================================
    // CHECK 5: Alert Fired > 1 Candle Ago (HARD)
    // ============================================
    const alertLag = document.getElementById('check-alert-lag')?.checked || false;
    const check5Pass = alertLag;
    updateCheckStatus(5, check5Pass, alertLag ? 'PASS - Not chasing' : 'PENDING');
    
    // ============================================
    // CHECK 6: 1H RSI Favourable (SOFT)
    // ============================================
    const rsiValue = parseFloat(document.getElementById('check-rsi-value')?.value) || 0;
    let rsiStatus = 'PENDING';
    let rsiLevel = 'pending';
    let positionSizeRec = 'Full size';
    
    if (rsiValue > 0 && direction) {
        if (direction === 'short') {
            if (rsiValue > 70) { rsiStatus = 'OVERBOUGHT - IDEAL'; rsiLevel = 'pass'; positionSizeRec = 'Full size'; }
            else if (rsiValue >= 50) { rsiStatus = 'PULLBACK'; rsiLevel = 'pass'; positionSizeRec = 'Full size'; }
            else if (rsiValue >= 30) { rsiStatus = 'MOMENTUM'; rsiLevel = 'warning'; positionSizeRec = '75% size'; }
            else { rsiStatus = 'OVERSOLD - NO ENTRY'; rsiLevel = 'fail'; positionSizeRec = 'Do not enter'; }
        } else if (direction === 'long') {
            if (rsiValue < 30) { rsiStatus = 'OVERSOLD - IDEAL'; rsiLevel = 'pass'; positionSizeRec = 'Full size'; }
            else if (rsiValue <= 50) { rsiStatus = 'PULLBACK'; rsiLevel = 'pass'; positionSizeRec = 'Full size'; }
            else if (rsiValue <= 70) { rsiStatus = 'MOMENTUM'; rsiLevel = 'warning'; positionSizeRec = '75% size'; }
            else { rsiStatus = 'OVERBOUGHT - NO ENTRY'; rsiLevel = 'fail'; positionSizeRec = 'Do not enter'; }
        }
    }
    
    const check6Status = document.getElementById('check-6-status');
    if (check6Status) {
        check6Status.textContent = rsiValue > 0 ? `${rsiStatus} (${positionSizeRec})` : 'Enter RSI value';
        check6Status.className = 'inst-check-status status-' + (rsiLevel === 'pass' ? 'pass' : rsiLevel === 'warning' ? 'warning' : rsiLevel === 'fail' ? 'fail' : 'pending');
    }
    
    const check6Item = document.getElementById('inst-check-6');
    if (check6Item) {
        check6Item.className = 'inst-check-item' + (rsiLevel === 'pass' ? ' check-pass' : rsiLevel === 'warning' ? ' check-warning' : rsiLevel === 'neutral' ? ' check-neutral' : rsiLevel === 'fail' ? ' check-fail' : '');
    }
    
    // Show/hide RSI override section
    const overrideSection = document.getElementById('rsi-override-section');
    if (overrideSection) {
        overrideSection.style.display = (rsiLevel === 'neutral') ? 'block' : 'none';
    }
    
    // ============================================
    // CHECK 7: 48h Cooldown (HARD) - auto-detected
    // ============================================
    const cooldownData = checkCooldown();
    const check7Pass = cooldownData.pass;
    
    // ============================================
    // UNIFIED VERDICT
    // ============================================
    const rsiOk = rsiLevel === 'pass' || rsiLevel === 'warning' || (rsiLevel === 'neutral' && rsiOverride);
    const hardChecksPassed = check1Pass && check2Pass && check3Pass && check4Pass && check5Pass && check7Pass;
    
    // ============================================
    // AUTO-DETECTED CHECKS (R-Code Match + Correlation)
    // ============================================
    updateAutoRegimeCheck(pair);
    updateAutoCorrelationCheck(pair);
    
    // Update verdict mini-icons
    updateVerdictCheck('vc-1', check1Pass, utccArmed);
    updateVerdictCheck('vc-2', check2Pass, emaStacked);
    updateVerdictCheck('vc-3', check3Pass, emaReaction);
    updateVerdictCheck('vc-4', check4Pass, failedOpposite);
    updateVerdictCheck('vc-5', check5Pass, alertLag);
    updateVerdictCheck('vc-6', rsiOk, rsiValue > 0);
    updateVerdictCheck('vc-7', check7Pass, pair);
    
    updateEntryVerdict(hardChecksPassed, rsiLevel, rsiOk, positionSizeRec, cooldownData);
    
    // ============================================
    // LEAKAGE DETECTION INTEGRATION
    // ============================================
    if (window.PlaybookModule) {
        const tradeData = {
            score: check1Pass ? 85 : 0,
            entryZone: 'optimal',
            regime: getCurrentRegimeState(),
            playbook: PlaybookModule.getSelectedPlaybook()?.id,
            positionSize: (rsiLevel === 'pass') ? 'full' : 'reduced',
            hasOverride: window.RegimeModule?.hasActiveOverride() || false,
            conviction: (rsiLevel === 'pass' && hardChecksPassed) ? 'high' : 'medium',
            correlatedPositions: getCorrelatedOpenPositions(pair),
            criteriaPass: (check1Pass ? 1 : 0) + (check2Pass ? 1 : 0) + (check3Pass ? 1 : 0) + (check4Pass ? 1 : 0) + (check5Pass ? 1 : 0) + (check7Pass ? 1 : 0),
            criteriaTrial: 6
        };
        
        PlaybookModule.renderLeakageWarnings('leakage-warnings-container', tradeData);
    }
}

// Helper function to get current regime state
function getCurrentRegimeState() {
    if (window.RegimeModule) {
        const data = window.RegimeModule.loadRegimeData();
        return data.dailyContext?.marketState || null;
    }
    return null;
}

// Helper function to get correlated open positions
function getCorrelatedOpenPositions(currentPair) {
    if (!currentPair) return [];
    
    const trades = JSON.parse(localStorage.getItem('ftcc_trades') || '[]');
    const openTrades = trades.filter(t => t.status === 'open');
    
    // Simple correlation check based on shared currencies
    const currentBase = currentPair.substring(0, 3);
    const currentQuote = currentPair.substring(3, 6);
    
    return openTrades.filter(t => {
        if (!t.pair || t.pair === currentPair) return false;
        const base = t.pair.substring(0, 3);
        const quote = t.pair.substring(3, 6);
        return base === currentBase || base === currentQuote || 
               quote === currentBase || quote === currentQuote;
    });
}

function updateCheckStatus(checkNum, passed, statusText) {
    const statusEl = document.getElementById(`check-${checkNum}-status`);
    const itemEl = document.getElementById(`inst-check-${checkNum}`);
    
    if (statusEl) {
        statusEl.textContent = statusText;
        statusEl.className = 'inst-check-status status-' + (passed ? 'pass' : statusText === 'PENDING' ? 'pending' : 'fail');
    }
    
    if (itemEl) {
        itemEl.classList.remove('check-pass', 'check-fail');
        if (passed) itemEl.classList.add('check-pass');
        else if (statusText !== 'PENDING') itemEl.classList.add('check-fail');
    }
}

function updateVerdictCheck(id, passed, hasValue) {
    const el = document.getElementById(id);
    if (!el) return;
    
    const label = el.textContent.split(' ').pop();
    if (!hasValue) {
        el.innerHTML = '&#x23F3; ' + label;
        el.className = 'verdict-check';
    } else if (passed) {
        el.innerHTML = 'OK - ' + label;
        el.className = 'verdict-check pass';
    } else {
        el.innerHTML = '&#x2716; ' + label;
        el.className = 'verdict-check fail';
    }
}

function updateEntryVerdict(hardPass, rsiLevel, rsiOk, positionSize, cooldownData) {
    const panel = document.getElementById('entry-verdict-panel');
    const icon = document.getElementById('entry-verdict-icon');
    const status = document.getElementById('entry-verdict-status');
    const reason = document.getElementById('entry-verdict-reason');
    
    if (!panel) return;
    
    panel.classList.remove('verdict-approved', 'verdict-approved-reduced', 'verdict-caution', 'verdict-blocked', 'verdict-pending');
    
    if (!hardPass) {
        // BLOCKED
        panel.classList.add('verdict-blocked');
        icon.innerHTML = '&#x26D4;';
        status.textContent = 'ENTRY BLOCKED';
        
        let reasons = [];
        const utccArmed = document.getElementById('check-utcc-armed')?.value || '';
        if (!utccArmed || (utccArmed !== 'armed_long' && utccArmed !== 'armed_short')) {
            if (utccArmed === 'disarmed') reasons.push('UTCC disarmed');
            else reasons.push('UTCC not armed');
        }
        if (!document.getElementById('check-ema-stacked')?.checked) reasons.push('1H EMAs not lined up');
        const emaReaction = document.getElementById('check-ema-reaction')?.value || '';
        if (emaReaction === 'touch_only') reasons.push('Just touched EMA, no reaction');
        else if (emaReaction === 'none') reasons.push('No EMA reaction yet');
        else if (!emaReaction) reasons.push('EMA reaction not checked');
        if (!document.getElementById('check-failed-opposite')?.checked) reasons.push('No failed opposite move');
        if (!document.getElementById('check-alert-lag')?.checked) reasons.push('Chasing (alert same candle)');
        if (!cooldownData.pass) reasons.push(`48h cooldown: ${cooldownData.hoursLeft}h left`);
        
        reason.textContent = reasons.join(' | ');
    } else if (rsiLevel === 'neutral' && !document.getElementById('rsi-override-confirm')?.checked) {
        // CAUTION - RSI Neutral
        panel.classList.add('verdict-caution');
        icon.innerHTML = 'WARNING:';
        status.textContent = 'CAUTION - RSI IS NEUTRAL';
        reason.textContent = 'RSI 45-55 means no momentum edge. Tick the override box if you want to proceed with smaller size.';
    } else if (rsiLevel === 'fail') {
        // BLOCKED - Wrong RSI direction
        panel.classList.add('verdict-blocked');
        icon.innerHTML = '&#x26D4;';
        status.textContent = 'BLOCKED - MOMENTUM AGAINST YOU';
        reason.textContent = 'RSI shows momentum going the other way. Do not enter.';
    } else if (rsiLevel === 'pass') {
        // APPROVED FULL
        panel.classList.add('verdict-approved');
        icon.innerHTML = '&#x2705;';
        status.textContent = 'GO - FULL SIZE';
        reason.textContent = 'All checks passed. Momentum in your favour. Execute with confidence.';
    } else if (rsiLevel === 'warning' || (rsiLevel === 'neutral' && document.getElementById('rsi-override-confirm')?.checked)) {
        // APPROVED REDUCED
        panel.classList.add('verdict-approved-reduced');
        icon.innerHTML = '&#x2705;';
        status.textContent = 'GO - REDUCED SIZE';
        reason.textContent = rsiLevel === 'warning' ? 
            'All checks passed. RSI is acceptable but not ideal. Use 50-75% position size.' :
            'All checks passed. RSI is neutral \u2014 proceed with caution and smaller size.';
    } else {
        // PENDING
        panel.classList.add('verdict-pending');
        icon.innerHTML = '&#x23F3;';
        status.textContent = 'COMPLETE THE CHECKS';
        reason.textContent = 'Fill in all 7 checks above to see if you can trade';
    }
    
    // v2.12.1: Toggle gated sections
    const isApproved = panel.classList.contains('verdict-approved') || panel.classList.contains('verdict-approved-reduced');
    const isBlocked = panel.classList.contains('verdict-blocked');
    updatePreTradeGate(isApproved, isBlocked);
}

/**
 * v2.12.1: Toggle gated sections based on checklist verdict
 */
function updatePreTradeGate(isApproved, isBlocked) {
    const gatedSections = document.querySelectorAll('.pretrade-gated');
    const pill = document.getElementById('gate-status-pill');
    const gateIcon = document.getElementById('gate-icon');
    const gateText = document.getElementById('gate-text');
    
    if (isApproved) {
        gatedSections.forEach(el => el.classList.add('gate-open'));
        if (pill) {
            pill.className = 'gate-status-pill gate-unlocked';
            if (gateIcon) gateIcon.innerHTML = '&#x1F513;';
            if (gateText) gateText.textContent = 'Checks passed \u2014 now set your levels';
        }
    } else {
        gatedSections.forEach(el => el.classList.remove('gate-open'));
        if (pill) {
            pill.className = 'gate-status-pill ' + (isBlocked ? 'gate-blocked' : 'gate-locked');
            if (gateIcon) gateIcon.innerHTML = isBlocked ? '&#x26D4;' : '&#x1F512;';
            if (gateText) gateText.textContent = isBlocked ? 'Blocked \u2014 fix the failing checks above' : 'Pass the checklist above to unlock';
        }
    }
}

function checkCooldown() {
    const pair = document.getElementById('val-pair')?.value || '';
    const statusEl = document.getElementById('check-7-status');
    const container = document.getElementById('cooldown-warning-container');
    const itemEl = document.getElementById('inst-check-7');
    
    if (!pair) {
        if (statusEl) {
            statusEl.textContent = 'Select pair first';
            statusEl.className = 'inst-check-status status-pending';
        }
        if (container) container.innerHTML = '';
        if (itemEl) itemEl.classList.remove('check-pass', 'check-fail');
        return { pass: false, hoursLeft: 0 };
    }
    
    // Check trade journal for recent losses on this pair
    const trades = JSON.parse(localStorage.getItem('ftcc_trades') || '[]');
    const now = new Date();
    const cutoff = new Date(now.getTime() - (48 * 60 * 60 * 1000)); // 48 hours ago
    
    const recentLoss = trades.find(t => {
        if (t.pair !== pair) return false;
        if (t.status !== 'closed') return false;
        if (t.outcome !== 'loss' && t.outcome !== 'stop_loss') return false;
        const closeDate = new Date(t.closeDate || t.entryDate);
        return closeDate > cutoff;
    });
    
    if (recentLoss) {
        const closeDate = new Date(recentLoss.closeDate || recentLoss.entryDate);
        const hoursLeft = Math.ceil((cutoff.getTime() + (48 * 60 * 60 * 1000) - now.getTime()) / (60 * 60 * 1000));
        
        if (statusEl) {
            statusEl.textContent = `FAIL - ${hoursLeft}h cooldown`;
            statusEl.className = 'inst-check-status status-fail';
        }
        if (itemEl) {
            itemEl.classList.remove('check-pass');
            itemEl.classList.add('check-fail');
        }
        if (container) {
            container.innerHTML = `
                <div class="cooldown-warning">
                    <span class="cooldown-warning-icon">&#x23F1;</span>
                    <span class="cooldown-warning-text">
                        Loss on ${pair} at ${closeDate.toLocaleDateString()}. 
                        <span class="cooldown-warning-time">${hoursLeft}h cooldown remaining.</span>
                    </span>
                </div>
            `;
        }
        return { pass: false, hoursLeft: hoursLeft };
    } else {
        if (statusEl) {
            statusEl.textContent = 'PASS - No recent loss';
            statusEl.className = 'inst-check-status status-pass';
        }
        if (itemEl) {
            itemEl.classList.remove('check-fail');
            itemEl.classList.add('check-pass');
        }
        if (container) container.innerHTML = '';
        return { pass: true, hoursLeft: 0 };
    }
}

function updateRSIMatrix() {
    const direction = document.getElementById('val-direction')?.value || '';
    const rsiValue = parseFloat(document.getElementById('check-rsi-value')?.value) || 0;
    
    // Highlight active row based on direction and RSI
    const rows = ['rsi-short-ideal', 'rsi-short-acc', 'rsi-neutral', 'rsi-long-acc', 'rsi-long-ideal'];
    rows.forEach(id => {
        const el = document.getElementById(id);
        const dirEl = document.getElementById(id + '-dir');
        if (el) el.style.fontWeight = 'normal';
        if (dirEl) dirEl.style.fontWeight = 'normal';
    });
    
    if (!direction || !rsiValue) return;
    
    let activeRow = null;
    if (direction === 'short') {
        if (rsiValue > 65) activeRow = 'rsi-short-ideal';
        else if (rsiValue >= 55) activeRow = 'rsi-short-acc';
        else if (rsiValue >= 45) activeRow = 'rsi-neutral';
    } else {
        if (rsiValue < 35) activeRow = 'rsi-long-ideal';
        else if (rsiValue <= 45) activeRow = 'rsi-long-acc';
        else if (rsiValue <= 55) activeRow = 'rsi-neutral';
    }
    
    if (activeRow) {
        const el = document.getElementById(activeRow);
        const dirEl = document.getElementById(activeRow + '-dir');
        if (el) el.style.fontWeight = '700';
        if (dirEl) dirEl.style.fontWeight = '700';
    }
}

function updateATRGuidance() {
    const atrPct = parseFloat(document.getElementById('val-atr-pct')?.value) || 0;
    const tierLabel = document.getElementById('atr-current-tier');
    
    // Remove active from all tiers
    ['compressed', 'normal', 'elevated', 'exhausted'].forEach(tier => {
        const el = document.getElementById('atr-tier-' + tier);
        if (el) el.classList.remove('active');
    });
    
    if (!atrPct) {
        if (tierLabel) tierLabel.textContent = '--';
        return;
    }
    
    let activeTier = '';
    let tierText = '';
    
    if (atrPct < 30) { activeTier = 'compressed'; tierText = 'COMPRESSED - Full size'; }
    else if (atrPct < 60) { activeTier = 'normal'; tierText = 'NORMAL - Full size'; }
    else if (atrPct < 80) { activeTier = 'elevated'; tierText = 'ELEVATED - Reduce 50%'; }
    else { activeTier = 'exhausted'; tierText = 'EXHAUSTED - Pass'; }
    
    const activeEl = document.getElementById('atr-tier-' + activeTier);
    if (activeEl) activeEl.classList.add('active');
    if (tierLabel) {
        tierLabel.textContent = tierText;
        tierLabel.style.color = activeTier === 'compressed' ? 'var(--color-pass)' : 
                                activeTier === 'normal' ? 'var(--color-info)' :
                                activeTier === 'elevated' ? 'var(--color-warning)' : 'var(--color-fail)';
    }
}

function resetInstitutionalChecklist() {
    // v2.12.1: Re-lock gate on reset
    updatePreTradeGate(false, false);
    // Reset all inputs
    const selects = ['val-pair', 'val-direction', 'check-utcc-armed', 'check-ema-reaction'];
    selects.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.selectedIndex = 0;
    });
    
    const checkboxes = ['check-ema-stacked', 'rsi-override-confirm', 'check-alert-lag', 'check-failed-opposite'];
    checkboxes.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.checked = false;
    });
    
    const inputs = ['check-rsi-value', 'val-atr-pct'];
    inputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    
    // Reset all check statuses (1-7)
    for (let i = 1; i <= 7; i++) {
        const statusEl = document.getElementById(`check-${i}-status`);
        const itemEl = document.getElementById(`inst-check-${i}`);
        if (statusEl) {
            statusEl.textContent = i === 7 ? 'Select pair first' : 'PENDING';
            statusEl.className = 'inst-check-status status-pending';
        }
        if (itemEl) itemEl.classList.remove('check-pass', 'check-fail', 'check-warning', 'check-neutral');
    }
    
    // Reset verdict checks
    ['vc-1', 'vc-2', 'vc-3', 'vc-4', 'vc-5', 'vc-6', 'vc-7'].forEach((id, i) => {
        const el = document.getElementById(id);
        const labels = ['Armed', 'EMAs', 'Reaction', 'Failed', 'Lag', 'RSI', '48h'];
        if (el) {
            el.innerHTML = '&#x23F3; ' + labels[i];
            el.className = 'verdict-check';
        }
    });
    
    // Reset unified verdict panel
    const panel = document.getElementById('entry-verdict-panel');
    const icon = document.getElementById('entry-verdict-icon');
    const status = document.getElementById('entry-verdict-status');
    const reason = document.getElementById('entry-verdict-reason');
    
    if (panel) panel.className = 'entry-verdict-panel verdict-pending';
    if (icon) icon.innerHTML = '&#x23F3;';
    if (status) status.textContent = 'COMPLETE THE CHECKS';
    if (reason) reason.textContent = 'Fill in all 7 checks above to see if you can trade';
    
    // Reset other displays
    const overrideSection = document.getElementById('rsi-override-section');
    if (overrideSection) overrideSection.style.display = 'none';
    
    const cooldownContainer = document.getElementById('cooldown-warning-container');
    if (cooldownContainer) cooldownContainer.innerHTML = '';
    
    const atrTier = document.getElementById('atr-current-tier');
    if (atrTier) atrTier.textContent = '--';
    
    ['compressed', 'normal', 'elevated', 'exhausted'].forEach(tier => {
        const el = document.getElementById('atr-tier-' + tier);
        if (el) el.classList.remove('active');
    });
}

// ============================================
// AUTO-DETECTED CHECKS (v4.1.0)
// ============================================

// Auto Check A: Regime Match
// Compares DailyContext regime with what UTCC alert reported
function updateAutoRegimeCheck(pair) {
    const statusEl = document.getElementById('check-auto-regime-status');
    const itemEl = document.getElementById('inst-check-auto-regime');
    if (!statusEl) return;

    // Get declared regime from DailyContext
    let declaredRegime = null;
    if (window.DailyContext && typeof window.DailyContext.getState === 'function') {
        const dcState = window.DailyContext.getState();
        if (dcState && dcState.locked && dcState.regime) {
            declaredRegime = dcState.regime.toLowerCase();
        }
    }

    if (!declaredRegime) {
        statusEl.textContent = 'No briefing locked yet';
        statusEl.className = 'inst-check-status status-pending';
        if (itemEl) itemEl.className = 'inst-check-item inst-check-auto';
        return;
    }

    // Try to get UTCC regime from armed panel data or alert queue
    let utccRegime = null;
    if (window.AlertQueue && typeof window.AlertQueue.getAlerts === 'function') {
        const alerts = window.AlertQueue.getAlerts();
        if (alerts && alerts.length > 0 && pair) {
            const pairAlerts = alerts.filter(function(a) {
                return a.pair === pair || a.instrument === pair;
            });
            if (pairAlerts.length > 0) {
                const latest = pairAlerts[pairAlerts.length - 1];
                utccRegime = (latest.regime || latest.r_code || '').toLowerCase();
            }
        }
    }

    if (!utccRegime) {
        statusEl.textContent = 'No UTCC alert data for this pair';
        statusEl.className = 'inst-check-status status-pending';
        if (itemEl) itemEl.className = 'inst-check-item inst-check-auto';
        return;
    }

    // Compare regimes
    const regimeMap = {
        'exp': 'expansion', 'expansion': 'expansion',
        'rot': 'rotation', 'rotation': 'rotation',
        'comp': 'compression', 'compression': 'compression',
        'dist': 'distribution', 'distribution': 'distribution',
        'trans': 'transition', 'transition': 'transition',
        'unclear': 'unclear'
    };

    const normalised = regimeMap[utccRegime] || utccRegime;
    const match = normalised === declaredRegime;

    if (match) {
        statusEl.textContent = 'MATCH \u2014 Briefing and UTCC agree (' + declaredRegime + ')';
        statusEl.className = 'inst-check-status status-pass';
        if (itemEl) itemEl.className = 'inst-check-item inst-check-auto check-pass';
    } else {
        statusEl.textContent = 'MISMATCH \u2014 You said ' + declaredRegime + ', UTCC says ' + normalised;
        statusEl.className = 'inst-check-status status-warning';
        if (itemEl) itemEl.className = 'inst-check-item inst-check-auto check-warning';
    }
}

// Auto Check B: Correlation Check
// Shows if you already have open trades on correlated pairs
function updateAutoCorrelationCheck(pair) {
    const statusEl = document.getElementById('check-auto-correlation-status');
    const itemEl = document.getElementById('inst-check-auto-correlation');
    if (!statusEl) return;

    if (!pair) {
        statusEl.textContent = 'Select pair first';
        statusEl.className = 'inst-check-status status-pending';
        if (itemEl) itemEl.className = 'inst-check-item inst-check-auto';
        return;
    }

    const correlated = getCorrelatedOpenPositions(pair);

    if (correlated.length === 0) {
        statusEl.textContent = 'CLEAR \u2014 No correlated positions open';
        statusEl.className = 'inst-check-status status-pass';
        if (itemEl) itemEl.className = 'inst-check-item inst-check-auto check-pass';
    } else {
        const pairNames = correlated.map(function(t) { return t.pair; }).join(', ');
        statusEl.textContent = 'WARNING \u2014 Open on: ' + pairNames + ' (shared currency exposure)';
        statusEl.className = 'inst-check-status status-warning';
        if (itemEl) itemEl.className = 'inst-check-item inst-check-auto check-warning';
    }
}

// ============================================
// NEWS GATE INTEGRATION (v1.0.0)
// ============================================

function updateNewsGateWarning(pair) {
    const container = document.getElementById('news-gate-warning-container');
    if (!container) return;
    
    // Clear previous content
    container.innerHTML = '';
    container.style.display = 'none';
    
    // Assess tradability using news gate module
    const verdict = window.NewsGateModule.assessTradability(pair, 4);
    
    if (verdict.verdict === 'GREEN') {
        // Green = no warning needed
        return;
    }
    
    // Build warning HTML
    let warningClass = 'warning-banner';
    let iconCode = '&#x26A0;'; // Warning triangle
    let titleText = 'News Warning';
    let backgroundColor = '#fff3cd'; // Yellow
    let borderColor = '#ffc107';
    
    if (verdict.verdict === 'RED') {
        warningClass = 'alert-banner alert-danger';
        iconCode = '&#x1F6D1;'; // Stop sign
        titleText = 'TRADE BLOCKED: News Event';
        backgroundColor = '#f8d7da';
        borderColor = '#dc3545';
    } else if (verdict.verdict === 'YELLOW') {
        warningClass = 'alert-banner alert-warning';
        titleText = 'Caution: News Approaching';
        backgroundColor = '#fff3cd';
        borderColor = '#ffc107';
    }
    
    // Format time until event
    let timeString = 'TBD';
    if (verdict.minutesUntil !== null) {
        const mins = verdict.minutesUntil;
        if (mins < 60) timeString = mins + ' minutes';
        else {
            const hours = Math.floor(mins / 60);
            const leftoverMins = mins % 60;
            timeString = hours + 'h ' + (leftoverMins > 0 ? leftoverMins + 'm' : '');
        }
    }
    
    const html = `
        <div class="${warningClass}" style="
            padding: 12px 16px;
            margin-bottom: 16px;
            border-left: 4px solid ${borderColor};
            background-color: ${backgroundColor};
            border-radius: 4px;
            font-size: 0.9rem;
        ">
            <div style="display: flex; align-items: flex-start; gap: 12px;">
                <span style="font-size: 1.2rem; flex-shrink: 0;">${iconCode}</span>
                <div style="flex-grow: 1;">
                    <div style="font-weight: 600; margin-bottom: 4px;">${titleText}</div>
                    <div style="margin-bottom: 6px;">
                        <strong>${verdict.nextEvent ? verdict.nextEvent.title : 'Upcoming event'}</strong>
                        ${verdict.nextEvent ? ' (' + verdict.nextEvent.currency + ')' : ''}
                        <br/><span style="font-size: 0.85rem;">In ${timeString}</span>
                    </div>
                    <div style="font-size: 0.85rem; color: #666; margin-top: 4px;">
                        ${verdict.reason}
                    </div>
                </div>
            </div>
        </div>
    `;
    
    container.innerHTML = html;
    container.style.display = 'block';
}

// UTCC v2.5 INSTITUTIONAL CHECKLIST COMPLETE
