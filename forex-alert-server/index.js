const http = require('http');
const fs = require('fs');
const path = require('path');
const webpush = require('web-push');

const PORT = process.env.PORT || 3847;
const STATE_FILE = process.env.STATE_FILE || '/data/armed.json';
const UTCC_FILE = process.env.UTCC_FILE || '/data/utcc-alerts.json';
const STRUCTURE_FILE = process.env.STRUCTURE_FILE || '/data/structure.json';
const ARM_HISTORY_FILE = process.env.ARM_HISTORY_FILE || '/data/arm-history.json';
const BIAS_HISTORY_FILE = process.env.BIAS_HISTORY_FILE || '/data/bias-history.json';
const PUSH_SUBS_FILE = process.env.PUSH_SUBS_FILE || '/data/push-subscriptions.json';
const IG_SENTIMENT_FILE  = process.env.IG_SENTIMENT_FILE  || '/data/ig-sentiment.json';
const OANDA_BOOK_FILE    = process.env.OANDA_BOOK_FILE    || '/data/oanda-orderbook.json';
const LOCATION_FILE     = process.env.LOCATION_FILE     || '/data/location.json';
const LOC_HISTORY_FILE  = process.env.LOC_HISTORY_FILE  || '/data/location-history.json';

// ============================================================================
// VERSION INFO
// ============================================================================
const VERSION = '2.13.1';
const CHANGES = [
    '2.13.1 - Fix signal frequency counts: getPairSignalCounts() now deduplicates arm-history events into distinct sessions (6h gap threshold). Fixes inflated counts caused by 4H re-affirmation pings logging as separate events.',
    '2.13.0 - Signal frequency: /state now exposes weekSignalCount and twoWeekSignalCount per pair, derived server-side from arm-history.json. Zero extra client API calls.',
    '2.12.0 - Add ltfBreak field (ctx.ltf_break from TR_ARMED payloads); TR_ARMED bootstrap: structure=SUPPORT|RESISTANCE infers structExt=FRESH before FCC-SRL fires; remove legacy fields criteria/volBehaviour/structBars/riskMult from pair state and arm history (never populated by ultimate-utcc.pine); remove ctx.struct_ext read (server-derives from locGrade only).',
    '2.11.0 - Location score enrichment: FCC-SRL grade drives entry location pts (0-25) added server-side to base UTCC score (max 75). enrichedScore + locScore + locGrade + locTimestamp exposed on /state. structExt derived from locGrade (FRESH/EXTENDED). Fixes broken PRIME/STANDARD/DEGRADED tier grouping in armed panel.',
    '2.10.3 - /state now exposes armedAt field (fixes dismiss auto-restore); pure JSON path reads context.playbook fallback (fixes blank playbook on Ultimate UTCC cards)',
    '3.0.0 - Pure JSON parsing path for Ultimate UTCC alert() payloads; entry_zone + atr_pct field mapping fixed; playbook extraction added',
    '2.9.0 - Ultimate UTCC integration: TF_ARMED (trend-following, 1.5R) and TR_ARMED (trend-reversal, 0.75R); legacy ARMED mapped to TF_ARMED; positionSize derived from alert type',
    '2.10.0 - Location History: append every location payload to location-history.json for calibration analysis',
    '2.9.0 - Location Engine: POST /webhook/location + GET /location endpoints; per-pair location grade fed from FCC-LOC Pine indicator',
    '2.10.2 - No armedAt backfill for pre-v2.10.1 pairs; null prevents dismiss defeat',
    '2.10.1 - Preserve armedAt on re-ARMED; prevents dismiss reconcile defeat by repeated candle-close alerts',
    '2.8.0 - SESSION_RESET no longer clears armed pairs — natural disarm only; pairs survive session transitions',
    '2.7.0 - pushBlocked(): PWA push notification on BLOCKED alerts — position management signal with human-readable disarm reason',
    '2.6.0 - GET /te-snapshot: serve te-snapshot.json (Trading Economics macro briefing) with 8h staleness check',
    '2.5.0 - PWA push notifications: ARMED, FOMO cleared (1hr), news gate, circuit breaker',
    '2.4.1 - CRITICAL: All data file paths moved from /app/ to /data/ (mounted volume) — arm-history.json, structure.json, armed.json, utcc-alerts.json, candidates.json now survive container restarts',
    '2.4.0 - Arm History expansion: capture full UTCC context (playbook, mtf, criteria, volBehaviour, volLevel, rsi, riskMult, riskState, maxRisk, dayOfWeek, hour, weekNumber)',
    '2.3.0 - Arm History: append every ARMED event to arm-history.json; GET /arm-history endpoint for heatmap dashboard',
    '2.2.0 - Structure Gate: POST /webhook/structure + GET /structure endpoints; ProZones proximity data stored per pair with 4h TTL',
    '2.1.0 - Parse JSON body from webhooks: store direction, entryZone, mtf, criteria, volState, volBehaviour, volLevel, riskMult, rsi, playbook in armed/candidate state',
    '2.0.0 - Institutional alert format: new parseAlert(), CANDIDATE storage, BLOCKED/INFO types, backward compat',
    '1.1.0 - Added UTCC alert queue for trade capture system',
    '1.0.0 - Original armed pairs tracking'
];

// ============================================================================
// CONFIGURATION
// ============================================================================
const CONFIG = {
    UTCC_ALERT_TTL_HOURS: 4,        // Alerts expire after 4 hours
    UTCC_MAX_ALERTS_PER_PAIR: 10,   // Keep last 10 alerts per pair
    UTCC_CLEANUP_INTERVAL_MS: 300000, // Cleanup every 5 minutes
    STRUCTURE_TTL_HOURS: 4,         // Structure alerts expire after 4 hours
    LOCATION_TTL_HOURS:  6          // Location grades expire after 6 hours
};

// ============================================================================
// WEB PUSH (VAPID) CONFIGURATION
// ============================================================================
const VAPID_PUBLIC_KEY  = 'BK7MEl0DhksZv7pLAk_C9a0K-cY-wpSNsuqfqMnkuLIrOPvnBEMBAGvQGwEx32EgRvIj8Uruhq_PHzw4vrxZa1I';
const VAPID_PRIVATE_KEY = '6-kmWsH4vhes6qbAhlJJQKw1crolvRM4bhgnYcDWFYU';
const VAPID_CONTACT     = 'mailto:admin@pineros.club';

