// asset-class.js - FCC Phase 3 extraction
// Asset class detection system

// ASSET CLASS DETECTION SYSTEM
// ============================================

const ASSET_CLASS_CONFIG = {
    forex: {
        symbols: ['AUDUSD', 'USDJPY', 'EURUSD', 'GBPUSD', 'EURJPY', 'GBPJPY', 'AUDCAD', 'AUDCHF', 'AUDJPY', 'AUDNZD', 'EURAUD', 'EURCAD', 'EURGBP', 'EURNZD', 'GBPAUD', 'GBPCAD', 'GBPCHF', 'GBPNZD', 'CADJPY', 'CHFJPY', 'NZDJPY', 'NZDCAD', 'NZDCHF', 'NZDUSD', 'USDCAD', 'USDCHF', 'CADCHF', 'EURCHF'],
        name: 'Forex',
        risk: '1.5-2%',
        bestSession: 'Depends on pair - check session rating',
        warning: null,
        details: 'Standard forex pair. Use session rating for optimal timing.'
    },
    metals: {
        symbols: ['XAUUSD', 'XAGUSD', 'XPTUSD', 'XCUUSD'],
        name: 'Metals',
        risk: '1.5%',
        bestSession: 'London/NY overlap (11pm-2am AEST)',
        warning: 'Inverse USD correlation. Check DXY direction.',
        details: 'Gold/Silver: Safe haven, inverse USD. Platinum/Copper: Industrial, risk-on.'
    },
    energy: {
        symbols: ['WTICOUSD', 'BCOUSD', 'NATGASUSD'],
        name: 'Energy',
        risk: '1%',
        bestSession: 'NYMEX hours (11:30pm-5am AEST)',
        warning: 'EIA Report Wednesday ~12:30am AEST - 4h buffer required!',
        details: 'Oil: OPEC/geopolitics driven. NatGas: Extremely volatile, weather sensitive.'
    },
    indices: {
        symbols: ['US30USD', 'SPX500USD', 'NAS100USD', 'US2000USD', 'DE30EUR', 'UK100GBP', 'FR40EUR', 'EU50EUR', 'JP225USD', 'JP225YJPY', 'HK33HKD', 'CN50USD', 'AU200AUD'],
        name: 'Indices',
        risk: '1.5%',
        bestSession: 'Match to index region',
        warning: null,
        details: 'US: 11:30pm-6am AEST. Europe: 5pm-1:30am. Asia: 10am-4pm.'
    },
    bonds: {
        symbols: ['USB02YUSD', 'USB05YUSD', 'USB10YUSD', 'USB30YUSD', 'UK10YBGBP', 'DE10YBEUR'],
        name: 'Bonds',
        risk: '1%',
        bestSession: 'NY session for US, London for EU',
        warning: 'CPI/FOMC = massive volatility. Price UP = Yield DOWN.',
        details: 'Long = betting yields fall. Short = betting yields rise. 30Y most volatile.'
    },
    crypto: {
        symbols: ['BTCUSD', 'MBTCUSD', 'ETHUSD', 'LTCUSD', 'BCHUSD'],
        name: 'Crypto',
        risk: '1% MAX',
        bestSession: 'US session (11pm-7am AEST)',
        warning: '24/7 market - reduced weekend liquidity. No circuit breakers!',
        details: 'BTC leads, alts follow. High correlation with NAS100. Sentiment driven.'
    }
};

function getAssetClass(symbol) {
    if (!symbol) return null;
    const upperSymbol = symbol.toUpperCase();
    
    for (const [className, config] of Object.entries(ASSET_CLASS_CONFIG)) {
        if (config.symbols.includes(upperSymbol)) {
            return { class: className, ...config };
        }
    }
    return null;
}

function updateAssetClassInfo() {
    const pair = document.getElementById('val-pair')?.value;
    const panel = document.getElementById('asset-info-panel');
    const badge = document.getElementById('asset-class-badge');
    const riskEl = document.getElementById('asset-risk-suggest');
    const detailsEl = document.getElementById('asset-info-details');
    const warningEl = document.getElementById('asset-warning');
    
    if (!panel) return;
    
    if (!pair) {
        panel.classList.remove('active', 'forex', 'metals', 'energy', 'indices', 'bonds', 'crypto');
        return;
    }
    
    const assetInfo = getAssetClass(pair);
    
    if (!assetInfo) {
        panel.classList.remove('active');
        return;
    }
    
    // Update panel
    panel.classList.remove('forex', 'metals', 'energy', 'indices', 'bonds', 'crypto');
    panel.classList.add('active', assetInfo.class);
    
    badge.className = 'asset-info-badge ' + assetInfo.class;
    badge.textContent = assetInfo.name;
    
    riskEl.textContent = assetInfo.risk;
    
    detailsEl.innerHTML = '<strong>Session:</strong> ' + assetInfo.bestSession + '<br>' + assetInfo.details;
    
    if (assetInfo.warning) {
        warningEl.style.display = 'block';
        warningEl.innerHTML = 'WARNING: ' + assetInfo.warning;
    } else {
        warningEl.style.display = 'none';
    }
    
    // Check for specific time-based warnings
    checkAssetTimeWarnings(assetInfo, pair);
}

