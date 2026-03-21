import './app.css';
import init, { dispatch as wasmDispatch, greet } from '../wasm/music_core.js';
import { initTabs } from './tabs.js';
import { initAlbums, renderAlbumGrid } from './views/albums.js';
import { initPlaylist } from './views/playlist.js';
import { initQueue } from './views/queue.js';
import { initDownloaded } from './views/downloaded.js';
import { initMiniPlayer } from './views/mini-player.js';
import { initFullPlayer } from './views/full-player.js';
import { initAudio } from './audio.js';
import { initMediaSession } from './media-session.js';
import { loadState, saveState, getAllDownloadedIds } from './storage.js';
import { dispatchCommand, onEvent, setWasmDispatch } from './event-bus.js';

// ---------------------------------------------------------------------------
// Theme toggle
// ---------------------------------------------------------------------------

function initTheme() {
  const toggle = document.getElementById('theme-toggle');
  const html = document.documentElement;

  const saved = localStorage.getItem('theme');
  if (saved === 'light') {
    html.classList.remove('dark');
    if (toggle) toggle.textContent = '☀';
  } else {
    html.classList.add('dark');
    if (toggle) toggle.textContent = '☾';
  }

  toggle?.addEventListener('click', () => {
    const isDark = html.classList.toggle('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    toggle.textContent = isDark ? '☾' : '☀';
  });
}

// ---------------------------------------------------------------------------
// State persistence — track in-memory snapshot, debounce saves to IndexedDB
// ---------------------------------------------------------------------------

let _sessionState = {
  current_track_id: null,
  playlist_track_ids: [],
  playlist_position: null,
  original_playlist_order: [],
  repeat_mode: 'Off',
  shuffle_enabled: false,
  current_album_id: null,
  current_time: 0,
  queue_track_ids: [],
};

let _saveTimer = null;

function scheduleSave() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    // Capture current playback position at save time for seek restore.
    const audio = window._audio;
    if (audio && audio.currentTime > 0 && isFinite(audio.currentTime)) {
      _sessionState.current_time = audio.currentTime;
    }
    console.log('[state] save', {
      track: _sessionState.current_track_id,
      pos: _sessionState.playlist_position,
      t: _sessionState.current_time?.toFixed(1),
      album: _sessionState.current_album_id,
    });
    saveState({ ..._sessionState }).catch(console.error);
  }, 1000);
}

/**
 * Capture current_time immediately and persist — called on page hide/unload
 * so the seek position is accurate even if no state event fired recently.
 */
function saveNow() {
  const audio = window._audio;
  if (audio && audio.currentTime > 0 && isFinite(audio.currentTime)) {
    _sessionState.current_time = audio.currentTime;
    // Synchronous localStorage backup because IndexedDB writes may not complete
    // before the browser terminates the page on unload.
    try {
      localStorage.setItem('_lastCurrentTime', String(audio.currentTime));
    } catch {}
  }
  clearTimeout(_saveTimer);
  saveState({ ..._sessionState }).catch(console.error);
}

function initStatePersistence() {
  onEvent('TrackChanged', (info) => {
    _sessionState.current_track_id = info.track_id;
    // Keep playlist_position in sync with the playing track so restore always
    // returns to the right position (PlaylistUpdated is not emitted on Next/Prev).
    const pos = _sessionState.playlist_track_ids.indexOf(info.track_id);
    if (pos !== -1) {
      _sessionState.playlist_position = pos;
    }
    scheduleSave();
  });

  onEvent('PlaylistUpdated', (info) => {
    const ids = (info.tracks || []).map((t) => t.id);
    _sessionState.playlist_track_ids = ids;
    _sessionState.playlist_position = info.current_position ?? null;
    if (info.album_id != null) {
      _sessionState.current_album_id = info.album_id;
    }
    // When shuffle is off the current order IS the original order.
    // This ensures shuffle-off restores correctly after a reload.
    if (!_sessionState.shuffle_enabled) {
      _sessionState.original_playlist_order = ids;
    }
    scheduleSave();
  });

  onEvent('ShuffleChanged', (enabled) => {
    _sessionState.shuffle_enabled = enabled;
    scheduleSave();
  });

  onEvent('RepeatChanged', (mode) => {
    // Convert lowercase event values ('off','all','one') to Rust enum names.
    const map = { off: 'Off', all: 'All', one: 'One' };
    _sessionState.repeat_mode = map[mode] ?? 'Off';
    scheduleSave();
  });

  onEvent('QueueUpdated', (info) => {
    _sessionState.queue_track_ids = (info.tracks || []).map((t) => t.id);
    scheduleSave();
  });
}

