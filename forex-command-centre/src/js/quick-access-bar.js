// quick-access-bar.js - Extracted from index.html Phase 2
// Quick Access Bar Manager
const QuickAccessBar = (function() {
    const STATE_URL = 'https://api.pineros.club/state';
    const REFRESH_INTERVAL = 30000; // 30 seconds
    
    let openTrades = [];
    let armedInstruments = [];
    let refreshTimer = null;
    
    function formatMoneyValue(val) {
        if (!val) return '—';
        if (typeof val !== 'number') return String(val);
        const sign = val >= 0 ? '+' : '';
        return sign + val.toFixed(2);
    }
    
    function calculateTTLStatus(timestamp) {
        var now = new Date();
        var ts = timestamp ? new Date(timestamp) : now;
        var ageMs = now - ts;
        var ageHours = ageMs / (1000 * 60 * 60);
        
        if (ageHours > 24) return { state: 'expired', label: 'EXPIRED', colour: '#6b7280' };
        if (ageHours > 8) return { state: 'ageing', label: 'AGEING', colour: '#fb923c' };
        if (ageHours < 1) return { state: 'fomo', label: 'FOMO', colour: '#ef4444' };
        return { state: 'ready', label: 'READY', colour: '#22c55e' };
    }
    
    function renderOpenTrades() {
        // Fetch open trades from localStorage (from broker-manager or trade-journal)
        try {
            const tradesJson = localStorage.getItem('ftcc_open_trades');
            if (tradesJson) {
                openTrades = JSON.parse(tradesJson);
            } else {
                openTrades = [];
            }
        } catch (e) {
            console.warn('Could not parse open trades:', e);
            openTrades = [];
        }
        
        updateQuickAccessBar();
    }
    
    async function fetchArmedState() {
        try {
            const response = await fetch(STATE_URL, { 
                method: 'GET',
                cache: 'no-cache'
            });
            if (response.ok) {
                const data = await response.json();
                armedInstruments = data.pairs || [];
                updateQuickAccessBar();
            } else {
                armedInstruments = [];
            }
        } catch (e) {
            console.warn('Could not fetch armed state:', e);
            armedInstruments = [];
        }
    }
    
    function updateQuickAccessBar() {
        const barEl = document.getElementById('quick-access-bar');
        const itemsEl = document.getElementById('quick-access-items');
        
        if (!barEl || !itemsEl) return;
        
        let html = '';
        
        // Add open trades
        if (openTrades && openTrades.length > 0) {
            openTrades.forEach(trade => {
                const pnl = trade.pnl || 0;
                const pnlSign = pnl >= 0 ? '+' : '';
                const colour = pnl >= 0 ? '#22c55e' : '#ef4444';
                const dirEmoji = trade.direction === 'long' || trade.direction === 'buy' ? '📈' : '📉';
                
                html += '<div class="quick-item open-position" onclick="showTab(\'validation\'); setTimeout(function() { document.getElementById(\'val-pair\').value = \'' + (trade.pair || '') + '\'; }, 100);">' +
                    '<span class="quick-item-emoji">' + dirEmoji + '</span>' +
                    '<span class="quick-item-label">' +
                        '<span class="quick-item-pair">' + (trade.pair || '?') + '</span>' +
                        '<span class="quick-item-status" style="color:' + colour + '">' + pnlSign + formatMoneyValue(pnl) + 'R</span>' +
                    '</span>' +
                '</div>';
            });
        }
        
        // Add armed instruments
        if (armedInstruments && armedInstruments.length > 0) {
            armedInstruments.forEach(armed => {
                const ttlStatus = calculateTTLStatus(armed.timestamp);
                const dirEmoji = armed.primary && armed.primary.includes('↑') ? '🎯' : armed.primary && armed.primary.includes('↓') ? '🎯' : '◆';
                const itemClass = ttlStatus.state === 'fomo' ? 'armed-fomo' : 'armed-ready';
                const statusLabel = ttlStatus.state === 'fomo' ? 'FOMO' : 'READY';
                
                html += '<div class="quick-item ' + itemClass + '" onclick="showTab(\'validation\'); setTimeout(function() { document.getElementById(\'val-pair\').value = \'' + (armed.pair || '') + '\'; updateInstitutionalChecklist(); }, 100);" title="' + (armed.pair || '') + ' \u2014 ' + statusLabel + '">' +
                    '<span class="quick-item-emoji">' + dirEmoji + '</span>' +
                    '<span class="quick-item-label">' +
                        '<span class="quick-item-pair">' + (armed.pair || '?') + '</span>' +
                        '<span class="quick-item-status" style="color:' + ttlStatus.colour + '">' + statusLabel + '</span>' +
                    '</span>' +
                '</div>';
            });
        }
        
        if (html === '') {
            // Hide bar if empty
            barEl.classList.add('hidden');
        } else {
            // Show bar with items
            barEl.classList.remove('hidden');
            itemsEl.innerHTML = html;
        }
    }
    
    function init() {
        renderOpenTrades();
        fetchArmedState();
        
        // Refresh periodically
        if (refreshTimer) clearInterval(refreshTimer);
        refreshTimer = setInterval(() => {
            renderOpenTrades();
            fetchArmedState();
        }, REFRESH_INTERVAL);
    }
    
    function destroy() {
        if (refreshTimer) {
            clearInterval(refreshTimer);
            refreshTimer = null;
        }
    }
    
    return {
        init: init,
        destroy: destroy,
        refresh: function() {
            renderOpenTrades();
            fetchArmedState();
        }
    };
})();

// Initialize on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        QuickAccessBar.init();
    });
} else {
    QuickAccessBar.init();
}

// Expose globally for manual refresh
window.refreshQuickAccessBar = function() {
    QuickAccessBar.refresh();
};
