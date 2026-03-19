// Service Worker for Music Player PWA
// Manual implementation (no Workbox CDN dependency)

const CACHE_NAME = 'music-player-v1';

// Shell files to pre-cache on install
const SHELL_FILES = [
  '/',
  '/index.html',
  '/style.css',
  '/manifest.json',
  '/src/app.js',
  '/src/event-bus.js',
  '/src/tabs.js',
  '/src/audio.js',
  '/src/media-session.js',
  '/src/storage.js',
  '/src/views/albums.js',
  '/src/views/playlist.js',
  '/src/views/queue.js',
  '/src/views/downloaded.js',
  '/src/views/mini-player.js',
  '/src/views/full-player.js',
];

// ── Install: cache shell ────────────────────────────────────────────────────

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Cache individually so one failure doesn't break everything
      return Promise.allSettled(
        SHELL_FILES.map((url) =>
          cache.add(url).catch((err) => {
            console.warn('[SW] Failed to cache:', url, err);
          })
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// ── Activate: remove old caches ─────────────────────────────────────────────

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: strategy per request type ────────────────────────────────────────

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) {
    return;
  }

  // Audio files: network-first with range request support
  if (isAudioRequest(request)) {
    event.respondWith(handleAudio(request));
    return;
  }

  // WASM files: network-first (they may update with builds)
  if (url.pathname.includes('/wasm/')) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Everything else: cache-first
  event.respondWith(cacheFirst(request));
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function isAudioRequest(request) {
  const url = new URL(request.url);
  const ext = url.pathname.split('.').pop().toLowerCase();
  return ['mp3', 'flac', 'ogg', 'opus', 'm4a', 'aac', 'wav'].includes(ext)
    || request.headers.get('Range') !== null;
}

/**
 * Audio handler: supports Range requests for seekable playback.
 * Tries the network first; if offline, falls back to cache.
 * Re-assembles a proper 206 Partial Content response if the client
 * sent a Range header against a cached full response.
 */
async function handleAudio(request) {
  const rangeHeader = request.headers.get('Range');

  try {
    // Always go to network for audio (streaming / large files)
    const networkResponse = await fetch(request);
    // Cache successful full responses (200) so we can serve them offline
    if (networkResponse.ok && networkResponse.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request.url, networkResponse.clone());
    }
    return networkResponse;
  } catch {
    // Offline — try cache
    const cached = await caches.match(request.url);
    if (!cached) {
      return new Response('Audio not available offline', { status: 503 });
    }

    // If client wants a range and we have the full file cached, slice it
    if (rangeHeader) {
      return buildRangeResponse(cached, rangeHeader);
    }
    return cached;
  }
}

/**
 * Build a 206 Partial Content response from a cached full Response.
 */
async function buildRangeResponse(cachedResponse, rangeHeader) {
  const arrayBuffer = await cachedResponse.clone().arrayBuffer();
  const total = arrayBuffer.byteLength;

  const match = rangeHeader.match(/bytes=(\d*)-(\d*)/);
  if (!match) {
    return new Response('Invalid range', { status: 416 });
  }

  const start = match[1] !== '' ? parseInt(match[1], 10) : total - parseInt(match[2], 10);
  const end   = match[2] !== '' ? Math.min(parseInt(match[2], 10), total - 1) : total - 1;

  if (start > end || start >= total) {
    return new Response('Range Not Satisfiable', {
      status: 416,
      headers: { 'Content-Range': `bytes */${total}` },
    });
  }

  const slice = arrayBuffer.slice(start, end + 1);
  return new Response(slice, {
    status: 206,
    headers: {
      'Content-Type':  cachedResponse.headers.get('Content-Type') || 'audio/mpeg',
      'Content-Range': `bytes ${start}-${end}/${total}`,
      'Content-Length': String(slice.byteLength),
      'Accept-Ranges':  'bytes',
    },
  });
}

/** Network-first; falls back to cache on failure. */
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response('Offline', { status: 503 });
  }
}

/** Cache-first; falls back to network and caches the result. */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}
