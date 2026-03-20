/**
 * views/playlist.js — Playlist panel.
 *
 * Displays the currently loaded album/playlist with:
 *  - Album artwork header, album name, artist, track count, total duration
 *  - "Play All" and "Download Album" action buttons
 *  - Track rows with ShadCN-style Tailwind: playing indicator, hover states,
 *    Add-to-Queue and per-track Download buttons
 *  - Mobile-responsive layout (duration hidden on small screens)
 *
 * Handles PlaylistUpdated and DownloadedLoaded events (both carry
 * { tracks, current_position, album_name?, album_id? }).
 */

import { dispatchCommand, onEvent } from '../event-bus.js';
import { downloadTrack, downloadAlbum, isDownloading } from '../download-manager.js';

/** Cache the last rendered playlist info so download state updates can re-render. */
let _lastInfo = null;

export function initPlaylist() {
  onEvent('PlaylistUpdated', (info) => {
    _lastInfo = info;
    renderPlaylist(info);
  });
  onEvent('DownloadedLoaded', (info) => {
    _lastInfo = info;
    renderPlaylist(info);
  });

  // Highlight the current track when playback changes.
  onEvent('TrackChanged', (info) => {
    if (!info?.track_id) return;
    document.querySelectorAll('#playlist-list .track-row').forEach((row) => {
      const playing = row.dataset.trackId === info.track_id;
      row.classList.toggle('playing', playing);
      // Accent the track number for the playing row.
      const numEl = row.querySelector('.track-num');
      if (numEl) {
        numEl.classList.toggle('text-neutral-900', playing);
        numEl.classList.toggle('dark:text-neutral-100', playing);
        numEl.classList.toggle('font-bold', playing);
        numEl.classList.toggle('text-neutral-400', !playing);
        numEl.classList.toggle('dark:text-neutral-500', !playing);
      }
      // Bold the title for the playing row.
      const titleEl = row.querySelector('.track-title');
      if (titleEl) titleEl.classList.toggle('font-semibold', playing);
    });
  });

  // "Download Album" button wired up in renderPlaylist via event delegation.
}

// ── Rendering ─────────────────────────────────────────────────────────────────

/**
 * @param {{ tracks: TrackSummary[], current_position: number|null, album_name?: string, album_id?: string }} info
 */
