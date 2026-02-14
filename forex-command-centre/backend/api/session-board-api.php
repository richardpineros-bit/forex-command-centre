<?php
/**
 * Session Board API - Server-Side Storage
 * Forex Command Centre v2.1.0
 * 
 * Stores session board state on server for cross-device persistence.
 * File location: /config/www/session-board-api.php (Nginx container)
 * Data file: /config/www/data/session-board.json
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// Handle preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Data directory and file
$dataDir = __DIR__ . '/data';
$dataFile = $dataDir . '/session-board.json';

// Ensure data directory exists
if (!is_dir($dataDir)) {
    mkdir($dataDir, 0755, true);
}

// Load existing data
function loadData($file) {
    if (!file_exists($file)) {
        return [
            'boards' => [],
            'history' => []
        ];
    }
    $content = file_get_contents($file);
    return json_decode($content, true) ?: ['boards' => [], 'history' => []];
}

// Save data
function saveData($file, $data) {
    return file_put_contents($file, json_encode($data, JSON_PRETTY_PRINT));
}

// Generate session key (YYYY-MM-DD_SESSION)
function getSessionKey($session, $date = null) {
    $date = $date ?: date('Y-m-d');
    return $date . '_' . strtolower($session);
}

// Get AEST date (handles timezone)
function getAESTDate() {
    $tz = new DateTimeZone('Australia/Melbourne');
    $now = new DateTime('now', $tz);
    return $now->format('Y-m-d');
}

// Route handling
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

try {
    $data = loadData($dataFile);
    
    switch ($method) {
        case 'GET':
            if ($action === 'current') {
                // Get current session board (if any locked for today)
                $today = getAESTDate();
                $currentBoards = [];
                
                foreach ($data['boards'] as $key => $board) {
                    if (strpos($key, $today) === 0 && $board['locked']) {
                        $currentBoards[$key] = $board;
                    }
                }
                
                echo json_encode([
                    'success' => true,
                    'date' => $today,
                    'boards' => $currentBoards
                ]);
            } elseif ($action === 'check') {
                // Check if session board exists for given session/date
                $session = $_GET['session'] ?? '';
                $date = $_GET['date'] ?? getAESTDate();
                $key = getSessionKey($session, $date);
                
                $exists = isset($data['boards'][$key]);
                $locked = $exists && ($data['boards'][$key]['locked'] ?? false);
                
                echo json_encode([
                    'success' => true,
                    'exists' => $exists,
                    'locked' => $locked,
                    'board' => $exists ? $data['boards'][$key] : null
                ]);
            } elseif ($action === 'history') {
                // Get recent history
                $limit = min((int)($_GET['limit'] ?? 10), 50);
                $history = array_slice($data['history'], -$limit);
                
                echo json_encode([
                    'success' => true,
                    'history' => array_reverse($history)
                ]);
            } else {
                // Return all data
                echo json_encode([
                    'success' => true,
                    'data' => $data
                ]);
            }
            break;
            
        case 'POST':
            $input = json_decode(file_get_contents('php://input'), true);
            
            if ($action === 'save') {
                // Save/lock a session board
                $session = $input['session'] ?? '';
                $date = $input['date'] ?? getAESTDate();
                
                if (empty($session)) {
                    throw new Exception('Session is required');
                }
                
                $key = getSessionKey($session, $date);
                
                // Check if already locked (prevent override without explicit unlock)
                if (isset($data['boards'][$key]) && $data['boards'][$key]['locked'] && !($input['override'] ?? false)) {
                    echo json_encode([
                        'success' => false,
                        'error' => 'Session board already locked. Use override to modify.',
                        'board' => $data['boards'][$key]
                    ]);
                    break;
                }
                
                $board = [
                    'session' => $session,
                    'date' => $date,
                    'maxTrades' => (int)($input['maxTrades'] ?? 2),
                    'playbooks' => $input['playbooks'] ?? [],
                    'permissionLevel' => $input['permissionLevel'] ?? 'full',
                    'context' => $input['context'] ?? '',
                    'locked' => true,
                    'lockedAt' => date('c'),
                    'overrideCount' => ($data['boards'][$key]['overrideCount'] ?? 0) + ($input['override'] ? 1 : 0),
                    'overrideReason' => $input['overrideReason'] ?? null
                ];
                
                $data['boards'][$key] = $board;
                
                // Add to history
                $data['history'][] = [
                    'action' => $input['override'] ? 'override' : 'lock',
                    'key' => $key,
                    'timestamp' => date('c'),
                    'board' => $board
                ];
                
                // Keep only last 100 history entries
                if (count($data['history']) > 100) {
                    $data['history'] = array_slice($data['history'], -100);
                }
                
                saveData($dataFile, $data);
                
                echo json_encode([
                    'success' => true,
                    'message' => 'Session board saved',
                    'board' => $board
                ]);
            } elseif ($action === 'decrement') {
                // Decrement trades remaining
                $session = $input['session'] ?? '';
                $date = $input['date'] ?? getAESTDate();
                $key = getSessionKey($session, $date);
                
                if (!isset($data['boards'][$key])) {
                    throw new Exception('Session board not found');
                }
                
                $data['boards'][$key]['tradesUsed'] = ($data['boards'][$key]['tradesUsed'] ?? 0) + 1;
                saveData($dataFile, $data);
                
                $remaining = $data['boards'][$key]['maxTrades'] - $data['boards'][$key]['tradesUsed'];
                
                echo json_encode([
                    'success' => true,
                    'tradesUsed' => $data['boards'][$key]['tradesUsed'],
                    'tradesRemaining' => max(0, $remaining)
                ]);
            } else {
                throw new Exception('Unknown action');
            }
            break;
            
        case 'DELETE':
            if ($action === 'clear') {
                // Clear today's boards (for testing/reset)
                $today = getAESTDate();
                foreach (array_keys($data['boards']) as $key) {
                    if (strpos($key, $today) === 0) {
                        unset($data['boards'][$key]);
                    }
                }
                saveData($dataFile, $data);
                
                echo json_encode([
                    'success' => true,
                    'message' => 'Today\'s session boards cleared'
                ]);
            } else {
                throw new Exception('Unknown action');
            }
            break;
            
        default:
            http_response_code(405);
            echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    }
    
} catch (Exception $e) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error' => $e->getMessage()
    ]);
}