webpush.setVapidDetails(VAPID_CONTACT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

// In-memory FOMO timers: pair -> setTimeout handle
var fomoTimers = {};

// ============================================================================
// PUSH SUBSCRIPTION MANAGEMENT
// ============================================================================
function loadSubscriptions() {
    try {
        if (fs.existsSync(PUSH_SUBS_FILE)) {
            return JSON.parse(fs.readFileSync(PUSH_SUBS_FILE, 'utf8'));
        }
    } catch (e) {
        console.error('Error loading subscriptions:', e.message);
    }
    return { subscriptions: [] };
}

function saveSubscriptions(data) {
    try {
        fs.writeFileSync(PUSH_SUBS_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
        console.error('Error saving subscriptions:', e.message);
    }
}

function addOrUpdateSubscription(subscription) {
    var data = loadSubscriptions();
    var endpoint = subscription.endpoint;
    // Extract prefs if sent (client sends { ...sub, prefs: {...} })
    var prefs = subscription.prefs || { armed: true, fomoCleared: true, newsWarning: true, circuitBreaker: true };
    var subData = {
        endpoint:   subscription.endpoint,
        keys:       subscription.keys,
        expirationTime: subscription.expirationTime || null,
        prefs:      prefs
    };
    var idx = data.subscriptions.findIndex(function(s) { return s.endpoint === endpoint; });
    if (idx >= 0) {
        data.subscriptions[idx] = subData;
    } else {
        data.subscriptions.push(subData);
    }
    saveSubscriptions(data);
    console.log('[PUSH] Subscription saved. Prefs:', JSON.stringify(prefs), '| Total:', data.subscriptions.length);
}

// ============================================================================
// SEND PUSH NOTIFICATIONS
// ============================================================================
function sendPushToAll(payload, prefKey) {
    var data = loadSubscriptions();
    if (!data.subscriptions.length) {
        console.log('[PUSH] No subscriptions registered');
        return;
    }

    var deadEndpoints = [];
    var payloadStr = JSON.stringify(payload);

    data.subscriptions.forEach(function(sub) {
        // Check per-subscription pref if a key is provided
        if (prefKey && sub.prefs && sub.prefs[prefKey] === false) {
            console.log('[PUSH] Skipping (pref disabled):', prefKey, sub.endpoint.slice(-20));
            return;
        }
        webpush.sendNotification(sub, payloadStr)
            .then(function() {
                console.log('[PUSH] Sent:', (payload.data && payload.data.type) || '?');
            })
            .catch(function(err) {
                if (err.statusCode === 410 || err.statusCode === 404) {
                    deadEndpoints.push(sub.endpoint);
                    console.log('[PUSH] Dead subscription removed');
                } else {
                    console.error('[PUSH] Send error:', err.statusCode, err.message);
                }
            });
    });

    if (deadEndpoints.length) {
        var cleaned = loadSubscriptions();
        cleaned.subscriptions = cleaned.subscriptions.filter(function(s) {
            return deadEndpoints.indexOf(s.endpoint) === -1;
        });
        saveSubscriptions(cleaned);
    }
}

function pushArmed(alert) {
    var score = alert.score || 0;
    var zone  = alert.entryZone || '';
    var dir   = alert.direction || '';
    var pb    = alert.playbook || alert.primary || '';
    var body  = alert.pair + ' ' + dir + ' | ' + pb + ' | Score ' + score + (zone ? ' | ' + zone : '');
    var state = loadState();
    var armedCount = Object.keys(state.pairs).length;
    sendPushToAll({
        title:   (alert.type || 'TF_ARMED') + ': ' + alert.pair,
        body:    body,
        icon:    '/icons/icon-192.png',
        tag:     'armed-' + alert.pair,
        vibrate: [200, 100, 200],
        requireInteraction: true,
        data:    { type: 'ARMED', pair: alert.pair, armedCount: armedCount }
    }, 'armed');
}

function pushFomoCleared(pair) {
    sendPushToAll({
        title:   'FOMO Gate Cleared: ' + pair,
        body:    '1-hour analysis window complete. You may now assess entry.',
        icon:    '/icons/icon-192.png',
        tag:     'fomo-' + pair,
        vibrate: [100, 50, 100],
        requireInteraction: false,
        data:    { type: 'FOMO_CLEARED', pair: pair }
    }, 'fomoCleared');
}

function pushBlocked(alert) {
    var pair    = alert.pair || '';
    var reason  = alert.primary || '';
    var score   = alert.score || 0;
    var dir     = (alert.direction || '').toUpperCase();
    // Human-readable reason from reason codes
    var reasonText = reason === 'U-EMA-FLAT'            ? 'EMA compressed — trend lost'
                   : reason === 'U-MTF-MISALIGN'        ? 'MTF alignment broken'
                   : reason === 'U-EFFICIENCY-COLLAPSE'  ? 'Directional efficiency collapsed'
                   : reason === 'R-CHAOS'                ? 'Volatility regime — MIXED'
                   : reason === 'R-COMPRESSION'          ? 'Market compressing'
                   : reason === 'R-OFFSESSION'           ? 'Session ended'
                   : reason === 'K-LOCKED'               ? 'Risk governor LOCKED'
                   : reason;
    var wasDir  = dir && dir !== 'NONE' ? ' | Was ' + dir : '';
    var body    = reasonText + wasDir + ' | Score ' + score;
    sendPushToAll({
        title:   'BLOCKED: ' + pair,
        body:    body,
        icon:    '/icons/icon-192.png',
        tag:     'blocked-' + pair,
        vibrate: [300, 100, 300, 100, 300],
        requireInteraction: true,
        data:    { type: 'BLOCKED', pair: pair, reason: reason }
    }, 'blocked');
}

function pushNewsWarning(payload) {
    var body = payload.event
        ? payload.event + ' in ' + (payload.minutesAway || '?') + ' min'
        : 'High-impact event approaching';
    sendPushToAll({
        title:   'News Warning',
        body:    body,
        icon:    '/icons/icon-192.png',
        tag:     'news-warning',
        vibrate: [300, 100, 300],
        requireInteraction: true,
        data:    { type: 'NEWS_WARNING' }
    }, 'newsWarning');
}

function pushCircuitBreaker(payload) {
    var drawdown = payload.drawdown || '';
    var level    = payload.level    || '';
    var message  = payload.message  || '';
    var body = message || (drawdown ? 'Drawdown: ' + drawdown : 'Drawdown threshold hit');
    var title = level === 'EMERGENCY'
        ? 'EMERGENCY STAND-DOWN'
        : level === 'STANDDOWN'
            ? 'Stand-Down Activated'
            : 'Risk Cap Applied';
    var vibrate = level === 'EMERGENCY'
        ? [300, 100, 300, 100, 300, 100, 300]
        : [300, 100, 300];
    sendPushToAll({
        title:   title,
        body:    body,
        icon:    '/icons/icon-192.png',
        tag:     'circuit-breaker-' + (level || 'cap'),
        vibrate: vibrate,
        requireInteraction: true,
        data:    { type: 'CIRCUIT_BREAKER', level: level }
    }, 'circuitBreaker');
}



function pushScraperError(payload) {
    var message  = payload.message || 'FF calendar markup changed -- verify events manually';
    var ts       = payload.timestamp || new Date().toISOString();
    sendPushToAll({
        title:   'Scraper Alert: Canary Failed',
        body:    message,
        icon:    '/icons/icon-192.png',
        tag:     'scraper-error',
        vibrate: [300, 100, 300],
        requireInteraction: true,
        data:    { type: 'SCRAPER_ERROR', timestamp: ts }
    }, 'scraperError');
}


// ============================================================================
// STATE MANAGEMENT - ARMED PAIRS
// ============================================================================

function loadState() {
    try {
        if (fs.existsSync(STATE_FILE)) {
            return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
        }
    } catch (e) {
        console.error('Error loading state:', e.message);
    }
    return { pairs: {}, lastUpdate: null };
}

function saveState(state) {
    state.lastUpdate = new Date().toISOString();
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}


// ============================================================================
// STATE MANAGEMENT - ARM HISTORY (append-only log)
// ============================================================================

function loadArmHistory() {
    try {
        if (fs.existsSync(ARM_HISTORY_FILE)) {
            return JSON.parse(fs.readFileSync(ARM_HISTORY_FILE, 'utf8'));
        }
    } catch (e) {
        console.error('Error loading arm history:', e.message);
    }
    return { events: [], lastUpdate: null };
}

// Returns distinct arm SESSIONS for a pair in the last 7 / 14 days.
// arm-history logs every 4H re-affirmation, not just new arms.
// Events within 6h of each other = same session; only first counts.
function getPairSignalCounts(pair) {
    try {
        var data       = loadArmHistory();
        var events     = data.events || [];
        var now        = Date.now();
        var ms7        = 7  * 24 * 60 * 60 * 1000;
        var ms14       = 14 * 24 * 60 * 60 * 1000;
        var SESSION_GAP = 6 * 60 * 60 * 1000; // 6h gap = distinct new arm session

        // Filter to this pair within 14 days, sort chronologically
        var relevant = [];
        for (var i = 0; i < events.length; i++) {
            var e = events[i];
            if ((e.pair || '').toUpperCase() !== pair.toUpperCase()) continue;
            var ts = new Date(e.timestamp).getTime();
            if (now - ts <= ms14) relevant.push(ts);
        }
        relevant.sort(function(a, b) { return a - b; });

        // Deduplicate: only count the first event of each session
        var sessions = [];
        var lastTs   = null;
        for (var j = 0; j < relevant.length; j++) {
            if (lastTs === null || (relevant[j] - lastTs) >= SESSION_GAP) {
                sessions.push(relevant[j]);
                lastTs = relevant[j];
            }
        }

        var week    = sessions.filter(function(ts) { return now - ts <= ms7;  }).length;
        var twoWeek = sessions.length;

        return { weekSignalCount: week, twoWeekSignalCount: twoWeek };
    } catch (err) {
        return { weekSignalCount: 0, twoWeekSignalCount: 0 };
    }
}

function loadBiasHistory() {
    try {
        if (fs.existsSync(BIAS_HISTORY_FILE)) {
            return JSON.parse(fs.readFileSync(BIAS_HISTORY_FILE, 'utf8'));
        }
    } catch (e) {
        console.error('Error loading bias history:', e.message);
    }
    return { schema_version: '1.0.0', runs: [], run_count: 0, last_updated: null };
}

function getCurrentPairVerdicts() {
    var history = loadBiasHistory();
    if (!history.runs || history.runs.length === 0) return {};
    // Most recent run has the current verdicts
    var latest = history.runs[history.runs.length - 1];
    return latest.pair_verdicts || {};
}

function getCurrentCurrencyBias() {
    var history = loadBiasHistory();
    if (!history.runs || history.runs.length === 0) return {};
    var latest = history.runs[history.runs.length - 1];
    return latest.currency_bias || {};
}


function appendArmEvent(alert, timestamp) {
    try {
        var data = loadArmHistory();
        var dt = new Date(timestamp);

        // Day of week: 0=Sun, 1=Mon ... 6=Sat
        var days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
        var dayOfWeek = days[dt.getUTCDay()];

        // ISO week number
        var startOfYear = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
        var weekNumber = Math.ceil(((dt - startOfYear) / 86400000 + startOfYear.getUTCDay() + 1) / 7);

        data.events.push({
            // ── Identity ──────────────────────────────────────────
            pair:         alert.pair,
            timestamp:    timestamp,

            // ── Time context (derived) ────────────────────────────
            dayOfWeek:    dayOfWeek,
            hourUTC:      dt.getUTCHours(),
            weekNumber:   weekNumber,
            month:        dt.getUTCMonth() + 1,

            // ── Setup quality ─────────────────────────────────────
            score:        alert.score        || 0,
            mtf:          alert.mtf          || 0,
            direction:    alert.direction    || '',
            entryZone:    alert.entryZone    || '',

            // ── Volatility context ────────────────────────────────
            volState:     alert.volState     || '',
            volLevel:     alert.volLevel     || 0,
            structExt:    alert.structExt    || '',

            // ── Momentum ──────────────────────────────────────────
            rsi:          alert.rsi          || 0,

            // ── Session & regime ──────────────────────────────────
            session:      alert.session      || '',
            primary:      alert.primary      || '',
            playbook:     alert.playbook     || alert._playbook || '',

            // ── Risk state at arm time ────────────────────────────
            riskState:    alert.riskState    || 'K-NORMAL',
            maxRisk:      alert.maxRisk      || '1.0R',
            permission:   alert.permission   || 'FULL',

            // ── News bias at arm time (from bias-history.json) ──────────────
            news_bias:    (function() {
                try {
                    var verdicts = getCurrentPairVerdicts();
                    var biases   = getCurrentCurrencyBias();
                    var pair     = alert.pair || '';
                    // Index pairs need explicit base/quote (can't split at char 3)
                    var INDEX_CURRENCIES = {
                        'AU200AUD':('AUD','USD'),'CN50USD':('CNY','USD'),
                        'HK33HKD':('HKD','USD'),'JP225YJPY':('JPY','USD'),
                        'JP225USD':('JPY','USD'),'US30USD':('USD','USD'),
                        'US2000USD':('USD','USD'),'SPX500USD':('USD','USD'),
                        'NAS100USD':('USD','USD'),'UK100GBP':('GBP','USD'),
                        'FR40EUR':('EUR','USD'),'EU50EUR':('EUR','USD'),
                        'DE30EUR':('EUR','USD'),
                    };
                    var base, quote;
                    if (INDEX_CURRENCIES[pair]) {
                        base  = INDEX_CURRENCIES[pair][0];
                        quote = INDEX_CURRENCIES[pair][1];
                    } else {
                        base  = pair.substring(0,3);
                        quote = pair.substring(3,6);
                    }
                    if (!verdicts[pair]) return null;
                    var verdict  = verdicts[pair];
                    // Determine confluence vs UTCC direction
                    var utccDir  = (alert.direction || '').toUpperCase();
                    var biasDir  = verdict.direction; // 'BULLISH','BEARISH','NEUTRAL'
                    var confluence = 'NEUTRAL';
                    if (biasDir !== 'NEUTRAL') {
                        var biasLong  = biasDir === 'BULLISH';
                        var utccLong  = utccDir === 'LONG' || utccDir === 'BULL';
                        var utccShort = utccDir === 'SHORT' || utccDir === 'BEAR';
                        if ((biasLong && utccLong) || (!biasLong && utccShort)) {
                            confluence = 'ALIGNED';
                        } else if ((biasLong && utccShort) || (!biasLong && utccLong)) {
                            confluence = 'CONFLICTING';
                        }
                    }
                    return {
                        pair_direction:  verdict.direction,
                        net_score:       verdict.net_score,
                        strength:        verdict.strength,
                        confluence:      confluence,
                        size_modifier:   confluence === 'CONFLICTING' ? verdict.size_modifier : 1.0,
                        base_bias:       (biases[base]  || {bias:'UNKNOWN',score:0,confidence:'LOW'}),
                        quote_bias:      (biases[quote] || {bias:'UNKNOWN',score:0,confidence:'LOW'})
                    };
                } catch(e) {
                    return null;
                }
            })()
        });

        data.lastUpdate = new Date().toISOString();
        fs.writeFileSync(ARM_HISTORY_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('Error appending arm history:', e.message);
    }
}

// ============================================================================
// STATE MANAGEMENT - STRUCTURE (ProZones proximity data)
// ============================================================================

function loadStructure() {
    try {
        if (fs.existsSync(STRUCTURE_FILE)) {
            return JSON.parse(fs.readFileSync(STRUCTURE_FILE, 'utf8'));
        }
    } catch (e) {
        console.error('Error loading structure:', e.message);
    }
    return { pairs: {}, lastUpdate: null };
}

function saveStructure(data) {
    data.lastUpdate = new Date().toISOString();
    fs.writeFileSync(STRUCTURE_FILE, JSON.stringify(data, null, 2));
}

function cleanupExpiredStructure() {
    const data = loadStructure();
    const now = Date.now();
    const ttlMs = CONFIG.STRUCTURE_TTL_HOURS * 60 * 60 * 1000;
    let cleaned = 0;

    for (const pair of Object.keys(data.pairs)) {
        const ts = new Date(data.pairs[pair].timestamp).getTime();
        if (now - ts > ttlMs) {
            delete data.pairs[pair];
            cleaned++;
        }
    }

    if (cleaned > 0) {
        saveStructure(data);
        console.log('[Cleanup] Removed ' + cleaned + ' expired structure entries');
    }
}

// ============================================================================
// LOCATION STATE MANAGEMENT
// ============================================================================
function loadLocation() {
    try {
        if (fs.existsSync(LOCATION_FILE)) {
            return JSON.parse(fs.readFileSync(LOCATION_FILE, 'utf8'));
        }
    } catch (e) {
        console.error('[Location] Load error:', e.message);
    }
    return { pairs: {}, lastUpdate: null };
}

function saveLocation(data) {
    data.lastUpdate = new Date().toISOString();
    try {
        fs.writeFileSync(LOCATION_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('[Location] Save error:', e.message);
    }
}

// ============================================================================
// LOCATION SCORE ENRICHMENT
// Maps FCC-SRL grade to entry location pts and enriches the armed pair score.
// Called in two places:
//   1. When a UTCC alert arms a pair (location data may already exist)
//   2. When a location update arrives for a pair that is already armed
// ============================================================================

function gradeToLocPts(grade) {
    var map = {
        'PRIME':           25,
        'AT_ZONE':         20,
        'BREAKOUT_RETEST': 20,
        'AT_CLOUD':        12,
        'IN_CLOUD':         6,
        'WAIT':             0,
        'OPPOSED':          0,
        'FALSE_BREAK':      0,
        'BREAKOUT_EXT':     0,
        'NO_DIRECTION':     0
    };
    return map[grade] !== undefined ? map[grade] : 0;
}

function gradeToStructExt(grade) {
    if (grade === 'PRIME' || grade === 'AT_ZONE' || grade === 'BREAKOUT_RETEST') return 'FRESH';
    return 'EXTENDED';
}

function enrichArmedPair(pair) {
    try {
        var locData = loadLocation();
        var now     = new Date();
        var ttlMs   = CONFIG.LOCATION_TTL_HOURS * 60 * 60 * 1000;
        var loc     = locData.pairs ? locData.pairs[pair] : null;

        if (!loc || !loc.grade || loc.grade === 'NO_DATA') return false;
        if ((now - new Date(loc.timestamp)) > ttlMs) return false;

        var state = loadState();
        if (!state.pairs[pair]) return false;

        var baseScore = state.pairs[pair].score || 0;
        var locPts    = gradeToLocPts(loc.grade);

        state.pairs[pair].locScore      = locPts;
        state.pairs[pair].enrichedScore = Math.min(100, baseScore + locPts);
        state.pairs[pair].locGrade      = loc.grade;
        state.pairs[pair].locTimestamp  = loc.timestamp;
        state.pairs[pair].structExt     = gradeToStructExt(loc.grade);

        saveState(state);
        console.log('[Enrich] ' + pair + ' | grade:' + loc.grade + ' | locPts:' + locPts + ' | enriched:' + state.pairs[pair].enrichedScore + ' | structExt:' + state.pairs[pair].structExt);
        return true;
    } catch (e) {
        console.error('[Enrich] Error enriching ' + pair + ':', e.message);
        return false;
    }
}

// ============================================================================
// LOCATION HISTORY - append every webhook payload for calibration analysis
// ============================================================================
function loadLocHistory() {
    try {
        if (fs.existsSync(LOC_HISTORY_FILE)) {
            return JSON.parse(fs.readFileSync(LOC_HISTORY_FILE, 'utf8'));
        }
    } catch (e) {
        console.error('[LocHistory] Load error:', e.message);
    }
    return { events: [], total: 0, last_updated: null };
}

function appendLocHistory(payload) {
    try {
        var data = loadLocHistory();
        var event = {
            timestamp:      new Date().toISOString(),
            pair:           payload.pair            || '',
            asset_class:    payload.asset_class      || 'FX',
            direction:      payload.direction        || 'NEUTRAL',
            grade:          payload.grade            || 'WAIT',
            zone:           payload.zone             || 'NONE',
            zone_dist_atr:  parseFloat(payload.zone_dist_atr)  || null,
            cloud_pos:      payload.cloud_pos        || 'CLEAR',
            cloud_dist_atr: parseFloat(payload.cloud_dist_atr) || null,
            breakout:       payload.breakout         || 'NONE',
            supp_name:      payload.supp_name        || 'NONE',
            supp_dist_atr:  parseFloat(payload.supp_dist_atr)  || null,
            res_name:       payload.res_name         || 'NONE',
            res_dist_atr:   parseFloat(payload.res_dist_atr)   || null
        };
        data.events.push(event);
        data.total        = data.events.length;
        data.last_updated = event.timestamp;
        if (data.events.length > 10000) {
            data.events = data.events.slice(-10000);
            data.total  = data.events.length;
        }
        fs.writeFileSync(LOC_HISTORY_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('[LocHistory] Append error:', e.message);
    }
}

function cleanupExpiredLocation() {
    var data  = loadLocation();
    var now   = Date.now();
    var ttlMs = CONFIG.LOCATION_TTL_HOURS * 60 * 60 * 1000;
    var cleaned = 0;
    for (var pair of Object.keys(data.pairs)) {
        if (now - new Date(data.pairs[pair].timestamp).getTime() > ttlMs) {
            delete data.pairs[pair];
            cleaned++;
        }
    }
    if (cleaned > 0) {
        saveLocation(data);
        console.log('[Location] Cleaned ' + cleaned + ' expired entries');
    }
}

// ============================================================================
// STATE MANAGEMENT - UTCC ALERTS (existing)
// ============================================================================

function loadUtccAlerts() {
    try {
        if (fs.existsSync(UTCC_FILE)) {
            return JSON.parse(fs.readFileSync(UTCC_FILE, 'utf8'));
        }
    } catch (e) {
        console.error('Error loading UTCC alerts:', e.message);
    }
    return { alerts: {}, lastUpdate: null };
}

function saveUtccAlerts(data) {
    data.lastUpdate = new Date().toISOString();
    fs.writeFileSync(UTCC_FILE, JSON.stringify(data, null, 2));
}

function cleanupExpiredAlerts() {
    const data = loadUtccAlerts();
    const now = Date.now();
    let cleaned = 0;

    for (const pair of Object.keys(data.alerts)) {
        const before = data.alerts[pair].length;
        data.alerts[pair] = data.alerts[pair].filter(function(alert) {
            const ttl = new Date(alert.ttl).getTime();
            return ttl > now;
        });
        cleaned += before - data.alerts[pair].length;

        // Remove empty pair arrays
        if (data.alerts[pair].length === 0) {
            delete data.alerts[pair];
        }
    }

    if (cleaned > 0) {
        saveUtccAlerts(data);
        console.log('[Cleanup] Removed ' + cleaned + ' expired UTCC alerts');
    }
}

// Start periodic cleanup
setInterval(cleanupExpiredAlerts, CONFIG.UTCC_CLEANUP_INTERVAL_MS);
setInterval(cleanupExpiredStructure, CONFIG.UTCC_CLEANUP_INTERVAL_MS);

// ============================================================================
// ALERT PARSING - BACKWARD COMPATIBILITY (old format detection)
// ============================================================================

/**
 * Detect old-format alerts from pre-institutional indicators.
 * Old format uses: \u2705 ARMED, DISARMED, \uD83D\uDD04 RESET, \u26A1 CANDIDATE
 * These will be phased out once all 6 indicators are migrated.
 */
function isOldFormat(text) {
    return text.includes('DISARMED') ||
           text.includes('\u2705 ARMED') ||    // old checkmark ARMED
           text.includes('\uD83D\uDD04 RESET') || // old rotating arrows RESET
           text.includes('\u26A1 CANDIDATE');   // old lightning CANDIDATE
}

/**
 * Parse old-format alert (pre-institutional).
 * Maps old keywords to new types for consistent state handling.
 */
function parseOldAlert(body) {
    const text = typeof body === 'string' ? body : body.toString();
    const parts = text.split('|').map(function(p) { return p.trim(); });

    if (parts.length < 2) return null;

    const header = parts[0];

    // Old ARMED: "\u2705 ARMED \u2191 | EURUSD | CONTINUATION | London"
    if (header.includes('ARMED') && !header.includes('DISARMED')) {
        var direction = header.includes('\u2191') ? '\u2191' :
                        header.includes('\u2193') ? '\u2193' : '?';
        return {
            type: 'ARMED',
            pair: parts[1] || '',
            primary: 'LEGACY',
            permission: 'FULL',
            maxRisk: '1.0R',
            score: 0,
            riskState: 'K-NORMAL',
            session: parts[3] || '',
            // Preserve old fields for backward compat display
            _legacy: true,
            _direction: direction,
            _playbook: parts[2] || '',
            timestamp: new Date().toISOString()
        };
    }

    // Old DISARMED -> maps to BLOCKED
    if (header.includes('DISARMED')) {
        return {
            type: 'BLOCKED',
            pair: parts[1] || '',
            primary: 'LEGACY',
            timestamp: new Date().toISOString()
        };
    }

    // Old RESET -> maps to INFO SESSION_RESET
    if (header.includes('RESET')) {
        return {
            type: 'INFO',
            pair: 'SESSION_RESET',
            primary: parts[1] || '',
            timestamp: new Date().toISOString()
        };
    }

    // Old CANDIDATE (was not stored)
    if (header.includes('CANDIDATE')) {
        return {
            type: 'CANDIDATE',
            pair: parts[1] || '',
            primary: 'LEGACY',
            permission: 'CONDITIONAL',
            maxRisk: '0.25R',
            score: 0,
            riskState: 'K-NORMAL',
            session: '',
            _legacy: true,
            timestamp: new Date().toISOString()
        };
    }

    return null;
}

// ============================================================================
// ALERT PARSING - NEW INSTITUTIONAL FORMAT
// ============================================================================

/**
 * Parse institutional scan line format:
 * [emoji] [prefix] TYPE | PAIR | PRIMARY_REASON | RISK_STATE | U-SCORE-XX
 *
 * Severity prefix [A]/[C]/[B]/[I] is transparent — parsed via .includes()
 * Header and body separated by em-dash (\u2014) or newline
 * Primary reason is ALWAYS R-series or K-series, NEVER U-series
 */
function parseNewAlert(body) {
    var text = typeof body === 'string' ? body : body.toString();
    var lines = text.split('\n');
    var headerLine = lines[0].trim();

    // --- Pure JSON path (Ultimate UTCC alert() payloads) ---
    // Ultimate UTCC fires alert() with raw JSON body. No pipe header.
    if (headerLine.charAt(0) === '{') {
        try {
            var jsonAlert = JSON.parse(headerLine);
            var jCtx = jsonAlert.context || {};
            // v2.12.0: TR bootstrap — if price is confirmed at S/R by the alert gate,
            // infer structExt=FRESH immediately (before FCC-SRL bar close fires).
            var jStructExt = '';
            if ((jsonAlert.type === 'TR_ARMED') &&
                (jCtx.structure === 'SUPPORT' || jCtx.structure === 'RESISTANCE')) {
                jStructExt = 'FRESH';
            }
            return {
                type:         jsonAlert.type || 'TF_ARMED',
                pair:         jsonAlert.pair || '',
                primary:      jsonAlert.reason || jsonAlert.regime || '',
                permission:   jsonAlert.permission || 'FULL',
                maxRisk:      jsonAlert.position_size || (jsonAlert.type === 'TR_ARMED' ? '0.75R' : '1.5R'),
                score:        parseInt(jsonAlert.score) || 0,
                riskState:    jsonAlert.risk_state || 'K-NORMAL',
                session:      jCtx.session || '',
                timestamp:    new Date().toISOString(),
                direction:    jsonAlert.direction || '',
                entryZone:    jCtx.entry_zone || '',
                mtf:          parseInt(jCtx.mtf) || 0,
                volState:     jCtx.vol_state || '',
                volLevel:     jCtx.atr_pct !== undefined ? String(jCtx.atr_pct) : '',
                structExt:    jStructExt,
                ltfBreak:     jCtx.ltf_break || '',
                rsi:          parseInt(jCtx.rsi) || 0,
                playbook:     jsonAlert.playbook || jCtx.playbook || ''
            };
        } catch (e) {
            // Not valid JSON - fall through to pipe parser
        }
    }

    // Split scan line on pipe delimiter
    var parts = headerLine.split('|').map(function(p) { return p.trim(); });
    if (parts.length < 3) return null;

    // Part 0: "[emoji] [prefix] TYPE" — extract type via .includes()
    // Prefix [A]/[C]/[B]/[I] is for email/Discord filtering; parser ignores it
    var typeField = parts[0];
    var alertType = null;

    // Order matters: check TF_ARMED/TR_ARMED before generic ARMED
    if (typeField.includes('TF_ARMED')) {
        alertType = 'TF_ARMED';
    } else if (typeField.includes('TR_ARMED')) {
        alertType = 'TR_ARMED';
    } else if (typeField.includes('ARMED')) {
        alertType = 'ARMED';  // legacy fallback (old Universal UTCC)
    } else if (typeField.includes('BLOCKED')) {
        alertType = 'BLOCKED';
    } else if (typeField.includes('CANDIDATE')) {
        alertType = 'CANDIDATE';
    } else if (typeField.includes('INFO')) {
        alertType = 'INFO';
    } else {
        return null;
    }

    // Part 1: Pair (or SESSION_RESET for INFO)
    var pair = parts[1] || '';

    // Part 2: Primary reason code (or session name for INFO SESSION_RESET)
    var primaryReason = parts[2] || '';

    // Part 3: Risk state (optional, default K-NORMAL)
    var riskState = parts[3] || 'K-NORMAL';

    // Part 4: Key contributing (optional, e.g., U-SCORE-86)
    var scoreField = parts[4] || '';
    var scoreMatch = scoreField.match(/U-SCORE-(\d+)/);
    var score = scoreMatch ? parseInt(scoreMatch[1]) : 0;

    // Parse body lines for additional detail
    // Body is after em-dash separator (\u2014) or just after header line
    var permission = '';
    var maxRisk = '';
    var session = '';

    // v2.1.0: Parse JSON body for full UTCC context
    var direction = '';
    var entryZone = '';
    var mtf = 0;
    var volState = '';
    var volLevel = '';
    var structExt = '';
    var ltfBreak = '';
    var playbook = '';
    var rsi = 0;

    for (var i = 1; i < lines.length; i++) {
        var line = lines[i].trim();

        // Skip em-dash separator line
        if (line === '\u2014' || line === '---') continue;

        if (line.indexOf('PERMISSION:') === 0) {
            permission = line.replace('PERMISSION:', '').trim();
        }
        if (line.indexOf('MAX_RISK:') !== -1) {
            maxRisk = line.replace(/.*MAX_RISK:\s*/, '').trim();
        }

        // v2.1.0: Try to parse JSON body line
        if (line.charAt(0) === '{') {
            try {
                var json = JSON.parse(line);
                // Extract from context object
                var ctx = json.context || {};
                direction = ctx.direction || json.direction || '';
                entryZone = ctx.entry_zone || ctx.entry || json.entry || '';
                mtf = parseInt(ctx.mtf) || 0;
                volState = ctx.vol_state || '';
                volLevel = ctx.atr_pct !== undefined ? String(ctx.atr_pct) : (ctx.vol_level || '');
                ltfBreak = ctx.ltf_break || '';
                // v2.12.0: structExt server-derived from locGrade (FCC-SRL enrichment).
                // TR_ARMED bootstrap: gate already confirmed price at S/R — infer FRESH
                // immediately so PRIME tier can fire before the next FCC-SRL bar close.
                if (alertType === 'TR_ARMED' &&
                    (ctx.structure === 'SUPPORT' || ctx.structure === 'RESISTANCE')) {
                    structExt = 'FRESH';
                }
                rsi = parseInt(ctx.rsi) || 0;
                playbook = json.playbook || ctx.playbook || '';
                // Also extract top-level fields if header missed them
                if (!permission && json.permission) permission = json.permission;
                if (!session && ctx.session) session = ctx.session;
                if (!score && json.context && json.context.score) score = parseInt(json.context.score);
                if (json.execution) {
                    if (!maxRisk && json.execution.max_risk) maxRisk = json.execution.max_risk;
                }
            } catch (e) {
                // Not valid JSON, skip
            }
        }

        // Fallback: extract session from quoted string if JSON parse failed
        if (!session && line.indexOf('"session"') !== -1) {
            var sessMatch = line.match(/"session"\s*:\s*"([^"]+)"/);
            if (sessMatch) session = sessMatch[1];
        }
    }

    return {
        type: alertType,
        pair: pair,
        primary: primaryReason,
        riskState: riskState,
        score: score,
        permission: permission,
        maxRisk: maxRisk,
        session: session,
        timestamp: new Date().toISOString(),
        // v2.1.0: UTCC context from JSON body
        direction: direction,
        entryZone: entryZone,
        mtf: mtf,
        volState: volState,
        volLevel: volLevel,
        structExt: structExt,
        ltfBreak: ltfBreak,
        rsi: rsi,
        playbook: playbook
    };
}

// ============================================================================
// ALERT PARSING - UNIFIED ENTRY POINT
// ============================================================================

/**
 * Unified parseAlert: routes to old or new parser based on format detection.
 * Old format will be removed after all 6 indicators are migrated.
 */
function parseAlert(body) {
    var text = typeof body === 'string' ? body : body.toString();

    if (isOldFormat(text)) {
        console.log('  -> [COMPAT] Old format detected');
        return parseOldAlert(text);
    }

    return parseNewAlert(text);
}

// ============================================================================
// ALERT PARSING - UTCC (existing, unchanged)
// ============================================================================

function parseUtccAlert(body) {
    try {
        // Expect JSON payload from TradingView
        var data = typeof body === 'string' ? JSON.parse(body) : body;

        // Validate required fields
        if (!data.pair || !data.direction) {
            console.log('  -> Missing required fields (pair, direction)');
            return null;
        }

        var now = new Date();
        var ttl = new Date(now.getTime() + CONFIG.UTCC_ALERT_TTL_HOURS * 60 * 60 * 1000);

        return {
            id: 'utcc_' + now.getTime() + '_' + data.pair + '_' + data.direction,
            pair: data.pair.toUpperCase().replace('_', ''),
            direction: data.direction.toLowerCase(),
            timestamp: now.toISOString(),
            ttl: ttl.toISOString(),

            // UTCC criteria data
            utcc: {
                score: parseInt(data.score) || 0,
                tier: data.tier || 'UNKNOWN',
                criteriaPass: parseInt(data.criteriaPass) || 0,
                criteriaMet: {
                    trendScore: data.c1 === true || data.c1 === 1 || data.c1 === '1',
                    mtfAlignment: data.c2 === true || data.c2 === 1 || data.c2 === '1',
                    volatilityReady: data.c3 === true || data.c3 === 1 || data.c3 === '1',
                    atrFilter: data.c4 === true || data.c4 === 1 || data.c4 === '1',
                    newsSafety: data.c5 === true || data.c5 === 1 || data.c5 === '1'
                },
                entryZone: data.entryZone || 'UNKNOWN',
                volatilityState: data.volatility || 'UNKNOWN',
                mtfStatus: data.mtfStatus || '',
                rsiAlignment: data.rsiAlign || ''
            },

            // Tracking
            matched: false,
            matchedTradeId: null
        };
    } catch (e) {
        console.error('Error parsing UTCC alert:', e.message);
        return null;
    }
}

// ============================================================================
// TIME HELPERS
// ============================================================================

function getAge(timestamp) {
    if (!timestamp) return '';
    var mins = Math.floor((Date.now() - new Date(timestamp).getTime()) / 60000);
    if (mins < 60) return mins + 'm';
    var hours = Math.floor(mins / 60);
    if (hours < 24) return hours + 'h';
    return Math.floor(hours / 24) + 'd';
}

function getAgeMinutes(timestamp) {
    if (!timestamp) return 0;
    return Math.floor((Date.now() - new Date(timestamp).getTime()) / 60000);
}

// ============================================================================
// HTTP SERVER
// ============================================================================

var server = http.createServer(function(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // ========================================================================
    // ARMED PAIRS ENDPOINTS
    // ========================================================================

    // GET /state - Return current armed state
    if (req.method === 'GET' && req.url === '/state') {
        var state = loadState();

        // Build armed pairs response (new format)
        var pairs = Object.keys(state.pairs).map(function(pair) {
            var d      = state.pairs[pair];
            var counts = getPairSignalCounts(pair);
            return {
                pair: pair,
                alertType: d.alertType || 'TF_ARMED',
                primary: d.primary || 'LEGACY',
                permission: d.permission || 'FULL',
                maxRisk: d.maxRisk || '1.0R',
                score: d.score || 0,
                riskState: d.riskState || 'K-NORMAL',
                session: d.session || '',
                timestamp: d.timestamp,
                age: getAge(d.timestamp),
                // v2.1.0: UTCC context fields
                direction: d.direction || '',
                entryZone: d.entryZone || '',
                mtf: d.mtf || 0,
                volState: d.volState || '',
                volLevel: d.volLevel || '',
                structExt: d.structExt || '',
                ltfBreak: d.ltfBreak || '',
                rsi: d.rsi || 0,
                playbook: d.playbook || '',
                positionSize: d.positionSize || (d.alertType === 'TR_ARMED' ? '0.75R' : '1.5R'),
                armedAt:          d.armedAt || null,
                locScore:         d.locScore      !== undefined ? d.locScore      : null,
                enrichedScore:    d.enrichedScore !== undefined ? d.enrichedScore : null,
                locGrade:         d.locGrade      || null,
                locTimestamp:     d.locTimestamp  || null,
                // v2.13.0: Signal frequency from arm-history
                weekSignalCount:    counts.weekSignalCount,
                twoWeekSignalCount: counts.twoWeekSignalCount
            };
        }).sort(function(a, b) {
            return new Date(b.timestamp) - new Date(a.timestamp);
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            count: pairs.length,
            pairs: pairs,
            lastUpdate: state.lastUpdate
        }));
        return;
    }

    // GET /health - Health check
    if (req.method === 'GET' && req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'ok',
            version: VERSION,
            time: new Date().toISOString()
        }));
        return;
    }

    // POST /webhook - Receive TradingView alerts (Armed Pairs)
    if (req.method === 'POST' && req.url === '/webhook') {
        var body = '';
        req.on('data', function(chunk) { body += chunk; });
        req.on('end', function() {
            var timestamp = new Date().toISOString();
            console.log('[' + timestamp + '] Webhook: ' + body.substring(0, 500));

            var alert = parseAlert(body);

            if (!alert) {
                console.log('  -> Unparseable');
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true, action: 'ignored' }));
                return;
            }

            var state = loadState();

            // ----------------------------------------------------------------
            // TF_ARMED / TR_ARMED: Add/update pair in state
            // Legacy ARMED mapped to TF_ARMED for backward compatibility
            // ----------------------------------------------------------------
            if (alert.type === 'TF_ARMED' || alert.type === 'TR_ARMED' || alert.type === 'ARMED') {
                var derivedType = alert.type === 'ARMED' ? 'TF_ARMED' : alert.type;
                var derivedPosSize = derivedType === 'TR_ARMED' ? '0.75R' : '1.5R';
                // v2.10.1: Preserve armedAt (first arm time) so dismiss reconcile
                // is not defeated by repeated candle-close ARMED alerts updating timestamp
                var existingPair = state.pairs[alert.pair];
                state.pairs[alert.pair] = {
                    alertType: derivedType,
                    primary: alert.primary,
                    permission: alert.permission || 'FULL',
                    maxRisk: alert.maxRisk || derivedPosSize,
                    positionSize: derivedPosSize,
                    score: alert.score || 0,
                    riskState: alert.riskState || 'K-NORMAL',
                    session: alert.session || '',
                    // v2.10.2: null for existing pre-v2.10.1 pairs (no backfill).
                    // Backfilling timestamp defeats dismiss reconcile immediately.
                    // Client reconcile skips pairs where p.armedAt is null/falsy.
                    armedAt: existingPair ? (existingPair.armedAt || null) : timestamp,
                    timestamp: timestamp,
                    // v2.1.0: UTCC context from JSON body
                    direction: alert.direction || '',
                    entryZone: alert.entryZone || '',
                    mtf: alert.mtf || 0,
                    volState: alert.volState || '',
                    volLevel: alert.volLevel || '',
                    structExt: alert.structExt || '',
                    ltfBreak: alert.ltfBreak || '',
                    rsi: alert.rsi || 0,
                    playbook: alert.playbook || alert._playbook || ''
                };
                saveState(state);
                appendArmEvent(alert, timestamp);
                enrichArmedPair(alert.pair);

                console.log('  -> ' + derivedType + ' ' + alert.pair + ' | ' + alert.primary + ' | ' + alert.permission + ' | dir:' + (alert.direction || '-') + ' | struct:' + (alert.structExt || 'NONE') + ' | ltf:' + (alert.ltfBreak || '-'));

                // Push notification — ARMED fires
                pushArmed(alert);

                // FOMO gate — push again after 1 hour
                if (fomoTimers[alert.pair]) {
                    clearTimeout(fomoTimers[alert.pair]);
                }
                fomoTimers[alert.pair] = setTimeout(function() {
                    pushFomoCleared(alert.pair);
                    delete fomoTimers[alert.pair];
                }, 60 * 60 * 1000);
                console.log('  -> FOMO timer set for ' + alert.pair + ' (1hr)');
            }
            // ----------------------------------------------------------------
            // BLOCKED: Remove pair from state (replaces DISARMED)
            // ----------------------------------------------------------------
            else if (alert.type === 'BLOCKED') {
                if (state.pairs[alert.pair]) {
                    delete state.pairs[alert.pair];
                    saveState(state);
                }


                // Cancel FOMO timer if pair was waiting
                if (fomoTimers[alert.pair]) {
                    clearTimeout(fomoTimers[alert.pair]);
                    delete fomoTimers[alert.pair];
                    console.log('  -> FOMO timer cancelled for ' + alert.pair);
                }

                // Push notification — position management signal
                pushBlocked(alert);

                console.log('  -> BLOCKED ' + alert.pair + ' (removed)');
            }
            // ----------------------------------------------------------------
            // INFO: Handle SESSION_RESET (replaces old RESET)
            // ----------------------------------------------------------------
            else if (alert.type === 'INFO') {
                if (alert.pair === 'SESSION_RESET') {
                    // v2.8.0: Session transitions no longer clear armed pairs.
                    // UTCC natural disarm (score drop + structural damage) is the
                    // only system-initiated removal. Armed pairs remain valid across
                    // sessions until the market invalidates them.
                    var sessionName = alert.primary || '';
                    console.log('  -> INFO SESSION_RESET ' + sessionName + ' (pairs preserved — natural disarm only)');
                } else {
                    console.log('  -> INFO ' + alert.pair + ' (acknowledged)');
                }
            }
            else {
                console.log('  -> ' + alert.type + ' (not tracked)');
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, action: alert.type }));
        });
        return;
    }

    // ========================================================================
    // UTCC ALERT QUEUE ENDPOINTS (existing, unchanged)
    // ========================================================================

    // POST /webhook/utcc - Receive UTCC alert data from TradingView
    if (req.method === 'POST' && req.url === '/webhook/utcc') {
        var body = '';
        req.on('data', function(chunk) { body += chunk; });
        req.on('end', function() {
            var timestamp = new Date().toISOString();
            console.log('[' + timestamp + '] UTCC: ' + body.substring(0, 500));

            var alert = parseUtccAlert(body);

            if (!alert) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: 'Invalid UTCC alert format' }));
                return;
            }

            var data = loadUtccAlerts();

            // Initialise pair array if needed
            if (!data.alerts[alert.pair]) {
                data.alerts[alert.pair] = [];
            }

            // Add new alert
            data.alerts[alert.pair].unshift(alert);

            // Trim to max per pair
            if (data.alerts[alert.pair].length > CONFIG.UTCC_MAX_ALERTS_PER_PAIR) {
                data.alerts[alert.pair] = data.alerts[alert.pair].slice(0, CONFIG.UTCC_MAX_ALERTS_PER_PAIR);
            }

            saveUtccAlerts(data);

            console.log('  -> Stored UTCC alert: ' + alert.pair + ' ' + alert.direction + ' Score:' + alert.utcc.score + ' Tier:' + alert.utcc.tier);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                ok: true,
                alertId: alert.id,
                pair: alert.pair,
                direction: alert.direction,
                score: alert.utcc.score,
                tier: alert.utcc.tier
            }));
        });
        return;
    }

    // GET /utcc/alerts - Get all unmatched alerts (with optional pair filter)
    if (req.method === 'GET' && req.url.startsWith('/utcc/alerts')) {
        var urlParts = new URL(req.url, 'http://' + req.headers.host);
        var pairFilter = urlParts.searchParams.get('pair');
        var unmatchedOnly = urlParts.searchParams.get('unmatched') !== 'false';

        cleanupExpiredAlerts(); // Clean before returning

        var data = loadUtccAlerts();
        var result = [];

        if (pairFilter) {
            var pairAlerts = data.alerts[pairFilter.toUpperCase()] || [];
            result = unmatchedOnly ? pairAlerts.filter(function(a) { return !a.matched; }) : pairAlerts;
        } else {
            for (var pair in data.alerts) {
                var alerts = unmatchedOnly
                    ? data.alerts[pair].filter(function(a) { return !a.matched; })
                    : data.alerts[pair];
                result = result.concat(alerts);
            }
            result.sort(function(a, b) { return new Date(b.timestamp) - new Date(a.timestamp); });
        }

        // Add age to each alert
        result = result.map(function(alert) {
            return Object.assign({}, alert, {
                ageMinutes: getAgeMinutes(alert.timestamp),
                age: getAge(alert.timestamp)
            });
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            count: result.length,
            alerts: result,
            lastUpdate: data.lastUpdate
        }));
        return;
    }

    // POST /utcc/match - Mark an alert as matched to a trade
    if (req.method === 'POST' && req.url === '/utcc/match') {
        var body = '';
        req.on('data', function(chunk) { body += chunk; });
        req.on('end', function() {
            try {
                var parsed = JSON.parse(body);
                var alertId = parsed.alertId;
                var tradeId = parsed.tradeId;

                if (!alertId || !tradeId) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ ok: false, error: 'Missing alertId or tradeId' }));
                    return;
                }

                var data = loadUtccAlerts();
                var found = false;

                for (var pair in data.alerts) {
                    for (var i = 0; i < data.alerts[pair].length; i++) {
                        if (data.alerts[pair][i].id === alertId) {
                            data.alerts[pair][i].matched = true;
                            data.alerts[pair][i].matchedTradeId = tradeId;
                            data.alerts[pair][i].matchedAt = new Date().toISOString();
                            found = true;
                            break;
                        }
                    }
                    if (found) break;
                }

                if (found) {
                    saveUtccAlerts(data);
                    console.log('[Match] Alert ' + alertId + ' matched to trade ' + tradeId);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ ok: true }));
                } else {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ ok: false, error: 'Alert not found' }));
                }
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: 'Invalid JSON' }));
            }
        });
        return;
    }

    // GET /utcc/find - Find best matching alert for a pair+direction within time window
    if (req.method === 'GET' && req.url.startsWith('/utcc/find')) {
        var urlParts = new URL(req.url, 'http://' + req.headers.host);
        var pair = urlParts.searchParams.get('pair');
        var direction = urlParts.searchParams.get('direction');
        var maxAgeMinutes = parseInt(urlParts.searchParams.get('maxAge')) || 240;

        if (!pair || !direction) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'Missing pair or direction' }));
            return;
        }

        cleanupExpiredAlerts();

        var data = loadUtccAlerts();
        var pairAlerts = data.alerts[pair.toUpperCase()] || [];

        var candidates = pairAlerts
            .filter(function(a) { return !a.matched; })
            .filter(function(a) { return a.direction === direction.toLowerCase(); })
            .filter(function(a) { return getAgeMinutes(a.timestamp) <= maxAgeMinutes; })
            .sort(function(a, b) { return new Date(b.timestamp) - new Date(a.timestamp); });

        if (candidates.length > 0) {
            var best = candidates[0];
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                ok: true,
                found: true,
                alert: Object.assign({}, best, {
                    ageMinutes: getAgeMinutes(best.timestamp),
                    age: getAge(best.timestamp)
                })
            }));
        } else {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                ok: true,
                found: false,
                alert: null
            }));
        }
        return;
    }

    // GET /utcc/stats - Get alert queue statistics
    if (req.method === 'GET' && req.url === '/utcc/stats') {
        cleanupExpiredAlerts();

        var data = loadUtccAlerts();
        var totalAlerts = 0;
        var unmatchedAlerts = 0;
        var matchedAlerts = 0;
        var pairCounts = {};

        for (var pair in data.alerts) {
            var alerts = data.alerts[pair];
            totalAlerts += alerts.length;
            pairCounts[pair] = alerts.length;

            for (var i = 0; i < alerts.length; i++) {
                if (alerts[i].matched) {
                    matchedAlerts++;
                } else {
                    unmatchedAlerts++;
                }
            }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            totalAlerts: totalAlerts,
            unmatchedAlerts: unmatchedAlerts,
            matchedAlerts: matchedAlerts,
            pairCounts: pairCounts,
            ttlHours: CONFIG.UTCC_ALERT_TTL_HOURS,
            lastUpdate: data.lastUpdate
        }));
        return;
    }

    // ========================================================================
    // STRUCTURE GATE ENDPOINTS (v2.2.0)
    // ========================================================================

    // POST /webhook/structure - Receive ProZones proximity alerts from TradingView
    if (req.method === 'POST' && req.url === '/webhook/structure') {
        var body = '';
        req.on('data', function(chunk) { body += chunk; });
        req.on('end', function() {
            try {
                var payload = JSON.parse(body);

                // Validate required fields
                if (!payload.pair || !payload.zone || !payload.strength || !payload.verdict) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Missing required fields: pair, zone, strength, verdict' }));
                    return;
                }

                var data = loadStructure();
                var now = new Date();
                var expiry = new Date(now.getTime() + CONFIG.STRUCTURE_TTL_HOURS * 60 * 60 * 1000);

                data.pairs[payload.pair] = {
                    pair:      payload.pair,
                    zone:      payload.zone,
                    strength:  payload.strength,
                    dist_atr:  payload.dist_atr !== undefined ? payload.dist_atr : null,
                    tr:        payload.tr || '',
                    verdict:   payload.verdict,
                    timestamp: now.toISOString(),
                    expiresAt: expiry.toISOString()
                };

                saveStructure(data);
                console.log('[Structure] ' + payload.pair + ' | ' + payload.verdict + ' | ' + payload.zone + ' (' + payload.strength + ') dist=' + payload.dist_atr);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true, pair: payload.pair, verdict: payload.verdict }));
            } catch (e) {
                console.error('[Structure] Parse error:', e.message);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid JSON: ' + e.message }));
            }
        });
        return;
    }

    // GET /structure - Get structure state for a pair (or all pairs)
    // Usage: /structure?pair=CADJPY
    if (req.method === 'GET' && req.url.startsWith('/structure')) {
        var urlParts = req.url.split('?');
        var queryStr = urlParts[1] || '';
        var params = {};
        queryStr.split('&').forEach(function(p) {
            var kv = p.split('=');
            if (kv[0]) params[kv[0]] = decodeURIComponent(kv[1] || '');
        });

        var data = loadStructure();
        var now = Date.now();
        var ttlMs = CONFIG.STRUCTURE_TTL_HOURS * 60 * 60 * 1000;

        if (params.pair) {
            var entry = data.pairs[params.pair];
            if (!entry) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ found: false, pair: params.pair, verdict: 'NO_DATA' }));
                return;
            }
            var age = now - new Date(entry.timestamp).getTime();
            var expired = age > ttlMs;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                found: !expired,
                pair: entry.pair,
                zone: entry.zone,
                strength: entry.strength,
                dist_atr: entry.dist_atr,
                tr: entry.tr,
                verdict: expired ? 'EXPIRED' : entry.verdict,
                timestamp: entry.timestamp,
                ageMinutes: Math.floor(age / 60000),
                expiresAt: entry.expiresAt
            }));
        } else {
            // Return all non-expired entries
            var active = [];
            for (var p in data.pairs) {
                var e = data.pairs[p];
                var a = now - new Date(e.timestamp).getTime();
                if (a <= ttlMs) {
                    active.push({
                        pair: e.pair,
                        zone: e.zone,
                        strength: e.strength,
                        dist_atr: e.dist_atr,
                        tr: e.tr,
                        verdict: e.verdict,
                        timestamp: e.timestamp,
                        ageMinutes: Math.floor(a / 60000)
                    });
                }
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ count: active.length, pairs: active, lastUpdate: data.lastUpdate }));
        }
        return;
    }


    // POST /webhook/location - Receive location grade from FCC-LOC Pine indicator