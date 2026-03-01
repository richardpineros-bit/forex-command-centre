// news-impact.js - FCC Phase 3 extraction
// News impact management & economic calendar

// ============================================
// CHUNK 9: NEWS IMPACT MANAGEMENT SYSTEM
// ============================================

// ============================================
// LIVE ECONOMIC CALENDAR DATA
// ============================================

// Live calendar data loaded from JSON file
let LIVE_CALENDAR_DATA = {
    last_updated: null,
    events: []
};

// Calendar JSON file paths - try multiple locations (data folder primary)
const CALENDAR_PATHS = [
    '../data/calendar.json',        // Primary: relative to src/index.html
    './data/calendar.json',         // Root level (absolute)
    '/data/calendar.json',          // Server root
    './calendar.json'               // Fallback: legacy location
];

// Auto-refresh interval (30 minutes)
let calendarRefreshTimer = null;
const CALENDAR_REFRESH_MS = 30 * 60 * 1000;

// Load economic calendar with fallback paths
async function loadEconomicCalendar() {
    for (const path of CALENDAR_PATHS) {
        try {
            const response = await fetch(path + '?t=' + Date.now());
            if (!response.ok) continue;
            
            const data = await response.json();
            if (!data.events || data.events.length === 0) continue;
            
            LIVE_CALENDAR_DATA = {
                last_updated: data.last_updated || new Date().toISOString(),
                events: data.events,
                loaded_from: path,
                loaded_at: new Date().toISOString()
            };
            
            console.log('Calendar loaded: ' + LIVE_CALENDAR_DATA.events.length + ' events from ' + path);
            updateCalendarStatusIndicator(true);
            startCalendarAutoRefresh();
            return true;
        } catch (e) {
            // Try next path
        }
    }
    
    console.warn('Calendar: No valid source found. Tried: ' + CALENDAR_PATHS.join(', '));
    updateCalendarStatusIndicator(false);
    startCalendarAutoRefresh(); // Keep trying
    return false;
}

// Auto-refresh calendar every 30 minutes
function startCalendarAutoRefresh() {
    if (calendarRefreshTimer) clearInterval(calendarRefreshTimer);
    calendarRefreshTimer = setInterval(function() {
        console.log('Calendar: Auto-refreshing...');
        loadEconomicCalendar();
    }, CALENDAR_REFRESH_MS);
}

