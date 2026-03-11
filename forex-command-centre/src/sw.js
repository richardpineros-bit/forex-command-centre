// ============================================================================
// FCC Service Worker — v1.0.0
// Handles: push notifications, app shell caching, offline resilience
// ============================================================================

const CACHE_NAME = 'fcc-v4';

// App shell — critical files to cache for offline use
const SHELL_URLS = [
    '/',
    '/index.html',
    '/manifest.json',
    '/css/base.css',
    '/css/layout.css',
    '/css/components.css',
    '/css/dashboard.css',
    '/css/regime.css',
    '/css/pre-trade.css',
    '/css/journal.css',
    '/css/modals.css',
    '/css/alert-queue-ui.css',
    '/css/trade-capture-ui.css'
];

// ============================================================================
// INSTALL — cache app shell
// ============================================================================
self.addEventListener('install', function(event) {
    console.log('[SW] Installing...');
    event.waitUntil(
        caches.open(CACHE_NAME).then(function(cache) {
            console.log('[SW] Caching app shell');
            // Cache what we can, but don't fail install if some files are missing
            return Promise.allSettled(
                SHELL_URLS.map(function(url) { return cache.add(url); })
            );
        }).then(function() {
            console.log('[SW] Install complete');
            return self.skipWaiting();
        })
    );
});

// ============================================================================
// ACTIVATE — clean up old caches
// ============================================================================
self.addEventListener('activate', function(event) {
    console.log('[SW] Activating...');
    event.waitUntil(
        caches.keys().then(function(cacheNames) {
            return Promise.all(
                cacheNames
                    .filter(function(name) { return name !== CACHE_NAME; })
                    .map(function(name) {
                        console.log('[SW] Deleting old cache:', name);
                        return caches.delete(name);
                    })
            );
        }).then(function() {
            return self.clients.claim();
        })
    );
});

// ============================================================================
// FETCH — network first, cache fallback for navigation
// ============================================================================
self.addEventListener('fetch', function(event) {
    // Only handle GET requests
    if (event.request.method !== 'GET') return;

    // Skip API calls — always go to network
    if (event.request.url.includes('api.pineros.club')) return;

    event.respondWith(
        fetch(event.request).catch(function() {
            // Network failed — try cache
            return caches.match(event.request).then(function(cached) {
                if (cached) return cached;
                // If no cache match and it's a navigation, return index.html
                if (event.request.mode === 'navigate') {
                    return caches.match('/index.html');
                }
            });
        })
    );
});

// ============================================================================
// PUSH — receive and display notifications
// ============================================================================
self.addEventListener('push', function(event) {
    console.log('[SW] Push received');

    var data = {};
    try {
        data = event.data ? event.data.json() : {};
    } catch (e) {
        data = { title: 'FCC Alert', body: event.data ? event.data.text() : '' };
    }

    var title   = data.title || 'Forex Command Centre';
    var options = {
        body:    data.body    || '',
        icon:    data.icon    || '/icons/icon-192.png',
        badge:   '/icons/icon-192.png',
        tag:     data.tag     || 'fcc-alert',
        data:    data.data    || {},
        vibrate: data.vibrate || [200, 100, 200],
        requireInteraction: data.requireInteraction || false
    };

    event.waitUntil(
        self.registration.showNotification(title, options).then(function() {
            // Update app icon badge with armed pair count
            if ('setAppBadge' in self.navigator && data.data && data.data.armedCount !== undefined) {
                return self.navigator.setAppBadge(data.data.armedCount);
            } else if ('setAppBadge' in self.navigator) {
                return self.navigator.setAppBadge(1);
            }
        })
    );
});

// ============================================================================
// NOTIFICATION CLICK — focus or open the app
// ============================================================================
self.addEventListener('notificationclick', function(event) {
    console.log('[SW] Notification clicked:', event.notification.tag);
    event.notification.close();

    // Clear app icon badge
    if ('clearAppBadge' in self.navigator) {
        self.navigator.clearAppBadge().catch(function() {});
    }

    var targetUrl = '/';
    var notifData = event.notification.data || {};

    // Route to specific tab based on notification type
    if (notifData.type === 'ARMED' || notifData.type === 'FOMO_CLEARED') {
        targetUrl = '/?tab=dashboard';
    } else if (notifData.type === 'NEWS_WARNING') {
        targetUrl = '/?tab=daily-context';
    } else if (notifData.type === 'CIRCUIT_BREAKER') {
        targetUrl = '/?tab=dashboard';
    }

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
            // Focus existing window if open
            for (var i = 0; i < clientList.length; i++) {
                var client = clientList[i];
                if (client.url.includes('forex.pineros.club') && 'focus' in client) {
                    return client.focus();
                }
            }
            // Otherwise open a new window
            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
            }
        })
    );
});
