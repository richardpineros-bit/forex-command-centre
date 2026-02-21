// stop-loss-exit.js - FCC Phase 3 extraction
// Stop loss, exit management & correlation

// STOP LOSS STRATEGY FUNCTIONS
// ============================================

let selectedVolatility = 'trend';

function selectVolatility(vol) {
    selectedVolatility = vol;
    
    // Update button states
    document.querySelectorAll('.volatility-option').forEach(opt => {
        opt.classList.toggle('selected', opt.dataset.vol === vol);
    });
    
    // Update advice text
    const adviceEl = document.getElementById('volatility-advice');
    const multiplierEl = document.getElementById('sl-atr-multiplier');
    
    const advice = {
        quiet: { text: '&#x1F634; QUIET conditions: Tighter stops acceptable. Use 0.75-1x ATR. Watch for breakout.', mult: 1.0 },
        trend: { text: '&#x1F4C8; TREND conditions: Standard stop distance. Use 1-1.5x ATR for balanced risk.', mult: 1.5 },
        explode: { text: '&#x1F4A5; EXPLODE conditions: Wider stops required! Use 1.5-2x ATR to avoid noise stops.', mult: 2.0 }
    };
    
    if (adviceEl) adviceEl.innerHTML = advice[vol].text;
    if (multiplierEl) multiplierEl.value = advice[vol].mult;
    
    calculateATRStop();
}

function calculateATRStop() {
    const atr = parseFloat(document.getElementById('sl-atr-value')?.value) || 0;
    const multiplier = parseFloat(document.getElementById('sl-atr-multiplier')?.value) || 1.5;
    const entry = parseFloat(document.getElementById('val-entry')?.value) || 0;
    const direction = document.getElementById('val-direction')?.value || '';
    const pair = document.getElementById('val-pair')?.value || '';
    
    const pipMultiplier = pair.includes('JPY') ? 100 : 10000;
    
    // Calculate SL distance
    const slDistance = atr * multiplier;
    const slPips = slDistance * pipMultiplier;
    
    // Update displays
    const pipsEl = document.getElementById('atr-sl-pips');
    const priceEl = document.getElementById('atr-sl-price');
    
    if (pipsEl) pipsEl.textContent = atr > 0 ? slPips.toFixed(1) : '--';
    
    if (priceEl && entry > 0 && atr > 0) {
        let slPrice;
        const dir = direction.toUpperCase();
        if (dir === 'LONG') {
            slPrice = entry - slDistance;
        } else if (dir === 'SHORT') {
            slPrice = entry + slDistance;
        }
        
        if (slPrice) {
            const decimals = pair.includes('JPY') ? 3 : 5;
            priceEl.textContent = slPrice.toFixed(decimals);
        } else {
            priceEl.textContent = '--';
        }
    } else {
        if (priceEl) priceEl.textContent = '--';
    }
    
    updateSLStrategyStatus();
}

function syncStructureToBuffer() {
    const structureLevel = document.getElementById('val-sl-structure')?.value;
    const bufferField = document.getElementById('sl-structure-level');
    if (bufferField && structureLevel) {
        bufferField.value = structureLevel;
    }
    
    // Also sync direction
    const mainDirection = document.getElementById('val-direction')?.value;
    const bufferDirection = document.getElementById('sl-direction');
    if (bufferDirection && mainDirection) {
        bufferDirection.value = mainDirection;
    }
    
    calculateBufferedSL();
}

function calculateBufferedSL() {
    const structureLevel = parseFloat(document.getElementById('sl-structure-level')?.value) || 0;
    const bufferPips = parseFloat(document.getElementById('sl-buffer-pips')?.value) || 5;
    const direction = document.getElementById('sl-direction')?.value || '';
    const pair = document.getElementById('val-pair')?.value || '';
    
    const resultEl = document.getElementById('sl-final-result');
    const priceEl = document.getElementById('sl-final-price');
    
    if (!structureLevel || !direction) {
        if (resultEl) resultEl.style.display = 'none';
        return;
    }
    
    const pipValue = pair.includes('JPY') ? 0.01 : 0.0001;
    const bufferDistance = bufferPips * pipValue;
    
    let finalSL;
    if (direction === 'long') {
        finalSL = structureLevel - bufferDistance;
    } else {
        finalSL = structureLevel + bufferDistance;
    }
    
    const decimals = pair.includes('JPY') ? 3 : 5;
    
    if (resultEl) resultEl.style.display = 'block';
    if (priceEl) priceEl.textContent = finalSL.toFixed(decimals);
    
    updateSLStrategyStatus();
}

function applySLToValidation() {
    const finalSL = document.getElementById('sl-final-price')?.textContent;
    const valStop = document.getElementById('val-stop');
    
    if (finalSL && finalSL !== '--' && valStop) {
        valStop.value = finalSL;
        calculateStructureLevels();
        showToast('SL applied to validation', 'success');
    }
}

