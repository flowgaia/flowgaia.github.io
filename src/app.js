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
    saveState({ ..._sessionState }).catch(console.error);
  }, 1000);
}

function initStatePersistence() {
  onEvent('TrackChanged', (info) => {
    _sessionState.current_track_id = info.track_id;
    scheduleSave();
  });

  onEvent('PlaylistUpdated', (info) => {
    _sessionState.playlist_track_ids = (info.tracks || []).map((t) => t.id);
    _sessionState.playlist_position = info.current_position ?? null;
    if (info.album_id != null) {
      _sessionState.current_album_id = info.album_id;
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
}

async function restoreSessionState() {
  const saved = await loadState();
  if (!saved || !saved.playlist_track_ids?.length) return;

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
  await restoreSessionState();

  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(console.error);
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
