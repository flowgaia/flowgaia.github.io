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
import { loadState, getAllDownloadedIds } from './storage.js';
import { dispatchCommand, setWasmDispatch } from './event-bus.js';

// Theme toggle
function initTheme() {
  const toggle = document.getElementById('theme-toggle');
  const html = document.documentElement;

  // Initialize from localStorage or system preference
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

async function main() {
  initTheme();

  // Initialize WASM
  await init();
  console.log(greet('FlowGaia'));
  setWasmDispatch(wasmDispatch);

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

  // Load saved downloaded state from IndexedDB
  const downloadedIds = await getAllDownloadedIds();
  if (downloadedIds.length > 0) {
    dispatchCommand({ type: 'SetDownloaded', payload: downloadedIds });
  }

  // Load music library
  await loadLibrary();

  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(console.error);
  }
}

async function loadLibrary() {
  try {
    const resp = await fetch('/music.json');
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();

    // Cache the library for audio.js to look up URIs
    window._musicLibrary = data;

    dispatchCommand({ type: 'LoadTracks', payload: data.tracks });
    dispatchCommand({ type: 'LoadAlbums', payload: data.albums });

    // Render album grid
    renderAlbumGrid(data.albums);
  } catch (err) {
    console.warn('Failed to load music.json, using demo data:', err);
    loadDemoData();
  }
}

function loadDemoData() {
  const tracks = [
    { id: 't1', title: 'Song One', artist: 'Demo Artist', album: 'Demo Album', duration: 210, track_number: 1, uri: '', artwork_url: '' },
    { id: 't2', title: 'Song Two', artist: 'Demo Artist', album: 'Demo Album', duration: 185, track_number: 2, uri: '', artwork_url: '' },
    { id: 't3', title: 'Song Three', artist: 'Demo Artist', album: 'Demo Album', duration: 230, track_number: 3, uri: '', artwork_url: '' },
  ];
  const albums = [
    { id: 'a1', name: 'Demo Album', artist: 'Demo Artist', artwork_url: '', track_ids: ['t1', 't2', 't3'] },
  ];
  window._musicLibrary = { tracks, albums };
  dispatchCommand({ type: 'LoadTracks', payload: tracks });
  dispatchCommand({ type: 'LoadAlbums', payload: albums });
  renderAlbumGrid(albums);
}

main().catch(console.error);
