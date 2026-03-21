/**
 * views/albums.js — Albums grid panel.
 *
 * Renders a 2-column (mobile) grid of album cards from the global
 * music library cache.  Clicking a card loads the album into the WASM
 * playlist and switches to the Playlist tab.
 */

import { dispatchCommand } from '../event-bus.js';

// initAlbums is a no-op: the initial render is driven by app.js calling
// renderAlbumGrid(data.albums) directly after loadLibrary() resolves.
// The album catalogue never changes after load, so no event listener is needed.
export function initAlbums() {}

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
    <div class="album-card cursor-pointer rounded-lg overflow-hidden bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors" data-album-id="${escapeAttr(album.id)}">
      <div class="aspect-square w-full overflow-hidden bg-neutral-200 dark:bg-neutral-700">
        ${
          album.artwork_url
            ? `<img src="${escapeAttr(album.artwork_url)}" alt="${escapeAttr(album.name)}" loading="lazy" class="w-full h-full object-cover">`
            : `<div class="w-full h-full flex items-center justify-center text-neutral-400 dark:text-neutral-600">
                 <svg class="w-12 h-12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                   <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
                 </svg>
               </div>`
        }
      </div>
      <div class="p-2">
        <div class="text-sm font-medium truncate text-neutral-900 dark:text-neutral-100">${escapeHtml(album.name)}</div>
        <div class="text-xs text-neutral-500 dark:text-neutral-400 truncate mt-0.5">${escapeHtml(album.artist)}</div>
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