function checkAssetTimeWarnings(assetInfo, pair) {
    const warningEl = document.getElementById('asset-warning');
    const now = new Date();
    const dayOfWeek = now.getUTCDay();
    const utcHours = now.getUTCHours();
    
    // Energy: EIA warning on Wednesday
    if (assetInfo.class === 'energy') {
        // Wednesday in UTC (EIA is ~14:30 UTC = 12:30am AEST Thursday)
        if (dayOfWeek === 3 && utcHours >= 10 && utcHours <= 18) {
            warningEl.style.display = 'block';
            warningEl.innerHTML = '&#x1F6A8; <strong>EIA DAY!</strong> Report expected ~14:30 UTC. Avoid new entries until after release.';
        }
    }
    
    // Crypto: Weekend liquidity warning
    if (assetInfo.class === 'crypto') {
        if (dayOfWeek === 0 || dayOfWeek === 6) {
            warningEl.style.display = 'block';
            warningEl.innerHTML = 'WARNING: <strong>WEEKEND:</strong> Reduced liquidity, wider spreads. Consider smaller position or wait for Monday.';
        }
    }
    
    // Bonds: Check if near FOMC (simplified - would need calendar integration)
    // For now just show the standard warning
}

// Expose to global scope
window.getAssetClass = getAssetClass;
window.updateAssetClassInfo = updateAssetClassInfo;

function updateSessionPairRating() {
    const pair = document.getElementById('val-pair')?.value;
    const ratingEl = document.getElementById('session-pair-rating');
    
    if (!ratingEl) return;
    
    if (!pair) {
        ratingEl.innerHTML = '';
        return;
    }
    
    const { rating, session } = getSessionPairRating(pair);
    
    const badgeClass = rating === 'OPTIMAL' ? 'rating-optimal' :
                      rating === 'ACCEPTABLE' ? 'rating-acceptable' :
                      rating === 'AVOID' ? 'rating-avoid' : 'rating-neutral';
    
    ratingEl.innerHTML = `
        <span class="rating-badge ${badgeClass}">${rating}</span>
        <span class="rating-text">for ${session} session</span>
    `;
}

function getCurrentKillZone() {
    const now = new Date();
    const aestOffset = 11;
    const utcHours = now.getUTCHours();
    const utcMins = now.getUTCMinutes();
    const aestHours = (utcHours + aestOffset) % 24;
    const aestMins = utcMins;
    const currentTime = aestHours + (aestMins / 60);
    
    for (const [key, zone] of Object.entries(killZones)) {
        const startTime = zone.startHour + (zone.startMin / 60);
        let endTime = zone.endHour + (zone.endMin / 60);
        
        // Handle overnight zones
        if (endTime < startTime) {
            if (currentTime >= startTime || currentTime < endTime) {
                const remaining = currentTime >= startTime ? 
                    (24 - currentTime) + endTime : endTime - currentTime;
                return { ...zone, key, remainingMins: Math.round(remaining * 60) };
            }
        } else {
            if (currentTime >= startTime && currentTime < endTime) {
                const remaining = endTime - currentTime;
                return { ...zone, key, remainingMins: Math.round(remaining * 60) };
            }
        }
    }
    return null;
}

function updateKillZoneIndicator() {
    const kzIndicator = document.getElementById('kill-zone-indicator');
    const killZone = getCurrentKillZone();
    
    if (!kzIndicator) return;
    
    if (killZone) {
        kzIndicator.style.display = 'flex';
        document.getElementById('kz-name').textContent = killZone.name;
        document.getElementById('kz-desc').textContent = killZone.description;
        document.getElementById('kz-pairs').textContent = `Optimal: ${killZone.pairs.join(', ')}`;
        document.getElementById('kz-timer').textContent = `${killZone.remainingMins} min`;
    } else {
        kzIndicator.style.display = 'none';
    }
}

function useStructureForLimit() {
    const slStructure = document.getElementById('val-sl-structure')?.value;
    const direction = document.getElementById('val-direction')?.value;
    const entry = document.getElementById('val-entry')?.value;
    
    // For long: limit should be at or below support
    // For short: limit should be at or above resistance
    // Use the entry price as the limit (assumes entry is at structure)
    
    if (entry) {
        document.getElementById('limit-entry-price').value = entry;
        updateLimitOrderCalcs();
        showToast('Limit price set from structure level', 'success');
    } else {
        showToast('Enter structure levels first', 'warning');
    }
}

