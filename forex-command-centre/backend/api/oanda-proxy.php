<?php
/**
 * Oanda API Proxy v1.0
 * Handles CORS for browser-based Oanda API calls
 * 
 * Place in: /api/oanda-proxy.php on your Nginx server
 * 
 * Security: Only allows requests to Oanda domains
 */

// CORS Headers
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, PATCH, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Oanda-Token, Authorization');
header('Content-Type: application/json');

// Handle preflight OPTIONS request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Allowed Oanda domains only
$allowedHosts = [
    'api-fxtrade.oanda.com',
    'api-fxpractice.oanda.com',
    'stream-fxtrade.oanda.com',
    'stream-fxpractice.oanda.com'
];

// Get target URL from query parameter
$targetUrl = isset($_GET['url']) ? $_GET['url'] : null;

if (!$targetUrl) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing url parameter']);
    exit;
}

// Validate URL
$parsedUrl = parse_url($targetUrl);
if (!$parsedUrl || !isset($parsedUrl['host'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid URL']);
    exit;
}

// Security: Only allow Oanda domains
if (!in_array($parsedUrl['host'], $allowedHosts)) {
    http_response_code(403);
    echo json_encode(['error' => 'Domain not allowed', 'host' => $parsedUrl['host']]);
    exit;
}

// Get API token from header
$headers = getallheaders();
$apiToken = isset($headers['X-Oanda-Token']) ? $headers['X-Oanda-Token'] : null;

if (!$apiToken) {
    // Also check lowercase (some servers normalise headers)
    $apiToken = isset($headers['x-oanda-token']) ? $headers['x-oanda-token'] : null;
}

if (!$apiToken) {
    http_response_code(401);
    echo json_encode(['error' => 'Missing X-Oanda-Token header']);
    exit;
}

// Build cURL request
$ch = curl_init();

curl_setopt_array($ch, [
    CURLOPT_URL => $targetUrl,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_TIMEOUT => 30,
    CURLOPT_HTTPHEADER => [
        'Authorization: Bearer ' . $apiToken,
        'Content-Type: application/json',
        'Accept: application/json'
    ]
]);

// Handle request method
$method = $_SERVER['REQUEST_METHOD'];
curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);

// Handle request body for POST/PUT/PATCH
if (in_array($method, ['POST', 'PUT', 'PATCH'])) {
    $body = file_get_contents('php://input');
    if ($body) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
    }
}

// Execute request
$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$error = curl_error($ch);
curl_close($ch);

// Handle cURL errors
if ($error) {
    http_response_code(502);
    echo json_encode(['error' => 'Proxy request failed', 'details' => $error]);
    exit;
}

// Forward response
http_response_code($httpCode);
echo $response;
