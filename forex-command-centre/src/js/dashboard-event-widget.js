// ============================================
// DASHBOARD EVENT WIDGET v1.0.0
// Displays Next CRITICAL News Event
// ============================================

(function() {
    'use strict';

    window.DashboardEventWidget = {
        init: init,
        updateEventDisplay: updateEventDisplay
    };

    function init() {
        console.log('DashboardEventWidget v1.0.0 initialised');
        updateEventDisplay();
        // Update every 30 minutes
        setInterval(updateEventDisplay, 30 * 60 * 1000);
        return true;
    }

    function updateEventDisplay() {
        const container = document.getElementById('dashboard-next-event-container');
        if (!container) return;

        if (!window.LIVE_CALENDAR_DATA || !Array.isArray(window.LIVE_CALENDAR_DATA.events)) {
            container.innerHTML = '<div style="padding: 12px; color: #999; font-size: 0.9rem;">Calendar offline</div>';
            return;
        }

        const events = window.LIVE_CALENDAR_DATA.events || [];
        const now = new Date();

        // Find next CRITICAL event (within 7 days)
        let nextCritical = null;
        for (let event of events) {
            if (!event.impact_level || event.impact_level !== 3) continue; // Only CRITICAL (3)
            
            const eventTime = new Date(event.datetime_utc);
            if (eventTime > now && (eventTime - now) < 7 * 24 * 60 * 60 * 1000) {
                if (!nextCritical || eventTime < new Date(nextCritical.datetime_utc)) {
                    nextCritical = event;
                }
            }
        }

        if (!nextCritical) {
            container.innerHTML = '<div style="padding: 12px; color: #666; font-size: 0.9rem;">No CRITICAL events in next 7 days</div>';
            return;
        }

        const eventTime = new Date(nextCritical.datetime_utc);
        const now_utc = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
        const minutesUntil = Math.floor((eventTime - now_utc) / 60000);
        
        let timeString = '';
        if (minutesUntil < 60) {
            timeString = minutesUntil + 'm';
        } else if (minutesUntil < 1440) {
            const hours = Math.floor(minutesUntil / 60);
            timeString = hours + 'h ' + (minutesUntil % 60) + 'm';
        } else {
            const days = Math.floor(minutesUntil / 1440);
            const hours = Math.floor((minutesUntil % 1440) / 60);
            timeString = days + 'd ' + hours + 'h';
        }

        const dayName = eventTime.toLocaleDateString('en-AU', { weekday: 'short' });
        const timeStr = eventTime.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });

        let colour = '#666';
        let bgColour = '#f8f9fa';
        if (minutesUntil < 240) { // < 4h
            colour = '#dc3545';
            bgColour = '#f8d7da';
        } else if (minutesUntil < 1440) { // < 24h
            colour = '#ffc107';
            bgColour = '#fff3cd';
        }

        const html = `
            <div style="
                padding: 12px;
                background-color: ${bgColour};
                border-left: 4px solid ${colour};
                border-radius: 4px;
            ">
                <div style="font-size: 0.75rem; color: #666; text-transform: uppercase; margin-bottom: 4px;">
                    &#x26A0; Next CRITICAL Event
                </div>
                <div style="font-weight: 600; color: ${colour}; margin-bottom: 4px;">
                    ${nextCritical.title}
                </div>
                <div style="font-size: 0.85rem; color: #555;">
                    ${nextCritical.currency} · ${dayName} ${timeStr} AEST
                </div>
                <div style="font-size: 0.8rem; color: #666; margin-top: 6px;">
                    In ${timeString}
                </div>
            </div>
        `;

        container.innerHTML = html;
    }

    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => { init(); }, 1000);
    });

})();
