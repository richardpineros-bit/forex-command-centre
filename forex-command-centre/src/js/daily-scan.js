// daily-scan.js - FCC Phase 3 extraction
// Daily scan module

// ============================================
// CHUNK 3: DAILY SCAN
// ============================================

function initDailyScan() {
    const scanDate = document.getElementById('scan-date');
    if (scanDate && !scanDate.value) {
        scanDate.value = new Date().toISOString().split('T')[0];
    }
    loadScanData();
}

function getScanKey(date, session) {
    return `${date}_${session}`;
}

function loadScanData() {
    const date = document.getElementById('scan-date')?.value || new Date().toISOString().split('T')[0];
    const session = document.getElementById('scan-session')?.value || 'asian';
    const scanKey = getScanKey(date, session);
    
    const allScans = loadFromStorage(STORAGE_KEYS.scans, {});
    const scanData = allScans[scanKey] || {};
    
    // Apply saved data to pair cards
    ALL_PAIRS.forEach(pair => {
        const pairData = scanData[pair] || getEmptyPairData();
        updatePairCardFromData(pair, pairData);
    });
}

function getEmptyPairData() {
    return {
        trendScore: null,
        mtf: null,
        volatility: null,
        entryZone: null,
        newsSafe: false,
        direction: null,
        notes: ''
    };
}

function updatePairCardFromData(pair, data) {
    const card = document.getElementById(`pair-${pair.toLowerCase()}`);
    if (!card) return;
    
    // Update criteria dots
    const dots = card.querySelectorAll('.criteria-dot');
    const criteria = [
        data.trendScore >= 80,
        data.mtf === 3,
        ['trend', 'explode', 'quiet'].includes(data.volatility),
        ['hot', 'optimal'].includes(data.entryZone),
        data.newsSafe
    ];
    
    dots.forEach((dot, i) => {
        dot.classList.remove('pass', 'fail');
        if (criteria[i] === true) {
            dot.classList.add('pass');
        } else if (criteria[i] === false && data.trendScore !== null) {
            dot.classList.add('fail');
        }
    });
    
    // Highlight if TRADE READY (all 5 criteria met)
    const allMet = criteria.every(c => c === true);
    card.classList.toggle('trade-ready', allMet);
    
    // Update expanded details if they exist
    const detailsDiv = card.querySelector('.pair-details');
    if (detailsDiv) {
        updatePairDetails(pair, data, detailsDiv);
    }
}

function updatePairDetails(pair, data, container) {
    const trendInput = container.querySelector(`[data-field="trendScore"]`);
    const mtfSelect = container.querySelector(`[data-field="mtf"]`);
    const volSelect = container.querySelector(`[data-field="volatility"]`);
    const zoneSelect = container.querySelector(`[data-field="entryZone"]`);
    const newsCheck = container.querySelector(`[data-field="newsSafe"]`);
    const dirSelect = container.querySelector(`[data-field="direction"]`);
    
    if (trendInput) trendInput.value = data.trendScore || '';
    if (mtfSelect) mtfSelect.value = data.mtf || '';
    if (volSelect) volSelect.value = data.volatility || '';
    if (zoneSelect) zoneSelect.value = data.entryZone || '';
    if (newsCheck) newsCheck.checked = data.newsSafe || false;
    if (dirSelect) dirSelect.value = data.direction || '';
}

function togglePairCard(pair) {
    const card = document.getElementById(`pair-${pair.toLowerCase()}`);
    if (!card) return;
    
    let detailsDiv = card.querySelector('.pair-details');
    
    if (detailsDiv) {
        // Toggle visibility
        detailsDiv.classList.toggle('hidden');
    } else {
        // Create details section
        detailsDiv = document.createElement('div');
        detailsDiv.className = 'pair-details';
        detailsDiv.innerHTML = createPairDetailsHTML(pair);
        card.appendChild(detailsDiv);
        
        // Load any saved data
        loadScanData();
    }
}

