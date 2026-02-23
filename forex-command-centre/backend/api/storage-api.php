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
    'daily-context' => 'daily-context.json'
];

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
