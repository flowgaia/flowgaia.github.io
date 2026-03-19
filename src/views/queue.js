/**
 * views/queue.js — Queue panel with drag-and-drop reordering via SortableJS.
 */

import Sortable from 'sortablejs';
import { dispatchCommand, onEvent } from '../event-bus.js';

let sortable = null;

export function initQueue() {
  onEvent('QueueUpdated', renderQueue);
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
    .map(
      (track, idx) => `
    <li class="track-item queue-item${info.current_position === idx ? ' playing' : ''}"
        data-track-id="${escapeAttr(track.id)}"
        data-index="${idx}">
      <span class="drag-handle" aria-label="Drag to reorder">⠿</span>
      <div class="track-info">
        <span class="track-title">${escapeHtml(track.title)}</span>
        <span class="track-artist">${escapeHtml(track.artist)}</span>
      </div>
      <span class="track-duration">${formatDuration(track.duration)}</span>
      <button class="remove-from-queue-btn"
              data-index="${idx}"
              title="Remove from queue"
              aria-label="Remove from queue">✕</button>
    </li>
  `,
    )
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