function updateSLStrategyStatus() {
    const confirmed = document.getElementById('sl-strategy-confirmed')?.checked;
    const hasATR = !!document.getElementById('sl-atr-value')?.value;
    const hasBuffer = !!document.getElementById('sl-structure-level')?.value;
    
    const iconEl = document.getElementById('sl-strategy-icon');
    const textEl = document.getElementById('sl-strategy-text');
    
    if (iconEl && textEl) {
        if (confirmed) {
            iconEl.innerHTML = 'OK -';
            textEl.textContent = 'Stop loss strategy confirmed';
            textEl.style.color = 'var(--color-pass)';
        } else if (hasATR || hasBuffer) {
            iconEl.innerHTML = '&#x23F3;';
            textEl.textContent = 'Confirm stop loss placement';
            textEl.style.color = 'var(--color-warning)';
        } else {
            iconEl.innerHTML = '&#x23F3;';
            textEl.textContent = 'Configure stop loss strategy';
            textEl.style.color = 'var(--text-muted)';
        }
    }
    
    updateValidationVerdict();
}

// ============================================
// EXIT MANAGEMENT FUNCTIONS
// ============================================

function updateExitPartials() {
    const tp1Percent = parseInt(document.getElementById('exit-tp1-percent')?.value) || 50;
    const tp2PercentEl = document.getElementById('exit-tp2-percent');
    
    if (tp2PercentEl) {
        tp2PercentEl.value = 100 - tp1Percent;
    }
    
    const validationEl = document.getElementById('partials-validation');
    if (validationEl) {
        if (tp1Percent >= 25 && tp1Percent <= 75) {
            validationEl.innerHTML = `<span style="color: var(--color-pass);">&#x2713; TP1: ${tp1Percent}% | TP2: ${100 - tp1Percent}%</span>`;
        } else {
            validationEl.innerHTML = `<span style="color: var(--color-warning);">WARNING: Keep TP1 between 25-75%</span>`;
        }
    }
    
    updateExitPlanStatus();
}

function syncTPtoExitPlan() {
    const valTp1 = document.getElementById('val-tp1')?.value;
    const valTp2 = document.getElementById('val-tp2')?.value;
    const tp1Price = document.getElementById('exit-tp1-price');
    const tp2Price = document.getElementById('exit-tp2-price');
    
    if (tp1Price && valTp1) {
        tp1Price.value = valTp1;
    }
    if (tp2Price && valTp2) {
        tp2Price.value = valTp2;
    }
    
    updateExitPlanStatus();
}

function updateExitPlan() {
    // Sync with Structure Analysis TP values if empty
    const tp1Price = document.getElementById('exit-tp1-price');
    const tp2Price = document.getElementById('exit-tp2-price');
    const valTp1 = document.getElementById('val-tp1')?.value;
    const valTp2 = document.getElementById('val-tp2')?.value;
    
    if (tp1Price && !tp1Price.value && valTp1) {
        tp1Price.value = valTp1;
    }
    if (tp2Price && !tp2Price.value && valTp2) {
        tp2Price.value = valTp2;
    }
    
    updateExitPlanStatus();
}

function updateTrailMethod() {
    const atrInput = document.getElementById('trail-atr-multiple');
    const fixedInput = document.getElementById('trail-fixed-pips');
    const atrRadio = document.getElementById('trail-atr');
    const fixedRadio = document.getElementById('trail-fixed');
    
    if (atrInput) atrInput.disabled = !atrRadio?.checked;
    if (fixedInput) fixedInput.disabled = !fixedRadio?.checked;
    
    updateExitPlanStatus();
}

function updateExitPlanStatus() {
    const planAcknowledged = document.getElementById('exit-plan-acknowledged')?.checked;
    const oppositeSignal = document.getElementById('exit-opposite-signal')?.checked;
    const tp1Price = document.getElementById('exit-tp1-price')?.value;
    
    const allComplete = planAcknowledged && oppositeSignal;
    const hasPartialSetup = tp1Price || planAcknowledged || oppositeSignal;
    
    const iconEl = document.getElementById('exit-plan-icon');
    const textEl = document.getElementById('exit-plan-text');
    
    if (iconEl && textEl) {
        if (allComplete) {
            iconEl.innerHTML = 'OK -';
            textEl.textContent = 'Exit management plan confirmed';
            textEl.style.color = 'var(--color-pass)';
        } else if (hasPartialSetup) {
            iconEl.innerHTML = '&#x23F3;';
            textEl.textContent = 'Complete exit plan confirmations';
            textEl.style.color = 'var(--color-warning)';
        } else {
            iconEl.innerHTML = '&#x23F3;';
            textEl.textContent = 'Configure exit management plan';
            textEl.style.color = 'var(--text-muted)';
        }
    }
    
    updateValidationVerdict();
}

