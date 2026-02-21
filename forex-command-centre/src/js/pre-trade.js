// pre-trade.js - FCC Phase 3 extraction
// Pre-trade validation & entry strategy

// ============================================
// CHUNK 4: PRE-TRADE VALIDATION
// ============================================

function updateCriteria() {
    const criteria = [
        checkCriterion1(),
        checkCriterion2(),
        checkCriterion3(),
        checkCriterion4(),
        checkCriterion5()
    ];
    
    // Update visual indicators for each criterion
    criteria.forEach((passed, index) => {
        const criteriaEl = document.getElementById(`criteria-${index + 1}`);
        if (criteriaEl) {
            criteriaEl.classList.remove('pass', 'fail');
            const numEl = criteriaEl.querySelector('.criteria-number');
            if (passed === true) {
                criteriaEl.classList.add('pass');
                if (numEl) numEl.textContent = '';
            } else if (passed === false) {
                criteriaEl.classList.add('fail');
                if (numEl) numEl.textContent = index + 1;
            } else {
                if (numEl) numEl.textContent = index + 1;
            }
        }
    });
    
    // Update count badge
    const passedCount = criteria.filter(c => c === true).length;
    const badge = document.getElementById('criteria-count-badge');
    if (badge) {
        badge.textContent = `${passedCount}/5 Met`;
        badge.className = 'badge';
        if (passedCount === 5) {
            badge.classList.add('badge-pass');
        } else if (passedCount >= 3) {
            badge.classList.add('badge-warning');
        } else {
            badge.classList.add('badge-fail');
        }
    }
    
    // Update verdict
    updateValidationVerdict(criteria);
    
    // Calculate R:R if prices are filled
    calculateRR();
}

function checkCriterion1() {
    // Trend Score 80 + sub-checks
    const score = parseInt(document.getElementById('val-trend-score')?.value) || 0;
    const emasStacked = document.getElementById('val-emas-stacked')?.checked || false;
    const price200 = document.getElementById('val-price-200')?.checked || false;
    const adx = document.getElementById('val-adx')?.checked || false;
    
    if (!score && !emasStacked && !price200 && !adx) return null; // Not filled
    
    return score >= 80 && emasStacked && price200 && adx;
}

function checkCriterion2() {
    // MTF Alignment 3/3
    const mtf = document.getElementById('val-mtf')?.value;
    const aligned1h = document.getElementById('val-1h-aligned')?.checked || false;
    const aligned4h = document.getElementById('val-4h-aligned')?.checked || false;
    const alignedDaily = document.getElementById('val-daily-aligned')?.checked || false;
    
    if (!mtf && !aligned1h && !aligned4h && !alignedDaily) return null;
    
    return mtf === '3' && aligned1h && aligned4h && alignedDaily;
}

function checkCriterion3() {
    // Volatility Ready (TREND/EXPLODE/QUIET + ATR 80%)
    const vol = document.getElementById('val-volatility')?.value;
    const atrFilter = document.getElementById('val-atr-filter')?.checked || false;
    const atrPct = parseInt(document.getElementById('val-atr-pct')?.value) || 0;
    
    if (!vol) return null;
    
    const validVol = ['trend', 'explode', 'quiet'].includes(vol);
    const validAtr = atrFilter && atrPct >= 80;
    
    return validVol && validAtr;
}

function checkCriterion4() {
    // Entry Zone HOT/OPTIMAL + S/R distance
    const zone = document.getElementById('val-entry-zone')?.value;
    const srDistance = document.getElementById('val-sr-distance')?.checked || false;
    
    if (!zone) return null;
    
    const validZone = ['hot', 'optimal'].includes(zone);
    return validZone && srDistance;
}

function checkCriterion5() {
    // News Safety
    const newsSafe = document.getElementById('val-news-safe')?.checked || false;
    const newsChecked = document.getElementById('val-news-checked')?.checked || false;
    
    if (!newsChecked) return null;
    
    return newsSafe;
}

