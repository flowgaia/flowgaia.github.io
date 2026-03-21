/**
 * download-manager.js — Track download and removal logic.
 *
 * Handles fetching audio blobs, persisting them to IndexedDB via storage.js,
 * and keeping the WASM core informed via SetDownloaded commands.
 *
 * All functions are async.  UI components import and call these directly.
 */

import { saveDownloaded, removeDownloaded, getAllDownloadedIds } from './storage.js';
import { dispatchCommand } from './event-bus.js';

/** Track IDs currently being fetched, to prevent duplicate downloads. */
const _active = new Set();

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Download a single track and persist it to IndexedDB.
 *
 * @param {string}   trackId  - Track ID (used as IndexedDB key).
 * @param {string}   uri      - Remote URL to fetch the audio from.
 * @param {Function} [onStart]    - Called with (trackId) when fetch begins.
 * @param {Function} [onComplete] - Called with (trackId) on success.
 * @param {Function} [onError]    - Called with (trackId, err) on failure.
 */
export async function downloadTrack(trackId, uri, onStart, onComplete, onError) {
  if (_active.has(trackId)) return; // already in progress
  _active.add(trackId);
  onStart?.(trackId);

  try {
    const response = await fetch(uri);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    await saveDownloaded(trackId, blob);
    _active.delete(trackId);
    await _syncDownloaded();
    onComplete?.(trackId);
  } catch (err) {
    _active.delete(trackId);
    console.error('[download-manager] downloadTrack failed:', err);
    onError?.(trackId, err);
  }
}

/**
 * Download all tracks in an album sequentially.
 *
 * @param {Array<{id: string, uri: string}>} tracks
 * @param {Function} [onProgress] - Called with (completedCount, totalCount) after each track.
 */
export async function downloadAlbum(tracks, onProgress) {
  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i];
    if (!t.uri) continue;
    await downloadTrack(t.id, t.uri);
    onProgress?.(i + 1, tracks.length);
  }
}

/**
 * Remove a downloaded track from IndexedDB and update the WASM core.
 *
 * @param {string} trackId
 */
export async function removeDownload(trackId) {
  await removeDownloaded(trackId);
  await _syncDownloaded();
}

/**
 * Remove all downloaded tracks for an album from IndexedDB and update the WASM core.
 *
 * @param {string[]} trackIds - IDs of every track in the album to remove.
 */
export async function removeAlbumDownloads(trackIds) {
  for (const id of trackIds) {
    await removeDownloaded(id);
  }
  await _syncDownloaded();
}

/**
 * Returns true if `trackId` is currently being downloaded.
 *
 * @param {string} trackId
 * @returns {boolean}
 */
export function isDownloading(trackId) {
  return _active.has(trackId);
}

// ── Internal ──────────────────────────────────────────────────────────────────

/** Re-read all downloaded IDs from IndexedDB and push to WASM core. */
async function _syncDownloaded() {
  const ids = await getAllDownloadedIds();
  dispatchCommand({ type: 'SetDownloaded', payload: ids });
}