export function renderPlaylist(info) {
  const panel = document.getElementById('panel-playlist');
  if (!panel) return;

  const tracks = info?.tracks || [];
  const albumId = info?.album_id ?? null;
  const albumName = info?.album_name ?? 'Playlist';

  // Look up full album details (artwork, artist) from the music library cache.
  const albumMeta = albumId ? window._musicLibrary?.albums?.find((a) => a.id === albumId) : null;
  const artworkUrl = albumMeta?.artwork_url ?? '';
  const artist = albumMeta?.artist ?? tracks[0]?.artist ?? '';
  const totalDuration = tracks.reduce((s, t) => s + (t.duration || 0), 0);

  // ── Rebuild header ──────────────────────────────────────────────────────────
  let header = document.getElementById('playlist-header');
  if (!header) {
    header = document.createElement('div');
    header.id = 'playlist-header';
    panel.insertBefore(header, panel.firstChild);
  }

  header.innerHTML = `
    <div class="flex gap-4 p-4 pb-3">
      <!-- Album artwork -->
      <div class="w-20 h-20 sm:w-24 sm:h-24 flex-shrink-0 rounded-lg overflow-hidden bg-neutral-100 dark:bg-neutral-800 shadow-sm">
        ${
          artworkUrl
            ? `<img src="${escapeAttr(artworkUrl)}" alt="${escapeAttr(albumName)}" loading="lazy" class="w-full h-full object-cover">`
            : `<div class="w-full h-full flex items-center justify-center text-neutral-300 dark:text-neutral-600">
                 <svg class="w-8 h-8" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                   <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
                 </svg>
               </div>`
        }
      </div>
      <!-- Album meta -->
      <div class="flex-1 min-w-0 flex flex-col justify-between py-0.5">
        <div>
          <h2 id="playlist-album-name" class="text-base font-semibold text-neutral-900 dark:text-neutral-100 truncate">${escapeHtml(albumName)}</h2>
          <p class="text-sm text-neutral-500 dark:text-neutral-400 truncate mt-0.5">${escapeHtml(artist)}</p>
          <p class="text-xs text-neutral-400 dark:text-neutral-500 mt-0.5">
            ${tracks.length} track${tracks.length !== 1 ? 's' : ''} &middot; ${formatDuration(totalDuration)}
          </p>
        </div>
        <!-- Actions -->
        <div class="flex gap-2 mt-2">
          <button id="btn-play-all"
            class="text-xs px-3 py-1.5 rounded-md bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 font-medium hover:opacity-90 transition-opacity">
            Play All
          </button>
          <button id="btn-download-album"
            class="text-xs px-3 py-1.5 rounded-md bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 font-medium hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
            ${!albumId ? 'disabled title="No album loaded"' : ''}>
            <span id="download-album-label">Download Album</span>
          </button>
        </div>
      </div>
    </div>
    <div class="h-px bg-neutral-100 dark:bg-neutral-800 mx-4"></div>
  `;

  // Wire "Play All" — play the first track.
  header.querySelector('#btn-play-all')?.addEventListener('click', () => {
    if (tracks.length > 0) {
      dispatchCommand({ type: 'PlayTrack', payload: tracks[0].id });
    }
  });

  // Wire "Download Album".
  header.querySelector('#btn-download-album')?.addEventListener('click', async () => {
    if (!albumId) return;
    const btn = header.querySelector('#btn-download-album');
    const label = header.querySelector('#download-album-label');
    if (!btn || !label) return;
    btn.disabled = true;

    // Resolve URIs from the music library cache.
    const tracksWithUri = tracks.map((t) => ({
      id: t.id,
      uri: window._musicLibrary?.tracks?.find((lt) => lt.id === t.id)?.uri ?? '',
    }));

    await downloadAlbum(tracksWithUri, (done, total) => {
      label.textContent = `Downloading ${done}/${total}…`;
    });

    label.textContent = 'Download Album';
    btn.disabled = false;
    // Mutate cached info to mark all album tracks as downloaded, then re-render.
    if (_lastInfo) {
      // Only mark tracks that actually have a URI — downloadAlbum skips URI-less tracks.
      const downloadedIds = new Set(tracksWithUri.filter((t) => t.uri).map((t) => t.id));
      _lastInfo.tracks.forEach((t) => {
        if (downloadedIds.has(t.id)) t.is_downloaded = true;
      });
      renderPlaylist(_lastInfo);
    }
  });

  // ── Track list ──────────────────────────────────────────────────────────────
  const list = document.getElementById('playlist-list');
  if (!list) return;

  if (tracks.length === 0) {
    list.innerHTML =
      '<li class="py-8 text-center text-sm text-neutral-400 dark:text-neutral-500">No tracks in playlist</li>';
    return;
  }

  list.innerHTML = tracks
    .map((track, idx) => {
      const isPlaying = info.current_position === idx;
      const isDownloaded = track.is_downloaded;
      const downloading = isDownloading(track.id);
      return `
      <li class="track-row flex items-center gap-3 px-4 py-2.5 cursor-pointer
                 hover:bg-neutral-50 dark:hover:bg-neutral-800/60 transition-colors
                 ${isPlaying ? 'playing bg-neutral-50 dark:bg-neutral-800/60' : ''}"
          data-track-id="${escapeAttr(track.id)}"
          data-index="${idx}">
        <!-- Track number / playing indicator -->
        <span class="track-num w-5 text-center text-xs tabular-nums flex-shrink-0
                     ${isPlaying ? 'text-neutral-900 dark:text-neutral-100 font-bold' : 'text-neutral-400 dark:text-neutral-500'}">
          ${
            isPlaying
              ? `<svg class="w-3 h-3 mx-auto" viewBox="0 0 24 24" fill="currentColor" aria-label="Playing">
                 <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
               </svg>`
              : String(track.track_number ?? idx + 1)
          }
        </span>
        <!-- Track info -->
        <div class="flex-1 min-w-0">
          <span class="track-title block text-sm ${isPlaying ? 'font-semibold' : 'font-medium'} text-neutral-900 dark:text-neutral-100 truncate">
            ${escapeHtml(track.title)}
          </span>
          <span class="block text-xs text-neutral-500 dark:text-neutral-400 truncate">${escapeHtml(track.artist)}</span>
        </div>
        <!-- Duration (hidden on very small screens) -->
        <span class="hidden xs:inline text-xs text-neutral-400 dark:text-neutral-500 tabular-nums flex-shrink-0">
          ${formatDuration(track.duration)}
        </span>
        <!-- Action buttons -->
        <div class="flex items-center gap-1 flex-shrink-0">
          <button class="add-to-queue-btn p-1.5 rounded text-neutral-400 dark:text-neutral-500
                         hover:text-neutral-700 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700
                         transition-colors text-xs font-medium"
                  data-track-id="${escapeAttr(track.id)}"
                  title="Add to queue" aria-label="Add to queue">
            +Q
          </button>
          <button class="download-btn p-1.5 rounded transition-colors
                         ${
                           isDownloaded
                             ? 'text-green-600 dark:text-green-400'
                             : 'text-neutral-400 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700'
                         }"
                  data-track-id="${escapeAttr(track.id)}"
                  title="${isDownloaded ? 'Downloaded' : 'Download track'}"
                  aria-label="${isDownloaded ? 'Downloaded' : 'Download track'}"
                  ${isDownloaded ? 'disabled' : ''}>
            ${
              isDownloaded
                ? `<svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                   <path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/>
                 </svg>`
                : downloading
                  ? `<svg class="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                   <circle cx="12" cy="12" r="10" stroke-opacity=".25"/>
                   <path d="M12 2a10 10 0 0 1 10 10" stroke-opacity="1"/>
                 </svg>`
                  : `<svg class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                   <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z"/>
                 </svg>`
            }
          </button>
        </div>
      </li>
    `;
    })
    .join('');

  // ── Event delegation ────────────────────────────────────────────────────────

  list.querySelectorAll('.track-row').forEach((row) => {
    row.addEventListener('click', (e) => {
      // Ignore clicks on action buttons.
      if (e.target.closest('.add-to-queue-btn, .download-btn')) return;
      dispatchCommand({ type: 'PlayTrack', payload: row.dataset.trackId });
    });
  });

  list.querySelectorAll('.add-to-queue-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      dispatchCommand({ type: 'AddToQueue', payload: btn.dataset.trackId });
    });
  });

  list.querySelectorAll('.download-btn:not([disabled])').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const trackId = btn.dataset.trackId;
      const uri = window._musicLibrary?.tracks?.find((t) => t.id === trackId)?.uri;
      if (!uri) return;

      // Replace button with spinner immediately.
      btn.innerHTML = `<svg class="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10" stroke-opacity=".25"/>
        <path d="M12 2a10 10 0 0 1 10 10" stroke-opacity="1"/>
      </svg>`;
      btn.disabled = true;

      downloadTrack(
        trackId,
        uri,
        null,
        () => {
          // Mutate cached info so the re-render shows the checkmark.
          // (SetDownloaded emits no WASM events, so _lastInfo won't be refreshed otherwise.)
          if (_lastInfo) {
            const t = _lastInfo.tracks.find((tr) => tr.id === trackId);
            if (t) t.is_downloaded = true;
            renderPlaylist(_lastInfo);
          }
        },
        (id, err) => {
          console.error('[playlist] download failed for', id, err);
          if (_lastInfo) renderPlaylist(_lastInfo);
        },
      );
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