function updateValidationVerdict(criteria) {
    const verdictBox = document.getElementById('validation-verdict');
    const verdictStatus = verdictBox?.querySelector('.verdict-status');
    const verdictDesc = document.getElementById('verdict-reason');
    const executeBtn = document.getElementById('execute-trade-btn');
    
    if (!verdictBox) return;
    
    const passedCount = criteria.filter(c => c === true).length;
    const failedCount = criteria.filter(c => c === false).length;
    const pendingCount = criteria.filter(c => c === null).length;
    
    // Check safety net status
    const safetyCheckboxes = [
        'safety-sl-identified',
        'safety-sl-buffer',
        'safety-tp1-identified',
        'safety-rr-acceptable',
        'safety-path-clear',
        'safety-correlation-checked',
        'safety-final-confirm'
    ];
    const safetyNetComplete = safetyCheckboxes.every(id => {
        const checkbox = document.getElementById(id);
        return checkbox?.checked;
    });
    
    let verdict, desc, className;
    
    if (passedCount === 5 && safetyNetComplete) {
        verdict = '&#x2714; TRADE READY';
        desc = 'All criteria met + Structure verified. Execute with confidence!';
        className = 'verdict-ready';
        if (executeBtn) executeBtn.disabled = false;
    } else if (passedCount === 5 && !safetyNetComplete) {
        verdict = '&#x23F3; STRUCTURE CHECK';
        desc = 'Criteria passed. Complete Structure Safety Net below.';
        className = 'verdict-pending';
        if (executeBtn) executeBtn.disabled = true;
    } else if (failedCount > 0) {
        verdict = '&#x1F6AB; BLOCKED';
        desc = `${failedCount} criteria failed. Do NOT trade.`;
        className = 'verdict-blocked';
        if (executeBtn) executeBtn.disabled = true;
    } else if (pendingCount > 0) {
        verdict = '&#x23F3; INCOMPLETE';
        desc = `${pendingCount} criteria not yet checked.`;
        className = 'verdict-pending';
        if (executeBtn) executeBtn.disabled = true;
    } else {
        verdict = 'WARNING: CAUTION';
        desc = 'Review criteria before proceeding.';
        className = 'verdict-caution';
        if (executeBtn) executeBtn.disabled = true;
    }
    
    verdictBox.className = `verdict-box ${className}`;
    if (verdictStatus) verdictStatus.innerHTML = verdict;
    if (verdictDesc) verdictDesc.textContent = desc;
}

function calculateRR() {
    const direction = document.getElementById('val-direction')?.value;
    const entry = parseFloat(document.getElementById('val-entry-price')?.value) || 0;
    const stop = parseFloat(document.getElementById('val-stop-price')?.value) || 0;
    const tp1 = parseFloat(document.getElementById('val-tp1-price')?.value) || 0;
    const tp2 = parseFloat(document.getElementById('val-tp2-price')?.value) || 0;
    
    if (!entry || !stop) return;
    
    const risk = Math.abs(entry - stop);
    
    // Calculate R:R for TP1
    let rr1 = 0, rr2 = 0;
    if (tp1 && risk > 0) {
        const reward1 = Math.abs(tp1 - entry);
        rr1 = reward1 / risk;
    }
    
    // Calculate R:R for TP2
    if (tp2 && risk > 0) {
        const reward2 = Math.abs(tp2 - entry);
        rr2 = reward2 / risk;
    }
    
    // Update displays
    const rr1El = document.getElementById('val-rr1');
    const rr2El = document.getElementById('val-rr2');
    
    if (rr1El) {
        rr1El.textContent = `1:${formatNumber(rr1, 1)}`;
        rr1El.className = rr1 >= 1.5 ? 'text-pass' : rr1 >= 1 ? 'text-warning' : 'text-fail';
    }
    if (rr2El && tp2) {
        rr2El.textContent = `1:${formatNumber(rr2, 1)}`;
        rr2El.className = rr2 >= 2 ? 'text-pass' : rr2 >= 1.5 ? 'text-warning' : 'text-fail';
    }
    
    // Calculate position size
    calculateValidationPosition(risk);
}

function calculateValidationPosition(riskPips) {
    const settings = getSettings();
    const recommendedRisk = getRecommendedRisk();
    const riskAmount = settings.accountBalance * (recommendedRisk / 100);
    
    const posSizeEl = document.getElementById('val-position-size');
    const riskAmountEl = document.getElementById('val-risk-amount');
    
    if (riskPips && riskPips > 0) {
        const pipValue = 0.0001; // Standard for most pairs
        const units = Math.floor(riskAmount / (riskPips * pipValue));
        if (posSizeEl) posSizeEl.textContent = units.toLocaleString();
        if (riskAmountEl) riskAmountEl.textContent = `$${riskAmount.toFixed(2)}`;
    } else {
        if (posSizeEl) posSizeEl.textContent = '--';
        if (riskAmountEl) riskAmountEl.textContent = '--';
    }
}

// ============================================
// PRE-TRADE VALIDATION (NEW STRUCTURE-BASED)
// ============================================

function toggleStructureEducation() {
    const eduEl = document.getElementById('structure-education');
    if (eduEl) {
        eduEl.style.display = eduEl.style.display === 'none' ? 'block' : 'none';
    }
}

function toggleCorrelationGroups() {
    const groupsEl = document.getElementById('correlation-groups-content');
    if (groupsEl) {
        groupsEl.style.display = groupsEl.style.display === 'none' ? 'block' : 'none';
    }
}

// ============================================
// ENTRY STRATEGY FUNCTIONS
// ============================================