// Update calendar status indicator with last-updated time
function updateCalendarStatusIndicator(isLoaded) {
    const indicator = document.getElementById('calendar-status-indicator');
    if (!indicator) return;

    if (isLoaded && LIVE_CALENDAR_DATA.events.length > 0) {
        indicator.className = 'status-dot online';
        var tipParts = ['Calendar: Loaded (' + LIVE_CALENDAR_DATA.events.length + ' events)'];
        if (LIVE_CALENDAR_DATA.last_updated) {
            var updDate = new Date(LIVE_CALENDAR_DATA.last_updated);
            tipParts.push('Data: ' + updDate.toLocaleString('en-AU', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' }));
        }
        if (LIVE_CALENDAR_DATA.loaded_at) {
            var loadDate = new Date(LIVE_CALENDAR_DATA.loaded_at);
            tipParts.push('Fetched: ' + loadDate.toLocaleString('en-AU', { hour:'2-digit', minute:'2-digit' }));
        }
        indicator.title = tipParts.join(' | ');
    } else {
        indicator.className = 'status-dot offline';
        indicator.title = 'Calendar: Offline - check scraper cron job';
    }
}

// Get upcoming events for a specific currency within X hours
function getUpcomingEventsForCurrency(currency, hoursAhead = 4) {
    if (!LIVE_CALENDAR_DATA.events || LIVE_CALENDAR_DATA.events.length === 0) {
        return [];
    }
    
    const now = new Date();
    const cutoff = new Date(now.getTime() + (hoursAhead * 60 * 60 * 1000));
    
    return LIVE_CALENDAR_DATA.events.filter(event => {
        if (event.currency !== currency) return false;
        if (!event.datetime_utc) return false;
        
        const eventTime = new Date(event.datetime_utc);
        return eventTime > now && eventTime <= cutoff;
    }).sort((a, b) => new Date(a.datetime_utc) - new Date(b.datetime_utc));
}

// Get all high impact events for a currency pair within X hours
function getHighImpactEventsForPair(pair, hoursAhead = 4) {
    if (!pair || pair.length < 6) return [];
    
    const baseCurrency = pair.substring(0, 3);
    const quoteCurrency = pair.substring(3, 6);
    
    const baseEvents = getUpcomingEventsForCurrency(baseCurrency, hoursAhead)
        .filter(e => e.impact === 'High');
    const quoteEvents = getUpcomingEventsForCurrency(quoteCurrency, hoursAhead)
        .filter(e => e.impact === 'High');
    
    return [...baseEvents, ...quoteEvents].sort((a, b) => 
        new Date(a.datetime_utc) - new Date(b.datetime_utc)
    );
}

// Calculate minutes until an event
function getMinutesUntilEvent(event) {
    if (!event.datetime_utc) return null;
    const now = new Date();
    const eventTime = new Date(event.datetime_utc);
    return Math.round((eventTime - now) / (1000 * 60));
}

// Format time until event for display
function formatTimeUntil(minutes) {
    if (minutes === null) return 'Time TBD';
    if (minutes < 0) return 'Released';
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

// Check if it's safe to trade based on news (v4.1.0 - Tiered Impact)
function isNewsSafeToTrade(pair, hoursAhead = 4) {
    // Return UNKNOWN if calendar not loaded (safe to trade, but warn)
    if (!LIVE_CALENDAR_DATA.events || LIVE_CALENDAR_DATA.events.length === 0) {
        return { status: 'UNKNOWN', safe: true, reason: 'Calendar offline - check manually', nextEvent: null, minutesUntil: null };
    }
    
    // Extract currencies
    if (!pair || pair.length < 6) {
        return { status: 'GREEN', safe: true, reason: 'Invalid pair', nextEvent: null };
    }
    
    const baseCurrency = pair.substring(0, 3);
    const quoteCurrency = pair.substring(3, 6);
    
    const now = new Date();
    const windowEnd = new Date(now.getTime() + (hoursAhead * 60 * 60 * 1000));
    
    // Find all upcoming events for this pair's currencies within window
    const upcomingEvents = LIVE_CALENDAR_DATA.events.filter(event => {
        if (event.currency !== baseCurrency && event.currency !== quoteCurrency) return false;
        if (!event.datetime_utc) return false;
        
        const eventTime = new Date(event.datetime_utc);
        return eventTime > now && eventTime <= windowEnd;
    }).sort((a, b) => new Date(a.datetime_utc) - new Date(b.datetime_utc));
    
    // No events found = GREEN
    if (upcomingEvents.length === 0) {
        return { 
            status: 'GREEN', 
            safe: true, 
            reason: 'No upcoming events in next ' + hoursAhead + 'h', 
            nextEvent: null,
            minutesUntil: null,
            buffer: 0
        };
    }
    
    const nearestEvent = upcomingEvents[0];
    const minutesUntil = Math.round((new Date(nearestEvent.datetime_utc) - now) / 60000);
    
    // Check if it's a CRITICAL event (4h lockout)
    const isCritical = CRITICAL_EVENTS_BY_PAIR[pair]?.some(eventName => 
        nearestEvent.title && nearestEvent.title.includes(eventName)
    ) || false;
    
    if (isCritical) {
        const isRed = minutesUntil < 240;
        return {
            status: isRed ? 'RED' : 'YELLOW',
            safe: !isRed,
            reason: `CRITICAL: ${nearestEvent.title} (${nearestEvent.currency}) in ${formatTimeUntil(minutesUntil)}`,
            nextEvent: nearestEvent,
            minutesUntil,
            buffer: 240,
            tier: 'CRITICAL'
        };
    }
    
    // HIGH impact events (2h buffer)
    if (nearestEvent.impact === 'High') {
        const isRed = minutesUntil < 120;
        return {
            status: isRed ? 'RED' : 'YELLOW',
            safe: !isRed,
            reason: `HIGH: ${nearestEvent.title} (${nearestEvent.currency}) in ${formatTimeUntil(minutesUntil)}`,
            nextEvent: nearestEvent,
            minutesUntil,
            buffer: 120,
            tier: 'High'
        };
    }
    
    // MEDIUM impact events (1h buffer)
    if (nearestEvent.impact === 'Medium') {
        const isYellow = minutesUntil < 60;
        return {
            status: isYellow ? 'YELLOW' : 'GREEN',
            safe: !isYellow,
            reason: `MEDIUM: ${nearestEvent.title} (${nearestEvent.currency}) in ${formatTimeUntil(minutesUntil)}`,
            nextEvent: nearestEvent,
            minutesUntil,
            buffer: 60,
            tier: 'Medium'
        };
    }
    
    // LOW impact = always tradeable
    return {
        status: 'GREEN',
        safe: true,
        reason: 'LOW impact event ahead',
        nextEvent: nearestEvent,
        minutesUntil,
        buffer: 0,
        tier: 'Low'
    };
}

// ============================================
// END LIVE ECONOMIC CALENDAR
// ============================================

// ============================================
// NEWS IMPACT TIER SYSTEM (v4.1.0)
// ============================================

// Impact tier definitions for pre-trade gating
const NEWS_IMPACT_TIERS = {
    'CRITICAL': { buffer: 240, description: '4h mandatory lockout', color: '#dc3545' },
    'High': { buffer: 120, description: '2h buffer required', color: '#ff6b35' },
    'Medium': { buffer: 60, description: '1h buffer, reduced risk', color: '#ffa500' },
    'Low': { buffer: 0, description: 'Tradeable', color: '#28a745' }
};

// Pair-specific CRITICAL events (force 4h lockout)
const CRITICAL_EVENTS_BY_PAIR = {
    'AUDUSD': ['RBA Rate Decision', 'RBA Minutes Release', 'RBA Monetary Policy Decision'],
    'USDJPY': ['FOMC Rate Decision', 'BoJ Monetary Policy Decision', 'BoJ Press Conference'],
    'EURUSD': ['ECB Rate Decision', 'ECB Monetary Policy Minutes', 'ECB Press Conference'],
    'GBPUSD': ['BoE Rate Decision', 'BoE Monetary Policy Minutes', 'BoE Press Conference'],
    'EURGBP': ['ECB Rate Decision', 'BoE Rate Decision'],
    'EURJPY': ['ECB Rate Decision', 'BoJ Monetary Policy Decision'],
    'GBPJPY': ['BoE Rate Decision', 'BoJ Monetary Policy Decision'],
    'NZDUSD': ['RBNZ Rate Decision', 'RBNZ Monetary Policy Decision'],
    'USDCAD': ['BoC Rate Decision', 'BoC Monetary Policy Decision'],
    'USDCHF': ['SNB Rate Decision', 'SNB Monetary Policy Decision'],
    'NZDJPY': ['RBNZ Rate Decision', 'BoJ Monetary Policy Decision']
};

// ============================================
// News Impact Database - Comprehensive reference for major economic events
const NEWS_IMPACT_DATABASE = {
    USD: [
        {
            name: 'Non-Farm Payrolls (NFP)',
            impact: 'high',
            description: 'Monthly employment change excluding agriculture. Most market-moving US data.',
            beatBias: 'USD bullish - stronger economy supports rate hikes',
            missBias: 'USD bearish - weak employment suggests economic slowdown',
            typicalMove: '50-150 pips',
            bufferHours: 4
        },
        {
            name: 'CPI (Consumer Price Index)',
            impact: 'high',
            description: 'Main inflation measure. Directly influences Fed rate decisions.',
            beatBias: 'USD bullish - higher inflation = more hawkish Fed',
            missBias: 'USD bearish - lower inflation = dovish Fed expectations',
            typicalMove: '50-100 pips',
            bufferHours: 4
        },
        {
            name: 'FOMC Rate Decision',
            impact: 'high',
            description: 'Federal Reserve interest rate announcement and statement.',
            beatBias: 'USD bullish - hawkish surprise or rate hike',
            missBias: 'USD bearish - dovish surprise or rate cut',
            typicalMove: '100-200 pips',
            bufferHours: 6
        },
        {
            name: 'GDP (Gross Domestic Product)',
            impact: 'high',
            description: 'Economic growth measure. Quarterly release.',
            beatBias: 'USD bullish - stronger growth supports currency',
            missBias: 'USD bearish - weaker growth concerns',
            typicalMove: '30-80 pips',
            bufferHours: 4
        },
        {
            name: 'Unemployment Claims',
            impact: 'medium',
            description: 'Weekly jobless claims. Lower is better for USD.',
            beatBias: 'USD bearish - higher claims = weaker economy',
            missBias: 'USD bullish - lower claims = stronger employment',
            typicalMove: '20-40 pips',
            bufferHours: 2
        },
        {
            name: 'Retail Sales',
            impact: 'medium',
            description: 'Consumer spending measure. Key economic indicator.',
            beatBias: 'USD bullish - strong consumer spending',
            missBias: 'USD bearish - weak consumer spending',
            typicalMove: '25-50 pips',
            bufferHours: 2
        },
        {
            name: 'ISM Manufacturing PMI',
            impact: 'medium',
            description: 'Manufacturing sector health. Above 50 = expansion.',
            beatBias: 'USD bullish - manufacturing expansion',
            missBias: 'USD bearish - manufacturing contraction',
            typicalMove: '20-40 pips',
            bufferHours: 2
        },
        {
            name: 'ISM Services PMI',
            impact: 'medium',
            description: 'Services sector health. Larger part of US economy.',
            beatBias: 'USD bullish - services expansion',
            missBias: 'USD bearish - services contraction',
            typicalMove: '20-40 pips',
            bufferHours: 2
        },
        {
            name: 'Core PCE Price Index',
            impact: 'high',
            description: 'Fed preferred inflation measure. Excludes food/energy.',
            beatBias: 'USD bullish - higher inflation = hawkish Fed',
            missBias: 'USD bearish - lower inflation = dovish Fed',
            typicalMove: '40-80 pips',
            bufferHours: 4
        },
        {
            name: 'ADP Employment',
            impact: 'medium',
            description: 'Private sector employment. NFP preview (2 days before).',
            beatBias: 'USD bullish - strong private hiring',
            missBias: 'USD bearish - weak private hiring',
            typicalMove: '20-40 pips',
            bufferHours: 2
        },
        {
            name: 'Fed Chair Speech',
            impact: 'high',
            description: 'Powell or Fed officials speaking. Watch for policy hints.',
            beatBias: 'USD bullish - hawkish tone on rates/inflation',
            missBias: 'USD bearish - dovish tone, concern about growth',
            typicalMove: '30-100 pips',
            bufferHours: 4
        }
    ],
    EUR: [
        {
            name: 'ECB Rate Decision',
            impact: 'high',
            description: 'European Central Bank interest rate announcement.',
            beatBias: 'EUR bullish - hawkish surprise or rate hike',
            missBias: 'EUR bearish - dovish surprise or rate cut',
            typicalMove: '80-150 pips',
            bufferHours: 6
        },
        {
            name: 'CPI (Eurozone)',
            impact: 'high',
            description: 'Eurozone inflation. Key for ECB policy.',
            beatBias: 'EUR bullish - higher inflation = hawkish ECB',
            missBias: 'EUR bearish - lower inflation = dovish ECB',
            typicalMove: '40-80 pips',
            bufferHours: 4
        },
        {
            name: 'German CPI',
            impact: 'medium',
            description: 'Germany inflation. Leads Eurozone CPI.',
            beatBias: 'EUR bullish - German inflation rising',
            missBias: 'EUR bearish - German inflation falling',
            typicalMove: '25-50 pips',
            bufferHours: 2
        },
        {
            name: 'German ZEW Economic Sentiment',
            impact: 'medium',
            description: 'Investor confidence in Germany.',
            beatBias: 'EUR bullish - improved sentiment',
            missBias: 'EUR bearish - deteriorating sentiment',
            typicalMove: '20-40 pips',
            bufferHours: 2
        },
        {
            name: 'GDP (Eurozone)',
            impact: 'high',
            description: 'Eurozone economic growth.',
            beatBias: 'EUR bullish - stronger growth',
            missBias: 'EUR bearish - weaker growth or recession',
            typicalMove: '30-60 pips',
            bufferHours: 4
        },
        {
            name: 'PMI (Manufacturing/Services)',
            impact: 'medium',
            description: 'Business activity indicators.',
            beatBias: 'EUR bullish - economic expansion',
            missBias: 'EUR bearish - economic contraction',
            typicalMove: '20-40 pips',
            bufferHours: 2
        },
        {
            name: 'ECB President Speech',
            impact: 'high',
            description: 'Lagarde or ECB officials speaking.',
            beatBias: 'EUR bullish - hawkish policy signals',
            missBias: 'EUR bearish - dovish policy signals',
            typicalMove: '30-80 pips',
            bufferHours: 4
        }
    ],
    GBP: [
        {
            name: 'BoE Rate Decision',
            impact: 'high',
            description: 'Bank of England interest rate announcement.',
            beatBias: 'GBP bullish - hawkish surprise or rate hike',
            missBias: 'GBP bearish - dovish surprise or rate cut',
            typicalMove: '80-150 pips',
            bufferHours: 6
        },
        {
            name: 'CPI (UK)',
            impact: 'high',
            description: 'UK inflation measure.',
            beatBias: 'GBP bullish - higher inflation = hawkish BoE',
            missBias: 'GBP bearish - lower inflation = dovish BoE',
            typicalMove: '50-100 pips',
            bufferHours: 4
        },
        {
            name: 'GDP (UK)',
            impact: 'high',
            description: 'UK economic growth.',
            beatBias: 'GBP bullish - stronger growth',
            missBias: 'GBP bearish - weaker growth',
            typicalMove: '40-80 pips',
            bufferHours: 4
        },
        {
            name: 'Employment/Unemployment',
            impact: 'medium',
            description: 'UK labor market data.',
            beatBias: 'GBP bullish - strong employment',
            missBias: 'GBP bearish - weak employment',
            typicalMove: '30-60 pips',
            bufferHours: 2
        },
        {
            name: 'Retail Sales (UK)',
            impact: 'medium',
            description: 'UK consumer spending.',
            beatBias: 'GBP bullish - strong consumer',
            missBias: 'GBP bearish - weak consumer',
            typicalMove: '25-50 pips',
            bufferHours: 2
        },
        {
            name: 'PMI (Manufacturing/Services)',
            impact: 'medium',
            description: 'UK business activity.',
            beatBias: 'GBP bullish - expansion',
            missBias: 'GBP bearish - contraction',
            typicalMove: '20-40 pips',
            bufferHours: 2
        },
        {
            name: 'BoE Governor Speech',
            impact: 'high',
            description: 'Bailey or BoE officials speaking.',
            beatBias: 'GBP bullish - hawkish tone',
            missBias: 'GBP bearish - dovish tone',
            typicalMove: '30-70 pips',
            bufferHours: 4
        }
    ],
    JPY: [
        {
            name: 'BoJ Rate Decision',
            impact: 'high',
            description: 'Bank of Japan rate and policy announcement.',
            beatBias: 'JPY bullish - policy normalisation, rate hike',
            missBias: 'JPY bearish - continued ultra-loose policy',
            typicalMove: '100-200 pips',
            bufferHours: 6
        },
        {
            name: 'CPI (Japan)',
            impact: 'high',
            description: 'Japanese inflation. BoJ watching closely.',
            beatBias: 'JPY bullish - inflation supports policy shift',
            missBias: 'JPY bearish - low inflation = no policy change',
            typicalMove: '40-80 pips',
            bufferHours: 4
        },
        {
            name: 'GDP (Japan)',
            impact: 'medium',
            description: 'Japanese economic growth.',
            beatBias: 'JPY bullish - stronger growth',
            missBias: 'JPY bearish - weaker growth',
            typicalMove: '25-50 pips',
            bufferHours: 2
        },
        {
            name: 'Tankan Survey',
            impact: 'medium',
            description: 'Business confidence survey. Quarterly.',
            beatBias: 'JPY bullish - improved confidence',
            missBias: 'JPY bearish - deteriorating confidence',
            typicalMove: '20-40 pips',
            bufferHours: 2
        },
        {
            name: 'Trade Balance',
            impact: 'medium',
            description: 'Japan exports vs imports.',
            beatBias: 'JPY bullish - trade surplus',
            missBias: 'JPY bearish - trade deficit widening',
            typicalMove: '15-30 pips',
            bufferHours: 2
        },
        {
            name: 'BoJ Governor Speech',
            impact: 'high',
            description: 'Ueda or BoJ officials speaking.',
            beatBias: 'JPY bullish - hints at policy normalisation',
            missBias: 'JPY bearish - commitment to loose policy',
            typicalMove: '40-100 pips',
            bufferHours: 4
        }
    ],
    AUD: [
        {
            name: 'RBA Rate Decision',
            impact: 'high',
            description: 'Reserve Bank of Australia rate announcement.',
            beatBias: 'AUD bullish - hawkish surprise or rate hike',
            missBias: 'AUD bearish - dovish surprise or rate cut',
            typicalMove: '60-120 pips',
            bufferHours: 6
        },
        {
            name: 'CPI (Australia)',
            impact: 'high',
            description: 'Australian inflation. Quarterly release.',
            beatBias: 'AUD bullish - higher inflation = hawkish RBA',
            missBias: 'AUD bearish - lower inflation = dovish RBA',
            typicalMove: '50-100 pips',
            bufferHours: 4
        },
        {
            name: 'Employment Change',
            impact: 'high',
            description: 'Australian job market. Key RBA consideration.',
            beatBias: 'AUD bullish - strong job growth',
            missBias: 'AUD bearish - weak job growth',
            typicalMove: '40-80 pips',
            bufferHours: 4
        },
        {
            name: 'GDP (Australia)',
            impact: 'high',
            description: 'Australian economic growth. Quarterly.',
            beatBias: 'AUD bullish - stronger growth',
            missBias: 'AUD bearish - weaker growth',
            typicalMove: '30-60 pips',
            bufferHours: 4
        },
        {
            name: 'Retail Sales',
            impact: 'medium',
            description: 'Australian consumer spending.',
            beatBias: 'AUD bullish - strong consumer',
            missBias: 'AUD bearish - weak consumer',
            typicalMove: '20-40 pips',
            bufferHours: 2
        },
        {
            name: 'Trade Balance',
            impact: 'medium',
            description: 'Australia exports vs imports.',
            beatBias: 'AUD bullish - trade surplus',
            missBias: 'AUD bearish - trade deficit',
            typicalMove: '15-30 pips',
            bufferHours: 2
        },
        {
            name: 'RBA Governor Speech',
            impact: 'high',
            description: 'Bullock or RBA officials speaking.',
            beatBias: 'AUD bullish - hawkish policy signals',
            missBias: 'AUD bearish - dovish policy signals',
            typicalMove: '30-70 pips',
            bufferHours: 4
        },
        {
            name: 'China PMI/GDP',
            impact: 'high',
            description: 'China data heavily impacts AUD (trade partner).',
            beatBias: 'AUD bullish - strong China = Aus exports',
            missBias: 'AUD bearish - weak China = less demand',
            typicalMove: '40-80 pips',
            bufferHours: 4
        }
    ],
    NZD: [
        {
            name: 'RBNZ Rate Decision',
            impact: 'high',
            description: 'Reserve Bank of NZ rate announcement.',
            beatBias: 'NZD bullish - hawkish surprise or rate hike',
            missBias: 'NZD bearish - dovish surprise or rate cut',
            typicalMove: '60-120 pips',
            bufferHours: 6
        },
        {
            name: 'CPI (New Zealand)',
            impact: 'high',
            description: 'NZ inflation. Quarterly release.',
            beatBias: 'NZD bullish - higher inflation = hawkish RBNZ',
            missBias: 'NZD bearish - lower inflation = dovish RBNZ',
            typicalMove: '50-90 pips',
            bufferHours: 4
        },
        {
            name: 'GDP (New Zealand)',
            impact: 'high',
            description: 'NZ economic growth.',
            beatBias: 'NZD bullish - stronger growth',
            missBias: 'NZD bearish - weaker growth',
            typicalMove: '30-60 pips',
            bufferHours: 4
        },
        {
            name: 'Employment/Unemployment',
            impact: 'medium',
            description: 'NZ labor market data.',
            beatBias: 'NZD bullish - strong employment',
            missBias: 'NZD bearish - weak employment',
            typicalMove: '30-50 pips',
            bufferHours: 2
        },
        {
            name: 'Trade Balance',
            impact: 'medium',
            description: 'NZ exports vs imports.',
            beatBias: 'NZD bullish - trade surplus',
            missBias: 'NZD bearish - trade deficit',
            typicalMove: '15-30 pips',
            bufferHours: 2
        },
        {
            name: 'GDT Price Index',
            impact: 'medium',
            description: 'Global Dairy Trade prices. Key NZ export.',
            beatBias: 'NZD bullish - higher dairy prices',
            missBias: 'NZD bearish - lower dairy prices',
            typicalMove: '15-30 pips',
            bufferHours: 2
        }
    ],
    CAD: [
        {
            name: 'BoC Rate Decision',
            impact: 'high',
            description: 'Bank of Canada rate announcement.',
            beatBias: 'CAD bullish - hawkish surprise or rate hike',
            missBias: 'CAD bearish - dovish surprise or rate cut',
            typicalMove: '60-120 pips',
            bufferHours: 6
        },
        {
            name: 'CPI (Canada)',
            impact: 'high',
            description: 'Canadian inflation.',
            beatBias: 'CAD bullish - higher inflation = hawkish BoC',
            missBias: 'CAD bearish - lower inflation = dovish BoC',
            typicalMove: '40-80 pips',
            bufferHours: 4
        },
        {
            name: 'GDP (Canada)',
            impact: 'high',
            description: 'Canadian economic growth.',
            beatBias: 'CAD bullish - stronger growth',
            missBias: 'CAD bearish - weaker growth',
            typicalMove: '30-60 pips',
            bufferHours: 4
        },
        {
            name: 'Employment Change',
            impact: 'high',
            description: 'Canadian job market. Often same day as US NFP.',
            beatBias: 'CAD bullish - strong job growth',
            missBias: 'CAD bearish - weak job growth',
            typicalMove: '40-70 pips',
            bufferHours: 4
        },
        {
            name: 'Retail Sales',
            impact: 'medium',
            description: 'Canadian consumer spending.',
            beatBias: 'CAD bullish - strong consumer',
            missBias: 'CAD bearish - weak consumer',
            typicalMove: '20-40 pips',
            bufferHours: 2
        },
        {
            name: 'Trade Balance',
            impact: 'medium',
            description: 'Canada exports vs imports.',
            beatBias: 'CAD bullish - trade surplus',
            missBias: 'CAD bearish - trade deficit',
            typicalMove: '15-30 pips',
            bufferHours: 2
        },
        {
            name: 'Oil Inventories',
            impact: 'medium',
            description: 'US crude inventories. CAD correlated with oil.',
            beatBias: 'CAD bearish - higher inventories = lower oil',
            missBias: 'CAD bullish - lower inventories = higher oil',
            typicalMove: '20-40 pips',
            bufferHours: 2
        }
    ],
    CHF: [
        {
            name: 'SNB Rate Decision',
            impact: 'high',
            description: 'Swiss National Bank rate announcement.',
            beatBias: 'CHF bullish - hawkish surprise or rate hike',
            missBias: 'CHF bearish - dovish surprise or rate cut',
            typicalMove: '60-120 pips',
            bufferHours: 6
        },
        {
            name: 'CPI (Switzerland)',
            impact: 'medium',
            description: 'Swiss inflation.',
            beatBias: 'CHF bullish - higher inflation',
            missBias: 'CHF bearish - lower inflation',
            typicalMove: '25-50 pips',
            bufferHours: 2
        },
        {
            name: 'GDP (Switzerland)',
            impact: 'medium',
            description: 'Swiss economic growth.',
            beatBias: 'CHF bullish - stronger growth',
            missBias: 'CHF bearish - weaker growth',
            typicalMove: '20-40 pips',
            bufferHours: 2
        },
        {
            name: 'KOF Economic Barometer',
            impact: 'low',
            description: 'Swiss leading indicator.',
            beatBias: 'CHF bullish - improved outlook',
            missBias: 'CHF bearish - deteriorating outlook',
            typicalMove: '10-25 pips',
            bufferHours: 1
        },
        {
            name: 'SNB Chairman Speech',
            impact: 'high',
            description: 'Jordan or SNB officials speaking.',
            beatBias: 'CHF bullish - less intervention signals',
            missBias: 'CHF bearish - intervention threats',
            typicalMove: '30-70 pips',
            bufferHours: 4
        }
    ]
};

// Current state for news filtering
let currentNewsFilter = { currency: 'all', search: '' };

// ============================================
// NEWS REFERENCE TAB FUNCTIONS
// ============================================

function renderNewsEvents() {
    const container = document.getElementById('news-events-list');
    if (!container) return;

    let eventsToShow = [];
    
    // Collect events based on filter
    if (currentNewsFilter.currency === 'all') {
        for (const currency in NEWS_IMPACT_DATABASE) {
            NEWS_IMPACT_DATABASE[currency].forEach(event => {
                eventsToShow.push({ ...event, currency });
            });
        }
    } else {
        const currencyEvents = NEWS_IMPACT_DATABASE[currentNewsFilter.currency] || [];
        eventsToShow = currencyEvents.map(event => ({ ...event, currency: currentNewsFilter.currency }));
    }

    // Apply search filter
    if (currentNewsFilter.search) {
        const searchTerm = currentNewsFilter.search.toLowerCase();
        eventsToShow = eventsToShow.filter(event => 
            event.name.toLowerCase().includes(searchTerm) ||
            event.description.toLowerCase().includes(searchTerm)
        );
    }

    // Sort by impact (high first)
    const impactOrder = { high: 0, medium: 1, low: 2 };
    eventsToShow.sort((a, b) => impactOrder[a.impact] - impactOrder[b.impact]);

    // Render
    if (eventsToShow.length === 0) {
        container.innerHTML = '<div class="text-muted" style="text-align: center; padding: 20px;">No events found matching your criteria</div>';
        return;
    }

    container.innerHTML = eventsToShow.map(event => `
        <div class="news-event-card impact-${event.impact}">
            <div class="news-event-header">
                <div>
                    <span class="news-event-name">${event.name}</span>
                    <span class="badge badge-info" style="margin-left: 8px; font-size: 0.7rem;">${event.currency}</span>
                </div>
                <span class="news-impact-badge ${event.impact}">${event.impact}</span>
            </div>
            <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 8px;">
                ${event.description}
            </div>
            <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 8px;">
                <strong>Typical Move:</strong> ${event.typicalMove} | <strong>Buffer:</strong> ${event.bufferHours}h before entry
            </div>
            <div class="news-bias-row">
                <div class="news-bias-box bullish">
                    <span class="news-bias-label">If Beats Forecast:</span>
                    ${event.beatBias}
                </div>
                <div class="news-bias-box bearish">
                    <span class="news-bias-label">If Misses Forecast:</span>
                    ${event.missBias}
                </div>
            </div>
        </div>
    `).join('');
}

function toggleNewsReference() {
    const content = document.getElementById('news-reference-content');
    const btn = document.getElementById('news-ref-toggle-btn');
    if (content.style.display === 'none') {
        content.style.display = 'block';
        btn.textContent = 'Hide All';
    } else {
        content.style.display = 'none';
        btn.textContent = 'Show All';
    }
}

function filterNewsByCurrency(currency) {
    currentNewsFilter.currency = currency;
    
    // Update tab active state
    document.querySelectorAll('.news-currency-tab').forEach(tab => {
        tab.classList.remove('active');
        if (tab.dataset.currency === currency) {
            tab.classList.add('active');
        }
    });
    
    renderNewsEvents();
}

function filterNewsEvents() {
    const searchInput = document.getElementById('news-search-input');
    currentNewsFilter.search = searchInput ? searchInput.value : '';
    renderNewsEvents();
}

// ============================================
// QUICK BIAS LOOKUP FUNCTIONS
// ============================================

function toggleQuickBiasPanel() {
    const panel = document.getElementById('quick-bias-panel');
    if (panel) {
        panel.classList.toggle('collapsed');
    }
}

function updateQuickBiasEvents() {
    const currencySelect = document.getElementById('quick-bias-currency');
    const eventSelect = document.getElementById('quick-bias-event');
    
    if (!currencySelect || !eventSelect) return;
    
    const currency = currencySelect.value;
    eventSelect.innerHTML = '<option value="">Select event...</option>';
    
    if (currency && NEWS_IMPACT_DATABASE[currency]) {
        NEWS_IMPACT_DATABASE[currency].forEach(event => {
            const option = document.createElement('option');
            option.value = event.name;
            option.textContent = `${event.name} (${event.impact})`;
            eventSelect.appendChild(option);
        });
    }
    
    // Clear result
    const resultDiv = document.getElementById('quick-bias-result');
    if (resultDiv) {
        resultDiv.className = 'quick-bias-result empty';
        resultDiv.innerHTML = 'Select currency and event to see bias';
    }
}

function showQuickBiasResult() {
    const currencySelect = document.getElementById('quick-bias-currency');
    const eventSelect = document.getElementById('quick-bias-event');
    const resultDiv = document.getElementById('quick-bias-result');
    
    if (!currencySelect || !eventSelect || !resultDiv) return;
    
    const currency = currencySelect.value;
    const eventName = eventSelect.value;
    
    if (!currency || !eventName) {
        resultDiv.className = 'quick-bias-result empty';
        resultDiv.innerHTML = 'Select currency and event to see bias';
        return;
    }
    
    const events = NEWS_IMPACT_DATABASE[currency] || [];
    const event = events.find(e => e.name === eventName);
    
    if (!event) {
        resultDiv.className = 'quick-bias-result empty';
        resultDiv.innerHTML = 'Event not found';
        return;
    }
    
    resultDiv.className = 'quick-bias-result';
    resultDiv.innerHTML = `
        <div style="margin-bottom: 12px;">
            <strong style="font-size: 1rem;">${event.name}</strong>
            <span class="news-impact-badge ${event.impact}" style="margin-left: 8px;">${event.impact}</span>
        </div>
        <div style="font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 12px;">
            ${event.description}
        </div>
        <div class="news-bias-row">
            <div class="news-bias-box bullish">
                <span class="news-bias-label">BEATS Forecast:</span>
                ${event.beatBias}
            </div>
            <div class="news-bias-box bearish">
                <span class="news-bias-label">MISSES Forecast:</span>
                ${event.missBias}
            </div>
        </div>
        <div style="margin-top: 12px; font-size: 0.8rem; color: var(--text-muted);">
            <strong>Typical Move:</strong> ${event.typicalMove} | 
            <strong>Entry Buffer:</strong> Avoid entering ${event.bufferHours}h before release
        </div>
    `;
}

// ============================================
// NEWS BUFFER CHECK FOR PRE-TRADE
// ============================================

function checkNewsBuffer() {
    // Check news buffer using live calendar data
    const pairSelect = document.getElementById('val-pair');
    if (!pairSelect) return;
    
    const pair = pairSelect.value;
    if (!pair) return;
    
    // Extract currencies from pair
    const baseCurrency = pair.substring(0, 3);
    const quoteCurrency = pair.substring(3, 6);
    
    // Check live calendar first, fall back to reference data
    if (LIVE_CALENDAR_DATA.events && LIVE_CALENDAR_DATA.events.length > 0) {
        updateNewsBufferWarningLive(pair, baseCurrency, quoteCurrency);
    } else {
        updateNewsBufferWarning(baseCurrency, quoteCurrency);
    }
}

// Live calendar version of news buffer warning
function updateNewsBufferWarningLive(pair, baseCurrency, quoteCurrency) {
    const warningDiv = document.getElementById('news-buffer-warning');
    const titleText = document.getElementById('news-buffer-title-text');
    const contentDiv = document.getElementById('news-buffer-content');
    const recDiv = document.getElementById('news-buffer-recommendation');
    
    if (!warningDiv) return;
    
    // Get upcoming events for both currencies (next 4 hours)
    const baseEventsHigh = getUpcomingEventsForCurrency(baseCurrency, 4).filter(e => e.impact === 'High');
    const quoteEventsHigh = getUpcomingEventsForCurrency(quoteCurrency, 4).filter(e => e.impact === 'High');
    const baseEventsMed = getUpcomingEventsForCurrency(baseCurrency, 2).filter(e => e.impact === 'Medium');
    const quoteEventsMed = getUpcomingEventsForCurrency(quoteCurrency, 2).filter(e => e.impact === 'Medium');
    
    const allHighImpact = [...baseEventsHigh, ...quoteEventsHigh];
    const allMediumImpact = [...baseEventsMed, ...quoteEventsMed];
    
    // No upcoming news
    if (allHighImpact.length === 0 && allMediumImpact.length === 0) {
        warningDiv.classList.remove('active', 'caution');
        warningDiv.classList.add('active');
        titleText.textContent = 'News Clear';
        titleText.style.color = 'var(--color-pass)';
        contentDiv.innerHTML = '<div style="color: var(--color-pass);">No high impact news within 4 hours for ' + pair + '</div>';
        recDiv.innerHTML = '<strong style="color: var(--color-pass);">Safe to trade based on news calendar</strong>';
        return;
    }
    
    // Has upcoming high impact news
    warningDiv.classList.add('active');
    titleText.style.color = '';
    
    if (allHighImpact.length > 0) {
        const nearestHigh = allHighImpact[0];
        const minutesUntil = getMinutesUntilEvent(nearestHigh);
        
        // Critical - within 30 minutes
        if (minutesUntil !== null && minutesUntil < 30) {
            warningDiv.classList.add('caution');
            titleText.textContent = 'HIGH IMPACT NEWS IMMINENT';
            titleText.style.color = 'var(--color-fail)';
        } else if (minutesUntil !== null && minutesUntil < 120) {
            warningDiv.classList.add('caution');
            titleText.textContent = 'High Impact News Approaching';
            titleText.style.color = 'var(--color-warning)';
        } else {
            warningDiv.classList.remove('caution');
            titleText.textContent = 'Upcoming News for ' + pair;
        }
    } else {
        warningDiv.classList.remove('caution');
        titleText.textContent = 'Medium Impact News for ' + pair;
    }
    
    // Build content
    let contentHTML = '';
    
    if (allHighImpact.length > 0) {
        contentHTML += '<div style="margin-bottom: 8px;"><strong style="color: var(--color-fail);">High Impact:</strong></div>';
        contentHTML += '<ul style="margin: 0 0 8px 0; padding-left: 20px; font-size: 0.85rem;">';
        allHighImpact.slice(0, 4).forEach(event => {
            const mins = getMinutesUntilEvent(event);
            const timeStr = formatTimeUntil(mins);
            const isUrgent = mins !== null && mins < 60;
            contentHTML += '<li style="' + (isUrgent ? 'color: var(--color-fail);' : '') + '">';
            contentHTML += event.currency + ': ' + event.title;
            contentHTML += ' - <strong>' + timeStr + '</strong>';
            if (event.forecast) contentHTML += ' (F: ' + event.forecast + ')';
            contentHTML += '</li>';
        });
        contentHTML += '</ul>';
    }
    
    if (allMediumImpact.length > 0) {
        contentHTML += '<div style="margin-bottom: 4px;"><strong style="color: var(--color-warning);">Medium Impact:</strong></div>';
        contentHTML += '<ul style="margin: 0; padding-left: 20px; font-size: 0.8rem; color: var(--text-secondary);">';
        allMediumImpact.slice(0, 3).forEach(event => {
            const mins = getMinutesUntilEvent(event);
            contentHTML += '<li>' + event.currency + ': ' + event.title + ' - ' + formatTimeUntil(mins) + '</li>';
        });
        contentHTML += '</ul>';
    }
    
    contentDiv.innerHTML = contentHTML;
    
    // Recommendation based on nearest high impact
    if (allHighImpact.length > 0) {
        const nearestHigh = allHighImpact[0];
        const mins = getMinutesUntilEvent(nearestHigh);
        
        if (mins !== null && mins < 30) {
            recDiv.innerHTML = '<strong style="color: var(--color-fail);">DO NOT ENTER - News in ' + mins + ' minutes</strong>';
        } else if (mins !== null && mins < 120) {
            recDiv.innerHTML = '<strong style="color: var(--color-warning);">CAUTION - Consider waiting or reduce to 1% risk</strong>';
        } else {
            recDiv.innerHTML = '<strong>Monitor - High impact news in ' + formatTimeUntil(mins) + '</strong>';
        }
    } else {
        recDiv.innerHTML = '<strong>Low risk - Only medium impact news upcoming</strong>';
    }
}

function manualNewsBufferCheck() {
    const pairSelect = document.getElementById('val-pair');
    if (!pairSelect || !pairSelect.value) {
        alert('Please select a currency pair first');
        return;
    }
    
    const pair = pairSelect.value;
    const baseCurrency = pair.substring(0, 3);
    const quoteCurrency = pair.substring(3, 6);
    
    let message = `News Events for ${pair}\n`;
    message += '='.repeat(35) + '\n\n';
    
    // LIVE EVENTS SECTION (from calendar.json)
    if (LIVE_CALENDAR_DATA.events && LIVE_CALENDAR_DATA.events.length > 0) {
        const baseEventsLive = getUpcomingEventsForCurrency(baseCurrency, 24);
        const quoteEventsLive = getUpcomingEventsForCurrency(quoteCurrency, 24);
        const allLiveEvents = [...baseEventsLive, ...quoteEventsLive];
        
        if (allLiveEvents.length > 0) {
            message += 'UPCOMING SCHEDULED EVENTS (Next 24h)\n';
            message += '='.repeat(35) + '\n';
            
            allLiveEvents.slice(0, 8).forEach(e => {
                const mins = getMinutesUntilEvent(e);
                const timeStr = formatTimeUntil(mins);
                const impact = e.impact === 'High' ? '[HIGH]' : e.impact === 'Medium' ? '[MED]' : '[LOW]';
                message += `${impact} ${e.currency}: ${e.title}\n`;
                message += `   Time: ${timeStr}`;
                if (e.forecast) message += ` | F: ${e.forecast}`;
                if (e.previous) message += ` | P: ${e.previous}`;
                message += '\n';
            });
        } else {
            message += 'OK - No scheduled events in next 24h\n';
        }
    } else {
        message += 'WARNING: Live calendar not loaded\n';
    }
    
    message += '\n' + '='.repeat(35) + '\n';
    message += 'REFERENCE: Key Events to Watch\n';
    message += '='.repeat(35) + '\n\n';
    
    // REFERENCE SECTION (from NEWS_IMPACT_DATABASE)
    const baseEvents = (NEWS_IMPACT_DATABASE[baseCurrency] || []).filter(e => e.impact === 'high');
    const quoteEvents = (NEWS_IMPACT_DATABASE[quoteCurrency] || []).filter(e => e.impact === 'high');
    
    if (baseEvents.length > 0) {
        message += `${baseCurrency} High Impact Events:\n`;
        baseEvents.forEach(e => {
            message += `  * ${e.name} (${e.bufferHours}h buffer)\n`;
        });
        message += '\n';
    }
    
    if (quoteEvents.length > 0) {
        message += `${quoteCurrency} High Impact Events:\n`;
        quoteEvents.forEach(e => {
            message += `  * ${e.name} (${e.bufferHours}h buffer)\n`;
        });
    }
    
    message += '\n' + '='.repeat(35) + '\n';
    message += 'Rule: High impact = 4h buffer, Medium = 2h buffer';
    
    alert(message);
}

function updateNewsBufferWarning(baseCurrency, quoteCurrency) {
    const warningDiv = document.getElementById('news-buffer-warning');
    const titleText = document.getElementById('news-buffer-title-text');
    const contentDiv = document.getElementById('news-buffer-content');
    const recDiv = document.getElementById('news-buffer-recommendation');
    
    if (!warningDiv) return;
    
    // Get high impact events for both currencies
    const baseEvents = (NEWS_IMPACT_DATABASE[baseCurrency] || []).filter(e => e.impact === 'high');
    const quoteEvents = (NEWS_IMPACT_DATABASE[quoteCurrency] || []).filter(e => e.impact === 'high');
    
    const allHighImpact = [...baseEvents.map(e => ({...e, currency: baseCurrency})), 
                           ...quoteEvents.map(e => ({...e, currency: quoteCurrency}))];
    
    if (allHighImpact.length === 0) {
        warningDiv.classList.remove('active');
        return;
    }
    
    // Show educational warning (in production, would check actual calendar times)
    warningDiv.classList.add('active');
    warningDiv.classList.remove('caution');
    
    titleText.textContent = `News Events for ${baseCurrency}/${quoteCurrency}`;
    
    contentDiv.innerHTML = `
        <div style="margin-bottom: 8px;">
            <strong>High Impact Events to Check:</strong>
        </div>
        <ul style="margin: 0; padding-left: 20px; font-size: 0.85rem;">
            ${allHighImpact.slice(0, 5).map(e => `
                <li>${e.currency}: ${e.name} - <span style="color: var(--color-warning);">${e.bufferHours}h buffer required</span></li>
            `).join('')}
        </ul>
    `;
    
    recDiv.innerHTML = `
        <strong>Pre-Trade Rules:</strong>
        <ul style="margin: 4px 0 0 0; padding-left: 20px; font-size: 0.8rem;">
            <li>High impact within 4h: <span style="color: var(--color-fail);">DO NOT ENTER</span></li>
            <li>Medium impact within 2h: <span style="color: var(--color-warning);">Reduce to 1% risk</span></li>
            <li>Already in trade: Consider moving to BE or taking partials</li>
        </ul>
    `;
}

// ============================================
// POSITION NEWS WARNINGS (DASHBOARD)
// ============================================

function checkOpenPositionNews() {
    // This checks open positions against upcoming news
    // Called when dashboard loads or active trades change
    
    const trades = JSON.parse(localStorage.getItem(STORAGE_KEYS.trades) || '[]');
    const openTrades = trades.filter(t => t.status === 'open');
    
    if (openTrades.length === 0) {
        const container = document.getElementById('position-news-warnings-container');
        if (container) container.innerHTML = '';
        return;
    }
    
    // Get affected currencies from open positions
    const affectedCurrencies = new Set();
    openTrades.forEach(trade => {
        if (trade.pair) {
            affectedCurrencies.add(trade.pair.substring(0, 3));
            affectedCurrencies.add(trade.pair.substring(3, 6));
        }
    });
    
    // Build warning content (educational - in production would check live calendar)
    const container = document.getElementById('position-news-warnings-container');
    if (!container) return;
    
    // Show a general reminder about checking news for open positions
    const currencies = Array.from(affectedCurrencies);
    let highImpactEvents = [];
    
    currencies.forEach(curr => {
        const events = (NEWS_IMPACT_DATABASE[curr] || []).filter(e => e.impact === 'high');
        events.forEach(e => {
            highImpactEvents.push({ ...e, currency: curr });
        });
    });
    
    if (highImpactEvents.length > 0) {
        container.innerHTML = `
            <div class="position-news-warning">
                <div class="position-news-header">
                    <span class="icon">&#x1F4F0;</span>
                    <span>Open Position News Reminder</span>
                </div>
                <div class="position-news-details">
                    You have ${openTrades.length} open position(s) in currencies with major news events. 
                    Check your TradingView Economic Calendar for scheduled times.
                </div>
                <div style="font-size: 0.8rem; margin-bottom: 8px;">
                    <strong>Currencies Exposed:</strong> ${currencies.join(', ')}
                </div>
                <div class="position-news-action">
                    <button class="action-btn" onclick="showTab('reference'); filterNewsByCurrency('${currencies[0]}');">
                        View ${currencies[0]} Events
                    </button>
                    ${currencies[1] ? `<button class="action-btn" onclick="showTab('reference'); filterNewsByCurrency('${currencies[1]}');">View ${currencies[1]} Events</button>` : ''}
                </div>
                <div style="margin-top: 8px; font-size: 0.75rem; color: var(--text-muted);">
                    <strong>If high-impact news approaching:</strong> Move stop to BE if in profit, or take partials
                </div>
            </div>
        `;
    } else {
        container.innerHTML = '';
    }
}

// ============================================
// INITIALISATION
// ============================================

// Initialise news system when DOM ready
document.addEventListener('DOMContentLoaded', () => {
    // Render news reference on reference tab
    setTimeout(() => {
        renderNewsEvents();
        checkOpenPositionNews();
        
        // Hook into showTab for news updates (after showTab is defined)
        if (typeof window.showTab === 'function') {
            const _originalShowTab = window.showTab;
            window.showTab = function(tabName) {
                _originalShowTab(tabName);
                if (tabName === 'dashboard') {
                    checkOpenPositionNews();
                }
                if (tabName === 'reference') {
                    renderNewsEvents();
                }
            };
        }
    }, 700);
});

// CHUNK 9 COMPLETE - News Impact Management System
