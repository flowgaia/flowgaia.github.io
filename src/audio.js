/**
 * audio.js — HTML5 Audio element integration.
 *
 * Responsibilities:
 *  - Create and manage the <audio> element.
 *  - React to WASM events (TrackChanged, PlaybackStateChanged) to play/pause.
 *  - Update shared progress-bar and time elements on timeupdate.
 *  - Watchdog: advance to Next if audio stalls for > 5 s.
 *  - Expose seekTo() for the full-player progress bar.
 */

import { dispatchCommand, onEvent } from './event-bus.js';
import { getDownloaded } from './storage.js';

let audio = null;
let watchdogTimer = null;
let lastCurrentTime = -1;
let lastCheckTime = 0;
/** Blob URL created for the current track (if downloaded); revoked on track change. */
let _activeBlobUrl = null;
/**
 * Tracks what WASM believes the playback state should be.
 * Updated synchronously by PlaybackStateChanged, which fires in the same event
 * batch as TrackChanged — but because the TrackChanged handler is async (awaits
 * getDownloaded), PlaybackStateChanged arrives before the async handler resumes.
 * Reading _intendedState after the await therefore sees the correct final value.
 */
let _intendedState = 'stopped';

// ── Initialise ────────────────────────────────────────────────────────────────

export function initAudio() {
  audio = new Audio();
  audio.preload = 'metadata';

  // ── Playback events ────────────────────────────────────────

  audio.addEventListener('ended', () => {
    dispatchCommand({ type: 'Next' });
  });

  audio.addEventListener('error', (e) => {
    console.error('[audio] error:', e);
    // Small delay so the error doesn't cascade too quickly
    setTimeout(() => dispatchCommand({ type: 'Next' }), 500);
  });

  audio.addEventListener('stalled', () => {
    // Give the browser 3 s to recover before forcing a reload of src
    setTimeout(() => {
      if (audio && audio.readyState < 3 && !audio.paused) {
        console.warn('[audio] stalled — reloading src');
        const src = audio.src;
        audio.src = src;
        audio.play().catch(console.error);
      }
    }, 3000);
  });

  // ── Progress / time updates ────────────────────────────────

  audio.addEventListener('timeupdate', () => {
    const pct = audio.duration > 0 ? audio.currentTime / audio.duration : 0;

    // Update all .progress-bar elements (mini + full player share this class)
    document.querySelectorAll('.progress-bar').forEach((bar) => {
      bar.style.width = `${pct * 100}%`;
    });

    // Update time displays
    document.querySelectorAll('.time-current').forEach((el) => {
      el.textContent = formatTime(audio.currentTime);
    });
    document.querySelectorAll('.time-total').forEach((el) => {
      el.textContent = formatTime(audio.duration || 0);
    });

    // Reset watchdog on every tick
    lastCurrentTime = audio.currentTime;
    lastCheckTime = Date.now();
  });

  // ── Buffering indicator ────────────────────────────────────

  audio.addEventListener('waiting', () => document.body.classList.add('buffering'));
  audio.addEventListener('playing', () => document.body.classList.remove('buffering'));
  audio.addEventListener('canplay', () => document.body.classList.remove('buffering'));

  // ── WASM event handlers ────────────────────────────────────

  onEvent('TrackChanged', async (info) => {
    if (!info?.track_id) return;

    // Revoke any blob URL from the previous track to free memory.
    if (_activeBlobUrl) {
      URL.revokeObjectURL(_activeBlobUrl);
      _activeBlobUrl = null;
    }

    // Prefer a locally-downloaded blob; fall back to the remote URI.
    const downloaded = await getDownloaded(info.track_id);
    let uri;
    if (downloaded?.blob) {
      _activeBlobUrl = URL.createObjectURL(downloaded.blob);
      uri = _activeBlobUrl;
    } else {
      const track = window._musicLibrary?.tracks?.find((t) => t.id === info.track_id);
      uri = track?.uri;
    }

    if (uri) {
      // If a restored seek position is pending, apply it once the browser has
      // loaded enough metadata to accept a currentTime assignment.
      // loadedmetadata fires reliably with preload='metadata' even without play().
      const restoredTime = window._restoredCurrentTime;
      if (restoredTime > 0) {
        delete window._restoredCurrentTime;
        audio.addEventListener(
          'loadedmetadata',
          () => {
            audio.currentTime = restoredTime;
          },
          { once: true },
        );
      }

      audio.src = uri;
      // By the time we reach here (after the await), PlaybackStateChanged has
      // already fired and updated _intendedState.  Play only when WASM intended
      // playing — this prevents autoplay-policy violations on session restore
      // (where WASM restores as "paused", not "playing").
      if (_intendedState === 'playing') {
        audio.play().catch((err) => console.warn('[audio] play() rejected:', err));
      }
    } else {
      // No URI (demo data) — just reset position
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }

    startWatchdog();
  });

  onEvent('PlaybackStateChanged', (state) => {
    _intendedState = state;
    if (state === 'playing') {
      // Only play if audio already has a src set (TrackChanged may still be
      // awaiting getDownloaded, in which case it will call play() itself).
      if (audio.paused && audio.src) {
        audio.play().catch((err) => console.warn('[audio] play() rejected:', err));
      }
    } else if (state === 'paused' || state === 'stopped') {
      audio.pause();
    }
  });

  // Expose element for other modules that need direct access
  window._audio = audio;
}

// ── Watchdog ──────────────────────────────────────────────────────────────────

function startWatchdog() {
  clearInterval(watchdogTimer);
  lastCurrentTime = -1;
  lastCheckTime = Date.now();

  watchdogTimer = setInterval(() => {
    if (!audio || audio.paused || audio.ended || !audio.src) return;

    const now = Date.now();
    if (audio.currentTime === lastCurrentTime && now - lastCheckTime > 8000) {
      console.warn('[audio] watchdog: stalled > 8 s, advancing track');
      clearInterval(watchdogTimer);
      dispatchCommand({ type: 'Next' });
    }
  }, 5000);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Seek to a fractional position (0–1) in the current track.
 *
 * @param {number} fraction - Value between 0 and 1.
 */
export function seekTo(fraction) {
  if (audio && audio.duration && isFinite(audio.duration)) {
    audio.currentTime = fraction * audio.duration;
  }
}

/**
 * Format a duration in seconds as M:SS.
 *
 * @param {number} seconds
 * @returns {string}
 */
export function formatTime(seconds) {
  if (!seconds || !isFinite(seconds) || isNaN(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