function syncTPFromStructure() {
    const valTp1 = document.getElementById('val-tp1')?.value;
    const valTp2 = document.getElementById('val-tp2')?.value;
    const exitTp1 = document.getElementById('exit-tp1-price');
    const exitTp2 = document.getElementById('exit-tp2-price');
    
    if (exitTp1 && valTp1) exitTp1.value = valTp1;
    if (exitTp2 && valTp2) exitTp2.value = valTp2;
    
    updateExitPartials();
}

function updateStructureAnalysis() {
    // Update step completion status
    const step1Complete = document.getElementById('sl-swing-identified')?.checked && 
                          document.getElementById('sl-buffer-added')?.checked;
    const step3Complete = document.getElementById('tp-structure-identified')?.checked && 
                          document.getElementById('tp-path-clear')?.checked;
    const step4Complete = document.getElementById('rr-acceptable')?.checked;
    
    // Visual updates for steps
    const step1El = document.getElementById('structure-step-1');
    const step3El = document.getElementById('structure-step-3');
    const step4El = document.getElementById('structure-step-4');
    
    if (step1El) step1El.classList.toggle('completed', step1Complete);
    if (step3El) step3El.classList.toggle('completed', step3Complete);
    if (step4El) step4El.classList.toggle('completed', step4Complete);
    
    // Check step 2 (entry price filled)
    const entryFilled = !!document.getElementById('val-entry')?.value;
    const step2El = document.getElementById('structure-step-2');
    if (step2El) step2El.classList.toggle('completed', entryFilled);
    
    // Update overall validation verdict
    updateValidationVerdict();
}

function calculateStructureLevels() {
    const entry = parseFloat(document.getElementById('val-entry')?.value) || 0;
    const stop = parseFloat(document.getElementById('val-stop')?.value) || 0;
    const tp1 = parseFloat(document.getElementById('val-tp1')?.value) || 0;
    const tp2 = parseFloat(document.getElementById('val-tp2')?.value) || 0;
    
    // Get pip multiplier based on pair
    const pair = document.getElementById('val-pair')?.value || '';
    const pipMultiplier = pair.includes('JPY') ? 100 : 10000;
    
    // Calculate risk and reward in pips
    const riskPips = entry && stop ? Math.abs(entry - stop) * pipMultiplier : 0;
    const rewardPips = entry && tp1 ? Math.abs(tp1 - entry) * pipMultiplier : 0;
    const reward2Pips = entry && tp2 ? Math.abs(tp2 - entry) * pipMultiplier : 0;
    
    // Update displays
    const riskEl = document.getElementById('calc-risk-pips');
    const rewardEl = document.getElementById('calc-reward-pips');
    const rr1El = document.getElementById('calc-rr-tp1');
    const rr2El = document.getElementById('calc-rr-tp2');
    
    if (riskEl) riskEl.textContent = riskPips > 0 ? riskPips.toFixed(1) : '--';
    if (rewardEl) rewardEl.textContent = rewardPips > 0 ? rewardPips.toFixed(1) : '--';
    
    // Calculate R:R
    let rr1 = 0, rr2 = 0;
    if (riskPips > 0 && rewardPips > 0) {
        rr1 = rewardPips / riskPips;
    }
    if (riskPips > 0 && reward2Pips > 0) {
        rr2 = reward2Pips / riskPips;
    }
    
    // Update R:R displays with styling
    if (rr1El) {
        rr1El.textContent = rr1 > 0 ? `1:${rr1.toFixed(2)}` : '--';
        const rr1Box = rr1El.closest('.rr-stat');
        if (rr1Box) {
            rr1Box.classList.remove('rr-good', 'rr-bad', 'highlight');
            if (rr1 >= 1.5) rr1Box.classList.add('rr-good');
            else if (rr1 > 0 && rr1 < 1) rr1Box.classList.add('rr-bad');
            else rr1Box.classList.add('highlight');
        }
    }
    
    if (rr2El) {
        rr2El.textContent = rr2 > 0 ? `1:${rr2.toFixed(2)}` : '--';
    }
    
    // Update R:R verdict
    const verdictEl = document.getElementById('rr-verdict');
    if (verdictEl) {
        if (rr1 >= 1.5) {
            verdictEl.className = 'rr-verdict verdict-good';
            verdictEl.innerHTML = '<span class="rr-verdict-icon">OK -</span><span class="rr-verdict-text">Good R:R - Trade is worth taking</span>';
        } else if (rr1 > 0 && rr1 < 1.5) {
            verdictEl.className = 'rr-verdict verdict-bad';
            verdictEl.innerHTML = '<span class="rr-verdict-icon">WARNING:</span><span class="rr-verdict-text">Poor R:R - Consider skipping this trade</span>';
        } else {
            verdictEl.className = 'rr-verdict';
            verdictEl.innerHTML = '<span class="rr-verdict-icon">&#x23F3;</span><span class="rr-verdict-text">Enter levels to calculate R:R</span>';
        }
    }
    
    // Trigger structure analysis update
    updateStructureAnalysis();
}

