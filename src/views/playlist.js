/**
 * views/playlist.js — Playlist panel.
 *
 * Displays tracks from the currently loaded album/playlist.
 * Handles PlaylistUpdated and DownloadedLoaded events (both carry
 * { tracks, current_position, album_name? }).
 */

import { dispatchCommand, onEvent } from '../event-bus.js';

export function initPlaylist() {
  onEvent('PlaylistUpdated', renderPlaylist);
  onEvent('DownloadedLoaded', renderPlaylist);

  // Highlight the current track when playback changes
  onEvent('TrackChanged', (info) => {
    if (!info?.track_id) return;
    document.querySelectorAll('#playlist-list .track-item').forEach((item) => {
      item.classList.toggle('playing', item.dataset.trackId === info.track_id);
    });
  });
}

// ── Rendering ─────────────────────────────────────────────────────────────────

/**
 * @param {{ tracks: TrackSummary[], current_position: number, album_name?: string }} info
 */
export function renderPlaylist(info) {
  const list = document.getElementById('playlist-list');
  const header = document.getElementById('playlist-album-name');
  if (!list) return;

  if (header && info?.album_name) header.textContent = info.album_name;

  const tracks = info?.tracks || [];

  if (tracks.length === 0) {
    list.innerHTML = '<li class="empty-state">No tracks in playlist</li>';
    return;
  }

  list.innerHTML = tracks
    .map(
      (track, idx) => `
    <li class="track-item${info.current_position === idx ? ' playing' : ''}"
        data-track-id="${escapeAttr(track.id)}"
        data-index="${idx}">
      <span class="track-number">${track.track_number ?? idx + 1}</span>
      <div class="track-info">
        <span class="track-title">${escapeHtml(track.title)}</span>
        <span class="track-artist">${escapeHtml(track.artist)}</span>
      </div>
      <span class="track-duration">${formatDuration(track.duration)}</span>
      <button class="add-to-queue-btn" data-track-id="${escapeAttr(track.id)}" title="Add to queue" aria-label="Add to queue">+Q</button>
    </li>
  `,
    )
    .join('');

  // Play track on row click (but not on the queue button)
  list.querySelectorAll('.track-item').forEach((item) => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.add-to-queue-btn')) return;
      dispatchCommand({ type: 'PlayTrack', payload: item.dataset.trackId });
    });
  });

  // Add to queue button
  list.querySelectorAll('.add-to-queue-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      dispatchCommand({ type: 'AddToQueue', payload: btn.dataset.trackId });
    });
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