function validateLimitOrder() {
    const limitPrice = parseFloat(document.getElementById('limit-entry-price')?.value) || 0;
    const entry = parseFloat(document.getElementById('val-entry')?.value) || 0;
    const slStructure = parseFloat(document.getElementById('val-sl-structure')?.value) || 0;
    const direction = document.getElementById('val-direction')?.value;
    const pair = document.getElementById('val-pair')?.value || '';
    const pipMultiplier = pair.includes('JPY') ? 100 : 10000;
    
    const validationEl = document.getElementById('limit-validation');
    const iconEl = document.getElementById('limit-val-icon');
    const textEl = document.getElementById('limit-val-text');
    
    if (!validationEl || !limitPrice) {
        if (validationEl) validationEl.style.display = 'none';
        return;
    }
    
    validationEl.style.display = 'flex';
    
    // Check distance from structure
    const distanceFromEntry = Math.abs(limitPrice - entry) * pipMultiplier;
    
    if (distanceFromEntry <= 5) {
        validationEl.className = 'limit-validation valid';
        iconEl.innerHTML = 'OK -';
        textEl.textContent = 'Limit at structure level - good entry';
    } else if (distanceFromEntry <= 15) {
        validationEl.className = 'limit-validation warning';
        iconEl.innerHTML = 'WARNING:';
        textEl.textContent = `${distanceFromEntry.toFixed(1)} pips from structure - consider adjusting`;
    } else {
        validationEl.className = 'limit-validation invalid';
        iconEl.innerHTML = '&#x23F3;';
        textEl.textContent = `${distanceFromEntry.toFixed(1)} pips from structure - in "no man\'s land"`;
    }
}

function updateScaleGradeCheck() {
    const score = parseInt(document.getElementById('val-utcc-score')?.value) || 0;
    const gradeCheckEl = document.getElementById('scale-grade-check');
    const iconEl = document.getElementById('scale-grade-icon');
    const textEl = document.getElementById('scale-grade-text');
    
    if (!gradeCheckEl) return;
    
    if (score >= 85) {
        gradeCheckEl.className = 'scale-grade-check pass';
        iconEl.innerHTML = 'OK -';
        textEl.textContent = `Score ${score} = A+ Grade - Scale-in approved`;
    } else if (score > 0) {
        gradeCheckEl.className = 'scale-grade-check warn';
        iconEl.innerHTML = 'WARNING:';
        textEl.textContent = `Score ${score} - Scale-in only for A+ (&#x2265;85). Consider Market/Limit instead.`;
    } else {
        gradeCheckEl.className = 'scale-grade-check';
        iconEl.innerHTML = '&#x23F3;';
        textEl.textContent = 'Enter UTCC score to verify eligibility';
    }
}

function selectEntryType(type) {
    selectedEntryType = type;
    
    // Update button states
    document.querySelectorAll('.entry-type-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.type === type);
    });
    
    // Show/hide relevant details
    const limitDetails = document.getElementById('limit-order-details');
    const scaleDetails = document.getElementById('scale-in-details');
    
    if (limitDetails) {
        limitDetails.classList.toggle('visible', type === 'limit');
    }
    if (scaleDetails) {
        scaleDetails.classList.toggle('visible', type === 'scale');
    }
    
    updateEntryConfirmation();
}

function updateLimitOrderCalcs() {
    const limitPrice = parseFloat(document.getElementById('limit-entry-price')?.value) || 0;
    const currentEntry = parseFloat(document.getElementById('val-entry')?.value) || 0;
    const pair = document.getElementById('val-pair')?.value || '';
    const pipMultiplier = pair.includes('JPY') ? 100 : 10000;
    
    if (limitPrice && currentEntry) {
        const distance = Math.abs(limitPrice - currentEntry) * pipMultiplier;
        document.getElementById('limit-distance').value = distance.toFixed(1) + ' pips';
    } else {
        document.getElementById('limit-distance').value = '--';
    }
    
    updateEntryConfirmation();
}

function updateScaleCalcs() {
    const percent1 = parseInt(document.getElementById('scale-percent-1')?.value) || 0;
    const percent2 = parseInt(document.getElementById('scale-percent-2')?.value) || 0;
    const total = percent1 + percent2;
    
    const validationEl = document.getElementById('scale-validation');
    if (validationEl) {
        if (total === 100) {
            validationEl.innerHTML = '<span style="color: var(--color-pass);">&#x2713; Total: 100% - Valid split</span>';
        } else if (total < 100) {
            validationEl.innerHTML = `<span style="color: var(--color-warning);">WARNING: Total: ${total}% - Need ${100 - total}% more</span>`;
        } else {
            validationEl.innerHTML = `<span style="color: var(--color-fail);">&#x2716; Total: ${total}% - Exceeds 100%</span>`;
        }
    }
    
    updateEntryConfirmation();
}

