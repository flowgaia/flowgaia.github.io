/**
 * views/mini-player.js — Persistent mini player bar.
 *
 * Sits above the tab bar.  Tapping anywhere except the play/pause button
 * opens the full-screen player.  Prev / Next buttons are also provided.
 */

import { dispatchCommand, onEvent } from '../event-bus.js';

let isPlaying = false;

export function initMiniPlayer() {
  const miniPlayer  = document.getElementById('mini-player');
  const playPauseBtn = document.getElementById('mini-play-pause');
  const prevBtn     = document.getElementById('mini-prev');
  const nextBtn     = document.getElementById('mini-next');

  // Tap on mini player body → open full player
  miniPlayer?.addEventListener('click', (e) => {
    const isControl =
      e.target.closest('#mini-play-pause') ||
      e.target.closest('#mini-prev')       ||
      e.target.closest('#mini-next');
    if (!isControl) {
      document.getElementById('full-player')?.classList.remove('hidden');
    }
  });

  // Transport controls
  playPauseBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    dispatchCommand({ type: isPlaying ? 'Pause' : 'Play' });
  });

  prevBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    dispatchCommand({ type: 'Previous' });
  });

  nextBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    dispatchCommand({ type: 'Next' });
  });

  // ── WASM event handlers ─────────────────────────────────────────────────

  onEvent('TrackChanged', (info) => {
    if (!info) return;

    const titleEl  = document.getElementById('mini-track-title');
    const artistEl = document.getElementById('mini-track-artist');
    const artEl    = document.getElementById('mini-artwork');
    const placeholder = miniPlayer?.querySelector('.mini-artwork-placeholder');

    if (titleEl)  titleEl.textContent  = info.title  || 'Unknown';
    if (artistEl) artistEl.textContent = info.artist || '';

    if (artEl) {
      if (info.artwork_url) {
        artEl.src = info.artwork_url;
        artEl.style.display  = 'block';
        if (placeholder) placeholder.style.display = 'none';
      } else {
        artEl.style.display  = 'none';
        if (placeholder) placeholder.style.display = 'flex';
      }
    }

    // Show the mini player bar the first time a track loads
    miniPlayer?.classList.remove('hidden');
  });

  onEvent('PlaybackStateChanged', (state) => {
    isPlaying = state === 'playing';
    updatePlayButton(isPlaying);
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function updatePlayButton(playing) {
  const btn = document.getElementById('mini-play-pause');
  if (!btn) return;
  btn.textContent = playing ? '⏸' : '▶';
  btn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
}