async function restoreSessionState() {
  const saved = await loadState();

  if (!saved || !saved.playlist_track_ids?.length) {
    console.log('[state] restore: nothing saved');
    return;
  }

  // A localStorage entry written on page-hide may be more accurate than the
  // debounced IndexedDB value (which is only refreshed 1 s after the last event).
  const ltTime = parseFloat(localStorage.getItem('_lastCurrentTime') || '0');
  if (ltTime > (saved.current_time || 0)) {
    saved.current_time = ltTime;
  }
  localStorage.removeItem('_lastCurrentTime');

  console.log('[state] restore', {
    track: saved.current_track_id,
    pos: saved.playlist_position,
    t: saved.current_time?.toFixed(1),
    album: saved.current_album_id,
    tracks: saved.playlist_track_ids?.length,
  });

  // Sync the in-memory snapshot so subsequent saves don't clobber the restore.
  _sessionState = { ..._sessionState, ...saved };

  // Signal audio.js to restore seek position after the track loads.
  if (saved.current_time > 0) {
    window._restoredCurrentTime = saved.current_time;
  }

  dispatchCommand({ type: 'RestoreState', payload: saved });
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

async function main() {
  initTheme();

  // Initialize WASM
  await init();
  console.log(greet('FlowGaia'));
  setWasmDispatch(wasmDispatch);

  // Wire up persistence listeners before any events are emitted.
  initStatePersistence();

  // Initialize all UI components
  initTabs();
  initAlbums();
  initPlaylist();
  initQueue();
  initDownloaded();
  initMiniPlayer();
  initFullPlayer();
  initAudio();
  initMediaSession();

  // Load downloaded IDs so the WASM core knows which tracks are offline.
  const downloadedIds = await getAllDownloadedIds();
  if (downloadedIds.length > 0) {
    dispatchCommand({ type: 'SetDownloaded', payload: downloadedIds });
  }

  // Load music library, then restore last session.
  await loadLibrary();

  // Populate the Downloaded tab now that track metadata is available.
  if (downloadedIds.length > 0) {
    dispatchCommand({ type: 'LoadDownloaded' });
  }

  await restoreSessionState();

  // Save state immediately when the page is hidden or unloaded so the seek
  // position is accurate even if the debounced save hasn't fired yet.
  window.addEventListener('pagehide', saveNow);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveNow();
  });

  // Register service worker in production only.
  // In development (Vite HMR), the cache-first SW strategy causes stale assets
  // to be served after code changes, breaking hot reload and tab restore.
  if ('serviceWorker' in navigator) {
    if (import.meta.env.PROD) {
      navigator.serviceWorker.register('/sw.js').catch(console.error);
    } else {
      // Unregister any previously-registered SW so stale cache-first responses
      // don't cause the page to reload in a loop during development.
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (reg) reg.unregister();
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Music library loader
// ---------------------------------------------------------------------------

async function loadLibrary() {
  try {
    const resp = await fetch('/music.json');
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();

    // Cache the library for audio.js to look up URIs
    window._musicLibrary = data;

    dispatchCommand({ type: 'LoadTracks', payload: data.tracks });
    dispatchCommand({ type: 'LoadAlbums', payload: data.albums });

    renderAlbumGrid(data.albums);
  } catch (err) {
    console.warn('Failed to load music.json, using demo data:', err);
    loadDemoData();
  }
}

function loadDemoData() {
  const tracks = [
    {
      id: 't1',
      title: 'Song One',
      artist: 'Demo Artist',
      album: 'Demo Album',
      duration: 210,
      track_number: 1,
      uri: '',
      artwork_url: '',
    },
    {
      id: 't2',
      title: 'Song Two',
      artist: 'Demo Artist',
      album: 'Demo Album',
      duration: 185,
      track_number: 2,
      uri: '',
      artwork_url: '',
    },
    {
      id: 't3',
      title: 'Song Three',
      artist: 'Demo Artist',
      album: 'Demo Album',
      duration: 230,
      track_number: 3,
      uri: '',
      artwork_url: '',
    },
  ];
  const albums = [
    {
      id: 'a1',
      name: 'Demo Album',
      artist: 'Demo Artist',
      artwork_url: '',
      track_ids: ['t1', 't2', 't3'],
    },
  ];
  window._musicLibrary = { tracks, albums };
  dispatchCommand({ type: 'LoadTracks', payload: tracks });
  dispatchCommand({ type: 'LoadAlbums', payload: albums });
  renderAlbumGrid(albums);
}

main().catch(console.error);