function updateSessionTiming() {
    const now = new Date();
    const aestOffset = 11; // AEDT (adjust to 10 for AEST)
    const utcHours = now.getUTCHours();
    const aestHours = (utcHours + aestOffset) % 24;
    
    // Session times in AEST
    // Tokyo: 09:00 - 18:00 AEST
    // London: 17:00 - 02:00 AEST
    // New York: 22:00 - 07:00 AEST
    
    const tokyoActive = aestHours >= 9 && aestHours < 18;
    const londonActive = aestHours >= 17 || aestHours < 2;
    const nyActive = aestHours >= 22 || aestHours < 7;
    
    const tokyoBox = document.getElementById('session-tokyo');
    const londonBox = document.getElementById('session-london');
    const nyBox = document.getElementById('session-newyork');
    
    if (tokyoBox) {
        tokyoBox.classList.toggle('active-session', tokyoActive);
        document.getElementById('tokyo-status').textContent = tokyoActive ? 'ACTIVE' : 'Closed';
    }
    if (londonBox) {
        londonBox.classList.toggle('active-session', londonActive);
        document.getElementById('london-status').textContent = londonActive ? 'ACTIVE' : 'Closed';
    }
    if (nyBox) {
        nyBox.classList.toggle('active-session', nyActive);
        document.getElementById('newyork-status').textContent = nyActive ? 'ACTIVE' : 'Closed';
    }
    
    // Check for low liquidity periods
    const anySessionActive = tokyoActive || londonActive || nyActive;
    const warningEl = document.getElementById('session-warning');
    
    if (warningEl) {
        if (!anySessionActive) {
            warningEl.style.display = 'flex';
            document.getElementById('session-warning-text').textContent = 
                'Low liquidity period - spreads may be wider, consider waiting';
        } else {
            warningEl.style.display = 'none';
        }
    }
    
    // Check Friday close warning
    const dayOfWeek = now.getDay();
    const isFriday = dayOfWeek === 5;
    const isNearClose = isFriday && aestHours >= 3 && aestHours < 7; // Fri close ~07:00 AEST
    
    if (isNearClose && warningEl) {
        warningEl.style.display = 'flex';
        document.getElementById('session-warning-text').textContent = 
            'WARNING: Approaching Friday close - weekend gap risk!';
    }
    
    // Update Kill Zone indicator
    updateKillZoneIndicator();
    
    // Update Entry Decision Panel session info
    updateEntryDecisionPanel();
}

function updateEntryConfirmation() {
    const notNews = document.getElementById('timing-not-news')?.checked;
    const sessionOk = document.getElementById('timing-session-appropriate')?.checked;
    const notFriday = document.getElementById('timing-not-friday-close')?.checked;
    
    // Check entry type specific requirements
    let entryTypeValid = true;
    
    if (selectedEntryType === 'limit') {
        entryTypeValid = !!document.getElementById('limit-entry-price')?.value;
    } else if (selectedEntryType === 'scale') {
        const p1 = parseInt(document.getElementById('scale-percent-1')?.value) || 0;
        const p2 = parseInt(document.getElementById('scale-percent-2')?.value) || 0;
        const price1 = document.getElementById('scale-price-1')?.value;
        const price2 = document.getElementById('scale-price-2')?.value;
        entryTypeValid = (p1 + p2 === 100) && price1 && price2;
    }
    
    const allTimingChecked = notNews && sessionOk && notFriday;
    const allComplete = allTimingChecked && entryTypeValid;
    
    const iconEl = document.getElementById('entry-strategy-icon');
    const textEl = document.getElementById('entry-strategy-text');
    
    if (iconEl && textEl) {
        if (allComplete) {
            iconEl.innerHTML = 'OK -';
            textEl.textContent = `Entry strategy confirmed: ${selectedEntryType.toUpperCase()} order`;
            textEl.style.color = 'var(--color-pass)';
        } else if (allTimingChecked || entryTypeValid) {
            iconEl.innerHTML = '&#x23F3;';
            textEl.textContent = 'Complete all timing confirmations';
            textEl.style.color = 'var(--color-warning)';
        } else {
            iconEl.innerHTML = '&#x23F3;';
            textEl.textContent = 'Complete entry strategy setup';
            textEl.style.color = 'var(--text-muted)';
        }
    }
    
    // Trigger overall validation update
    updateValidationVerdict();
}

// Update sessions on load and every minute
function initEntryStrategy() {
    updateSessionTiming();
    setInterval(updateSessionTiming, 60000);
}

// ============================================