function updateValidationVerdict() {
    const verdictBox = document.getElementById('validation-verdict');
    const verdictStatus = document.getElementById('verdict-status');
    const verdictDesc = document.getElementById('verdict-reason');
    const executeBtn = document.getElementById('execute-trade-btn');
    
    if (!verdictBox) return;
    
    // Check entry strategy requirements
    const notNews = document.getElementById('timing-not-news')?.checked;
    const sessionOk = document.getElementById('timing-session-appropriate')?.checked;
    const notFriday = document.getElementById('timing-not-friday-close')?.checked;
    const entryTimingComplete = notNews && sessionOk && notFriday;
    
    // Check SL strategy
    const slStrategyConfirmed = document.getElementById('sl-strategy-confirmed')?.checked;
    
    // Check exit plan
    const exitPlanConfirmed = document.getElementById('exit-plan-acknowledged')?.checked && 
                              document.getElementById('exit-opposite-signal')?.checked;
    
    // Check all requirements
    const utccArmed = document.getElementById('check-utcc-armed')?.value;
    const utccValid = utccArmed === 'armed_long' || utccArmed === 'armed_short';
    
    const checks = {
        pair: !!document.getElementById('val-pair')?.value,
        direction: !!document.getElementById('val-direction')?.value,
        utccScore: utccValid,
        slStructure: document.getElementById('sl-swing-identified')?.checked && 
                     document.getElementById('sl-buffer-added')?.checked,
        tpStructure: document.getElementById('tp-structure-identified')?.checked && 
                     document.getElementById('tp-path-clear')?.checked,
        rrAcceptable: document.getElementById('rr-acceptable')?.checked,
        entryStrategy: entryTimingComplete,
        slStrategy: slStrategyConfirmed,
        exitPlan: exitPlanConfirmed,
        correlation: document.getElementById('correlation-accepted')?.checked,
        finalStructure: document.getElementById('final-structure-supports')?.checked,
        finalRisk: document.getElementById('final-risk-sized')?.checked
    };
    
    const totalChecks = Object.values(checks).filter(v => v).length;
    const allComplete = Object.values(checks).every(v => v);
    const totalRequired = Object.keys(checks).length;
    
    let verdict, desc, className;
    
    if (allComplete) {
        verdict = '&#x2714; TRADE READY';
        desc = 'All checks passed. Execute with confidence!';
        className = 'verdict-ready';
        if (executeBtn) executeBtn.disabled = false;
    } else if (totalChecks >= totalRequired - 3) {
        verdict = '&#x23F3; ALMOST READY';
        desc = `${totalRequired - totalChecks} more checks needed`;
        className = 'verdict-pending';
        if (executeBtn) executeBtn.disabled = true;
    } else {
        verdict = '&#x23F3; INCOMPLETE';
        desc = `Complete structure analysis and confirmations (${totalChecks}/${totalRequired})`;
        className = 'verdict-pending';
        if (executeBtn) executeBtn.disabled = true;
    }
    
    verdictBox.className = `verdict-box ${className}`;
    if (verdictStatus) verdictStatus.innerHTML = verdict;
    if (verdictDesc) verdictDesc.textContent = desc;
}

