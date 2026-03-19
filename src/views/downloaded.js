/**
 * views/downloaded.js — Downloaded tracks panel.
 *
 * On load, reads persisted download IDs from IndexedDB and informs the WASM
 * core so it can construct the Downloaded playlist.
 * The "Play All" button sends LoadDownloaded and switches to Playlist.
 */

import { dispatchCommand, onEvent } from '../event-bus.js';
import { getAllDownloadedIds, saveDownloaded, getDownloaded } from '../storage.js';

export function initDownloaded() {
  // Render downloaded list when WASM emits the event
  onEvent('DownloadedLoaded', (info) => {
    renderDownloadedList(info?.tracks || []);
  });

  // On startup, tell WASM which track IDs are locally available
  getAllDownloadedIds().then((ids) => {
    if (ids.length > 0) {
      dispatchCommand({ type: 'SetDownloaded', payload: ids });
    }
    // Show storage estimate regardless
    showStorageInfo();
  });

  // "Play All" button
  document.getElementById('btn-load-downloaded')?.addEventListener('click', () => {
    dispatchCommand({ type: 'LoadDownloaded' });
    // Switch to Playlist tab to show the loaded playlist
    document.querySelector('.tab[data-tab="playlist"]')?.click();
  });
}

// ── Rendering ─────────────────────────────────────────────────────────────────

function renderDownloadedList(tracks) {
  const list = document.getElementById('downloaded-list');
  if (!list) return;

  if (tracks.length === 0) {
    list.innerHTML = '<li class="empty-state">No downloaded songs yet</li>';
    return;
  }

  list.innerHTML = tracks
    .map(
      (track, idx) => `
    <li class="track-item downloaded-item"
        data-track-id="${escapeAttr(track.id)}"
        data-index="${idx}">
      <span class="track-number">${track.track_number ?? idx + 1}</span>
      <div class="track-info">
        <span class="track-title">${escapeHtml(track.title)}</span>
        <span class="track-artist">${escapeHtml(track.artist)}</span>
      </div>
      <span class="track-duration">${formatDuration(track.duration)}</span>
    </li>
  `,
    )
    .join('');

  // Click to play
  list.querySelectorAll('.downloaded-item').forEach((item) => {
    item.addEventListener('click', () => {
      dispatchCommand({ type: 'PlayTrack', payload: item.dataset.trackId });
    });
  });
}

// ── Storage info ──────────────────────────────────────────────────────────────

function showStorageInfo() {
  if (!('storage' in navigator && 'estimate' in navigator.storage)) return;

  navigator.storage.estimate().then(({ usage = 0, quota = 0 }) => {
    const usageMB = (usage / 1024 / 1024).toFixed(1);
    const quotaMB = (quota / 1024 / 1024).toFixed(0);
    const el = document.getElementById('storage-info');
    if (el) el.textContent = `Storage: ${usageMB} MB / ${quotaMB} MB used`;
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(str) {
  return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function formatDuration(secs) {
  if (!secs || isNaN(secs)) return '--:--';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
