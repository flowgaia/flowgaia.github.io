/**
 * media-session.js — Media Session API integration.
 *
 * Keeps the OS lock-screen / notification controls in sync with the
 * WASM playback state and exposes hardware media keys back to the WASM core.
 */

import { dispatchCommand, onEvent } from './event-bus.js';

export function initMediaSession() {
  if (!('mediaSession' in navigator)) {
    console.log('[media-session] MediaSession API not available');
    return;
  }

  // ── Hardware / OS media key handlers ─────────────────────────────────────

  navigator.mediaSession.setActionHandler('play', () => dispatchCommand({ type: 'Play' }));
  navigator.mediaSession.setActionHandler('pause', () => dispatchCommand({ type: 'Pause' }));
  navigator.mediaSession.setActionHandler('previoustrack', () =>
    dispatchCommand({ type: 'Previous' }),
  );
  navigator.mediaSession.setActionHandler('nexttrack', () => dispatchCommand({ type: 'Next' }));

  // seekto / seekbackward / seekforward (best-effort — not all platforms)
  try {
    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (window._audio && details.seekTime != null) {
        window._audio.currentTime = details.seekTime;
      }
    });
  } catch {
    /* not supported on this platform */
  }

  // ── WASM event handlers ───────────────────────────────────────────────────

  onEvent('TrackChanged', (info) => {
    if (!info) return;
    const artwork = info.artwork_url
      ? [{ src: info.artwork_url, sizes: '512x512', type: 'image/jpeg' }]
      : [];

    navigator.mediaSession.metadata = new MediaMetadata({
      title: info.title || 'Unknown Title',
      artist: info.artist || 'Unknown Artist',
      album: info.album || '',
      artwork,
    });

    // Update position state if we have audio duration
    if (window._audio?.duration) {
      updatePositionState();
    }
  });

  onEvent('PlaybackStateChanged', (state) => {
    navigator.mediaSession.playbackState = state === 'playing' ? 'playing' : 'paused';
  });

  // Keep position state fresh on time updates
  // (rate-limited — only update every ~1 s via a flag)
  let positionUpdatePending = false;
  if (window._audio) {
    window._audio.addEventListener('timeupdate', () => {
      if (positionUpdatePending) return;
      positionUpdatePending = true;
      requestAnimationFrame(() => {
        updatePositionState();
        positionUpdatePending = false;
      });
    });
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function updatePositionState() {
  const audio = window._audio;
  if (!audio || !audio.duration || !isFinite(audio.duration)) return;
  try {
    navigator.mediaSession.setPositionState({
      duration: audio.duration,
      playbackRate: audio.playbackRate,
      position: audio.currentTime,
    });
  } catch {
    /* setPositionState may not be available */
  }
}
