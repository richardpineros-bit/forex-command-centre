// pre-trade.js - FCC Phase 3 extraction
// Pre-trade validation & entry strategy
// v4.1.0: Removed dead 5-criteria system (checkCriterion1-5, updateCriteria,
//         old updateValidationVerdict, calculateRR, calculateValidationPosition).
//         Active validation now lives in institutional-checklist.js (7-check system)
//         and stop-loss-exit.js (structure-based verdict).

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