function createPairDetailsHTML(pair) {
    return `
        <div class="pair-details-grid">
            <div class="form-group">
                <label class="form-label">Trend Score</label>
                <input type="number" class="form-input" data-pair="${pair}" data-field="trendScore" 
                       min="0" max="100" placeholder="0-100" onchange="onPairDataChange('${pair}')">
            </div>
            <div class="form-group">
                <label class="form-label">MTF</label>
                <select class="form-select" data-pair="${pair}" data-field="mtf" onchange="onPairDataChange('${pair}')">
                    <option value="">-</option>
                    <option value="3">3/3</option>
                    <option value="2">2/3</option>
                    <option value="1">1/3</option>
                    <option value="0">0/3</option>
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">Volatility</label>
                <select class="form-select" data-pair="${pair}" data-field="volatility" onchange="onPairDataChange('${pair}')">
                    <option value="">-</option>
                    <option value="trend">TREND</option>
                    <option value="explode">EXPLODE</option>
                    <option value="quiet">QUIET</option>
                    <option value="low">LOW</option>
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">Entry Zone</label>
                <select class="form-select" data-pair="${pair}" data-field="entryZone" onchange="onPairDataChange('${pair}')">
                    <option value="">-</option>
                    <option value="hot">HOT</option>
                    <option value="optimal">OPTIMAL</option>
                    <option value="acceptable">ACCEPTABLE</option>
                    <option value="extended">EXTENDED</option>
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">Direction</label>
                <select class="form-select" data-pair="${pair}" data-field="direction" onchange="onPairDataChange('${pair}')">
                    <option value="">-</option>
                    <option value="long">LONG</option>
                    <option value="short">SHORT</option>
                </select>
            </div>
            <div class="form-group">
                <label class="checkbox-wrapper" style="margin-top: 1.5rem;">
                    <input type="checkbox" data-pair="${pair}" data-field="newsSafe" onchange="onPairDataChange('${pair}')">
                    <span class="checkbox-label">News Safe</span>
                </label>
            </div>
        </div>
        <div class="flex gap-sm mt-sm">
            <button class="btn btn-primary btn-sm" onclick="validateFromScan('${pair}')"> Validate</button>
            <button class="btn btn-secondary btn-sm" onclick="clearPairData('${pair}')">Clear</button>
        </div>
    `;
}

function onPairDataChange(pair) {
    // Get current values
    const data = getPairDataFromUI(pair);
    
    // Update the card display
    updatePairCardFromData(pair, data);
    
    // Auto-save
    saveScanDataSilent();
}

function getPairDataFromUI(pair) {
    const card = document.getElementById(`pair-${pair.toLowerCase()}`);
    if (!card) return getEmptyPairData();
    
    const trendInput = card.querySelector(`[data-field="trendScore"]`);
    const mtfSelect = card.querySelector(`[data-field="mtf"]`);
    const volSelect = card.querySelector(`[data-field="volatility"]`);
    const zoneSelect = card.querySelector(`[data-field="entryZone"]`);
    const newsCheck = card.querySelector(`[data-field="newsSafe"]`);
    const dirSelect = card.querySelector(`[data-field="direction"]`);
    
    return {
        trendScore: trendInput ? parseInt(trendInput.value) || null : null,
        mtf: mtfSelect ? parseInt(mtfSelect.value) || null : null,
        volatility: volSelect ? volSelect.value || null : null,
        entryZone: zoneSelect ? zoneSelect.value || null : null,
        newsSafe: newsCheck ? newsCheck.checked : false,
        direction: dirSelect ? dirSelect.value || null : null
    };
}

function saveScanData() {
    saveScanDataSilent();
    showToast('Scan data saved', 'success');
}

function saveScanDataSilent() {
    const date = document.getElementById('scan-date')?.value || new Date().toISOString().split('T')[0];
    const session = document.getElementById('scan-session')?.value || 'asian';
    const scanKey = getScanKey(date, session);
    
    const allScans = loadFromStorage(STORAGE_KEYS.scans, {});
    
    // Collect data from all pairs
    const scanData = {};
    ALL_PAIRS.forEach(pair => {
        const data = getPairDataFromUI(pair);
        // Only save if there's actual data
        if (data.trendScore !== null || data.mtf !== null || data.volatility !== null) {
            scanData[pair] = data;
        }
    });
    
    allScans[scanKey] = scanData;
    saveToStorage(STORAGE_KEYS.scans, allScans);
}