let selectedEntryType = 'market';
let recommendedEntryType = 'market';

// Session-Pair Optimization Matrix
const sessionPairMatrix = {
    tokyo: {
        optimal: ['USDJPY', 'EURJPY', 'AUDJPY', 'GBPJPY', 'AUDUSD', 'NZDUSD', 'AUDNZD'],
        acceptable: ['EURUSD', 'GBPUSD', 'NZDJPY', 'CADJPY'],
        avoid: ['EURGBP', 'GBPCHF', 'EURCHF', 'USDCHF']
    },
    london: {
        optimal: ['EURUSD', 'GBPUSD', 'EURGBP', 'GBPCHF', 'EURCHF', 'USDCHF', 'EURJPY'],
        acceptable: ['USDJPY', 'AUDUSD', 'GBPJPY', 'USDCAD'],
        avoid: ['AUDNZD', 'NZDJPY']
    },
    newyork: {
        optimal: ['EURUSD', 'GBPUSD', 'USDCAD', 'USDJPY', 'USDCHF'],
        acceptable: ['AUDUSD', 'NZDUSD', 'EURJPY', 'GBPJPY'],
        avoid: ['AUDNZD', 'EURGBP', 'NZDJPY']
    },
    overlap: {
        optimal: ['EURUSD', 'GBPUSD', 'USDCHF', 'USDCAD'],
        acceptable: ['USDJPY', 'AUDUSD', 'EURJPY'],
        avoid: []
    }
};

// Kill Zone Definitions (AEST hours)
const killZones = {
    londonOpen: {
        startHour: 17, startMin: 0,
        endHour: 18, endMin: 30,
        name: 'London Open',
        description: 'High volatility breakout zone - Asian range breaks',
        pairs: ['EURUSD', 'GBPUSD', 'EURGBP', 'EURJPY']
    },
    nyOpen: {
        startHour: 22, startMin: 0,
        endHour: 23, endMin: 30,
        name: 'New York Open',
        description: 'USD pairs most active - continuation or reversal',
        pairs: ['EURUSD', 'GBPUSD', 'USDCAD', 'USDJPY', 'USDCHF']
    },
    londonNyOverlap: {
        startHour: 22, startMin: 0,
        endHour: 2, endMin: 0,
        name: 'LON/NY Overlap',
        description: 'Maximum liquidity - best execution window',
        pairs: ['EURUSD', 'GBPUSD']
    },
    asianBreak: {
        startHour: 17, startMin: 0,
        endHour: 17, endMin: 30,
        name: 'Asian Range Break',
        description: 'London breaks overnight consolidation',
        pairs: ['USDJPY', 'EURJPY', 'GBPJPY', 'AUDJPY']
    }
};

// Entry Decision Engine
function getRecommendedEntryType() {
    const distanceEl = document.getElementById('distance-to-structure');
    const volatility = document.getElementById('val-volatility')?.value || '';
    const score = parseInt(document.getElementById('val-utcc-score')?.value) || 0;
    
    // Calculate distance to structure
    const entry = parseFloat(document.getElementById('val-entry')?.value) || 0;
    const slStructure = parseFloat(document.getElementById('val-sl-structure')?.value) || 0;
    const pair = document.getElementById('val-pair')?.value || '';
    const pipMultiplier = pair.includes('JPY') ? 100 : 10000;
    
    let distanceToStructure = 0;
    if (entry && slStructure) {
        distanceToStructure = Math.abs(entry - slStructure) * pipMultiplier;
    }
    
    // Update display
    if (distanceEl) {
        distanceEl.textContent = distanceToStructure > 0 ? `${distanceToStructure.toFixed(1)} pips` : '-- pips';
    }
    
    // Decision logic
    let recommendation = { type: 'MARKET', reason: 'Default entry method', confidence: 'MEDIUM' };
    
    // Rule 1: EXPLODE volatility = Market only
    if (volatility.toUpperCase() === 'EXPLODE') {
        recommendation = {
            type: 'MARKET',
            reason: 'EXPLODE volatility - limits will be skipped in fast markets',
            confidence: 'HIGH'
        };
    }
    // Rule 2: Very close to structure (<10 pips) = Market
    else if (distanceToStructure > 0 && distanceToStructure < 10) {
        recommendation = {
            type: 'MARKET',
            reason: `Only ${distanceToStructure.toFixed(1)} pips from structure - enter now`,
            confidence: 'HIGH'
        };
    }
    // Rule 3: Moderate distance (10-30 pips) = Limit
    else if (distanceToStructure >= 10 && distanceToStructure <= 30) {
        recommendation = {
            type: 'LIMIT',
            reason: 'Set limit at structure for better entry price',
            confidence: 'HIGH'
        };
    }
    // Rule 4: Far from structure + A+ setup = Scale-in
    else if (distanceToStructure > 30 && score >= 85) {
        recommendation = {
            type: 'SCALE',
            reason: `${distanceToStructure.toFixed(1)} pips away - scale into A+ setup`,
            confidence: 'MEDIUM'
        };
    }
    // Rule 5: Far from structure, not A+ = Wait
    else if (distanceToStructure > 30) {
        recommendation = {
            type: 'WAIT',
            reason: `${distanceToStructure.toFixed(1)} pips from structure - wait for pullback`,
            confidence: 'HIGH'
        };
    }
    
    return recommendation;
}

