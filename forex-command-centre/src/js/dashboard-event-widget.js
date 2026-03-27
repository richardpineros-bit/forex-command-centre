// ============================================
// DASHBOARD EVENT WIDGET v2.1.0
// Displays CRITICAL News Events with Context
// v1.1.0: Added staleness detection - fail-closed when data is stale
// v2.0.0: All week's CRITICAL events with forecast/previous, measures, usual effect
// v2.1.0: Collapsible list - shows next 3, expand for rest
// ============================================

(function() {
    'use strict';

    window.DashboardEventWidget = {
        init: init,
        updateEventDisplay: updateEventDisplay
    };

    // ============================================
    // EVENT REFERENCE DATA
    // Measures + Usual Effect for CRITICAL events
    // ============================================

    const EVENT_REFERENCE = {
        // --- USD ---
        'ISM Manufacturing PMI': {
            measures: 'Diffusion index of surveyed purchasing managers in manufacturing',
            effect: 'Actual > Forecast = good for currency',
            threshold: '50 = expansion/contraction boundary'
        },
        'ISM Services PMI': {
            measures: 'Diffusion index of surveyed purchasing managers in services',
            effect: 'Actual > Forecast = good for currency',
            threshold: '50 = expansion/contraction boundary'
        },
        'Non-Farm Employment Change': {
            measures: 'Change in number of employed people, excluding farming',
            effect: 'Actual > Forecast = good for currency',
            threshold: 'Headline NFP number. Biggest USD mover.'
        },
        'ADP Non-Farm Employment Change': {
            measures: 'Estimated change in private-sector employment from ADP payroll data',
            effect: 'Actual > Forecast = good for currency',
            threshold: 'NFP preview. Often diverges from official number.'
        },
        'Unemployment Rate': {
            measures: 'Percentage of total workforce unemployed and actively seeking work',
            effect: 'Actual < Forecast = good for currency',
            threshold: null
        },
        'Unemployment Claims': {
            measures: 'Number of people filing first-time jobless claims in prior week',
            effect: 'Actual < Forecast = good for currency',
            threshold: null
        },
        'Average Hourly Earnings m/m': {
            measures: 'Change in price businesses pay for labour, excluding farming',
            effect: 'Actual > Forecast = good for currency',
            threshold: 'Wage inflation component of NFP report'
        },
        'Core Retail Sales m/m': {
            measures: 'Change in total retail sales value, excluding automobiles',
            effect: 'Actual > Forecast = good for currency',
            threshold: null
        },
        'Retail Sales m/m': {
            measures: 'Change in total value of sales at retail level',
            effect: 'Actual > Forecast = good for currency',
            threshold: null
        },
        'CPI m/m': {
            measures: 'Change in price of goods and services purchased by consumers',
            effect: 'Actual > Forecast = good for currency',
            threshold: 'Key inflation gauge for rate decisions'
        },
        'CPI y/y': {
            measures: 'Annualised change in consumer price index',
            effect: 'Actual > Forecast = good for currency',
            threshold: 'Fed watches this closely for rate path'
        },
        'Core CPI m/m': {
            measures: 'Change in consumer prices excluding food and energy',
            effect: 'Actual > Forecast = good for currency',
            threshold: 'Fed preferred inflation measure'
        },
        'Core PPI m/m': {
            measures: 'Change in selling price of goods/services by producers, excluding food and energy',
            effect: 'Actual > Forecast = good for currency',
            threshold: 'Leading indicator of consumer inflation'
        },
        'PPI m/m': {
            measures: 'Change in selling price of goods and services by producers',
            effect: 'Actual > Forecast = good for currency',
            threshold: null
        },
        'GDP q/q': {
            measures: 'Annualised change in value of all goods and services produced',
            effect: 'Actual > Forecast = good for currency',
            threshold: null
        },
        'Advance GDP q/q': {
            measures: 'Earliest GDP estimate. Annualised quarterly change.',
            effect: 'Actual > Forecast = good for currency',
            threshold: 'First of 3 releases. Biggest market mover.'
        },
        'JOLTS Job Openings': {
            measures: 'Number of job openings during the reported month',
            effect: 'Actual > Forecast = good for currency',
            threshold: null
        },
        'FOMC Statement': {
            measures: 'Fed rate decision + forward guidance on monetary policy',
            effect: 'Hawkish = good for currency',
            threshold: 'Contains rate dot plot and economic projections'
        },
        'Federal Funds Rate': {
            measures: 'Interest rate at which banks lend to each other overnight',
            effect: 'Actual > Forecast = good for currency',
            threshold: 'The rate decision itself'
        },
        'FOMC Press Conference': {
            measures: 'Fed Chair press conference after rate decision',
            effect: 'Hawkish tone = good for currency',
            threshold: 'Often more volatile than the decision itself'
        },
        'Prelim UoM Consumer Sentiment': {
            measures: 'Survey of consumer confidence in economic activity',
            effect: 'Actual > Forecast = good for currency',
            threshold: null
        },
        'Prelim UoM Inflation Expectations': {
            measures: 'Consumer expectations for inflation over next 12 months',
            effect: 'Higher = hawkish signal for rates',
            threshold: 'Fed monitors inflation expectations closely'
        },
        'President Trump Speaks': {
            measures: 'Public remarks - watch for trade/tariff/fiscal policy signals',
            effect: 'Unpredictable. Risk-off if tariff/trade threats.',
            threshold: 'No forecast. Pure event risk.'
        },

        // --- AUD ---
        'RBA Gov Bullock Speaks': {
            measures: 'Public remarks from Reserve Bank of Australia Governor',
            effect: 'Hawkish = good for currency',
            threshold: 'Watch for rate guidance and economic outlook'
        },
        'Cash Rate': {
            measures: 'Interest rate charged on overnight loans between banks',
            effect: 'Actual > Forecast = good for currency',
            threshold: 'RBA rate decision'
        },
        'RBA Rate Statement': {
            measures: 'RBA monetary policy statement with rate decision rationale',
            effect: 'Hawkish = good for currency',
            threshold: null
        },
        'Trimmed Mean CPI q/q': {
            measures: 'Change in average price paid by consumers, trimming extreme 30%',
            effect: 'Actual > Forecast = good for currency',
            threshold: 'RBA preferred inflation measure'
        },
        'Trimmed Mean CPI m/m': {
            measures: 'Monthly trimmed mean inflation excluding volatile items',
            effect: 'Actual > Forecast = good for currency',
            threshold: 'RBA preferred inflation measure'
        },
        'Employment Change': {
            measures: 'Change in number of employed people',
            effect: 'Actual > Forecast = good for currency',
            threshold: null
        },

        // --- GBP ---
        'Annual Budget Release': {
            measures: 'Government fiscal policy, tax changes, spending plans',
            effect: 'Growth-positive = good for currency',
            threshold: 'Major fiscal event. Watch debt/GDP and spending.'
        },
        'Official Bank Rate': {
            measures: 'Interest rate on commercial bank reserves held at BoE',
            effect: 'Actual > Forecast = good for currency',
            threshold: 'BoE rate decision'
        },
        'BOE Monetary Policy Summary': {
            measures: 'Summary of BoE rate decision and economic outlook',
            effect: 'Hawkish = good for currency',
            threshold: null
        },
        'Claimant Count Change': {
            measures: 'Change in number of people claiming unemployment benefits',
            effect: 'Actual < Forecast = good for currency',
            threshold: null
        },

        // --- JPY ---
        'BOJ Gov Ueda Speaks': {
            measures: 'Public remarks from Bank of Japan Governor',
            effect: 'Hawkish = good for currency',
            threshold: 'Watch for yield curve control and rate normalisation signals'
        },
        'Monetary Policy Statement': {
            measures: 'BOJ rate decision and policy guidance',
            effect: 'Hawkish = good for currency',
            threshold: null
        },
        'BOJ Policy Rate': {
            measures: 'Short-term interest rate target set by Bank of Japan',
            effect: 'Actual > Forecast = good for currency',
            threshold: 'BOJ rate decision'
        },
        'National Core CPI y/y': {
            measures: 'Annualised change in consumer prices excluding fresh food',
            effect: 'Actual > Forecast = good for currency',
            threshold: 'BOJ watches for sustained 2% target'
        },
        'Tokyo Core CPI y/y': {
            measures: 'Annualised change in Tokyo consumer prices excluding fresh food',
            effect: 'Actual > Forecast = good for currency',
            threshold: 'Leading indicator for national CPI'
        },

        // --- EUR ---
        'Main Refinancing Rate': {
            measures: 'Interest rate on main refinancing operations for eurozone banks',
            effect: 'Actual > Forecast = good for currency',
            threshold: 'ECB rate decision'
        },
        'ECB Press Conference': {
            measures: 'ECB President press conference after rate decision',
            effect: 'Hawkish = good for currency',
            threshold: null
        },
        'Flash Manufacturing PMI': {
            measures: 'Early estimate of manufacturing purchasing managers index',
            effect: 'Actual > Forecast = good for currency',
            threshold: '50 = expansion/contraction boundary'
        },
        'Flash Services PMI': {
            measures: 'Early estimate of services purchasing managers index',
            effect: 'Actual > Forecast = good for currency',
            threshold: '50 = expansion/contraction boundary'
        },
        'German Prelim CPI m/m': {
            measures: 'Early estimate of German consumer price change',
            effect: 'Actual > Forecast = good for currency',
            threshold: 'Leading indicator for eurozone CPI'
        },

        // --- CAD ---
        'GDP m/m': {
            measures: 'Change in value of all goods and services produced',
            effect: 'Actual > Forecast = good for currency',
            threshold: null
        },
        'Overnight Rate': {
            measures: 'Interest rate for overnight lending between major financial institutions',
            effect: 'Actual > Forecast = good for currency',
            threshold: 'BOC rate decision'
        },
        'BOC Monetary Policy Report': {
            measures: 'BOC detailed analysis of economic conditions and inflation outlook',
            effect: 'Hawkish = good for currency',
            threshold: null
        },

        // --- NZD ---
        'Official Cash Rate': {
            measures: 'Interest rate charged on overnight loans between banks',
            effect: 'Actual > Forecast = good for currency',
            threshold: 'RBNZ rate decision'
        },
        'RBNZ Monetary Policy Statement': {
            measures: 'RBNZ rate decision rationale and economic outlook',
            effect: 'Hawkish = good for currency',
            threshold: null
        },

        // --- CHF ---
        'SNB Policy Rate': {
            measures: 'Swiss National Bank overnight deposit interest rate',
            effect: 'Actual > Forecast = good for currency',
            threshold: 'SNB rate decision'
        }
    };

    function init() {
        console.log('DashboardEventWidget v2.1.0 initialised');
        updateEventDisplay();
        // Update every 15 minutes
        setInterval(updateEventDisplay, 15 * 60 * 1000);
        return true;
    }

    // Check if calendar data is stale (>48h old)
    function isCalendarStale() {
        if (!window.LIVE_CALENDAR_DATA || !window.LIVE_CALENDAR_DATA.last_updated) return true;
        const updatedAt = new Date(window.LIVE_CALENDAR_DATA.last_updated);
        const hoursOld = (Date.now() - updatedAt.getTime()) / (1000 * 60 * 60);
        return hoursOld > 48;
    }

    function updateEventDisplay() {
        const container = document.getElementById('dashboard-next-event-container');
        if (!container) return;

        if (!window.LIVE_CALENDAR_DATA || !Array.isArray(window.LIVE_CALENDAR_DATA.events)) {
            container.innerHTML = '<div style="padding: 12px; color: #dc3545; font-size: 0.9rem; background: #f8d7da; border-left: 4px solid #dc3545; border-radius: 4px;">&#x26A0; Calendar offline - verify news events manually before trading</div>';
            return;
        }

        const events = window.LIVE_CALENDAR_DATA.events || [];
        const now = new Date();

        // STALENESS CHECK
        if (window.LIVE_CALENDAR_DATA.is_stale || isCalendarStale()) {
            const hoursOld = window.LIVE_CALENDAR_DATA.last_updated
                ? Math.round((Date.now() - new Date(window.LIVE_CALENDAR_DATA.last_updated).getTime()) / (1000 * 60 * 60))
                : '?';
            container.innerHTML = '<div style="padding: 12px; color: #856404; font-size: 0.9rem; background: #fff3cd; border-left: 4px solid #ffc107; border-radius: 4px;">' +
                '&#x26A0; <strong>Calendar data is ' + hoursOld + 'h old</strong><br>' +
                '<span style="font-size: 0.8rem;">Scraper may not be running. Check ForexFactory manually before trading.</span>' +
                '</div>';
            return;
        }

        // Collect ALL CRITICAL events within 7 days
        const criticalEvents = [];
        for (const event of events) {
            if (!event.impact_level || event.impact_level !== 3) continue;
            if (!event.datetime_utc) continue;

            const eventTime = new Date(event.datetime_utc);
            if (eventTime > now && (eventTime - now) < 7 * 24 * 60 * 60 * 1000) {
                criticalEvents.push(event);
            }
        }

        // Sort by time
        criticalEvents.sort(function(a, b) { return new Date(a.datetime_utc) - new Date(b.datetime_utc); });

        if (criticalEvents.length === 0) {
            container.innerHTML = '<div style="padding: 12px; color: #28a745; font-size: 0.9rem;">&#x2713; No CRITICAL events in next 7 days (calendar fresh)</div>';
            return;
        }

        // Build the widget
        var html = '<div style="padding: 0;">';

        // Header with count
        html += '<div style="padding: 8px 12px; font-size: 0.75rem; color: var(--text-muted, #666); text-transform: uppercase; border-bottom: 1px solid var(--border-color, #dee2e6);">';
        html += '&#x26A0; ' + criticalEvents.length + ' CRITICAL Events This Week';
        html += '</div>';

        // Event list
        var VISIBLE_COUNT = 3;
        var hasMore = criticalEvents.length > VISIBLE_COUNT;

        criticalEvents.forEach(function(event, index) {
            // Insert hidden wrapper after first 3
            if (index === VISIBLE_COUNT && hasMore) {
                html += '<div id="news-events-overflow" style="display: none;">';
            }

            var eventTime = new Date(event.datetime_utc);
            var minutesUntil = Math.floor((eventTime - now) / 60000);
            var ref = EVENT_REFERENCE[event.title] || null;

            // Time formatting
            var timeString = '';
            if (minutesUntil < 60) {
                timeString = minutesUntil + 'm';
            } else if (minutesUntil < 1440) {
                var hours = Math.floor(minutesUntil / 60);
                timeString = hours + 'h ' + (minutesUntil % 60) + 'm';
            } else {
                var days = Math.floor(minutesUntil / 1440);
                var hrs = Math.floor((minutesUntil % 1440) / 60);
                timeString = days + 'd ' + hrs + 'h';
            }

            var dayName = eventTime.toLocaleDateString('en-AU', { weekday: 'short' });
            var timeStr = eventTime.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });

            // Urgency colour
            var borderColour = '#6c757d';
            if (minutesUntil < 240) {
                borderColour = '#dc3545';
            } else if (minutesUntil < 1440) {
                borderColour = '#ffc107';
            }

            // Expandable row
            var eventId = 'news-event-' + index;

            html += '<div style="border-bottom: 1px solid var(--border-color, #eee);">';

            // Main row (clickable)
            html += '<div onclick="var el=document.getElementById(\'' + eventId + '\'); el.style.display = el.style.display === \'none\' ? \'block\' : \'none\';" ' +
                'style="padding: 8px 12px; cursor: pointer; display: flex; align-items: center; gap: 8px; border-left: 3px solid ' + borderColour + ';">';

            // Currency badge
            html += '<span style="background: var(--bg-secondary, #e9ecef); color: var(--text-primary, #333); padding: 2px 6px; border-radius: 3px; font-size: 0.7rem; font-weight: 600; min-width: 32px; text-align: center;">' + event.currency + '</span>';

            // Title + time
            html += '<div style="flex: 1; min-width: 0;">';
            html += '<div style="font-weight: 600; font-size: 0.85rem; color: var(--text-primary, #333); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">' + event.title + '</div>';
            html += '<div style="font-size: 0.75rem; color: var(--text-muted, #888);">' + dayName + ' ' + timeStr + ' AEST</div>';
            html += '</div>';

            // Forecast / Previous
            html += '<div style="text-align: right; font-size: 0.75rem; line-height: 1.4; flex-shrink: 0;">';
            if (event.forecast) {
                html += '<div style="color: var(--text-muted, #888);">F: <strong style="color: var(--text-primary, #333);">' + event.forecast + '</strong></div>';
            }
            if (event.previous) {
                html += '<div style="color: var(--text-muted, #888);">P: ' + event.previous + '</div>';
            }
            html += '</div>';

            // Countdown
            html += '<div style="font-size: 0.7rem; color: ' + borderColour + '; font-weight: 600; min-width: 48px; text-align: right;">' + timeString + '</div>';

            html += '</div>';

            // Expandable detail panel
            html += '<div id="' + eventId + '" style="display: none; padding: 6px 12px 10px 47px; background: var(--bg-secondary, #f8f9fa); font-size: 0.78rem; line-height: 1.5;">';

            if (ref) {
                html += '<div style="color: var(--text-secondary, #555); margin-bottom: 3px;"><strong>Measures:</strong> ' + ref.measures + '</div>';
                html += '<div style="color: var(--text-secondary, #555); margin-bottom: 3px;"><strong>Usual effect:</strong> ' + ref.effect + '</div>';
                if (ref.threshold) {
                    html += '<div style="color: var(--text-muted, #888); font-style: italic;">' + ref.threshold + '</div>';
                }
            } else {
                html += '<div style="color: var(--text-muted, #888); font-style: italic;">No reference data available for this event.</div>';
            }

            html += '</div>';
            html += '</div>';
        });

        // Close overflow wrapper if it was opened
        if (hasMore) {
            html += '</div>';
            var remaining = criticalEvents.length - VISIBLE_COUNT;
            html += '<div id="news-events-toggle" onclick="var o=document.getElementById(\'news-events-overflow\'); var t=document.getElementById(\'news-events-toggle\'); if(o.style.display===\'none\'){o.style.display=\'block\';t.innerHTML=\'&#x25B2; Show less\';}else{o.style.display=\'none\';t.innerHTML=\'&#x25BC; Show ' + remaining + ' more events\';}" ' +
                'style="padding: 8px 12px; text-align: center; font-size: 0.78rem; color: var(--text-muted, #888); cursor: pointer; border-top: 1px solid var(--border-color, #eee);">' +
                '&#x25BC; Show ' + remaining + ' more events</div>';
        }

        html += '</div>';

        container.innerHTML = html;
    }

    document.addEventListener('DOMContentLoaded', function() {
        setTimeout(function() { init(); }, 1000);
    });

})();
