/**
 * views/downloaded.js — Downloaded tracks panel.
 *
 * On load, reads persisted download IDs from IndexedDB and informs the WASM
 * core so it can construct the Downloaded playlist.
 * The "Play All" button sends LoadDownloaded and switches to Playlist.
 * Each track row has a delete button to remove the offline copy.
 */

import { dispatchCommand, onEvent } from '../event-bus.js';
import { getAllDownloadedIds } from '../storage.js';
import { removeDownload } from '../download-manager.js';

export function initDownloaded() {
  // Render downloaded list when WASM emits the event.
  onEvent('DownloadedLoaded', (info) => {
    renderDownloadedList(info?.tracks || []);
  });

  // On startup, tell WASM which track IDs are locally available.
  getAllDownloadedIds().then((ids) => {
    if (ids.length > 0) {
      dispatchCommand({ type: 'SetDownloaded', payload: ids });
    }
    showStorageInfo();
  });

  // Refresh the list whenever the user navigates to this tab.
  document.querySelector('.tab[data-tab="downloaded"]')?.addEventListener('click', () => {
    dispatchCommand({ type: 'LoadDownloaded' });
  });

  // "Play All" button.
  document.getElementById('btn-load-downloaded')?.addEventListener('click', () => {
    dispatchCommand({ type: 'LoadDownloaded' });
    document.querySelector('.tab[data-tab="playlist"]')?.click();
  });
}

// ── Rendering ─────────────────────────────────────────────────────────────────

function renderDownloadedList(tracks) {
  const list = document.getElementById('downloaded-list');
  if (!list) return;

  if (tracks.length === 0) {
    list.innerHTML =
      '<li class="py-8 text-center text-sm text-neutral-400 dark:text-neutral-500">No downloaded songs yet</li>';
    return;
  }

  list.innerHTML = tracks
    .map(
      (track, idx) => `
    <li class="downloaded-item flex items-center gap-3 px-4 py-2.5 cursor-pointer
               hover:bg-neutral-50 dark:hover:bg-neutral-800/60 transition-colors"
        data-track-id="${escapeAttr(track.id)}"
        data-index="${idx}">
      <span class="w-5 text-center text-xs tabular-nums text-neutral-400 dark:text-neutral-500 flex-shrink-0">
        ${track.track_number ?? idx + 1}
      </span>
      <div class="flex-1 min-w-0">
        <span class="block text-sm font-medium text-neutral-900 dark:text-neutral-100 truncate">${escapeHtml(track.title)}</span>
        <span class="block text-xs text-neutral-500 dark:text-neutral-400 truncate">${escapeHtml(track.artist)}</span>
      </div>
      <span class="hidden xs:inline text-xs text-neutral-400 dark:text-neutral-500 tabular-nums flex-shrink-0">${formatDuration(track.duration)}</span>
      <button class="delete-btn p-1.5 rounded text-neutral-400 dark:text-neutral-500
                     hover:text-red-500 dark:hover:text-red-400 hover:bg-neutral-100 dark:hover:bg-neutral-700
                     transition-colors flex-shrink-0"
              data-track-id="${escapeAttr(track.id)}"
              title="Remove download" aria-label="Remove download">
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
        </svg>
      </button>
    </li>
  `,
    )
    .join('');

  // Click row (not delete button) to play the track.
  list.querySelectorAll('.downloaded-item').forEach((item) => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.delete-btn')) return;
      dispatchCommand({ type: 'PlayTrack', payload: item.dataset.trackId });
    });
  });

  // Delete button — remove from IndexedDB and refresh the list.
  list.querySelectorAll('.delete-btn').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const trackId = btn.dataset.trackId;
      btn.disabled = true;
      await removeDownload(trackId);
      dispatchCommand({ type: 'LoadDownloaded' });
      showStorageInfo();
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