function resetValidation() {
    // Clear all inputs
    document.querySelectorAll('#tab-validation input, #tab-validation select').forEach(el => {
        if (el.type === 'checkbox') {
            el.checked = false;
        } else if (el.tagName === 'SELECT') {
            el.selectedIndex = 0;
        } else {
            el.value = '';
        }
    });
    
    // Reset structure step styling
    for (let i = 1; i <= 4; i++) {
        const stepEl = document.getElementById(`structure-step-${i}`);
        if (stepEl) stepEl.classList.remove('completed');
    }
    
    // Reset R:R displays
    const rrElements = ['calc-risk-pips', 'calc-reward-pips', 'calc-rr-tp1', 'calc-rr-tp2'];
    rrElements.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = '--';
    });
    
    // Reset R:R verdict
    const rrVerdict = document.getElementById('rr-verdict');
    if (rrVerdict) {
        rrVerdict.className = 'rr-verdict';
        rrVerdict.innerHTML = '<span class="rr-verdict-icon">&#x23F3;</span><span class="rr-verdict-text">Enter levels to calculate R:R</span>';
    }
    
    // Reset verdict
    const verdictBox = document.getElementById('validation-verdict');
    const verdictStatus = document.getElementById('verdict-status');
    const verdictDesc = document.getElementById('verdict-reason');
    const executeBtn = document.getElementById('execute-trade-btn');
    
    if (verdictBox) verdictBox.className = 'verdict-box';
    if (verdictStatus) verdictStatus.innerHTML = '&#x23F3; INCOMPLETE';
    if (verdictDesc) verdictDesc.textContent = 'Complete structure analysis and confirmations';
    if (executeBtn) executeBtn.disabled = true;
    
    // Hide education if open
    const eduEl = document.getElementById('structure-education');
    if (eduEl) eduEl.style.display = 'none';
    
    // Reset entry strategy
    selectEntryType('market');
    const limitDetails = document.getElementById('limit-order-details');
    const scaleDetails = document.getElementById('scale-in-details');
    if (limitDetails) limitDetails.classList.remove('visible');
    if (scaleDetails) scaleDetails.classList.remove('visible');
    
    // Reset entry strategy summary
    const entryIcon = document.getElementById('entry-strategy-icon');
    const entryText = document.getElementById('entry-strategy-text');
    if (entryIcon) entryIcon.innerHTML = '&#x23F3;';
    if (entryText) {
        entryText.textContent = 'Complete entry strategy setup';
        entryText.style.color = 'var(--text-muted)';
    }
    
    // Reset SL strategy
    selectVolatility('trend');
    document.getElementById('sl-atr-value').value = '';
    document.getElementById('sl-atr-multiplier').value = '1.5';
    const slStructEl = document.getElementById('sl-structure-level');
    if (slStructEl) slStructEl.value = '';
    const slBufferEl = document.getElementById('sl-buffer-pips');
    if (slBufferEl) slBufferEl.value = '5';
    const slDirEl = document.getElementById('sl-direction');
    if (slDirEl) slDirEl.selectedIndex = 0;
    document.getElementById('sl-strategy-confirmed').checked = false;
    
    const slResult = document.getElementById('sl-final-result');
    if (slResult) slResult.style.display = 'none';
    
    const atrPips = document.getElementById('atr-sl-pips');
    const atrPrice = document.getElementById('atr-sl-price');
    if (atrPips) atrPips.textContent = '--';
    if (atrPrice) atrPrice.textContent = '--';
    
    // Reset SL strategy summary
    const slIcon = document.getElementById('sl-strategy-icon');
    const slText = document.getElementById('sl-strategy-text');
    if (slIcon) slIcon.innerHTML = '&#x23F3;';
    if (slText) {
        slText.textContent = 'Configure stop loss strategy';
        slText.style.color = 'var(--text-muted)';
    }
    
    // Reset Exit Management
    document.getElementById('exit-tp1-percent').value = '50';
    document.getElementById('exit-tp2-percent').value = '50';
    document.getElementById('exit-tp1-price').value = '';
    document.getElementById('exit-tp2-price').value = '';
    document.getElementById('trail-breakeven').checked = true;
    document.getElementById('trail-atr-multiple').disabled = true;
    document.getElementById('trail-fixed-pips').disabled = true;
    document.getElementById('time-stop-hours').value = '24';
    document.getElementById('exit-plan-acknowledged').checked = false;
    document.getElementById('exit-opposite-signal').checked = false;
    
    const partialsVal = document.getElementById('partials-validation');
    if (partialsVal) partialsVal.innerHTML = '';
    
    // Reset Exit Plan summary
    const exitIcon = document.getElementById('exit-plan-icon');
    const exitText = document.getElementById('exit-plan-text');
    if (exitIcon) exitIcon.innerHTML = '&#x23F3;';
    if (exitText) {
        exitText.textContent = 'Configure exit management plan';
        exitText.style.color = 'var(--text-muted)';
    }
    
    // Reset Correlation
    const corrStatus = document.getElementById('correlation-status');
    const corrBlock = document.getElementById('correlation-block');
    const corrAccepted = document.getElementById('correlation-accepted');
    const corrOverride = document.getElementById('correlation-override');
    const corrOverrideWarning = document.getElementById('correlation-override-warning');
    
    if (corrStatus) {
        corrStatus.className = 'correlation-status';
        corrStatus.innerHTML = '<div class="correlation-status-icon">&#x23F3;</div><div class="correlation-status-text">Select a pair to check correlation</div>';
    }
    if (corrBlock) corrBlock.style.display = 'none';
    if (corrAccepted) corrAccepted.checked = false;
    if (corrOverride) corrOverride.checked = false;
    if (corrOverrideWarning) corrOverrideWarning.style.display = 'none';
    
    showToast('Validation reset', 'info');
}

// ============================================
// CORRELATION CHECK
// ============================================

