/**
 * views/queue.js — Queue panel with drag-and-drop reordering via SortableJS.
 *
 * Layout mirrors the Downloads tab: drag handle, track info, duration,
 * trash-can remove button. The currently-playing track is highlighted bold.
 */

import Sortable from 'sortablejs';
import { dispatchCommand, onEvent } from '../event-bus.js';

let sortable = null;
let _currentTrackId = null;

export function initQueue() {
  onEvent('QueueUpdated', renderQueue);

  // Keep playing indicator in sync with WASM playback state.
  onEvent('TrackChanged', (info) => {
    _currentTrackId = info?.track_id ?? null;
    updatePlayingIndicator();
  });
}

// ── Rendering ─────────────────────────────────────────────────────────────────

/**
 * @param {{ tracks: TrackSummary[], current_position: number }} info
 */
function renderQueue(info) {
  const list = document.getElementById('queue-list');
  const empty = document.getElementById('queue-empty');
  if (!list) return;

  const tracks = info?.tracks || [];

  if (tracks.length === 0) {
    list.innerHTML = '';
    if (empty) empty.style.display = 'block';
    destroySortable();
    return;
  }

  if (empty) empty.style.display = 'none';

  list.innerHTML = tracks
    .map((track, idx) => {
      const isPlaying = track.id === _currentTrackId;
      return `
    <li class="queue-item flex items-center gap-3 px-4 py-2.5 cursor-pointer
               hover:bg-neutral-50 dark:hover:bg-neutral-800/60 transition-colors
               ${isPlaying ? 'bg-neutral-50 dark:bg-neutral-800/60' : ''}"
        data-track-id="${escapeAttr(track.id)}"
        data-index="${idx}">
      <span class="drag-handle w-5 text-center text-neutral-300 dark:text-neutral-600 flex-shrink-0 cursor-grab active:cursor-grabbing"
            aria-label="Drag to reorder">⠿</span>
      <div class="flex-1 min-w-0">
        <span class="block text-sm ${isPlaying ? 'font-semibold' : 'font-medium'} text-neutral-900 dark:text-neutral-100 truncate">${escapeHtml(track.title)}</span>
        <span class="block text-xs text-neutral-500 dark:text-neutral-400 truncate">${escapeHtml(track.artist)}</span>
      </div>
      <span class="hidden xs:inline text-xs text-neutral-400 dark:text-neutral-500 tabular-nums flex-shrink-0">${formatDuration(track.duration)}</span>
      <button class="remove-from-queue-btn p-1.5 rounded text-neutral-400 dark:text-neutral-500
                     hover:text-red-500 dark:hover:text-red-400 hover:bg-neutral-100 dark:hover:bg-neutral-700
                     transition-colors flex-shrink-0"
              data-index="${idx}"
              title="Remove from queue"
              aria-label="Remove from queue">
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
        </svg>
      </button>
    </li>
  `;
    })
    .join('');

  // Remove buttons
  list.querySelectorAll('.remove-from-queue-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      dispatchCommand({
        type: 'RemoveFromQueue',
        payload: parseInt(btn.dataset.index, 10),
      });
    });
  });

  // Play track on row click (not on drag handle or remove button)
  list.querySelectorAll('.queue-item').forEach((item) => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.drag-handle') || e.target.closest('.remove-from-queue-btn')) return;
      dispatchCommand({ type: 'PlayTrack', payload: item.dataset.trackId });
    });
  });

  // (Re-)initialise SortableJS
  initSortable(list);
}

/**
 * Apply / remove the playing highlight without a full re-render.
 * Called when TrackChanged fires after the list is already rendered.
 */
function updatePlayingIndicator() {
  const list = document.getElementById('queue-list');
  if (!list) return;
  list.querySelectorAll('.queue-item').forEach((item) => {
    const isPlaying = item.dataset.trackId === _currentTrackId;
    item.classList.toggle('bg-neutral-50', isPlaying);
    item.classList.toggle('dark:bg-neutral-800/60', isPlaying);
    const titleEl = item.querySelector('span.block.text-sm');
    if (titleEl) {
      titleEl.classList.toggle('font-semibold', isPlaying);
      titleEl.classList.toggle('font-medium', !isPlaying);
    }
  });
}

// ── SortableJS ────────────────────────────────────────────────────────────────

function initSortable(list) {
  destroySortable();
  sortable = Sortable.create(list, {
    handle: '.drag-handle',
    animation: 150,
    onEnd: (evt) => {
      if (evt.oldIndex === evt.newIndex) return;
      dispatchCommand({
        type: 'ReorderQueue',
        payload: { from: evt.oldIndex, to: evt.newIndex },
      });
    },
  });
}

function destroySortable() {
  if (sortable) {
    sortable.destroy();
    sortable = null;
  }
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
