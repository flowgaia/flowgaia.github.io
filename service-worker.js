/**
 * Service Worker - App shell caching for offline access
 *
 * Copyright © 2026 FlowGaia. All rights reserved.
 *
 * This source code is licensed under the copyright of FlowGaia.
 * Unauthorized copying, distribution, or modification is prohibited.
 */

const CACHE_VERSION = 'v1';
const CACHE_NAME = `flowgaia-app-shell-${CACHE_VERSION}`;

// Files to precache (app shell)
const PRECACHE_FILES = [
    '/',
    '/index.html',
    '/manifest.json',
    '/favicon.svg',
    '/config.yaml',
    '/styles/main.css',
    '/styles/sacred-theme.css',
    '/styles/player.css',
    '/scripts/playback-state.js',
    '/scripts/player-view.js',
    '/scripts/config-loader.js',
    '/scripts/storage-manager.js',
    '/scripts/download-manager.js',
    '/scripts/player.js',
    '/scripts/app.js',
    // CDN dependencies
    'https://cdn.jsdelivr.net/npm/js-yaml@4.1.0/dist/js-yaml.min.js',
    'https://cdn.jsdelivr.net/npm/howler@2.2.4/dist/howler.min.js',
    'https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Cormorant+Garamond:wght@300;400;600&display=swap'
];

/**
 * Install event - precache app shell
 */
self.addEventListener('install', (event) => {
    console.log('[SW] Installing service worker...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[SW] Precaching app shell');
                return cache.addAll(PRECACHE_FILES);
            })
            .then(() => {
                console.log('[SW] App shell cached successfully');
                return self.skipWaiting();
            })
            .catch((error) => {
                console.error('[SW] Precache failed:', error);
            })
    );
});

/**
 * Activate event - cleanup old caches
 */
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating service worker...');
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => {
                        if (cacheName !== CACHE_NAME && cacheName.startsWith('flowgaia-')) {
                            console.log('[SW] Deleting old cache:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
            .then(() => {
                console.log('[SW] Service worker activated');
                return self.clients.claim();
            })
    );
});

/**
 * Fetch event - serve from cache, fallback to network
 */
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Skip audio files (handled by IndexedDB in download-manager)
    if (url.pathname.startsWith('/assets/audio/')) {
        return;
    }

    // Network-first for images (with cache fallback)
    if (url.pathname.startsWith('/assets/images/')) {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    // Clone and cache the response
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(request, responseClone);
                    });
                    return response;
                })
                .catch(() => {
                    // Fallback to cache if network fails
                    return caches.match(request);
                })
        );
        return;
    }

    // Cache-first for app shell
    event.respondWith(
        caches.match(request)
            .then((cachedResponse) => {
                if (cachedResponse) {
                    return cachedResponse;
                }

                // Not in cache, fetch from network
                return fetch(request)
                    .then((response) => {
                        // Cache dynamic resources
                        if (response.status === 200) {
                            const responseClone = response.clone();
                            caches.open(CACHE_NAME).then((cache) => {
                                cache.put(request, responseClone);
                            });
                        }
                        return response;
                    });
            })
            .catch((error) => {
                console.error('[SW] Fetch failed:', error);
                // Return offline page if available
                return caches.match('/index.html');
            })
    );
});
