// ============================================
// NEWS GATE MODULE v1.0.0
// Supervisory News Event Veto Layer
// ============================================
// ROLE: Veto layer - disqualifies pairs before pre-trade validation
// AUTHORITY: Fail-closed, no override mechanism
// PRINCIPLE: News events are structural disqualifiers, not trading opportunities
// ============================================

(function() {
    'use strict';

    // ============================================
    // CONSTANTS & CONFIGURATION
    // ============================================

    const MODULE_VERSION = '1.0.0';
    const STORAGE_KEY = 'ftcc_news_gate_audit';

    // Impact Tier Buffers (hours before event when pair is RED)
    const IMPACT_BUFFERS = {
        CRITICAL: {
            bufferHours: 4,
            postWaitMinutes: 60,
            pairs: 'all' // All pairs affected
        },
        HIGH: {
            bufferHours: 2,
            postWaitMinutes: 30,
            pairs: 'affected' // Only currency pair affected
        },
        MEDIUM: {
            bufferHours: 1,
            postWaitMinutes: 15,
            pairs: 'affected'
        },
        LOW: {
            bufferHours: 0.5,
            postWaitMinutes: 0,
            pairs: 'affected'
        }
    };

    // ============================================
    // MODULE INTERFACE
    // ============================================

    window.NewsGateModule = {
        init: init,
        assessTradability: assessTradability,
        getAuditLog: getAuditLog,
        clearAuditLog: clearAuditLog,
        isCalendarLoaded: isCalendarLoaded,
        getNextEventForPair: getNextEventForPair
    };

    // ============================================
    // STATE
    // ============================================

    let auditLog = [];

    // ============================================
    // INITIALISATION
    // ============================================

    function init() {
        // Load audit log from storage
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                auditLog = JSON.parse(stored);
            }
        } catch (e) {
            console.warn('NewsGateModule: Could not load audit log from storage', e);
            auditLog = [];
        }

        console.log('NewsGateModule v' + MODULE_VERSION + ' initialised');
        return true;
    }

    // ============================================
    // CORE VETO LOGIC
    // ============================================

    /**
     * Assess if a pair is tradeable based on upcoming news events
     * @param {string} pair - e.g., 'AUDUSD'
     * @param {number} hoursAhead - Look ahead window (default 4 hours)
     * @returns {Object} { verdict: 'RED'|'YELLOW'|'GREEN', reason: string, nextEvent: object, minutesUntil: number }
     */
    function assessTradability(pair, hoursAhead = 4) {
        // Check if calendar is loaded
        if (!LIVE_CALENDAR_DATA || !LIVE_CALENDAR_DATA.events || LIVE_CALENDAR_DATA.events.length === 0) {
            return {
                verdict: 'UNKNOWN',
                reason: 'Economic calendar offline - verify manually before trading',
                nextEvent: null,
                minutesUntil: null,
                safe: true // Allow trading but with warning
            };
        }

        // Validate pair
        if (!pair || pair.length !== 6) {
            return {
                verdict: 'GREEN',
                reason: 'Invalid pair format',
                nextEvent: null,
                minutesUntil: null,
                safe: true
            };
        }

        const baseCurrency = pair.substring(0, 3);
        const quoteCurrency = pair.substring(3, 6);
        const now = new Date();
        const windowEnd = new Date(now.getTime() + (hoursAhead * 60 * 60 * 1000));

        // Find all upcoming events for this pair's currencies
        const upcomingEvents = LIVE_CALENDAR_DATA.events.filter(event => {
            if (event.currency !== baseCurrency && event.currency !== quoteCurrency) return false;
            if (!event.datetime_utc) return false;

            const eventTime = new Date(event.datetime_utc);
            return eventTime > now && eventTime <= windowEnd;
        }).sort((a, b) => new Date(a.datetime_utc) - new Date(b.datetime_utc));

        // No events = GREEN
        if (upcomingEvents.length === 0) {
            const verdict = { verdict: 'GREEN', reason: 'No news events in next ' + hoursAhead + 'h', nextEvent: null, minutesUntil: null, safe: true };
            logDecision(pair, verdict);
            return verdict;
        }

        const nearestEvent = upcomingEvents[0];
        const minutesUntil = Math.round((new Date(nearestEvent.datetime_utc) - now) / 60000);

        // Normalise impact string (calendar uses 'High', we check for 'high')
        const eventImpact = normaliseImpact(nearestEvent.impact);

        // Check if it's CRITICAL for this pair
        const isCriticalForPair = isCriticalEvent(pair, nearestEvent.title);

        if (isCriticalForPair) {
            // CRITICAL: 4h buffer always applies
            const buffer = IMPACT_BUFFERS.CRITICAL.bufferHours * 60;
            const isRed = minutesUntil < buffer;

            const verdict = {
                verdict: isRed ? 'RED' : 'YELLOW',
                reason: isRed
                    ? `CRITICAL: ${nearestEvent.title} (${nearestEvent.currency}) in ${formatTime(minutesUntil)} - 4h buffer required`
                    : `CAUTION: CRITICAL event ${nearestEvent.title} (${nearestEvent.currency}) in ${formatTime(minutesUntil)}`,
                nextEvent: nearestEvent,
                minutesUntil: minutesUntil,
                safe: !isRed
            };
            logDecision(pair, verdict);
            return verdict;
        }

        // Non-critical: use impact-based buffer
        const buffer = IMPACT_BUFFERS[eventImpact].bufferHours * 60;
        const isRed = minutesUntil < buffer;

        const verdict = {
            verdict: isRed ? 'RED' : 'YELLOW',
            reason: isRed
                ? `${eventImpact}: ${nearestEvent.title} (${nearestEvent.currency}) in ${formatTime(minutesUntil)} - buffer required`
                : `${eventImpact} event approaching: ${nearestEvent.title} (${nearestEvent.currency}) in ${formatTime(minutesUntil)}`,
            nextEvent: nearestEvent,
            minutesUntil: minutesUntil,
            safe: !isRed
        };

        logDecision(pair, verdict);
        return verdict;
    }

    /**
     * Get next event for a pair (utility function for display)
     * @param {string} pair - e.g., 'AUDUSD'
     * @returns {Object|null} Event object or null
     */
    function getNextEventForPair(pair) {
        if (!LIVE_CALENDAR_DATA || !LIVE_CALENDAR_DATA.events) return null;

        if (!pair || pair.length !== 6) return null;

        const baseCurrency = pair.substring(0, 3);
        const quoteCurrency = pair.substring(3, 6);
        const now = new Date();

        const upcomingEvents = LIVE_CALENDAR_DATA.events.filter(event => {
            if (event.currency !== baseCurrency && event.currency !== quoteCurrency) return false;
            if (!event.datetime_utc) return false;
            const eventTime = new Date(event.datetime_utc);
            return eventTime > now;
        }).sort((a, b) => new Date(a.datetime_utc) - new Date(b.datetime_utc));

        return upcomingEvents.length > 0 ? upcomingEvents[0] : null;
    }

    /**
     * Check if calendar data is loaded
     * @returns {boolean}
     */
    function isCalendarLoaded() {
        return LIVE_CALENDAR_DATA && LIVE_CALENDAR_DATA.events && LIVE_CALENDAR_DATA.events.length > 0;
    }

    // ============================================
    // HELPER FUNCTIONS
    // ============================================

    /**
     * Normalise impact string from calendar (High → HIGH, etc)
     */
    function normaliseImpact(impact) {
        if (!impact) return 'MEDIUM';
        const imp = impact.toUpperCase();
        if (imp.includes('HIGH')) return 'HIGH';
        if (imp.includes('MEDIUM') || imp.includes('MED')) return 'MEDIUM';
        if (imp.includes('LOW')) return 'LOW';
        return 'MEDIUM';
    }

    /**
     * Check if event is CRITICAL for this pair
     */
    function isCriticalEvent(pair, eventTitle) {
        if (!CRITICAL_EVENTS_BY_PAIR || !CRITICAL_EVENTS_BY_PAIR[pair]) {
            return false;
        }

        const criticalEvents = CRITICAL_EVENTS_BY_PAIR[pair];
        if (!Array.isArray(criticalEvents)) return false;

        return criticalEvents.some(eventName =>
            eventTitle && eventTitle.includes(eventName)
        );
    }

    /**
     * Format minutes into human-readable time
     */
    function formatTime(minutes) {
        if (minutes === null) return 'TBD';
        if (minutes < 0) return 'Released';
        if (minutes < 60) return minutes + 'm';

        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return mins > 0 ? hours + 'h ' + mins + 'm' : hours + 'h';
    }

    /**
     * Log gate decision to audit trail
     */
    function logDecision(pair, verdict) {
        const entry = {
            timestamp: new Date().toISOString(),
            pair: pair,
            verdict: verdict.verdict,
            reason: verdict.reason,
            nextEvent: verdict.nextEvent ? {
                title: verdict.nextEvent.title,
                currency: verdict.nextEvent.currency,
                datetime_utc: verdict.nextEvent.datetime_utc,
                impact: verdict.nextEvent.impact
            } : null,
            minutesUntil: verdict.minutesUntil
        };

        auditLog.push(entry);

        // Keep only last 100 entries
        if (auditLog.length > 100) {
            auditLog = auditLog.slice(-100);
        }

        // Persist to storage
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(auditLog));
        } catch (e) {
            console.warn('NewsGateModule: Could not persist audit log', e);
        }
    }

    /**
     * Get audit log (for debugging/compliance)
     */
    function getAuditLog() {
        return JSON.parse(JSON.stringify(auditLog)); // Return copy
    }

    /**
     * Clear audit log
     */
    function clearAuditLog() {
        auditLog = [];
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch (e) {
            console.warn('NewsGateModule: Could not clear audit log', e);
        }
    }

    // Initialise on load
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => {
            init();
        }, 500);
    });

})();

// MODULE COMPLETE - News Gate Module v1.0.0
