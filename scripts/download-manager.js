/**
 * DownloadManager - Orchestrates audio downloads with progress tracking
 *
 * Copyright © 2026 FlowGaia. All rights reserved.
 *
 * This source code is licensed under the copyright of FlowGaia.
 * Unauthorized copying, distribution, or modification is prohibited.
 */
class DownloadManager {
    constructor(storageManager, playbackState) {
        this.storage = storageManager;
        this.state = playbackState;
        this.activeDownloads = new Map(); // songId -> XHR
        this.downloadQueue = [];
        this.maxConcurrent = 2;
        this.listeners = {};
    }

    /**
     * Add event listener
     */
    on(event, callback) {
        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }
        this.listeners[event].push(callback);
    }

    /**
     * Remove event listener
     */
    off(event, callback) {
        if (this.listeners[event]) {
            this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
        }
    }

    /**
     * Emit event
     */
    emit(event, data) {
        if (this.listeners[event]) {
            this.listeners[event].forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`Error in ${event} listener:`, error);
                }
            });
        }
    }

    /**
     * Download a single song
     */
    async downloadSong(song) {
        const { id: songId, audio: audioUrl, title } = song;

        // Check if already downloaded
        const hasAudio = await this.storage.hasAudio(songId);
        if (hasAudio) {
            console.log('⏭️ Song already downloaded:', title);
            return { songId, status: 'already-downloaded' };
        }

        // Check if already downloading
        if (this.activeDownloads.has(songId)) {
            console.log('⏭️ Song already being downloaded:', title);
            return { songId, status: 'already-downloading' };
        }

        // Check storage quota
        const quota = await this.storage.checkQuota();
        if (quota && quota.percentUsed >= 90) {
            console.error('❌ Storage quota exceeded');
            this.emit('quota-exceeded', { songId, quota });
            throw new Error('Storage quota exceeded (90%)');
        }

        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', audioUrl, true);
            xhr.responseType = 'blob';

            // Track active download
            this.activeDownloads.set(songId, xhr);

            // Emit start event
            this.emit('start', { songId, title });

            // Progress handler
            xhr.addEventListener('progress', (event) => {
                if (event.lengthComputable) {
                    const percentComplete = (event.loaded / event.total) * 100;
                    this.emit('progress', {
                        songId,
                        title,
                        loaded: event.loaded,
                        total: event.total,
                        percent: percentComplete
                    });
                }
            });

            // Load handler (success)
            xhr.addEventListener('load', async () => {
                this.activeDownloads.delete(songId);

                if (xhr.status === 200) {
                    try {
                        const blob = xhr.response;
                        const mimeType = xhr.getResponseHeader('Content-Type') || 'audio/mpeg';

                        // Store in IndexedDB
                        await this.storage.storeAudio(songId, blob, mimeType);

                        // Update metadata in localStorage
                        this.state.markSongDownloaded(songId, blob.size);

                        this.emit('complete', { songId, title, size: blob.size });
                        resolve({ songId, status: 'success', size: blob.size });
                    } catch (error) {
                        console.error('❌ Failed to store audio:', error);
                        this.emit('error', { songId, title, error: error.message });
                        reject(error);
                    }
                } else {
                    const error = `HTTP ${xhr.status}: ${xhr.statusText}`;
                    console.error('❌ Download failed:', error);
                    this.emit('error', { songId, title, error });
                    reject(new Error(error));
                }

                // Process next in queue
                this.processQueue();
            });

            // Error handler
            xhr.addEventListener('error', () => {
                this.activeDownloads.delete(songId);
                const error = 'Network error';
                console.error('❌ Download error:', error);
                this.emit('error', { songId, title, error });
                reject(new Error(error));
                this.processQueue();
            });

            // Abort handler
            xhr.addEventListener('abort', () => {
                this.activeDownloads.delete(songId);
                console.log('⏹️ Download cancelled:', title);
                this.emit('cancelled', { songId, title });
                resolve({ songId, status: 'cancelled' });
                this.processQueue();
            });

            // Start download
            xhr.send();
        });
    }

    /**
     * Download multiple songs (batch)
     */
    async downloadMultiple(songs, options = {}) {
        const { onProgress, onComplete, onError } = options;

        this.emit('batch-start', { total: songs.length });

        const results = [];
        let completed = 0;
        let failed = 0;

        // Add to queue
        for (const song of songs) {
            this.downloadQueue.push(song);
        }

        // Process queue
        this.processQueue();

        // Wait for all downloads
        const promises = songs.map(async (song) => {
            try {
                const result = await this.downloadSong(song);
                completed++;
                if (onProgress) {
                    onProgress({ completed, failed, total: songs.length });
                }
                results.push(result);
                return result;
            } catch (error) {
                failed++;
                if (onError) {
                    onError({ song, error });
                }
                if (onProgress) {
                    onProgress({ completed, failed, total: songs.length });
                }
                results.push({ songId: song.id, status: 'failed', error: error.message });
                return { songId: song.id, status: 'failed', error };
            }
        });

        await Promise.allSettled(promises);

        if (onComplete) {
            onComplete({ completed, failed, total: songs.length });
        }

        this.emit('batch-complete', { completed, failed, total: songs.length, results });

        return results;
    }

    /**
     * Process download queue
     */
    processQueue() {
        // Start downloads up to max concurrent
        while (
            this.downloadQueue.length > 0 &&
            this.activeDownloads.size < this.maxConcurrent
        ) {
            const song = this.downloadQueue.shift();
            this.downloadSong(song).catch(error => {
                console.error('Queue download failed:', error);
            });
        }
    }

    /**
     * Cancel active download
     */
    cancelDownload(songId) {
        const xhr = this.activeDownloads.get(songId);
        if (xhr) {
            xhr.abort();
            return true;
        }
        return false;
    }

    /**
     * Cancel all active downloads
     */
    cancelAll() {
        for (const [songId, xhr] of this.activeDownloads.entries()) {
            xhr.abort();
        }
        this.downloadQueue = [];
    }

    /**
     * Delete downloaded song
     */
    async deleteSong(songId) {
        try {
            // Delete from IndexedDB
            await this.storage.deleteAudio(songId);

            // Remove metadata
            this.state.removeSongDownloaded(songId);

            this.emit('deleted', { songId });

            return { success: true };
        } catch (error) {
            console.error('❌ Failed to delete song:', error);
            throw error;
        }
    }

    /**
     * Get download status for a song
     */
    getDownloadStatus(songId) {
        if (this.activeDownloads.has(songId)) {
            return 'downloading';
        }

        if (this.state.isSongDownloaded(songId)) {
            return 'downloaded';
        }

        return 'not-downloaded';
    }

    /**
     * Get statistics
     */
    async getStats() {
        const storageStats = await this.storage.getStorageStats();
        const quota = await this.storage.checkQuota();

        return {
            downloaded: storageStats.count,
            totalSize: storageStats.size,
            totalSizeFormatted: storageStats.sizeFormatted,
            activeDownloads: this.activeDownloads.size,
            queuedDownloads: this.downloadQueue.length,
            quota: quota
        };
    }

    /**
     * Clear all downloads
     */
    async clearAll() {
        // Cancel active downloads
        this.cancelAll();

        // Clear IndexedDB
        await this.storage.clearAll();

        // Clear metadata
        this.state.clearDownloadMetadata();

        this.emit('cleared', {});

        console.log('✅ All downloads cleared');
    }
}
