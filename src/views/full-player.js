/**
 * views/full-player.js — Full-screen now-playing overlay.
 *
 * Features:
 *  - Play / Pause, Prev, Next transport controls
 *  - Shuffle and Repeat mode toggles
 *  - Clickable / tappable progress bar with seek support
 *  - Swipe left/right on artwork to skip tracks
 *  - Swipe down anywhere to close
 *  - SVG icon swap for play / pause state
 */

import { dispatchCommand, onEvent } from '../event-bus.js';
import { seekTo } from '../audio.js';

let isPlaying = false;
let repeatMode = 'off';
let shuffleEnabled = false;

// Touch tracking
let touchStartX = 0;
let touchStartY = 0;

export function initFullPlayer() {
  const fullPlayer = document.getElementById('full-player');
  const closeBtn = document.getElementById('full-player-close');
  const playPauseBtn = document.getElementById('full-play-pause');
  const nextBtn = document.getElementById('full-next');
  const prevBtn = document.getElementById('full-prev');
  const shuffleBtn = document.getElementById('full-shuffle');
  const repeatBtn = document.getElementById('full-repeat');
  const progressContainer = document.getElementById('full-progress-container');
  const artwork = document.getElementById('full-artwork');

  // ── Button handlers ─────────────────────────────────────────────────────

  closeBtn?.addEventListener('click', () => fullPlayer?.classList.add('hidden'));

  playPauseBtn?.addEventListener('click', () =>
    dispatchCommand({ type: isPlaying ? 'Pause' : 'Play' }),
  );

  nextBtn?.addEventListener('click', () => dispatchCommand({ type: 'Next' }));

  prevBtn?.addEventListener('click', () => dispatchCommand({ type: 'Previous' }));

  shuffleBtn?.addEventListener('click', () => dispatchCommand({ type: 'ToggleShuffle' }));

  repeatBtn?.addEventListener('click', () => {
    const next = repeatMode === 'off' ? 'all' : repeatMode === 'all' ? 'one' : 'off';
    dispatchCommand({ type: 'SetRepeat', payload: next });
  });

  // ── Progress bar seek ────────────────────────────────────────────────────

  progressContainer?.addEventListener('click', (e) => {
    const rect = progressContainer.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    seekTo(pct);
  });

  // ── Swipe gestures on artwork ─────────────────────────────────────────────

  artwork?.addEventListener(
    'touchstart',
    (e) => {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    },
    { passive: true },
  );

  artwork?.addEventListener(
    'touchend',
    (e) => {
      const dx = e.changedTouches[0].clientX - touchStartX;
      const dy = e.changedTouches[0].clientY - touchStartY;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
        dispatchCommand({ type: dx < 0 ? 'Next' : 'Previous' });
      }
    },
    { passive: true },
  );

  // ── Swipe down to close ───────────────────────────────────────────────────

  fullPlayer?.addEventListener(
    'touchstart',
    (e) => {
      touchStartY = e.touches[0].clientY;
    },
    { passive: true },
  );

  fullPlayer?.addEventListener(
    'touchend',
    (e) => {
      const dy = e.changedTouches[0].clientY - touchStartY;
      if (dy > 100) fullPlayer.classList.add('hidden');
    },
    { passive: true },
  );

  // ── WASM event handlers ───────────────────────────────────────────────────

  onEvent('TrackChanged', (info) => {
    if (!info) return;

    const titleEl = document.getElementById('full-track-title');
    const artistEl = document.getElementById('full-track-artist');
    const albumEl = document.getElementById('full-album-name');
    const artEl = document.getElementById('full-artwork');
    const placeholder = document.querySelector('.full-artwork-placeholder');

    if (titleEl) titleEl.textContent = info.title || 'Unknown';
    if (artistEl) artistEl.textContent = info.artist || '';
    if (albumEl) albumEl.textContent = info.album || '';

    if (artEl) {
      if (info.artwork_url) {
        artEl.src = info.artwork_url;
        artEl.style.display = 'block';
        if (placeholder) placeholder.style.display = 'none';
      } else {
        artEl.style.display = 'none';
        if (placeholder) placeholder.style.display = 'flex';
      }
    }
  });

  onEvent('PlaybackStateChanged', (state) => {
    isPlaying = state === 'playing';
    updatePlayButton(isPlaying);
  });

  onEvent('ShuffleChanged', (enabled) => {
    shuffleEnabled = !!enabled;
    shuffleBtn?.classList.toggle('active', shuffleEnabled);
  });

  onEvent('RepeatChanged', (mode) => {
    repeatMode = mode || 'off';
    updateRepeatButton(repeatMode);
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function updatePlayButton(playing) {
  const playIcon = document.getElementById('full-play-icon');
  const pauseIcon = document.getElementById('full-pause-icon');
  const btn = document.getElementById('full-play-pause');

  if (playIcon) playIcon.classList.toggle('hidden', playing);
  if (pauseIcon) pauseIcon.classList.toggle('hidden', !playing);
  if (btn) btn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
}

function updateRepeatButton(mode) {
  const btn = document.getElementById('full-repeat');
  if (!btn) return;

  // Replace inner SVG / text based on repeat mode.
  // class="w-6 h-6" must be present on every SVG — without it the browser
  // renders the SVG at the default 300 × 150 px, breaking the controls row.
  if (mode === 'one') {
    btn.innerHTML = `
      <svg class="w-6 h-6" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/>
      </svg>
      <span style="position:absolute;font-size:9px;font-weight:700;bottom:4px;right:6px">1</span>
    `;
    btn.style.position = 'relative';
  } else {
    btn.style.position = '';
    btn.innerHTML = `
      <svg class="w-6 h-6" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/>
      </svg>
    `;
  }

  btn.classList.toggle('active', mode !== 'off');
  btn.setAttribute('aria-label', `Repeat: ${mode}`);
}
