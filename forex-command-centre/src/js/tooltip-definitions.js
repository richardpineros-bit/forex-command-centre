// tooltip-definitions.js - Extracted from index.html Phase 2
// Comprehensive tooltip definitions
const TOOLTIP_DEFS = {
    // Regime
    'expansion': 'Money flowing strongly one way. Trend is active, price making progress. Your best trading environment.',
    'rotation': 'Money moving between pairs with no clear direction. Most dangerous regime. Most losing streaks happen here.',
    'compression': 'Price squeezed into tightening range. Volatility dropping. Breakout building but direction unknown.',
    'distribution': 'Smart money offloading positions. Price looks bullish but internal momentum fading. Late-stage move.',
    'transition': 'Old regime ending, new one not confirmed. High uncertainty. Reduced size or observation only.',
    'unclear': 'Cannot identify regime. Honest admission triggers automatic stand-down.',
    
    // Structure  
    'trending': 'Price making higher highs/lows (bullish) or lower highs/lows (bearish). Healthy momentum. Trade pullbacks.',
    'corrective': 'Price pulling back against trend. Trend NOT broken. Like rubber band stretching back. Wait for correction end.',
    'compressing': 'Price range tightening. Coiled spring. Energy building but direction unknown. Patience required.',
    'breaking-out': 'Price broken significant level. Needs confirmation (close, not wick). Start of new move.',
    'exhausting': 'Current move running too long. Wicks bigger, momentum diverging. Running out of fuel.',
    'ranging': 'Price bouncing between S/R with no trend. Trade boundaries or wait for breakout.',
    
    // Permission
    'full': 'All playbooks available. Standard position sizing. Normal operations.',
    'conditional': 'Reduced playbooks available. Position size 0.75x. Extra caution required.',
    'stand_down': 'No new trades permitted. Observation and position management only.',
    
    // Volatility
    'low': 'Volatility compressed. Moves small. Good for building cheaply if direction clear.',
    'normal': 'Healthy, typical volatility. Standard conditions. Full position size.',
    'elevated': 'Significant move underway. Volatility above average. Reduce position size.',
    'spike': 'Extreme volatility. Event-driven or panic. Stand down. Your models may not work.',
    
    // Risk
    'exhaustion': 'Current move may be near finished. Like runner nearing sprint end. Risk of sharp reversal.',
    'liquidity-sweep': 'Market makers hunting stops. Price spikes through, triggers stops, reverses hard.',
    'correlation-breakdown': 'Pairs normally moving together diverging. Confusion in flow. Normal analysis may not apply.',
    
    // Playbook
    'continuation': 'Riding existing trend. Joining move already underway. Enter on pullbacks, not highs/lows.',
    'deep-pullback': 'Trend valid but price pulled further than normal. Deeper discount, higher risk, better reward.',
    'range-breakout': 'Price stuck in range just broke. Trading new move after compression.',
    
    // UTCC State
    'armed': 'UTCC conditions met. Permission to search for entry. NOT a trade signal.',
    'candidate': 'Conditions close but not all met. Watchlist. Do not trade. Just monitor.',
    'blocked': 'Conditions failed. UTCC revoked permission. No trading until conditions improve.',
    'disarmed': 'Previously armed pair lost conditions. Context changed. Cancel pending plans.'
};

// Initialize tooltips on elements with data-tooltip
function initializeTooltips() {
    document.querySelectorAll('[data-tooltip]').forEach(el => {
        const key = el.getAttribute('data-tooltip');
        const def = TOOLTIP_DEFS[key];
        if (def) {
            el.setAttribute('title', def);
            el.style.cursor = 'help';
            if (!el.style.textDecoration) {
                el.style.textDecoration = 'underline dotted';
            }
        }
    });
}


// Enhanced Tooltip System - Phase 6 Complete
// Dynamically adds tooltips to visible labels in the DOM

const TOOLTIP_LABELS = {
    // Regime
    'Expansion': 'expansion',
    'Rotation': 'rotation',
    'Compression': 'compression',
    'Distribution': 'distribution',
    'Transition': 'transition',
    'Unclear': 'unclear',
    
    // Structure
    'Trending': 'trending',
    'Corrective': 'corrective',
    'Compressing': 'compressing',
    'Breaking Out': 'breaking-out',
    'Exhausting': 'exhausting',
    'Ranging': 'ranging',
    
    // Permission
    'FULL': 'full',
    'CONDITIONAL': 'conditional',
    'STAND_DOWN': 'stand_down',
    
    // Volatility
    'Low': 'low',
    'Normal': 'normal',
    'Elevated': 'elevated',
    'Spike': 'spike',
    
    // Risk
    'Exhaustion': 'exhaustion',
    'Liquidity Sweep': 'liquidity-sweep',
    'Correlation Breakdown': 'correlation-breakdown',
    
    // Playbook
    'Continuation': 'continuation',
    'Deep Pullback': 'deep-pullback',
    'Range Breakout': 'range-breakout',
    
    // UTCC State
    'ARMED': 'armed',
    'CANDIDATE': 'candidate',
    'BLOCKED': 'blocked',
    'DISARMED': 'disarmed'
};

// Walk DOM and add tooltips to option elements and labels
function enrichTooltipsInDOM() {
    // Process option elements (dropdowns)
    document.querySelectorAll('option').forEach(opt => {
        const text = opt.textContent.trim();
        const key = Object.keys(TOOLTIP_LABELS).find(k => text.includes(k));
        if (key) {
            const tooltipKey = TOOLTIP_LABELS[key];
            const def = TOOLTIP_DEFS[tooltipKey];
            if (def && !opt.hasAttribute('title')) {
                opt.setAttribute('title', def);
            }
        }
    });
    
    // Process label elements
    document.querySelectorAll('label, span.armed-permission, div[class*="badge"]').forEach(el => {
        const text = el.textContent.trim();
        const key = Object.keys(TOOLTIP_LABELS).find(k => text === k || text.includes(k));
        if (key) {
            const tooltipKey = TOOLTIP_LABELS[key];
            const def = TOOLTIP_DEFS[tooltipKey];
            if (def && !el.hasAttribute('title') && el.textContent.includes(key)) {
                el.setAttribute('title', def);
                el.style.cursor = 'help';
                el.style.textDecoration = 'underline dotted';
            }
        }
    });
    
    // Process card titles and headers
    document.querySelectorAll('h2, h3, h4, .card-title').forEach(el => {
        const text = el.textContent;
        const key = Object.keys(TOOLTIP_LABELS).find(k => text.includes(k));
        if (key) {
            const tooltipKey = TOOLTIP_LABELS[key];
            const def = TOOLTIP_DEFS[tooltipKey];
            if (def && !el.hasAttribute('title')) {
                el.setAttribute('title', def);
            }
        }
    });
}

// Run on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', enrichTooltipsInDOM);

    // v3.3.0: Phase 7 - Init regime validation panel
    try { updateRegimeValidation(); } catch(e) { console.warn('Regime validation init:', e); }

} else {
    enrichTooltipsInDOM();
}

// Re-run on tab switch (new content rendered)
const origShowTab = window.showTab;
window.showTab = function(tabName) {
    const result = origShowTab(tabName);
    setTimeout(enrichTooltipsInDOM, 100); // Run after DOM settles
    return result;
};

