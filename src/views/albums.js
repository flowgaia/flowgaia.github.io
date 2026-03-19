/**
 * views/albums.js — Albums grid panel.
 *
 * Renders a 2-column (mobile) grid of album cards from the global
 * music library cache.  Clicking a card loads the album into the WASM
 * playlist and switches to the Playlist tab.
 */

import { dispatchCommand, onEvent } from '../event-bus.js';

export function initAlbums() {
  // Re-render whenever the library is updated (LoadAlbums fires LoadTracks too)
  onEvent('*', (event) => {
    // Render on any event that might have changed the library
    if (
      event.type === 'PlaylistUpdated' ||
      event.type === 'TrackChanged' ||
      event.type === 'QueueUpdated'
    ) {
      renderAlbumGrid(window._musicLibrary?.albums || []);
    }
  });

  // dispatchCommand LoadAlbums events ultimately come back as PlaylistUpdated or
  // similar from the core; we also do an initial render after the library loads.
  // For robustness, do an initial render attempt now (may be empty) and again
  // on the LoadAlbums command path by watching the global.
  const tryInitialRender = () => {
    const albums = window._musicLibrary?.albums || [];
    if (albums.length > 0) renderAlbumGrid(albums);
  };

  // Poll briefly on startup to catch the library being set before events fire
  let attempts = 0;
  const pollId = setInterval(() => {
    attempts++;
    tryInitialRender();
    if ((window._musicLibrary?.albums?.length ?? 0) > 0 || attempts > 20) {
      clearInterval(pollId);
    }
  }, 100);
}

// ── Exported so app.js / other modules can trigger a re-render directly ──────

/**
 * Render album cards into #album-grid.
 *
 * @param {Array<{id: string, name: string, artist: string, artwork_url: string}>} albums
 */
export function renderAlbumGrid(albums) {
  const grid = document.getElementById('album-grid');
  if (!grid) return;

  if (!albums || albums.length === 0) {
    grid.innerHTML = '<p class="empty-state">No albums found</p>';
    return;
  }

  grid.innerHTML = albums
    .map(
      (album) => `
    <div class="album-card" data-album-id="${escapeAttr(album.id)}">
      <div class="album-art">
        ${
          album.artwork_url
            ? `<img src="${escapeAttr(album.artwork_url)}" alt="${escapeAttr(album.name)}" loading="lazy">`
            : `<div class="album-art-placeholder">
                 <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                   <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
                 </svg>
               </div>`
        }
      </div>
      <div class="album-info">
        <div class="album-name">${escapeHtml(album.name)}</div>
        <div class="album-artist">${escapeHtml(album.artist)}</div>
      </div>
    </div>
  `,
    )
    .join('');

  // Wire up click handlers
  grid.querySelectorAll('.album-card').forEach((card) => {
    card.addEventListener('click', () => {
      const albumId = card.dataset.albumId;
      dispatchCommand({ type: 'LoadAlbum', payload: albumId });
      // Navigate to Playlist tab
      document.querySelector('.tab[data-tab="playlist"]')?.click();
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
