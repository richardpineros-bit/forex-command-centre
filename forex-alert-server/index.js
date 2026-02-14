const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3847;
const STATE_FILE = process.env.STATE_FILE || '/app/armed.json';
const UTCC_FILE = process.env.UTCC_FILE || '/app/utcc-alerts.json';
const CANDIDATE_FILE = process.env.CANDIDATE_FILE || '/app/candidates.json';

// ============================================================================
// VERSION INFO
// ============================================================================
const VERSION = '2.1.0';
const CHANGES = [
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
    CANDIDATE_TTL_HOURS: 4          // Candidates expire after 4 hours
};

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
// STATE MANAGEMENT - CANDIDATES (separate from ARMED)
// ============================================================================

function loadCandidates() {
    try {
        if (fs.existsSync(CANDIDATE_FILE)) {
            return JSON.parse(fs.readFileSync(CANDIDATE_FILE, 'utf8'));
        }
    } catch (e) {
        console.error('Error loading candidates:', e.message);
    }
    return { pairs: {}, lastUpdate: null };
}

function saveCandidates(data) {
    data.lastUpdate = new Date().toISOString();
    fs.writeFileSync(CANDIDATE_FILE, JSON.stringify(data, null, 2));
}

function cleanupExpiredCandidates() {
    const data = loadCandidates();
    const now = Date.now();
    const ttlMs = CONFIG.CANDIDATE_TTL_HOURS * 60 * 60 * 1000;
    let cleaned = 0;

    for (const pair of Object.keys(data.pairs)) {
        const ts = new Date(data.pairs[pair].timestamp).getTime();
        if (now - ts > ttlMs) {
            delete data.pairs[pair];
            cleaned++;
        }
    }

    if (cleaned > 0) {
        saveCandidates(data);
        console.log('[Cleanup] Removed ' + cleaned + ' expired candidates');
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
setInterval(cleanupExpiredCandidates, CONFIG.UTCC_CLEANUP_INTERVAL_MS);

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

    // Split scan line on pipe delimiter
    var parts = headerLine.split('|').map(function(p) { return p.trim(); });
    if (parts.length < 3) return null;

    // Part 0: "[emoji] [prefix] TYPE" — extract type via .includes()
    // Prefix [A]/[C]/[B]/[I] is for email/Discord filtering; parser ignores it
    var typeField = parts[0];
    var alertType = null;

    // Order matters: check ARMED before BLOCKED to avoid false match
    // (ARMED doesn't contain BLOCKED, so no conflict)
    if (typeField.includes('ARMED')) {
        alertType = 'ARMED';
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
    var criteria = 0;
    var volState = '';
    var volBehaviour = '';
    var volLevel = '';
    var riskMult = 1.0;
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
                entryZone = ctx.entry || json.entry || '';
                mtf = parseInt(ctx.mtf) || 0;
                criteria = parseInt(ctx.criteria) || 0;
                volState = ctx.vol_state || '';
                volBehaviour = ctx.vol_behaviour || '';
                volLevel = ctx.vol_level || '';
                riskMult = parseFloat(ctx.risk_mult) || 1.0;
                rsi = parseInt(ctx.rsi) || 0;
                playbook = ctx.playbook || '';
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
        criteria: criteria,
        volState: volState,
        volBehaviour: volBehaviour,
        volLevel: volLevel,
        riskMult: riskMult,
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

    // GET /state - Return current armed state + candidates
    if (req.method === 'GET' && req.url === '/state') {
        var state = loadState();
        var candidateData = loadCandidates();

        // Build armed pairs response (new format)
        var pairs = Object.keys(state.pairs).map(function(pair) {
            var d = state.pairs[pair];
            return {
                pair: pair,
                alertType: d.alertType || 'ARMED',
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
                criteria: d.criteria || 0,
                volState: d.volState || '',
                volBehaviour: d.volBehaviour || '',
                volLevel: d.volLevel || '',
                riskMult: d.riskMult || 1.0,
                rsi: d.rsi || 0,
                playbook: d.playbook || ''
            };
        }).sort(function(a, b) {
            return new Date(b.timestamp) - new Date(a.timestamp);
        });

        // Build candidates response
        var candidates = Object.keys(candidateData.pairs).map(function(pair) {
            var d = candidateData.pairs[pair];
            return {
                pair: pair,
                alertType: 'CANDIDATE',
                primary: d.primary || '',
                permission: d.permission || 'CONDITIONAL',
                maxRisk: d.maxRisk || '0.25R',
                score: d.score || 0,
                riskState: d.riskState || 'K-NORMAL',
                session: d.session || '',
                timestamp: d.timestamp,
                age: getAge(d.timestamp),
                // v2.1.0: UTCC context fields
                direction: d.direction || '',
                entryZone: d.entryZone || '',
                mtf: d.mtf || 0,
                criteria: d.criteria || 0,
                volState: d.volState || '',
                volBehaviour: d.volBehaviour || '',
                riskMult: d.riskMult || 1.0,
                playbook: d.playbook || ''
            };
        }).sort(function(a, b) {
            return new Date(b.timestamp) - new Date(a.timestamp);
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            count: pairs.length,
            pairs: pairs,
            candidateCount: candidates.length,
            candidates: candidates,
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
            console.log('[' + timestamp + '] Webhook: ' + body.substring(0, 100));

            var alert = parseAlert(body);

            if (!alert) {
                console.log('  -> Unparseable');
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true, action: 'ignored' }));
                return;
            }

            var state = loadState();

            // ----------------------------------------------------------------
            // ARMED: Add/update pair in state (new institutional fields)
            // ----------------------------------------------------------------
            if (alert.type === 'ARMED') {
                state.pairs[alert.pair] = {
                    alertType: 'ARMED',
                    primary: alert.primary,
                    permission: alert.permission || 'FULL',
                    maxRisk: alert.maxRisk || '1.0R',
                    score: alert.score || 0,
                    riskState: alert.riskState || 'K-NORMAL',
                    session: alert.session || '',
                    timestamp: timestamp,
                    // v2.1.0: UTCC context from JSON body
                    direction: alert.direction || '',
                    entryZone: alert.entryZone || '',
                    mtf: alert.mtf || 0,
                    criteria: alert.criteria || 0,
                    volState: alert.volState || '',
                    volBehaviour: alert.volBehaviour || '',
                    volLevel: alert.volLevel || '',
                    riskMult: alert.riskMult || 1.0,
                    rsi: alert.rsi || 0,
                    playbook: alert.playbook || alert._playbook || ''
                };
                saveState(state);

                // If pair was a candidate, remove from candidates
                var cands = loadCandidates();
                if (cands.pairs[alert.pair]) {
                    delete cands.pairs[alert.pair];
                    saveCandidates(cands);
                }

                console.log('  -> ARMED ' + alert.pair + ' | ' + alert.primary + ' | ' + alert.permission + ' | dir:' + (alert.direction || '-') + ' | zone:' + (alert.entryZone || '-') + ' | mtf:' + (alert.mtf || '-'));
            }
            // ----------------------------------------------------------------
            // BLOCKED: Remove pair from state (replaces DISARMED)
            // ----------------------------------------------------------------
            else if (alert.type === 'BLOCKED') {
                if (state.pairs[alert.pair]) {
                    delete state.pairs[alert.pair];
                    saveState(state);
                }

                // Also remove from candidates if present
                var cands = loadCandidates();
                if (cands.pairs[alert.pair]) {
                    delete cands.pairs[alert.pair];
                    saveCandidates(cands);
                }

                console.log('  -> BLOCKED ' + alert.pair + ' (removed)');
            }
            // ----------------------------------------------------------------
            // INFO: Handle SESSION_RESET (replaces old RESET)
            // ----------------------------------------------------------------
            else if (alert.type === 'INFO') {
                if (alert.pair === 'SESSION_RESET') {
                    // Clear all pairs for the given session, or all if no session specified
                    var sessionName = alert.primary || '';
                    var cleared = 0;

                    if (sessionName) {
                        // Clear pairs matching this session
                        for (var p in state.pairs) {
                            if (state.pairs[p].session &&
                                state.pairs[p].session.toLowerCase() === sessionName.toLowerCase()) {
                                delete state.pairs[p];
                                cleared++;
                            }
                        }
                        // Also clear candidates for this session
                        var cands = loadCandidates();
                        for (var cp in cands.pairs) {
                            if (cands.pairs[cp].session &&
                                cands.pairs[cp].session.toLowerCase() === sessionName.toLowerCase()) {
                                delete cands.pairs[cp];
                            }
                        }
                        saveCandidates(cands);
                    } else {
                        // No session specified — clear all
                        cleared = Object.keys(state.pairs).length;
                        state.pairs = {};
                        saveCandidates({ pairs: {}, lastUpdate: null });
                    }

                    saveState(state);
                    console.log('  -> INFO SESSION_RESET ' + sessionName + ' (cleared ' + cleared + ')');
                } else {
                    console.log('  -> INFO ' + alert.pair + ' (acknowledged)');
                }
            }
            // ----------------------------------------------------------------
            // CANDIDATE: Store in separate candidates state
            // ----------------------------------------------------------------
            else if (alert.type === 'CANDIDATE') {
                var cands = loadCandidates();
                cands.pairs[alert.pair] = {
                    primary: alert.primary || '',
                    permission: alert.permission || 'CONDITIONAL',
                    maxRisk: alert.maxRisk || '0.25R',
                    score: alert.score || 0,
                    riskState: alert.riskState || 'K-NORMAL',
                    session: alert.session || '',
                    timestamp: timestamp,
                    // v2.1.0: UTCC context from JSON body
                    direction: alert.direction || '',
                    entryZone: alert.entryZone || '',
                    mtf: alert.mtf || 0,
                    criteria: alert.criteria || 0,
                    volState: alert.volState || '',
                    volBehaviour: alert.volBehaviour || '',
                    riskMult: alert.riskMult || 1.0,
                    playbook: alert.playbook || ''
                };
                saveCandidates(cands);
                console.log('  -> CANDIDATE ' + alert.pair + ' | ' + alert.primary + ' | score:' + alert.score);
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
            console.log('[' + timestamp + '] UTCC: ' + body.substring(0, 100));

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

    // 404
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, function() {
    console.log('='.repeat(60));
    console.log('Trading State Receiver v' + VERSION);
    console.log('='.repeat(60));
    console.log('Port:           ' + PORT);
    console.log('State file:     ' + STATE_FILE);
    console.log('UTCC file:      ' + UTCC_FILE);
    console.log('Candidate file: ' + CANDIDATE_FILE);
    console.log('Alert TTL:      ' + CONFIG.UTCC_ALERT_TTL_HOURS + ' hours');
    console.log('Candidate TTL:  ' + CONFIG.CANDIDATE_TTL_HOURS + ' hours');
    console.log('');
    console.log('Armed Pairs Endpoints:');
    console.log('  POST /webhook       - Receive alerts (old + new format)');
    console.log('  GET  /state         - Get armed state + candidates');
    console.log('');
    console.log('UTCC Alert Queue Endpoints:');
    console.log('  POST /webhook/utcc  - Receive UTCC alert data');
    console.log('  GET  /utcc/alerts   - Get alerts (?pair=X&unmatched=true)');
    console.log('  GET  /utcc/find     - Find matching alert (?pair=X&direction=Y)');
    console.log('  POST /utcc/match    - Mark alert as matched');
    console.log('  GET  /utcc/stats    - Get queue statistics');
    console.log('');
    console.log('Utility:');
    console.log('  GET  /health        - Health check');
    console.log('');
    console.log('Format: Institutional (v1.4.0) + Legacy backward compat');
    console.log('='.repeat(60));
});
