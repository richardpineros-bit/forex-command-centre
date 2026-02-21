// ============================================
// REGIME CHECK MODULE v1.0
// Institutional Pre-Session Regime Assessment
// ============================================

(function() {
    'use strict';

    // ============================================
    // STORAGE KEY
    // ============================================
    const REGIME_STORAGE_KEY = 'ftcc_regime';
    const NEWS_STALE_HOURS = 12;
    // v3.4.0: News data now stored inside ftcc_regime object (syncs to server)
    // Legacy keys 'forex_upcoming_news' / 'forex_news_timestamp' migrated on load

    // ============================================
    // REGIME CONSTANTS
    // ============================================
    const MARKET_STATES = ['expansion', 'balanced', 'transition', 'compression'];
    const VOLATILITY_READS = ['expanding', 'stable', 'contracting'];
    const STRUCTURE_QUALITY = ['clean', 'minor-overlap', 'damaged'];
    const SESSION_CONTEXT = ['prime', 'acceptable', 'dead-zone'];
    const MACRO_AWARENESS = ['clear', 'caution', 'stand-down'];
    const PRIMARY_RISKS = ['none', 'news', 'late-trend', 'low-liquidity', 'correlation'];

    const SESSIONS = {
        tokyo: { name: 'Tokyo', icon: '&#x1F1EF;&#x1F1F5;' },
        london: { name: 'London', icon: '&#x1F1EC;&#x1F1E7;' },
        newyork: { name: 'New York', icon: '&#x1F1FA;&#x1F1F8;' }
    };

    // ============================================
    // PERMISSION LEVELS
    // ============================================
    const PERMISSION_LEVELS = {
        FULL: { level: 'full', label: 'FULL PERMISSION', color: 'var(--color-pass)', icon: '&#x2714;' },
        CONDITIONAL: { level: 'conditional', label: 'CONDITIONAL', color: 'var(--color-warning)', icon: '&#x26A0;' },
        STAND_DOWN: { level: 'stand-down', label: 'STAND DOWN', color: 'var(--color-fail)', icon: '&#x1F6D1;' }
    };

    // ============================================
    // DEFAULT REGIME DATA STRUCTURE
    // ============================================
    function getDefaultRegimeData() {
        return {
            version: '1.1',
            dailyContext: null,
            sessions: {
                tokyo: null,
                london: null,
                newyork: null
            },
            overrides: [],
            tracking: [],
            activeOverride: null,
            upcomingNews: {
                text: '',
                timestamp: null
            }
        };
    }

    // ============================================
    // STORAGE FUNCTIONS
    // ============================================
    function loadRegimeData() {
        try {
            const data = localStorage.getItem(REGIME_STORAGE_KEY);
            if (data) {
                const parsed = JSON.parse(data);

                // v3.4.0: Ensure upcomingNews field exists (migration)
                if (!parsed.upcomingNews) {
                    parsed.upcomingNews = { text: '', timestamp: null };
                }

                // v3.4.0: Migrate legacy standalone news keys into regime object
                var legacyText = localStorage.getItem('forex_upcoming_news');
                var legacyTs = localStorage.getItem('forex_news_timestamp');
                if (legacyText && !parsed.upcomingNews.text) {
                    parsed.upcomingNews.text = legacyText;
                    parsed.upcomingNews.timestamp = legacyTs ? parseInt(legacyTs) : null;
                    // Save migrated data and clean up legacy keys
                    localStorage.setItem(REGIME_STORAGE_KEY, JSON.stringify(parsed));
                    localStorage.removeItem('forex_upcoming_news');
                    localStorage.removeItem('forex_news_timestamp');
                    console.log('News data migrated into regime object');
                }

                // Check if data is from today
                if (parsed.dailyContext && isToday(parsed.dailyContext.timestamp)) {
                    return parsed;
                }
            }
        } catch (e) {
            console.error('Error loading regime data:', e);
        }
        return getDefaultRegimeData();
    }

    function saveRegimeData(data) {
        try {
            localStorage.setItem(REGIME_STORAGE_KEY, JSON.stringify(data));
            return true;
        } catch (e) {
            console.error('Error saving regime data:', e);
            return false;
        }
    }

    function isToday(timestamp) {
        if (!timestamp) return false;
        const date = new Date(timestamp);
        const today = new Date();
        return date.toDateString() === today.toDateString();
    }

    function isCurrentSession(sessionData) {
        if (!sessionData || !sessionData.timestamp) return false;
        const sessionTime = new Date(sessionData.timestamp);
        const now = new Date();
        // Session check valid for 8 hours
        const hoursDiff = (now - sessionTime) / (1000 * 60 * 60);
        return hoursDiff < 8;
    }

    // ============================================
    // PERMISSION CALCULATION
    // ============================================
    function calculatePermission(sessionData) {
        if (!sessionData) return null;

        const { marketState, volatility, structure, sessionContext, macro } = sessionData;

        // Stand Down conditions (any one triggers)
        if (macro === 'stand-down') return PERMISSION_LEVELS.STAND_DOWN;
        if (structure === 'damaged') return PERMISSION_LEVELS.STAND_DOWN;
        if (sessionContext === 'dead-zone') return PERMISSION_LEVELS.STAND_DOWN;
        if (marketState === 'compression') return PERMISSION_LEVELS.STAND_DOWN;

        // Conditional conditions
        if (marketState === 'transition') return PERMISSION_LEVELS.CONDITIONAL;
        if (macro === 'caution') return PERMISSION_LEVELS.CONDITIONAL;
        if (structure === 'minor-overlap') return PERMISSION_LEVELS.CONDITIONAL;
        if (volatility === 'contracting') return PERMISSION_LEVELS.CONDITIONAL;

        // Full permission
        return PERMISSION_LEVELS.FULL;
    }

    // ============================================
    // DAILY CONTEXT FUNCTIONS
    // ============================================
    function saveDailyContext(marketState, primaryRisk, keyDriver) {
        const data = loadRegimeData();
        data.dailyContext = {
            marketState: marketState,
            primaryRisk: primaryRisk,
            keyDriver: keyDriver,
            timestamp: new Date().toISOString(),
            locked: true
        };
        saveRegimeData(data);
        renderDailyContext();
        updateRegimeStatus();
    }

    function isDailyContextComplete() {
        const data = loadRegimeData();
        return data.dailyContext && data.dailyContext.locked && isToday(data.dailyContext.timestamp);
    }

    // ============================================
    // SESSION REGIME FUNCTIONS
    // ============================================
    function saveSessionRegime(session, formData) {
        const data = loadRegimeData();
        const permission = calculatePermission(formData);
        
        data.sessions[session] = {
            ...formData,
            permission: permission,
            timestamp: new Date().toISOString(),
            locked: true
        };
        
        saveRegimeData(data);
        renderSessionCard(session);
        updateRegimeStatus();
        checkPreTradeAccess();
    }

    function isSessionRegimeComplete(session) {
        const data = loadRegimeData();
        const sessionData = data.sessions[session];
        return sessionData && sessionData.locked && isCurrentSession(sessionData);
    }

    function getActiveSession() {
        // Determine current session based on AEST time
        const now = new Date();
        const aestHour = new Date(now.toLocaleString('en-US', { timeZone: 'Australia/Sydney' })).getHours();
        
        // Tokyo: 9:00 AM - 6:00 PM AEST
        // London: 5:00 PM - 2:00 AM AEST
        // New York: 10:00 PM - 7:00 AM AEST
        
        if (aestHour >= 9 && aestHour < 17) return 'tokyo';
        if (aestHour >= 17 || aestHour < 2) return 'london';
        if (aestHour >= 22 || aestHour < 7) return 'newyork';
        
        return null;
    }

    function getCurrentPermission() {
        const data = loadRegimeData();
        const activeSession = getActiveSession();
        
        if (!activeSession) return null;
        
        const sessionData = data.sessions[activeSession];
        if (!sessionData || !isCurrentSession(sessionData)) return null;
        
        return sessionData.permission;
    }

    // ============================================
    // OVERRIDE PROTOCOL
    // ============================================
    function hasActiveOverride() {
        const data = loadRegimeData();
        if (!data.activeOverride) return false;
        
        // Check if override is still valid (not closed)
        return data.activeOverride.status === 'active';
    }

    function canCreateOverride() {
        const data = loadRegimeData();
        const activeSession = getActiveSession();
        
        // Check if there's already an active override
        if (hasActiveOverride()) return false;
        
        // Check permission level - only allow override for CONDITIONAL or STAND_DOWN
        const permission = getCurrentPermission();
        if (!permission) return false;
        if (permission.level === 'full') return false;
        
        return true;
    }

    function createOverride(reasoning) {
        if (!canCreateOverride()) return false;
        if (!reasoning || reasoning.trim().length < 10) return false;
        
        const data = loadRegimeData();
        const activeSession = getActiveSession();
        const permission = getCurrentPermission();
        
        const override = {
            id: Date.now().toString(36),
            session: activeSession,
            originalPermission: permission.level,
            reasoning: reasoning.trim(),
            timestamp: new Date().toISOString(),
            status: 'active',
            riskCap: 0.5, // 0.5R max
            tradeId: null
        };
        
        data.activeOverride = override;
        data.overrides.push(override);
        saveRegimeData(data);
        
        renderOverrideStatus();
        return true;
    }

    function closeOverride(tradeId) {
        const data = loadRegimeData();
        if (!data.activeOverride) return;
        
        data.activeOverride.status = 'closed';
        data.activeOverride.tradeId = tradeId;
        data.activeOverride.closedAt = new Date().toISOString();
        
        // Update in overrides array
        const idx = data.overrides.findIndex(o => o.id === data.activeOverride.id);
        if (idx >= 0) {
            data.overrides[idx] = { ...data.activeOverride };
        }
        
        data.activeOverride = null;
        saveRegimeData(data);
        renderOverrideStatus();
    }

    // ============================================
    // TRACKING FUNCTIONS
    // ============================================
    function addTrackingEntry(session, regimeCalled, actualBehaviour, correct, behaviourMatchedPermission, notes) {
        const data = loadRegimeData();
        
        data.tracking.push({
            id: Date.now().toString(36),
            date: new Date().toISOString(),
            session: session,
            regimeCalled: regimeCalled,
            actualBehaviour: actualBehaviour,
            correct: correct,
            behaviourMatchedPermission: behaviourMatchedPermission,
            notes: notes
        });
        
        // Keep last 100 entries
        if (data.tracking.length > 100) {
            data.tracking = data.tracking.slice(-100);
        }
        
        saveRegimeData(data);
        renderTrackingTable();
    }

    function getTrackingStats() {
        const data = loadRegimeData();
        const entries = data.tracking;
        
        if (entries.length === 0) {
            return { total: 0, correct: 0, accuracy: 0, permissionMatch: 0 };
        }
        
        const correct = entries.filter(e => e.correct).length;
        const permissionMatch = entries.filter(e => e.behaviourMatchedPermission).length;
        
        return {
            total: entries.length,
            correct: correct,
            accuracy: Math.round((correct / entries.length) * 100),
            permissionMatch: Math.round((permissionMatch / entries.length) * 100)
        };
    }

    // ============================================
    // UPCOMING NEWS FUNCTIONS (v3.4.0: stored inside ftcc_regime for server sync)
    // ============================================
    function loadUpcomingNews() {
        var data = loadRegimeData();
        var news = data.upcomingNews || { text: '', timestamp: null };
        return {
            text: news.text || '',
            timestamp: news.timestamp || null
        };
    }

    function saveUpcomingNews() {
        var textarea = document.getElementById('upcoming-news-input');
        if (!textarea) return;
        
        var newsText = textarea.value.trim();
        var now = Date.now();
        var data = loadRegimeData();

        // Ensure upcomingNews field exists
        if (!data.upcomingNews) {
            data.upcomingNews = { text: '', timestamp: null };
        }

        data.upcomingNews.text = newsText;
        data.upcomingNews.timestamp = now;

        saveRegimeData(data);
        renderUpcomingNews();
        
        // Show toast if available
        if (typeof showToast === 'function') {
            showToast('News saved successfully', 'success');
        }
    }

    function isNewsStale() {
        var data = loadRegimeData();
        var ts = data.upcomingNews ? data.upcomingNews.timestamp : null;
        if (!ts) return true;
        
        var savedTime = new Date(ts);
        var now = new Date();
        var hoursAgo = (now - savedTime) / (1000 * 60 * 60);
        return hoursAgo > NEWS_STALE_HOURS;
    }

    function getNewsTimestampDisplay() {
        var data = loadRegimeData();
        var ts = data.upcomingNews ? data.upcomingNews.timestamp : null;
        if (!ts) return 'Never updated';
        
        var savedTime = new Date(ts);
        return 'Updated: ' + savedTime.toLocaleString('en-AU', { 
            day: 'numeric', 
            month: 'short', 
            hour: '2-digit', 
            minute: '2-digit' 
        });
    }

    function renderUpcomingNews() {
        const container = document.getElementById('upcoming-news-container');
        if (!container) return;
        
        const news = loadUpcomingNews();
        const stale = isNewsStale();
        const timestampDisplay = getNewsTimestampDisplay();
        
        const staleStyle = stale ? 'background: rgba(234, 179, 8, 0.2); color: var(--color-warning);' : '';
        
        container.innerHTML = `
            <div class="card-header" style="display: flex; justify-content: space-between; align-items: center;">
                <h2 class="card-title">&#x1F4F0; Upcoming News (Next 24h)</h2>
                <div style="display: flex; align-items: center; gap: var(--spacing-sm);">
                    <span class="regime-badge-info" style="font-size: 0.7rem; ${staleStyle}">${timestampDisplay}</span>
                    <a href="https://www.forexfactory.com/calendar" target="_blank" class="btn btn-secondary btn-sm" title="Open Forex Factory">&#x1F4C5; Calendar</a>
                </div>
            </div>
            <div style="padding: var(--spacing-md);">
                ${stale ? `
                <div class="news-stale-warning">
                    &#x26A0; News data is stale (>12h old). Check Forex Factory and update.
                </div>
                ` : ''}
                <textarea 
                    id="upcoming-news-input" 
                    class="form-input" 
                    rows="4" 
                    placeholder="Paste upcoming news here from Forex Factory...

Example:
15:30 USD - Core CPI m/m (HIGH)
21:00 NZD - Official Cash Rate (HIGH)"
                    style="font-family: var(--font-body); resize: vertical; min-height: 100px;"
                >${news.text}</textarea>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: var(--spacing-sm);">
                    <span style="font-size: 0.75rem; color: var(--text-muted);">Check before every session</span>
                    <button class="btn btn-primary btn-sm" onclick="RegimeModule.saveUpcomingNews()">&#x1F4BE; Save News</button>
                </div>
            </div>
        `;
    }

    // ============================================
    // PRE-TRADE ACCESS GATING
    // ============================================
    function checkPreTradeAccess() {
        const activeSession = getActiveSession();
        
        // Must have daily context
        if (!isDailyContextComplete()) {
            return { allowed: false, reason: 'Complete Daily Context Regime first' };
        }
        
        // Must have session regime for active session
        if (activeSession && !isSessionRegimeComplete(activeSession)) {
            return { allowed: false, reason: `Complete ${SESSIONS[activeSession].name} Session Regime first` };
        }
        
        // Check permission level
        const permission = getCurrentPermission();
        if (permission && permission.level === 'stand-down' && !hasActiveOverride()) {
            return { allowed: false, reason: 'Permission is STAND DOWN. Create override to proceed.' };
        }
        
        return { allowed: true, reason: null };
    }

    // ============================================
    // RENDER FUNCTIONS
    // ============================================
    function renderDailyContext() {
        const container = document.getElementById('daily-context-container');
        if (!container) return;
        
        const data = loadRegimeData();
        const dc = data.dailyContext;
        
        if (dc && dc.locked && isToday(dc.timestamp)) {
            // Show locked state
            container.innerHTML = `
                <div class="regime-locked-card">
                    <div class="regime-locked-header">
                        <span class="regime-locked-icon">&#x1F512;</span>
                        <span>Daily Context Locked</span>
                        <span class="regime-locked-time">${new Date(dc.timestamp).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <div class="regime-locked-content">
                        <div class="regime-locked-item">
                            <span class="regime-locked-label">Market State:</span>
                            <span class="regime-locked-value regime-state-${dc.marketState}">${dc.marketState.toUpperCase()}</span>
                        </div>
                        <div class="regime-locked-item">
                            <span class="regime-locked-label">Primary Risk:</span>
                            <span class="regime-locked-value">${dc.primaryRisk === 'none' ? 'None identified' : dc.primaryRisk.replace('-', ' ').toUpperCase()}</span>
                        </div>
                        <div class="regime-locked-item">
                            <span class="regime-locked-label">Key Driver:</span>
                            <span class="regime-locked-value">${dc.keyDriver || 'Not specified'}</span>
                        </div>
                    </div>
                </div>
            `;
        } else {
            // Show input form with Quick Scan Guide
            container.innerHTML = `
                <div class="regime-form-card">
                    
                    <!-- Quick Scan Guide -->
                    <div class="quick-scan-guide">
                        <div class="quick-scan-header" onclick="toggleQuickScanGuide()">
                            <span class="quick-scan-icon">&#x1F50D;</span>
                            <span class="quick-scan-title">Quick Scan Guide</span>
                            <span class="quick-scan-subtitle">Do this first (2-3 mins)</span>
                            <span class="quick-scan-toggle" id="quick-scan-toggle">&#x25BC;</span>
                        </div>
                        <div class="quick-scan-content" id="quick-scan-content">
                            
                            <div class="quick-scan-step">
                                <div class="quick-scan-step-header">
                                    <span class="step-number">1</span>
                                    <span class="step-title">Open EURUSD or GBPUSD 4H chart</span>
                                </div>
                                <div class="quick-scan-question">
                                    <p><strong>Look at the last 10-15 candles. What do you see?</strong></p>
                                    <div class="scan-options">
                                        <div class="scan-option" onclick="selectScanOption(this, 'expansion')">
                                            <span class="scan-option-icon">&#x2197;</span>
                                            <span class="scan-option-text">Moving clearly in ONE direction<br><small>Big candles, obvious trend, easy to see</small></span>
                                        </div>
                                        <div class="scan-option" onclick="selectScanOption(this, 'balanced')">
                                            <span class="scan-option-icon">&#x2194;</span>
                                            <span class="scan-option-text">Bouncing UP and DOWN between two levels<br><small>Ping-pong action, staying in a range</small></span>
                                        </div>
                                        <div class="scan-option" onclick="selectScanOption(this, 'transition')">
                                            <span class="scan-option-icon">&#x2753;</span>
                                            <span class="scan-option-text">Messy and confusing<br><small>Breakouts failing, can't tell direction</small></span>
                                        </div>
                                        <div class="scan-option" onclick="selectScanOption(this, 'compression')">
                                            <span class="scan-option-icon">&#x1F634;</span>
                                            <span class="scan-option-text">Barely moving, tiny candles<br><small>Flat, boring, like it's sleeping</small></span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="quick-scan-step">
                                <div class="quick-scan-step-header">
                                    <span class="step-number">2</span>
                                    <span class="step-title">Check for risks</span>
                                </div>
                                <div class="quick-scan-checklist">
                                    <label class="scan-check">
                                        <input type="checkbox" id="scan-risk-news" onchange="updateScanRisk()">
                                        <span>Big news today or big news just happened?</span>
                                        <span class="scan-check-result">= News risk</span>
                                    </label>
                                    <label class="scan-check">
                                        <input type="checkbox" id="scan-risk-late" onchange="updateScanRisk()">
                                        <span>Has price already moved a lot? Am I late?</span>
                                        <span class="scan-check-result">= Late trend risk</span>
                                    </label>
                                    <label class="scan-check">
                                        <input type="checkbox" id="scan-risk-liquidity" onchange="updateScanRisk()">
                                        <span>Is it a holiday, Friday arvo, or weird hours?</span>
                                        <span class="scan-check-result">= Low liquidity risk</span>
                                    </label>
                                    <label class="scan-check">
                                        <input type="checkbox" id="scan-risk-correlation" onchange="updateScanRisk()">
                                        <span>Do I have open trades that would move the same way?</span>
                                        <span class="scan-check-result">= Correlation risk</span>
                                    </label>
                                </div>
                            </div>
                            
                            <div class="quick-scan-step">
                                <div class="quick-scan-step-header">
                                    <span class="step-number">3</span>
                                    <span class="step-title">Why is the market like this?</span>
                                </div>
                                <div class="quick-scan-driver">
                                    <p>Finish this sentence:</p>
                                    <p class="driver-prompt">"The market is <span id="driver-state-display">_____</span> because..."</p>
                                    <input type="text" class="form-input" id="scan-key-driver" placeholder="e.g. USD is weak after jobs data, waiting for FOMC, London reversed Asia...">
                                </div>
                            </div>
                            
                            <div class="quick-scan-result" id="quick-scan-result">
                                <p>Complete the scan above, then your answers will auto-fill below.</p>
                            </div>
                            
                            <button class="btn btn-secondary" onclick="applyScanResults()" style="width: 100%;">
                                &#x2193; Apply to Form Below
                            </button>
                        </div>
                    </div>
                    
                    <p class="regime-form-instruction">Declare once per day before any trading. This sets your background expectation.</p>
                    
                    <div class="regime-form-grid">
                        <div class="form-group">
                            <label class="form-label">Market State <span class="required">*</span></label>
                            <select class="form-select" id="daily-market-state">
                                <option value="">Select state...</option>
                                <option value="expansion">EXPANSION - Price moving clearly one way</option>
                                <option value="balanced">BALANCED - Bouncing between levels</option>
                                <option value="transition">TRANSITION - Messy, confusing</option>
                                <option value="compression">COMPRESSION - Barely moving</option>
                            </select>
                        </div>
                        
                        <div class="form-group">
                            <label class="form-label">Primary Risk</label>
                            <select class="form-select" id="daily-primary-risk">
                                <option value="none">None identified</option>
                                <option value="news">News - Big event today/recent</option>
                                <option value="late-trend">Late trend - Move already happened</option>
                                <option value="low-liquidity">Low liquidity - Thin market</option>
                                <option value="correlation">Correlation - Overlapping exposure</option>
                            </select>
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label class="form-label">Key Driver (why is the market like this?)</label>
                        <input type="text" class="form-input" id="daily-key-driver" placeholder="The market is [state] because...">
                    </div>
                    
                    <div class="regime-form-warning">
                        <span>&#x26A0;</span>
                        <span>Once submitted, this cannot be changed until tomorrow.</span>
                    </div>
                    
                    <button class="btn btn-primary" onclick="RegimeModule.submitDailyContext()">
                        &#x1F512; Lock Daily Context
                    </button>
                </div>
            `;
        }
    }
    
    // Quick Scan Guide functions
    window.toggleQuickScanGuide = function() {
        const content = document.getElementById('quick-scan-content');
        const toggle = document.getElementById('quick-scan-toggle');
        if (content && toggle) {
            const isVisible = content.style.display !== 'none';
            content.style.display = isVisible ? 'none' : 'block';
            toggle.innerHTML = isVisible ? '&#x25BC;' : '&#x25B2;';
        }
    };
    
    window.selectScanOption = function(el, state) {
        // Remove selected from siblings
        const options = el.parentElement.querySelectorAll('.scan-option');
        options.forEach(opt => opt.classList.remove('selected'));
        
        // Select this one
        el.classList.add('selected');
        el.dataset.state = state;
        
        // Update driver prompt
        const stateDisplay = document.getElementById('driver-state-display');
        if (stateDisplay) {
            const stateNames = {
                expansion: 'EXPANSION',
                balanced: 'BALANCED',
                transition: 'TRANSITION',
                compression: 'COMPRESSION'
            };
            stateDisplay.textContent = stateNames[state] || '_____';
        }
        
        updateScanResult();
    };
    
    window.updateScanRisk = function() {
        updateScanResult();
    };
    
    function updateScanResult() {
        const resultDiv = document.getElementById('quick-scan-result');
        if (!resultDiv) return;
        
        const selectedState = document.querySelector('.scan-option.selected');
        const state = selectedState ? selectedState.dataset.state : null;
        
        let risk = 'none';
        if (document.getElementById('scan-risk-news')?.checked) risk = 'news';
        else if (document.getElementById('scan-risk-late')?.checked) risk = 'late-trend';
        else if (document.getElementById('scan-risk-liquidity')?.checked) risk = 'low-liquidity';
        else if (document.getElementById('scan-risk-correlation')?.checked) risk = 'correlation';
        
        if (state) {
            const stateNames = {
                expansion: 'EXPANSION',
                balanced: 'BALANCED', 
                transition: 'TRANSITION',
                compression: 'COMPRESSION'
            };
            const riskNames = {
                none: 'None',
                news: 'News',
                'late-trend': 'Late Trend',
                'low-liquidity': 'Low Liquidity',
                correlation: 'Correlation'
            };
            
            resultDiv.innerHTML = `
                <div class="scan-result-summary">
                    <div class="scan-result-item">
                        <span>Market State:</span>
                        <strong class="regime-state-${state}">${stateNames[state]}</strong>
                    </div>
                    <div class="scan-result-item">
                        <span>Primary Risk:</span>
                        <strong>${riskNames[risk]}</strong>
                    </div>
                </div>
            `;
        } else {
            resultDiv.innerHTML = '<p>Select a market state above to see your summary.</p>';
        }
    }
    
    window.applyScanResults = function() {
        const selectedState = document.querySelector('.scan-option.selected');
        const state = selectedState ? selectedState.dataset.state : '';
        
        let risk = 'none';
        if (document.getElementById('scan-risk-news')?.checked) risk = 'news';
        else if (document.getElementById('scan-risk-late')?.checked) risk = 'late-trend';
        else if (document.getElementById('scan-risk-liquidity')?.checked) risk = 'low-liquidity';
        else if (document.getElementById('scan-risk-correlation')?.checked) risk = 'correlation';
        
        const driver = document.getElementById('scan-key-driver')?.value || '';
        
        // Apply to form
        const stateSelect = document.getElementById('daily-market-state');
        const riskSelect = document.getElementById('daily-primary-risk');
        const driverInput = document.getElementById('daily-key-driver');
        
        if (stateSelect && state) stateSelect.value = state;
        if (riskSelect) riskSelect.value = risk;
        if (driverInput && driver) driverInput.value = driver;
        
        // Collapse guide
        toggleQuickScanGuide();
        
        // Scroll to form
        stateSelect?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    function renderSessionCard(session) {
        const container = document.getElementById(`session-${session}-container`);
        if (!container) return;
        
        const data = loadRegimeData();
        const sessionData = data.sessions[session];
        const sessionInfo = SESSIONS[session];
        
        if (sessionData && sessionData.locked && isCurrentSession(sessionData)) {
            // Show locked state
            const permission = sessionData.permission;
            container.innerHTML = `
                <div class="regime-session-locked">
                    <div class="regime-session-header">
                        <span class="regime-session-icon">${sessionInfo.icon}</span>
                        <span class="regime-session-name">${sessionInfo.name}</span>
                        <span class="regime-permission-badge" style="background: ${permission.color};">${permission.label}</span>
                    </div>
                    <div class="regime-session-details">
                        <div class="regime-detail-row">
                            <span>State:</span>
                            <span class="regime-state-${sessionData.marketState}">${sessionData.marketState.toUpperCase()}</span>
                        </div>
                        <div class="regime-detail-row">
                            <span>Volatility:</span>
                            <span>${sessionData.volatility}</span>
                        </div>
                        <div class="regime-detail-row">
                            <span>Structure:</span>
                            <span>${sessionData.structure.replace('-', ' ')}</span>
                        </div>
                        <div class="regime-detail-row">
                            <span>Session:</span>
                            <span>${sessionData.sessionContext.replace('-', ' ')}</span>
                        </div>
                        <div class="regime-detail-row">
                            <span>Macro:</span>
                            <span class="regime-macro-${sessionData.macro}">${sessionData.macro.replace('-', ' ').toUpperCase()}</span>
                        </div>
                    </div>
                    <div class="regime-session-time">
                        Locked at ${new Date(sessionData.timestamp).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                </div>
            `;
        } else {
            // Show input form
            container.innerHTML = `
                <div class="regime-session-form">
                    <div class="regime-session-header">
                        <span class="regime-session-icon">${sessionInfo.icon}</span>
                        <span class="regime-session-name">${sessionInfo.name} Session</span>
                        <span class="regime-session-badge pending">PENDING</span>
                    </div>
                    
                    <div class="regime-session-fields">
                        <div class="form-group">
                            <label class="form-label">Market State <span class="required">*</span>
                                <span class="regime-tooltip">&#x2139;
                                    <span class="regime-tooltip-content">
                                        <strong>EXPANSION:</strong> Price moving clearly in one direction. Easy to see the trend.<br><br>
                                        <strong>BALANCED:</strong> Price bouncing between two levels. Up, down, up, down.<br><br>
                                        <strong>TRANSITION:</strong> Messy. Can't tell what's happening. Breakouts keep failing.<br><br>
                                        <strong>COMPRESSION:</strong> Barely moving. Tiny candles. Market is sleeping.
                                    </span>
                                </span>
                            </label>
                            <select class="form-select" id="session-${session}-state">
                                <option value="">Select...</option>
                                <option value="expansion">Expansion</option>
                                <option value="balanced">Balanced</option>
                                <option value="transition">Transition</option>
                                <option value="compression">Compression</option>
                            </select>
                        </div>
                        
                        <div class="form-group">
                            <label class="form-label">Volatility Read <span class="required">*</span>
                                <span class="regime-tooltip">&#x2139;
                                    <span class="regime-tooltip-content">
                                        <strong>EXPANDING:</strong> Candles getting bigger. Market waking up. Good for trends.<br><br>
                                        <strong>STABLE:</strong> Normal sized candles. Nothing unusual.<br><br>
                                        <strong>CONTRACTING:</strong> Candles getting smaller. Market going quiet. Be careful.
                                    </span>
                                </span>
                            </label>
                            <select class="form-select" id="session-${session}-volatility">
                                <option value="">Select...</option>
                                <option value="expanding">Expanding</option>
                                <option value="stable">Stable</option>
                                <option value="contracting">Contracting</option>
                            </select>
                        </div>
                        
                        <div class="form-group">
                            <label class="form-label">Structure Quality <span class="required">*</span>
                                <span class="regime-tooltip">&#x2139;
                                    <span class="regime-tooltip-content">
                                        <strong>CLEAN:</strong> Easy to see highs and lows. Clear pattern. You know where to put your stop.<br><br>
                                        <strong>MINOR OVERLAP:</strong> A bit messy but you can still see the trend. Less confident.<br><br>
                                        <strong>DAMAGED:</strong> Total mess. Highs and lows all over the place. Don't trade this.
                                    </span>
                                </span>
                            </label>
                            <select class="form-select" id="session-${session}-structure">
                                <option value="">Select...</option>
                                <option value="clean">Clean</option>
                                <option value="minor-overlap">Minor overlap</option>
                                <option value="damaged">Damaged</option>
                            </select>
                        </div>
                        
                        <div class="form-group">
                            <label class="form-label">Session Context <span class="required">*</span>
                                <span class="regime-tooltip">&#x2139;
                                    <span class="regime-tooltip-content">
                                        <strong>PRIME:</strong> Best trading hours. London or NY open. Good volume.<br><br>
                                        <strong>ACCEPTABLE:</strong> Session is open but not peak hours. Can still trade.<br><br>
                                        <strong>DEAD ZONE:</strong> Between sessions or lunch time. Low volume. Don't trade.
                                    </span>
                                </span>
                            </label>
                            <select class="form-select" id="session-${session}-context">
                                <option value="">Select...</option>
                                <option value="prime">Prime window</option>
                                <option value="acceptable">Acceptable</option>
                                <option value="dead-zone">Dead zone</option>
                            </select>
                        </div>
                        
                        <div class="form-group">
                            <label class="form-label">Macro Awareness <span class="required">*</span>
                                <span class="regime-tooltip">&#x2139;
                                    <span class="regime-tooltip-content">
                                        <strong>CLEAR:</strong> No big news coming. Safe to trade normally.<br><br>
                                        <strong>CAUTION:</strong> News coming soon OR big news just happened. Be careful, reduce size.<br><br>
                                        <strong>STAND DOWN:</strong> News happening right now or market still reacting. Don't trade.
                                    </span>
                                </span>
                            </label>
                            <select class="form-select" id="session-${session}-macro">
                                <option value="">Select...</option>
                                <option value="clear">Clear</option>
                                <option value="caution">Caution</option>
                                <option value="stand-down">Stand Down</option>
                            </select>
                        </div>
                    </div>
                    
                    <button class="btn btn-primary" onclick="RegimeModule.submitSessionRegime('${session}')">
                        &#x1F512; Lock ${sessionInfo.name} Regime
                    </button>
                </div>
            `;
        }
    }

    function renderOverrideStatus() {
        const container = document.getElementById('override-status-container');
        if (!container) return;
        
        const data = loadRegimeData();
        const permission = getCurrentPermission();
        
        if (!permission) {
            container.innerHTML = '<p class="text-muted">Complete session regime to see override options.</p>';
            return;
        }
        
        if (permission.level === 'full') {
            container.innerHTML = `
                <div class="override-not-needed">
                    <span>&#x2714;</span>
                    <span>Full permission granted. No override needed.</span>
                </div>
            `;
            return;
        }
        
        if (hasActiveOverride()) {
            const override = data.activeOverride;
            container.innerHTML = `
                <div class="override-active">
                    <div class="override-active-header">
                        <span>&#x26A0;</span>
                        <span>OVERRIDE ACTIVE</span>
                    </div>
                    <div class="override-active-details">
                        <div><strong>Risk Cap:</strong> 0.5R maximum</div>
                        <div><strong>Reasoning:</strong> ${override.reasoning}</div>
                        <div><strong>Created:</strong> ${new Date(override.timestamp).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}</div>
                    </div>
                    <div class="override-active-rules">
                        <span>&#x2022;</span> One trade only until override closes
                        <span>&#x2022;</span> No adding to position
                        <span>&#x2022;</span> Trade will be tagged "Regime Override"
                    </div>
                </div>
            `;
            return;
        }
        
        // Show override option
        container.innerHTML = `
            <div class="override-available">
                <div class="override-available-header">
                    <span style="color: ${permission.color};">${permission.icon}</span>
                    <span>Current Permission: <strong>${permission.label}</strong></span>
                </div>
                <p class="override-available-text">
                    You can override this constraint, but it comes with friction:
                </p>
                <ul class="override-rules-list">
                    <li>Risk capped at 0.5R (not negotiable)</li>
                    <li>One override trade per session maximum</li>
                    <li>No adding to position</li>
                    <li>Trade auto-tagged "Regime Override"</li>
                </ul>
                
                <div class="form-group">
                    <label class="form-label">What information do you believe the model is missing? <span class="required">*</span></label>
                    <textarea class="form-textarea" id="override-reasoning" rows="3" placeholder="Minimum 10 characters. Be specific about why you're overriding..."></textarea>
                </div>
                
                <div class="override-confirm">
                    <label class="checkbox-wrapper">
                        <input type="checkbox" id="override-acknowledge">
                        <span class="checkbox-label">I acknowledge the risks and accept reduced position size</span>
                    </label>
                </div>
                
                <button class="btn btn-warning" id="override-submit-btn" onclick="RegimeModule.submitOverride()" disabled>
                    &#x26A0; Create Override
                </button>
            </div>
        `;
        
        // Add event listeners for validation
        const reasoning = document.getElementById('override-reasoning');
        const acknowledge = document.getElementById('override-acknowledge');
        const submitBtn = document.getElementById('override-submit-btn');
        
        function validateOverride() {
            const valid = reasoning.value.trim().length >= 10 && acknowledge.checked;
            submitBtn.disabled = !valid;
        }
        
        reasoning.addEventListener('input', validateOverride);
        acknowledge.addEventListener('change', validateOverride);
    }

    function renderTrackingTable() {
        const container = document.getElementById('tracking-table-container');
        if (!container) return;
        
        const data = loadRegimeData();
        const stats = getTrackingStats();
        
        let html = `
            <div class="tracking-stats">
                <div class="tracking-stat">
                    <span class="tracking-stat-value">${stats.total}</span>
                    <span class="tracking-stat-label">Total Entries</span>
                </div>
                <div class="tracking-stat">
                    <span class="tracking-stat-value">${stats.accuracy}%</span>
                    <span class="tracking-stat-label">Regime Accuracy</span>
                </div>
                <div class="tracking-stat">
                    <span class="tracking-stat-value">${stats.permissionMatch}%</span>
                    <span class="tracking-stat-label">Permission Match</span>
                </div>
            </div>
        `;
        
        if (data.tracking.length === 0) {
            html += '<p class="text-muted">No tracking entries yet. Add entries after each session to build your regime accuracy data.</p>';
        } else {
            html += `
                <div class="tracking-table-wrapper">
                    <table class="tracking-table">
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Session</th>
                                <th>Regime Called</th>
                                <th>Actual</th>
                                <th>Correct?</th>
                                <th>Permission OK?</th>
                                <th>Notes</th>
                            </tr>
                        </thead>
                        <tbody>
            `;
            
            // Show last 20 entries, newest first
            const entries = [...data.tracking].reverse().slice(0, 20);
            entries.forEach(entry => {
                html += `
                    <tr>
                        <td>${new Date(entry.date).toLocaleDateString('en-AU', { day: '2-digit', month: 'short' })}</td>
                        <td>${SESSIONS[entry.session]?.name || entry.session}</td>
                        <td class="regime-state-${entry.regimeCalled}">${entry.regimeCalled}</td>
                        <td>${entry.actualBehaviour}</td>
                        <td class="${entry.correct ? 'text-pass' : 'text-fail'}">${entry.correct ? 'Yes' : 'No'}</td>
                        <td class="${entry.behaviourMatchedPermission ? 'text-pass' : 'text-fail'}">${entry.behaviourMatchedPermission ? 'Yes' : 'No'}</td>
                        <td>${entry.notes || '-'}</td>
                    </tr>
                `;
            });
            
            html += '</tbody></table></div>';
        }
        
        // Add new entry form
        html += `
            <div class="tracking-add-form">
                <h4>Add Tracking Entry</h4>
                <div class="tracking-form-grid">
                    <div class="form-group">
                        <label class="form-label">Session</label>
                        <select class="form-select" id="tracking-session">
                            <option value="tokyo">Tokyo</option>
                            <option value="london">London</option>
                            <option value="newyork">New York</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Regime Called</label>
                        <select class="form-select" id="tracking-regime">
                            <option value="expansion">Expansion</option>
                            <option value="balanced">Balanced</option>
                            <option value="transition">Transition</option>
                            <option value="compression">Compression</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Actual Behaviour</label>
                        <input type="text" class="form-input" id="tracking-actual" placeholder="e.g. Clean impulse, Chop, Range break...">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Correct?</label>
                        <select class="form-select" id="tracking-correct">
                            <option value="yes">Yes</option>
                            <option value="no">No</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Permission Matched?</label>
                        <select class="form-select" id="tracking-permission">
                            <option value="yes">Yes</option>
                            <option value="no">No</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Notes</label>
                        <input type="text" class="form-input" id="tracking-notes" placeholder="Optional notes...">
                    </div>
                </div>
                <button class="btn btn-secondary" onclick="RegimeModule.submitTrackingEntry()">Add Entry</button>
            </div>
        `;
        
        container.innerHTML = html;
    }

    function renderRegimeTab() {
        renderDailyContext();
        renderUpcomingNews();
        renderSessionCard('tokyo');
        renderSessionCard('london');
        renderSessionCard('newyork');
        renderOverrideStatus();
        renderTrackingTable();
        updateRegimeStatus();
    }

    function updateRegimeStatus() {
        const statusEl = document.getElementById('regime-overall-status');
        if (!statusEl) return;
        
        const access = checkPreTradeAccess();
        const permission = getCurrentPermission();
        
        if (!access.allowed) {
            statusEl.innerHTML = `
                <div class="regime-status-blocked">
                    <span>&#x1F6AB;</span>
                    <span>${access.reason}</span>
                </div>
            `;
            return;
        }
        
        if (permission) {
            statusEl.innerHTML = `
                <div class="regime-status-active" style="border-color: ${permission.color};">
                    <span style="color: ${permission.color};">${permission.icon}</span>
                    <span>Trading Permission: <strong style="color: ${permission.color};">${permission.label}</strong></span>
                    ${hasActiveOverride() ? '<span class="override-badge">OVERRIDE ACTIVE</span>' : ''}
                </div>
            `;
        }
    }

    // ============================================
    // FORM SUBMISSION HANDLERS
    // ============================================
    function submitDailyContext() {
        const marketState = document.getElementById('daily-market-state').value;
        const primaryRisk = document.getElementById('daily-primary-risk').value;
        const keyDriver = document.getElementById('daily-key-driver').value;
        
        if (!marketState) {
            alert('Please select a market state.');
            return;
        }
        
        if (!confirm('Lock daily context? This cannot be changed until tomorrow.')) {
            return;
        }
        
        saveDailyContext(marketState, primaryRisk, keyDriver);
    }

    function submitSessionRegime(session) {
        const state = document.getElementById(`session-${session}-state`).value;
        const volatility = document.getElementById(`session-${session}-volatility`).value;
        const structure = document.getElementById(`session-${session}-structure`).value;
        const context = document.getElementById(`session-${session}-context`).value;
        const macro = document.getElementById(`session-${session}-macro`).value;
        
        if (!state || !volatility || !structure || !context || !macro) {
            alert('Please complete all fields.');
            return;
        }
        
        const formData = {
            marketState: state,
            volatility: volatility,
            structure: structure,
            sessionContext: context,
            macro: macro
        };
        
        const permission = calculatePermission(formData);
        
        if (!confirm(`Lock ${SESSIONS[session].name} regime?\n\nPermission Level: ${permission.label}\n\nThis is locked for this session.`)) {
            return;
        }
        
        saveSessionRegime(session, formData);
    }

    function submitOverride() {
        const reasoning = document.getElementById('override-reasoning').value;
        const acknowledge = document.getElementById('override-acknowledge').checked;
        
        if (!reasoning || reasoning.trim().length < 10) {
            alert('Please provide reasoning (minimum 10 characters).');
            return;
        }
        
        if (!acknowledge) {
            alert('Please acknowledge the override conditions.');
            return;
        }
        
        if (!confirm('Create override?\n\nThis allows ONE trade at 0.5R maximum.\nThe trade will be tagged "Regime Override".')) {
            return;
        }
        
        if (createOverride(reasoning)) {
            renderOverrideStatus();
            alert('Override created. You may now proceed to Pre-Trade validation.\n\nRemember: 0.5R max, one trade only.');
        }
    }

    function submitTrackingEntry() {
        const session = document.getElementById('tracking-session').value;
        const regime = document.getElementById('tracking-regime').value;
        const actual = document.getElementById('tracking-actual').value;
        const correct = document.getElementById('tracking-correct').value === 'yes';
        const permission = document.getElementById('tracking-permission').value === 'yes';
        const notes = document.getElementById('tracking-notes').value;
        
        if (!actual) {
            alert('Please describe the actual behaviour.');
            return;
        }
        
        addTrackingEntry(session, regime, actual, correct, permission, notes);
        
        // Clear form
        document.getElementById('tracking-actual').value = '';
        document.getElementById('tracking-notes').value = '';
    }

    // ============================================
    // SHOWTAB GATING
    // ============================================
    function initGating() {
        // Wait for original showTab to be defined
        if (typeof window.showTab !== 'function') {
            setTimeout(initGating, 100);
            return;
        }
        
        const originalShowTab = window.showTab;
        
        window.showTab = function(tabId) {
            // Gate access to validation (Pre-Trade) tab
            if (tabId === 'validation') {
                const access = checkPreTradeAccess();
                if (!access.allowed) {
                    alert(access.reason);
                    originalShowTab('regime');
                    return;
                }
            }
            
            // Call original function
            originalShowTab(tabId);
            
            // Refresh regime tab when shown
            if (tabId === 'regime') {
                renderRegimeTab();
            }
        };
    }

    // ============================================
    // TRADE TAGGING INTEGRATION
    // ============================================
    function getTradeRegimeTag() {
        const data = loadRegimeData();
        const activeSession = getActiveSession();
        const permission = getCurrentPermission();
        
        const tag = {
            session: activeSession,
            permission: permission ? permission.level : 'unknown',
            isOverride: hasActiveOverride(),
            dailyState: data.dailyContext ? data.dailyContext.marketState : 'unknown'
        };
        
        if (hasActiveOverride()) {
            tag.overrideReasoning = data.activeOverride.reasoning;
            tag.riskCap = 0.5;
        }
        
        return tag;
    }

    // ============================================
    // RESET FUNCTION (for testing)
    // ============================================
    function resetRegimeData() {
        if (confirm('Reset all regime data? This cannot be undone.')) {
            localStorage.removeItem(REGIME_STORAGE_KEY);
            renderRegimeTab();
        }
    }

    // ============================================
    // INITIALISATION
    // ============================================
    function init() {
        // Wait for DOM
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
            return;
        }
        
        // Initialise gating
        initGating();
        
        // Render if on regime tab
        const regimeTab = document.getElementById('tab-regime');
        if (regimeTab && regimeTab.classList.contains('active')) {
            renderRegimeTab();
        }
        
        console.log('Regime Module v1.0 initialised');
    }

    // ============================================
    // PUBLIC API
    // ============================================
    window.RegimeModule = {
        // Core functions
        loadRegimeData: loadRegimeData,
        checkPreTradeAccess: checkPreTradeAccess,
        getCurrentPermission: getCurrentPermission,
        getActiveSession: getActiveSession,
        hasActiveOverride: hasActiveOverride,
        
        // News functions
        saveUpcomingNews: saveUpcomingNews,
        loadUpcomingNews: loadUpcomingNews,
        isNewsStale: isNewsStale,
        
        // Form handlers
        submitDailyContext: submitDailyContext,
        submitSessionRegime: submitSessionRegime,
        submitOverride: submitOverride,
        submitTrackingEntry: submitTrackingEntry,
        
        // Render functions
        renderRegimeTab: renderRegimeTab,
        
        // Trade integration
        getTradeRegimeTag: getTradeRegimeTag,
        closeOverride: closeOverride,
        
        // Utility
        resetRegimeData: resetRegimeData
    };

    // Auto-init
    init();

})();