function resetAllScans() {
    if (!confirm('Reset all pairs for this scan session?')) return;
    
    ALL_PAIRS.forEach(pair => {
        clearPairData(pair, false);
    });
    
    saveScanDataSilent();
    showToast('All scans reset', 'info');
}

function clearPairData(pair, save = true) {
    const card = document.getElementById(`pair-${pair.toLowerCase()}`);
    if (!card) return;
    
    // Clear all inputs
    card.querySelectorAll('input[type="number"], select').forEach(el => {
        el.value = '';
    });
    card.querySelectorAll('input[type="checkbox"]').forEach(el => {
        el.checked = false;
    });
    
    // Reset dots
    card.querySelectorAll('.criteria-dot').forEach(dot => {
        dot.classList.remove('pass', 'fail');
    });
    
    // Remove trade-ready class
    card.classList.remove('trade-ready');
    
    if (save) {
        saveScanDataSilent();
        showToast(`${pair} cleared`, 'info');
    }
}

function validateFromScan(pair) {
    const data = getPairDataFromUI(pair);
    
    // Switch to validation tab
    showTab('validation');
    
    // Pre-fill validation form
    setTimeout(() => {
        const pairSelect = document.getElementById('val-pair');
        const dirSelect = document.getElementById('val-direction');
        const trendInput = document.getElementById('val-trend-score');
        const mtfSelect = document.getElementById('val-mtf');
        const volSelect = document.getElementById('val-volatility');
        const zoneSelect = document.getElementById('val-entry-zone');
        
        if (pairSelect) pairSelect.value = pair;
        if (dirSelect && data.direction) dirSelect.value = data.direction;
        if (trendInput && data.trendScore) trendInput.value = data.trendScore;
        if (mtfSelect && data.mtf) mtfSelect.value = data.mtf;
        if (volSelect && data.volatility) volSelect.value = data.volatility;
        if (zoneSelect && data.entryZone) zoneSelect.value = data.entryZone;
        
        // Trigger validation update (legacy 5-criteria removed in v4.1.0)
        if (typeof updateInstitutionalChecklist === 'function') updateInstitutionalChecklist();
    }, 100);
}

// Add click handlers to existing pair cards
function initPairCardClicks() {
    ALL_PAIRS.forEach(pair => {
        const card = document.getElementById(`pair-${pair.toLowerCase()}`);
        if (card && !card.hasAttribute('data-click-init')) {
            card.setAttribute('data-click-init', 'true');
            card.style.cursor = 'pointer';
            card.addEventListener('click', (e) => {
                // Don't toggle if clicking on inputs
                if (e.target.matches('input, select, button')) return;
                togglePairCard(pair);
            });
        }
    });
}

// Add styles for pair details
const pairDetailsStyles = document.createElement('style');
pairDetailsStyles.textContent = `
    .pair-details {
        margin-top: var(--spacing-md);
        padding-top: var(--spacing-md);
        border-top: 1px solid var(--border-primary);
    }
    .pair-details.hidden {
        display: none;
    }
    .pair-details-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: var(--spacing-sm);
    }
    .pair-card.trade-ready {
        border-color: var(--color-pass) !important;
        box-shadow: 0 0 10px rgba(34, 197, 94, 0.3);
    }
    .pair-card.trade-ready .pair-name {
        color: var(--color-pass);
    }
    .criteria-dot.pass {
        background-color: var(--color-pass);
    }
    .criteria-dot.fail {
        background-color: var(--color-fail);
    }
    @media (max-width: 600px) {
        .pair-details-grid {
            grid-template-columns: repeat(2, 1fr);
        }
    }
`;
document.head.appendChild(pairDetailsStyles);

// Initialize pair card clicks on load
document.addEventListener('DOMContentLoaded', initPairCardClicks);

// CHUNK 3 COMPLETE - Daily Scan