function updateEntryDecisionPanel() {
    const recommendation = getRecommendedEntryType();
    recommendedEntryType = recommendation.type;
    
    // Update volatility display
    const volEl = document.getElementById('decision-volatility');
    const volatility = document.getElementById('val-volatility')?.value || '--';
    if (volEl) volEl.textContent = volatility.toUpperCase() || '--';
    
    // Update session display
    const sessionEl = document.getElementById('decision-session');
    const currentSession = getCurrentSessionName();
    if (sessionEl) sessionEl.textContent = currentSession;
    
    // Update grade display
    const gradeEl = document.getElementById('decision-grade');
    const score = parseInt(document.getElementById('val-utcc-score')?.value) || 0;
    let grade = '--';
    if (score >= 85) grade = 'A+';
    else if (score >= 80) grade = 'A';
    else if (score >= 75) grade = 'B';
    else if (score > 0) grade = 'C';
    if (gradeEl) gradeEl.textContent = grade;
    
    // Update recommendation display
    const recTypeEl = document.getElementById('rec-entry-type');
    const recReasonEl = document.getElementById('rec-reason');
    const recBox = document.getElementById('entry-recommendation');
    
    if (recTypeEl) recTypeEl.textContent = recommendation.type;
    if (recReasonEl) recReasonEl.textContent = recommendation.reason;
    if (recBox) {
        recBox.classList.toggle('wait', recommendation.type === 'WAIT');
    }
    
    // Update button recommendation badges
    document.querySelectorAll('.entry-type-btn').forEach(btn => {
        btn.classList.remove('recommended');
    });
    const recBtnId = recommendation.type === 'MARKET' ? 'btn-market' : 
                     recommendation.type === 'LIMIT' ? 'btn-limit' : 
                     recommendation.type === 'SCALE' ? 'btn-scale' : null;
    if (recBtnId) {
        const recBtn = document.getElementById(recBtnId);
        if (recBtn) recBtn.classList.add('recommended');
    }
    
    // Show warning if selection differs
    const warningEl = document.getElementById('entry-decision-warning');
    const warningTextEl = document.getElementById('entry-warning-text');
    
    if (warningEl && recommendation.type !== 'WAIT') {
        const selectionDiffers = selectedEntryType.toUpperCase() !== recommendation.type;
        warningEl.style.display = selectionDiffers ? 'flex' : 'none';
        if (warningTextEl && selectionDiffers) {
            warningTextEl.textContent = `You selected ${selectedEntryType.toUpperCase()} but ${recommendation.type} is recommended`;
        }
    } else if (warningEl) {
        warningEl.style.display = 'none';
    }
}

function getCurrentSessionName() {
    const now = new Date();
    const aestOffset = 11;
    const utcHours = now.getUTCHours();
    const aestHours = (utcHours + aestOffset) % 24;
    
    const tokyoActive = aestHours >= 9 && aestHours < 18;
    const londonActive = aestHours >= 17 || aestHours < 2;
    const nyActive = aestHours >= 22 || aestHours < 7;
    
    if (londonActive && nyActive) return 'LON/NY Overlap';
    if (nyActive) return 'New York';
    if (londonActive) return 'London';
    if (tokyoActive) return 'Tokyo';
    return 'Off-Hours';
}

function getCurrentSession() {
    const name = getCurrentSessionName();
    if (name === 'LON/NY Overlap') return 'overlap';
    if (name === 'New York') return 'newyork';
    if (name === 'London') return 'london';
    if (name === 'Tokyo') return 'tokyo';
    return null;
}

function getSessionPairRating(pair) {
    const session = getCurrentSession();
    if (!session || !sessionPairMatrix[session]) return { rating: 'NEUTRAL', session: 'Off-Hours' };
    
    const matrix = sessionPairMatrix[session];
    let rating = 'NEUTRAL';
    
    if (matrix.optimal.includes(pair)) rating = 'OPTIMAL';
    else if (matrix.acceptable.includes(pair)) rating = 'ACCEPTABLE';
    else if (matrix.avoid.includes(pair)) rating = 'AVOID';
    
    return { rating, session: getCurrentSessionName() };
}

// ============================================
