// ============================================================================
// FCC PWA Notifications — v1.0.0
// Handles: SW registration, push subscription, permission UI, FCC triggers
// ============================================================================

(function() {
    'use strict';

    // -------------------------------------------------------------------------
    // VAPID public key (must match server)
    // -------------------------------------------------------------------------
    var VAPID_PUBLIC_KEY = 'BK7MEl0DhksZv7pLAk_C9a0K-cY-wpSNsuqfqMnkuLIrOPvnBEMBAGvQGwEx32EgRvIj8Uruhq_PHzw4vrxZa1I';

    // -------------------------------------------------------------------------
    // Alert server base URL
    // -------------------------------------------------------------------------
    var API_BASE = 'https://api.pineros.club';

    // -------------------------------------------------------------------------
    // UTILITIES
    // -------------------------------------------------------------------------

    // Convert VAPID public key from base64url to Uint8Array
    function urlBase64ToUint8Array(base64String) {
        var padding = '='.repeat((4 - base64String.length % 4) % 4);
        var base64 = (base64String + padding)
            .replace(/-/g, '+')
            .replace(/_/g, '/');
        var rawData = window.atob(base64);
        var outputArray = new Uint8Array(rawData.length);
        for (var i = 0; i < rawData.length; i++) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    }

    // -------------------------------------------------------------------------
    // SERVICE WORKER REGISTRATION
    // -------------------------------------------------------------------------
    function registerServiceWorker() {
        if (!('serviceWorker' in navigator)) {
            console.log('[PWA] Service workers not supported');
            return Promise.resolve(null);
        }

        return navigator.serviceWorker.register('/sw.js', { scope: '/' })
            .then(function(registration) {
                console.log('[PWA] Service worker registered:', registration.scope);
                return registration;
            })
            .catch(function(err) {
                console.error('[PWA] Service worker registration failed:', err);
                return null;
            });
    }

    // -------------------------------------------------------------------------
    // PUSH SUBSCRIPTION
    // -------------------------------------------------------------------------
    function subscribeToPush(registration) {
        if (!('PushManager' in window)) {
            console.log('[PWA] Push not supported');
            return Promise.resolve(null);
        }

        return registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
        })
        .then(function(subscription) {
            console.log('[PWA] Push subscribed');
            return saveSubscriptionToServer(subscription);
        })
        .catch(function(err) {
            console.error('[PWA] Push subscription failed:', err);
            return null;
        });
    }

    function saveSubscriptionToServer(subscription) {
        // Attach current prefs so server can filter per-subscription
        var prefs = window.FCCPushPrefs ? window.FCCPushPrefs.get() : {};
        var payload = Object.assign({}, subscription.toJSON ? subscription.toJSON() : subscription, { prefs: prefs });
        return fetch(API_BASE + '/push/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
        .then(function(res) {
            if (res.ok) {
                console.log('[PWA] Subscription saved to server');
                localStorage.setItem('fcc-push-subscribed', '1');
                updateNotificationButton('enabled');
                return true;
            }
            throw new Error('Server returned ' + res.status);
        })
        .catch(function(err) {
            console.error('[PWA] Failed to save subscription:', err);
            return false;
        });
    }

    // -------------------------------------------------------------------------
    // PERMISSION REQUEST
    // -------------------------------------------------------------------------
    function requestPermissionAndSubscribe() {
        if (!('Notification' in window)) {
            showToastIfAvailable('Push notifications not supported on this browser');
            return;
        }

        if (Notification.permission === 'granted') {
            // Already granted — just ensure subscription is registered
            navigator.serviceWorker.ready.then(function(reg) {
                reg.pushManager.getSubscription().then(function(existing) {
                    if (existing) {
                        saveSubscriptionToServer(existing);
                    } else {
                        subscribeToPush(reg);
                    }
                });
            });
            return;
        }

        Notification.requestPermission().then(function(permission) {
            if (permission === 'granted') {
                navigator.serviceWorker.ready.then(function(reg) {
                    subscribeToPush(reg);
                });
                hideBanner();
            } else {
                showToastIfAvailable('Notifications blocked — you can enable them in browser settings');
                updateNotificationButton('blocked');
            }
        });
    }

    // -------------------------------------------------------------------------
    // FCC TRIGGER — called by FCC modules to fire server-side push
    // Types: 'NEWS_WARNING', 'CIRCUIT_BREAKER'
    // -------------------------------------------------------------------------
    window.FCCPush = {
        trigger: function(type, payload) {
            if (!localStorage.getItem('fcc-push-subscribed')) return;
            fetch(API_BASE + '/push/notify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: type, payload: payload || {} })
            }).catch(function(err) {
                console.warn('[PWA] Push trigger failed:', err);
            });
        }
    };

    // -------------------------------------------------------------------------
    // NOTIFICATION BANNER UI
    // -------------------------------------------------------------------------
    function createBanner() {
        if (document.getElementById('pwa-notif-banner')) return;
        if (Notification.permission === 'granted') return;
        if (Notification.permission === 'denied') return;

        var banner = document.createElement('div');
        banner.id = 'pwa-notif-banner';
        banner.style.cssText = [
            'position:fixed',
            'bottom:60px',
            'left:50%',
            'transform:translateX(-50%)',
            'background:#1a2332',
            'border:1px solid #22c55e',
            'border-radius:8px',
            'padding:12px 16px',
            'display:flex',
            'align-items:center',
            'gap:12px',
            'z-index:9999',
            'box-shadow:0 4px 16px rgba(0,0,0,0.4)',
            'max-width:90vw',
            'font-family:Inter,sans-serif',
            'font-size:13px',
            'color:#e2e8f0'
        ].join(';');

        banner.innerHTML = [
            '<span style="font-size:18px">&#x1F514;</span>',
            '<span>Enable push notifications for ARMED alerts &amp; FOMO gate</span>',
            '<button id="pwa-enable-btn" style="',
                'background:#22c55e;color:#0d1117;border:none;',
                'border-radius:4px;padding:6px 12px;font-weight:600;',
                'cursor:pointer;font-size:12px;white-space:nowrap',
            '">Enable</button>',
            '<button id="pwa-dismiss-btn" style="',
                'background:transparent;color:#64748b;border:none;',
                'cursor:pointer;font-size:16px;padding:0 4px',
            '">&#x2715;</button>'
        ].join('');

        document.body.appendChild(banner);

        document.getElementById('pwa-enable-btn').addEventListener('click', function() {
            requestPermissionAndSubscribe();
        });
        document.getElementById('pwa-dismiss-btn').addEventListener('click', function() {
            hideBanner();
            // Don't ask again this session
            sessionStorage.setItem('fcc-push-dismissed', '1');
        });
    }

    function hideBanner() {
        var b = document.getElementById('pwa-notif-banner');
        if (b) b.remove();
    }

    // -------------------------------------------------------------------------
    // HEADER BUTTON
    // -------------------------------------------------------------------------
    function createNotificationButton() {
        var existing = document.getElementById('pwa-notif-btn');
        if (existing) return;

        var actions = document.querySelector('.header-quick-actions');
        if (!actions) return;

        var btn = document.createElement('button');
        btn.id = 'pwa-notif-btn';
        btn.title = 'Push Notifications';
        btn.style.cssText = [
            'background:transparent',
            'border:1px solid #334155',
            'border-radius:6px',
            'padding:6px 10px',
            'cursor:pointer',
            'font-size:14px',
            'color:#94a3b8',
            'display:flex',
            'align-items:center',
            'gap:4px',
            'font-family:Inter,sans-serif',
            'font-size:12px'
        ].join(';');

        btn.innerHTML = '&#x1F514; Alerts';
        btn.addEventListener('click', requestPermissionAndSubscribe);

        // Insert before the Guide button
        actions.insertBefore(btn, actions.firstChild);

        // Update state on load
        checkSubscriptionState();
    }

    function updateNotificationButton(state) {
        var btn = document.getElementById('pwa-notif-btn');
        if (!btn) return;

        if (state === 'enabled') {
            btn.innerHTML = '&#x1F514; Alerts &#x2714;';
            btn.style.borderColor = '#22c55e';
            btn.style.color = '#22c55e';
            btn.title = 'Push notifications active';
        } else if (state === 'blocked') {
            btn.innerHTML = '&#x1F514; Blocked';
            btn.style.borderColor = '#ef4444';
            btn.style.color = '#ef4444';
            btn.title = 'Notifications blocked in browser settings';
        }
        // Keep settings panel in sync
        setTimeout(function() {
            if (window.FCCPushPrefs) window.FCCPushPrefs.updateSettingsUI();
        }, 300);
    }

    function checkSubscriptionState() {
        if (Notification.permission === 'granted' && localStorage.getItem('fcc-push-subscribed')) {
            updateNotificationButton('enabled');
        } else if (Notification.permission === 'denied') {
            updateNotificationButton('blocked');
        }
    }

    // -------------------------------------------------------------------------
    // HELPER — use FCC toast if available
    // -------------------------------------------------------------------------
    function showToastIfAvailable(msg) {
        if (window.showToast) {
            window.showToast(msg, 'warning');
        } else {
            console.warn('[PWA]', msg);
        }
    }

    // -------------------------------------------------------------------------
    // FCCPushPrefs — settings panel controller
    // -------------------------------------------------------------------------
    window.FCCPushPrefs = {
        STORAGE_KEY: 'fcc-push-prefs',

        get: function() {
            try {
                var raw = localStorage.getItem(this.STORAGE_KEY);
                return raw ? JSON.parse(raw) : {
                    armed: true,
                    fomoCleared: true,
                    newsWarning: true,
                    circuitBreaker: true
                };
            } catch (e) {
                return { armed: true, fomoCleared: true, newsWarning: true, circuitBreaker: true };
            }
        },

        save: function() {
            var prefs = {
                armed:          document.getElementById('push-pref-armed')   ? document.getElementById('push-pref-armed').checked   : true,
                fomoCleared:    document.getElementById('push-pref-fomo')    ? document.getElementById('push-pref-fomo').checked    : true,
                newsWarning:    document.getElementById('push-pref-news')    ? document.getElementById('push-pref-news').checked    : true,
                circuitBreaker: document.getElementById('push-pref-circuit') ? document.getElementById('push-pref-circuit').checked : true
            };
            try {
                localStorage.setItem(this.STORAGE_KEY, JSON.stringify(prefs));
            } catch (e) {
                console.warn('[PWA] Could not save prefs');
            }
            // Re-send subscription to server with updated prefs
            if (navigator.serviceWorker && navigator.serviceWorker.ready) {
                navigator.serviceWorker.ready.then(function(reg) {
                    reg.pushManager.getSubscription().then(function(sub) {
                        if (sub) saveSubscriptionToServer(sub);
                    });
                });
            }
        },

        loadIntoUI: function() {
            var prefs = this.get();
            var el;
            el = document.getElementById('push-pref-armed');   if (el) el.checked = prefs.armed         !== false;
            el = document.getElementById('push-pref-fomo');    if (el) el.checked = prefs.fomoCleared   !== false;
            el = document.getElementById('push-pref-news');    if (el) el.checked = prefs.newsWarning   !== false;
            el = document.getElementById('push-pref-circuit'); if (el) el.checked = prefs.circuitBreaker!== false;
        },

        updateSettingsUI: function() {
            var badge      = document.getElementById('push-status-badge');
            var enableBtn  = document.getElementById('push-enable-btn');
            var testBtn    = document.getElementById('push-test-btn');
            var toggles    = document.getElementById('push-toggles');
            var blockedMsg = document.getElementById('push-blocked-msg');

            if (!badge) return;

            var perm = ('Notification' in window) ? Notification.permission : 'denied';
            var subscribed = !!localStorage.getItem('fcc-push-subscribed');

            if (perm === 'granted' && subscribed) {
                badge.textContent = 'Active';
                badge.className = 'badge badge-success';
                if (enableBtn) enableBtn.style.display = 'none';
                if (testBtn)   testBtn.style.display   = 'inline-flex';
                if (toggles)   toggles.style.display   = 'block';
                if (blockedMsg) blockedMsg.style.display = 'none';
                this.loadIntoUI();
            } else if (perm === 'denied') {
                badge.textContent = 'Blocked';
                badge.className = 'badge badge-danger';
                if (enableBtn)  enableBtn.style.display  = 'none';
                if (testBtn)    testBtn.style.display    = 'none';
                if (toggles)    toggles.style.display    = 'none';
                if (blockedMsg) blockedMsg.style.display = 'block';
            } else {
                badge.textContent = 'Not enabled';
                badge.className = 'badge';
                if (enableBtn)  enableBtn.style.display  = 'inline-flex';
                if (testBtn)    testBtn.style.display    = 'none';
                if (toggles)    toggles.style.display    = 'none';
                if (blockedMsg) blockedMsg.style.display = 'none';
            }
        },

        requestPermission: function() {
            requestPermissionAndSubscribe();
            // Update settings UI after a short delay
            setTimeout(function() {
                window.FCCPushPrefs.updateSettingsUI();
            }, 2000);
        },

        sendTest: function() {
            fetch(API_BASE + '/push/notify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'NEWS_WARNING',
                    payload: { event: 'TEST ALERT — FCC push working', minutesAway: 999 }
                })
            })
            .then(function(r) {
                if (r.ok) {
                    showToastIfAvailable('Test push sent — check your phone');
                } else {
                    showToastIfAvailable('Test failed — check alert server');
                }
            })
            .catch(function() {
                showToastIfAvailable('Test failed — server unreachable');
            });
        }
    };

    // -------------------------------------------------------------------------
    // INIT — runs after DOM ready
    // -------------------------------------------------------------------------
    function init() {
        if (!('serviceWorker' in navigator)) {
            console.log('[PWA] Not supported');
            return;
        }

        registerServiceWorker().then(function(registration) {
            if (!registration) return;

            createNotificationButton();

            // Update settings panel UI
            setTimeout(function() {
                if (window.FCCPushPrefs) window.FCCPushPrefs.updateSettingsUI();
            }, 500);

            // Show banner after short delay (let page settle)
            if (!sessionStorage.getItem('fcc-push-dismissed') &&
                Notification.permission === 'default') {
                setTimeout(createBanner, 3000);
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