function checkCorrelation() {
    const selectedPair = document.getElementById('val-pair')?.value;
    const statusEl = document.getElementById('correlation-status');
    const blockEl = document.getElementById('correlation-block');
    const acceptedEl = document.getElementById('correlation-accepted');
    const overrideEl = document.getElementById('correlation-override');
    
    // Reset override checkbox
    if (overrideEl) overrideEl.checked = false;
    document.getElementById('correlation-override-warning').style.display = 'none';
    
    if (!selectedPair) {
        if (statusEl) {
            statusEl.className = 'correlation-status';
            statusEl.innerHTML = '<div class="correlation-status-icon">&#x23F3;</div><div class="correlation-status-text">Select a pair to check correlation</div>';
        }
        if (blockEl) blockEl.style.display = 'none';
        if (acceptedEl) acceptedEl.checked = false;
        updateValidationVerdict();
        return;
    }
    
    // Get open trades from journal
    const trades = JSON.parse(localStorage.getItem('forexTrades') || '[]');
    const openTrades = trades.filter(t => t.status === 'open');
    
    if (openTrades.length === 0) {
        if (statusEl) {
            statusEl.className = 'correlation-status status-clear';
            statusEl.innerHTML = '<div class="correlation-status-icon">OK -</div><div class="correlation-status-text">No open positions - no correlation risk</div>';
        }
        if (blockEl) blockEl.style.display = 'none';
        if (acceptedEl) acceptedEl.checked = true; // Auto-accept when clear
        updateValidationVerdict();
        return;
    }
    
    // Find which currencies are in the selected pair
    const selectedCurrencies = [];
    for (const [currency, pairs] of Object.entries(correlationGroups)) {
        if (pairs.includes(selectedPair)) {
            selectedCurrencies.push(currency);
        }
    }
    
    // Check if any open trades share the same currency exposure
    const correlatedPairs = [];
    for (const trade of openTrades) {
        for (const currency of selectedCurrencies) {
            if (correlationGroups[currency]?.includes(trade.pair)) {
                correlatedPairs.push(trade.pair);
                break;
            }
        }
    }
    
    // Remove duplicates and the selected pair itself
    const uniqueCorrelated = [...new Set(correlatedPairs)].filter(p => p !== selectedPair);
    
    if (uniqueCorrelated.length > 0) {
        // BLOCKED - correlated exposure detected
        if (statusEl) {
            statusEl.className = 'correlation-status status-warning';
            statusEl.innerHTML = `<div class="correlation-status-icon">&#x1F6AB;</div><div class="correlation-status-text">BLOCKED: Correlated with ${uniqueCorrelated.join(', ')}</div>`;
        }
        if (blockEl) {
            blockEl.style.display = 'block';
            document.getElementById('correlation-block-reason').textContent = 
                `You have open positions in ${uniqueCorrelated.join(', ')} which share currency exposure with ${selectedPair}.`;
        }
        if (acceptedEl) acceptedEl.checked = false; // Block until override
        updateValidationVerdict();
    } else {
        // CLEAR - no correlation
        if (statusEl) {
            statusEl.className = 'correlation-status status-clear';
            statusEl.innerHTML = '<div class="correlation-status-icon">OK -</div><div class="correlation-status-text">No correlated open positions</div>';
        }
        if (blockEl) blockEl.style.display = 'none';
        if (acceptedEl) acceptedEl.checked = true; // Auto-accept when clear
        updateValidationVerdict();
    }
}

function handleCorrelationOverride() {
    const overrideChecked = document.getElementById('correlation-override')?.checked;
    const warningEl = document.getElementById('correlation-override-warning');
    const acceptedEl = document.getElementById('correlation-accepted');
    
    if (warningEl) {
        warningEl.style.display = overrideChecked ? 'block' : 'none';
    }
    
    if (acceptedEl) {
        acceptedEl.checked = overrideChecked;
    }
    
    if (overrideChecked) {
        showToast('Correlation override accepted - USE HALF POSITION SIZE', 'warning');
    }
    
    updateValidationVerdict();
}


