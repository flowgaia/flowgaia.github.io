/**
 * storage.js — IndexedDB persistence layer.
 *
 * Stores:
 *   - 'state'      (key/value)  : player state (last track id, volume, etc.)
 *   - 'downloaded' (keyPath=id) : cached audio blobs for offline playback
 */

const DB_NAME = 'music-player';
const DB_VERSION = 1;

let db = null;

// ── Database initialisation ───────────────────────────────────────────────────

async function getDb() {
  if (db) return db;

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const database = e.target.result;
      if (!database.objectStoreNames.contains('state')) {
        database.createObjectStore('state');
      }
      if (!database.objectStoreNames.contains('downloaded')) {
        database.createObjectStore('downloaded', { keyPath: 'id' });
      }
    };

    req.onsuccess = (e) => {
      db = e.target.result;
      resolve(db);
    };

    req.onerror = (e) => reject(e.target.error);
  });
}

// ── Player state ──────────────────────────────────────────────────────────────

/**
 * Persist arbitrary player state object.
 *
 * @param {object} state
 */
export async function saveState(state) {
  try {
    const d = await getDb();
    const tx = d.transaction('state', 'readwrite');
    tx.objectStore('state').put(state, 'playerState');
    await txComplete(tx);
  } catch (e) {
    console.error('[storage] saveState error:', e);
  }
}

/**
 * Load the last saved player state.
 *
 * @returns {Promise<object|null>}
 */
export async function loadState() {
  try {
    const d = await getDb();
    const tx = d.transaction('state', 'readonly');
    const store = tx.objectStore('state');
    return await storeGet(store, 'playerState');
  } catch {
    return null;
  }
}

// ── Downloaded tracks ─────────────────────────────────────────────────────────

/**
 * Persist a downloaded audio blob.
 *
 * @param {string} id    - Track ID (also the keyPath).
 * @param {Blob}   blob  - Audio data.
 */
export async function saveDownloaded(id, blob) {
  try {
    const d = await getDb();
    const tx = d.transaction('downloaded', 'readwrite');
    tx.objectStore('downloaded').put({ id, blob, savedAt: Date.now() });
    await txComplete(tx);
  } catch (e) {
    console.error('[storage] saveDownloaded error:', e);
  }
}

/**
 * Retrieve a single downloaded track record.
 *
 * @param {string} id
 * @returns {Promise<{id: string, blob: Blob, savedAt: number}|null>}
 */
export async function getDownloaded(id) {
  try {
    const d = await getDb();
    const tx = d.transaction('downloaded', 'readonly');
    return await storeGet(tx.objectStore('downloaded'), id);
  } catch {
    return null;
  }
}

/**
 * Return all downloaded track IDs.
 *
 * @returns {Promise<string[]>}
 */
export async function getAllDownloadedIds() {
  try {
    const d = await getDb();
    const tx = d.transaction('downloaded', 'readonly');
    return await new Promise((resolve) => {
      const req = tx.objectStore('downloaded').getAllKeys();
      req.onsuccess = (e) => resolve(e.target.result || []);
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

/**
 * Delete a downloaded track record.
 *
 * @param {string} id
 */
export async function removeDownloaded(id) {
  try {
    const d = await getDb();
    const tx = d.transaction('downloaded', 'readwrite');
    tx.objectStore('downloaded').delete(id);
    await txComplete(tx);
  } catch (e) {
    console.error('[storage] removeDownloaded error:', e);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function txComplete(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function storeGet(store, key) {
  return new Promise((resolve) => {
    const req = store.get(key);
    req.onsuccess = (e) => resolve(e.target.result ?? null);
    req.onerror = () => resolve(null);
  });
}
