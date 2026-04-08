<?php
/**
 * Server Storage API v1.0
 * Direct save/load to Unraid server
 * Place in: /api/storage-api.php
 */

// CORS
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Storage directory (relative to this file)
$storageDir = __DIR__ . '/../data/';

// Ensure storage directory exists
if (!is_dir($storageDir)) {
    mkdir($storageDir, 0755, true);
}

// Allowed data files (whitelist for security)
$allowedFiles = [
    'trades' => 'trades.json',
    'circuit-breaker' => 'circuit-breaker.json',
    'broker-config' => 'broker-config.json',
    'settings' => 'settings.json',
    'regime' => 'regime.json',
    'playbook' => 'playbook.json',
    'app-state' => 'app-state.json',
    'daily-context' => 'daily-context.json',
    'armed-exclude' => 'armed-exclude.json',
    'dashboard-theme' => 'dashboard-theme.json',
    'armed-dismissed' => 'armed-dismissed.json',
    'scans' => 'scans.json',
    'goals' => 'goals.json',
    'no-trades' => 'no-trades.json',
    'armed-validation' => 'armed-validation.json',
    'location'         => 'location.json'
];

// ============================================================
// canExecuteTrade - Authoritative server-side permission gate
// Called by execute-integration.js before ANY trade execution
// Reads state files directly — browser has no input here
// ============================================================
$action = $_GET['action'] ?? null;

if ($action === 'canExecuteTrade') {
    $cbPath  = $storageDir . 'circuit-breaker.json';
    $dcPath  = $storageDir . 'daily-context.json';

    // Load circuit-breaker state
    $cb = file_exists($cbPath) ? json_decode(file_get_contents($cbPath), true) : null;
    // Load daily-context state
    $dc = file_exists($dcPath) ? json_decode(file_get_contents($dcPath), true) : null;

    // --- CIRCUIT BREAKER CHECKS ---
    if ($cb) {
        $global      = $cb['global']      ?? [];
        $behavioural = $cb['behavioural'] ?? [];

        // 1. Review required
        if (!empty($behavioural['revengeFlaggedForReview']) || !empty($cb['pendingReview'])) {
            echo json_encode(['allowed' => false, 'reason' => 'Post-session review required before trading can resume', 'blockedBy' => 'circuit_breaker']);
            exit;
        }

        // 2. Stand-down active
        if (!empty($global['standDownActive'])) {
            $until  = !empty($global['standDownUntil']) ? $global['standDownUntil'] : 'unknown';
            $reason = !empty($global['standDownReason']) ? $global['standDownReason'] : 'Stand-down active';
            echo json_encode(['allowed' => false, 'reason' => $reason . ' — resumes: ' . $until, 'blockedBy' => 'circuit_breaker']);
            exit;
        }

        // 3. Leakage lockout
        if (!empty($behavioural['leakageLockoutActive'])) {
            $until = $behavioural['leakageLockoutUntil'] ?? null;
            if ($until && strtotime($until) > time()) {
                $minsLeft = ceil((strtotime($until) - time()) / 60);
                echo json_encode(['allowed' => false, 'reason' => 'Leakage lockout active — ' . $minsLeft . ' minutes remaining', 'blockedBy' => 'circuit_breaker']);
                exit;
            }
        }

        // 4. No active session
        if (empty($global['sessionActive'])) {
            echo json_encode(['allowed' => false, 'reason' => 'No active session — lock your Daily Briefing first', 'blockedBy' => 'circuit_breaker']);
            exit;
        }
    } else {
        // Fail-closed: no circuit-breaker file = no trade
        echo json_encode(['allowed' => false, 'reason' => 'Circuit breaker state unavailable — cannot verify trading permission', 'blockedBy' => 'circuit_breaker']);
        exit;
    }

    // --- DAILY CONTEXT CHECKS ---
    if ($dc) {
        // Must be locked (briefing completed)
        if (empty($dc['locked'])) {
            echo json_encode(['allowed' => false, 'reason' => 'Daily Briefing not locked — complete and lock your briefing first', 'blockedBy' => 'daily_context']);
            exit;
        }

        // Briefing must be from today
        $lockedAt = $dc['lockedAt'] ?? null;
        if ($lockedAt) {
            $lockedDate = date('Y-m-d', strtotime($lockedAt));
            $today      = date('Y-m-d');
            if ($lockedDate !== $today) {
                echo json_encode(['allowed' => false, 'reason' => 'Daily Briefing is from a previous session — complete today\'s briefing first', 'blockedBy' => 'daily_context']);
                exit;
            }
        }

        // STAND_DOWN permission blocks trading
        $permission = $dc['permission'] ?? null;
        if ($permission === 'STAND_DOWN') {
            echo json_encode(['allowed' => false, 'reason' => 'Daily permission is STAND DOWN — observation only today', 'blockedBy' => 'daily_context']);
            exit;
        }
    } else {
        // Fail-closed: no daily-context = no trade
        echo json_encode(['allowed' => false, 'reason' => 'Daily Briefing not found — complete your briefing first', 'blockedBy' => 'daily_context']);
        exit;
    }

    // All checks passed
    echo json_encode(['allowed' => true, 'reason' => null, 'blockedBy' => null]);
    exit;
}
// Get requested file
$fileKey = $_GET['file'] ?? $_POST['file'] ?? null;

if (!$fileKey || !isset($allowedFiles[$fileKey])) {
    http_response_code(400);
    echo json_encode([
        'success' => false, 
        'error' => 'Invalid file key. Allowed: ' . implode(', ', array_keys($allowedFiles))
    ]);
    exit;
}

$filePath = $storageDir . $allowedFiles[$fileKey];

// Handle GET - Load data
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if (file_exists($filePath)) {
        $content = file_get_contents($filePath);
        $data = json_decode($content, true);
        
        echo json_encode([
            'success' => true,
            'data' => $data,
            'lastModified' => filemtime($filePath)
        ]);
    } else {
        echo json_encode([
            'success' => true,
            'data' => null,
            'lastModified' => null
        ]);
    }
    exit;
}

// Handle POST - Save data
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    
    if (!isset($input['data'])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Missing data field']);
        exit;
    }
    
    $content = json_encode($input['data'], JSON_PRETTY_PRINT);
    
    // Create backup before overwriting
    if (file_exists($filePath)) {
        $backupDir = $storageDir . 'backups/';
        if (!is_dir($backupDir)) {
            mkdir($backupDir, 0755, true);
        }
        $timestamp = date('Y-m-d_His');
        copy($filePath, $backupDir . $allowedFiles[$fileKey] . '.' . $timestamp . '.bak');
        
        // Keep only last 10 backups per file
        $backups = glob($backupDir . $allowedFiles[$fileKey] . '.*.bak');
        if (count($backups) > 10) {
            usort($backups, function($a, $b) { return filemtime($a) - filemtime($b); });
            for ($i = 0; $i < count($backups) - 10; $i++) {
                unlink($backups[$i]);
            }
        }
    }
    
    // Write file
    $result = file_put_contents($filePath, $content);
    
    if ($result === false) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Failed to write file']);
        exit;
    }
    
    echo json_encode([
        'success' => true,
        'bytes' => $result,
        'lastModified' => filemtime($filePath)
    ]);
    exit;
}

http_response_code(405);
echo json_encode(['success' => false, 'error' => 'Method not allowed']);