function executeTradeFromValidation() {
    // Get core validation data
    const pair = document.getElementById('val-pair')?.value;
    const direction = document.getElementById('val-direction')?.value;
    const timeframe = document.getElementById('val-timeframe')?.value;
    const utccScore = document.getElementById('val-utcc-score')?.value;
    const volatility = document.getElementById('val-volatility')?.value;
    const entryZone = document.getElementById('val-entry-zone')?.value;
    const atrPct = document.getElementById('val-atr-pct')?.value;
    
    // Get structure analysis data
    const entry = document.getElementById('val-entry')?.value;
    const stop = document.getElementById('val-stop')?.value;
    const tp1 = document.getElementById('val-tp1')?.value;
    const tp2 = document.getElementById('val-tp2')?.value;
    
    // Get entry strategy data (Chunk 2)
    const entryType = selectedEntryType || 'market';
    const limitPrice = document.getElementById('limit-entry-price')?.value;
    const scalePrice1 = document.getElementById('scale-price-1')?.value;
    const scalePrice2 = document.getElementById('scale-price-2')?.value;
    const scalePercent1 = document.getElementById('scale-percent-1')?.value;
    const scalePercent2 = document.getElementById('scale-percent-2')?.value;
    
    // Get SL strategy data (Chunk 3)
    const atrValue = document.getElementById('sl-atr-value')?.value;
    const atrMultiplier = document.getElementById('sl-atr-multiplier')?.value;
    const slFinalPrice = document.getElementById('sl-final-price')?.textContent;
    
    // Get exit management data (Chunk 4)
    const tp1Percent = document.getElementById('exit-tp1-percent')?.value || '50';
    const tp2Percent = document.getElementById('exit-tp2-percent')?.value || '50';
    const tp1Price = document.getElementById('exit-tp1-price')?.value;
    const tp2Price = document.getElementById('exit-tp2-price')?.value;
    const trailMethod = document.querySelector('input[name="trail-method"]:checked')?.value || 'breakeven';
    const trailAtrMultiple = document.getElementById('trail-atr-multiple')?.value;
    const trailFixedPips = document.getElementById('trail-fixed-pips')?.value;
    const timeStopHours = document.getElementById('time-stop-hours')?.value || '24';
    
    // Get correlation override status (Chunk 5)
    const correlationOverride = document.getElementById('correlation-override')?.checked || false;
    
    if (!pair || !direction) {
        showToast('Please select pair and direction', 'warning');
        return;
    }
    
    // Build comprehensive notes
    let notes = [];
    
    // Entry strategy details
    if (entryType === 'limit' && limitPrice) {
        notes.push(`Entry: LIMIT @ ${limitPrice}`);
    } else if (entryType === 'scale' && scalePrice1 && scalePrice2) {
        notes.push(`Entry: SCALE-IN - ${scalePercent1}% @ ${scalePrice1}, ${scalePercent2}% @ ${scalePrice2}`);
    } else {
        notes.push(`Entry: MARKET @ ${entry || 'current'}`);
    }
    
    // Exit plan details
    notes.push(`Exit Plan: TP1 ${tp1Percent}% @ ${tp1Price || tp1 || '--'}, TP2 ${tp2Percent}% @ ${tp2Price || tp2 || '--'}`);
    notes.push(`Trail: ${trailMethod.toUpperCase()}${trailMethod === 'atr' ? ` (${trailAtrMultiple}x)` : trailMethod === 'fixed' ? ` (${trailFixedPips} pips)` : ''}`);
    notes.push(`Time Stop: ${timeStopHours}h`);
    
    // SL strategy
    if (atrValue && atrMultiplier) {
        notes.push(`SL Strategy: ATR ${atrValue} &#xD7; ${atrMultiplier}`);
    }
    
    // Correlation warning
    if (correlationOverride) {
        notes.push(`WARNING: CORRELATION OVERRIDE - Half position size!`);
    }
    
    // Switch to journal tab and pre-fill
    showTab('journal');
    
    setTimeout(() => {
        // Pre-fill journal form
        const tradeDateEl = document.getElementById('trade-datetime');
        const tradePairEl = document.getElementById('trade-pair');
        const tradeDirEl = document.getElementById('trade-direction');
        const tradeEntryEl = document.getElementById('trade-entry');
        const tradeStopEl = document.getElementById('trade-stop');
        const tradeTpEl = document.getElementById('trade-tp');
        const tradeScoreEl = document.getElementById('trade-trend-score');
        const tradeZoneEl = document.getElementById('trade-entry-zone');
        const tradeVolEl = document.getElementById('trade-vol-state');
        const tradeMtfEl = document.getElementById('trade-mtf');
        const tradeSessionEl = document.getElementById('trade-session');
        const tradeNotesEl = document.getElementById('trade-notes');
        const tradeAlertEl = document.getElementById('trade-alert-type');
        
        if (tradeDateEl) tradeDateEl.value = new Date().toISOString().slice(0, 16);
        if (tradePairEl) tradePairEl.value = pair;
        if (tradeDirEl) tradeDirEl.value = direction;
        
        // Use appropriate entry price based on entry type
        let entryPrice = entry;
        if (entryType === 'limit' && limitPrice) entryPrice = limitPrice;
        else if (entryType === 'scale' && scalePrice1) entryPrice = scalePrice1;
        if (tradeEntryEl) tradeEntryEl.value = entryPrice || '';
        
        // Use final SL price if calculated, otherwise use structure SL
        const finalStop = (slFinalPrice && slFinalPrice !== '--') ? slFinalPrice : stop;
        if (tradeStopEl) tradeStopEl.value = finalStop || '';
        
        if (tradeTpEl) tradeTpEl.value = tp1Price || tp1 || '';
        if (tradeScoreEl) tradeScoreEl.value = utccScore || '';
        if (tradeZoneEl) tradeZoneEl.value = entryZone?.toUpperCase() || '';
        if (tradeVolEl) tradeVolEl.value = volatility?.toUpperCase() || '';
        
        // MTF is captured from checkboxes
        const mtfCount = [
            document.getElementById('check-timing-session')?.checked,
            document.getElementById('check-timing-news')?.checked,
            document.getElementById('check-timing-friday')?.checked
        ].filter(Boolean).length;
        if (tradeMtfEl) tradeMtfEl.value = `${mtfCount}/3`;
        
        if (tradeAlertEl) tradeAlertEl.value = 'TRADE_READY';
        if (tradeNotesEl) tradeNotesEl.value = notes.join('\n');
        
        // Determine session based on current time (AEST)
        const hour = new Date().getHours();
        let session = 'asian';
        if (hour >= 17 && hour < 22) session = 'london';
        else if (hour >= 22 || hour < 6) session = 'ny';
        if (tradeSessionEl) tradeSessionEl.value = session;
        
        // v2.9.0: Auto-populate Permission Log from Regime module
        try {
            let regimeData = null;
            if (window.RegimeModule && RegimeModule.loadRegimeData) {
                regimeData = RegimeModule.loadRegimeData();
            }
            const sessionData = regimeData?.sessions?.[session] || {};
            
            // Populate hidden fields
            const setHidden = (id, val) => { const el = document.getElementById(id); if (el && val) el.value = val; };
            setHidden('trade-market-regime', sessionData.regime || regimeData?.dailyContext?.regime || '');
            setHidden('trade-structure-quality', sessionData.structure || '');
            setHidden('trade-vol-context', sessionData.volatility || '');
            setHidden('trade-session-window', sessionData.sessionWindow || '');
            setHidden('trade-permission-state', sessionData.permissionState || 'full');
            
            // Build decision reason from available data
            const parts = [];
            if (sessionData.regime) parts.push(sessionData.regime);
            if (sessionData.structure) parts.push(sessionData.structure);
            if (sessionData.sessionWindow) parts.push(sessionData.sessionWindow);
            if (parts.length > 0) {
                setHidden('trade-permission-reason', parts.join(' + ') + ' = ' + (sessionData.permissionState || 'FULL').toUpperCase());
            }
            
            // Update read-only display
            updatePermissionLogDisplay();
        } catch (e) {
            console.warn('[Execute] Permission log auto-fill error:', e);
        }
        
        showToast('Trade details transferred to journal', 'success');
    }, 100);
}

// Add validation-specific styles
const validationStyles = document.createElement('style');
validationStyles.textContent = `
    .criteria-item {
        padding: var(--spacing-md);
        border: 1px solid var(--border-primary);
        border-radius: var(--radius-md);
        margin-bottom: var(--spacing-sm);
        transition: all var(--transition-fast);
    }
    .criteria-item.pass {
        border-color: var(--color-pass);
        background: rgba(34, 197, 94, 0.1);
    }
    .criteria-item.fail {
        border-color: var(--color-fail);
        background: rgba(239, 68, 68, 0.1);
    }
    .criteria-header {
        display: flex;
        align-items: center;
        gap: var(--spacing-md);
    }
    .criteria-number {
        width: 28px;
        height: 28px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--bg-tertiary);
        border-radius: 50%;
        font-weight: 600;
        font-size: 0.9rem;
    }
    .criteria-item.pass .criteria-number {
        background: var(--color-pass);
        color: white;
    }
    .criteria-item.fail .criteria-number {
        background: var(--color-fail);
        color: white;
    }
    .criteria-title {
        font-weight: 500;
    }
    .criteria-sub {
        margin-top: var(--spacing-sm);
        padding-left: calc(28px + var(--spacing-md));
    }
    .verdict-box {
        padding: var(--spacing-lg);
        border-radius: var(--radius-lg);
        text-align: center;
        margin-top: var(--spacing-lg);
    }
    .verdict-ready {
        background: rgba(34, 197, 94, 0.15);
        border: 2px solid var(--color-pass);
    }
    .verdict-blocked {
        background: rgba(239, 68, 68, 0.15);
        border: 2px solid var(--color-fail);
    }
    .verdict-caution {
        background: rgba(234, 179, 8, 0.15);
        border: 2px solid var(--color-warning);
    }
    .verdict-pending {
        background: var(--bg-tertiary);
        border: 2px solid var(--border-primary);
    }
    #verdict-text {
        font-size: 1.5rem;
        font-weight: 700;
        margin-bottom: var(--spacing-xs);
    }
    #verdict-desc {
        color: var(--text-secondary);
    }
`;
document.head.appendChild(validationStyles);

// CHUNK 4 COMPLETE - Pre-Trade Validation
