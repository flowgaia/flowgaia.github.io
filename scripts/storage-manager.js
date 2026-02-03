/**
 * StorageManager - IndexedDB wrapper for audio blob storage
 *
 * Copyright © 2026 FlowGaia. All rights reserved.
 *
 * This source code is licensed under the copyright of FlowGaia.
 * Unauthorized copying, distribution, or modification is prohibited.
 */
class StorageManager {
    constructor() {
        this.dbName = 'flowgaia-audio';
        this.dbVersion = 1;
        this.storeName = 'audio';
        this.db = null;
    }

    /**
     * Initialize IndexedDB
     */
    init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = () => {
                console.error('❌ IndexedDB open failed:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                console.log('✅ IndexedDB initialized');
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Create object store if it doesn't exist
                if (!db.objectStoreNames.contains(this.storeName)) {
                    const objectStore = db.createObjectStore(this.storeName, { keyPath: 'songId' });
                    objectStore.createIndex('downloadedAt', 'downloadedAt', { unique: false });
                    objectStore.createIndex('lastAccessedAt', 'lastAccessedAt', { unique: false });
                    console.log('✅ Object store created:', this.storeName);
                }
            };
        });
    }

    /**
     * Store audio blob in IndexedDB
     */
    storeAudio(songId, blob, mimeType) {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('Database not initialized'));
                return;
            }

            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const objectStore = transaction.objectStore(this.storeName);

            const record = {
                songId: songId,
                blob: blob,
                size: blob.size,
                mimeType: mimeType || 'audio/mpeg',
                downloadedAt: new Date().toISOString(),
                lastAccessedAt: new Date().toISOString()
            };

            const request = objectStore.put(record);

            request.onsuccess = () => {
                console.log('✅ Audio stored:', songId, `(${(blob.size / 1024 / 1024).toFixed(2)} MB)`);
                resolve(record);
            };

            request.onerror = () => {
                console.error('❌ Store audio failed:', request.error);
                reject(request.error);
            };
        });
    }

    /**
     * Retrieve audio blob from IndexedDB
     */
    getAudio(songId) {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('Database not initialized'));
                return;
            }

            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const objectStore = transaction.objectStore(this.storeName);
            const request = objectStore.get(songId);

            request.onsuccess = () => {
                const record = request.result;
                if (record) {
                    // Update last accessed time
                    record.lastAccessedAt = new Date().toISOString();
                    objectStore.put(record);
                    resolve(record);
                } else {
                    resolve(null);
                }
            };

            request.onerror = () => {
                console.error('❌ Get audio failed:', request.error);
                reject(request.error);
            };
        });
    }

    /**
     * Check if audio is cached
     */
    hasAudio(songId) {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('Database not initialized'));
                return;
            }

            const transaction = this.db.transaction([this.storeName], 'readonly');
            const objectStore = transaction.objectStore(this.storeName);
            const request = objectStore.getKey(songId);

            request.onsuccess = () => {
                resolve(request.result !== undefined);
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    /**
     * Delete audio from IndexedDB
     */
    deleteAudio(songId) {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('Database not initialized'));
                return;
            }

            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const objectStore = transaction.objectStore(this.storeName);
            const request = objectStore.delete(songId);

            request.onsuccess = () => {
                console.log('✅ Audio deleted:', songId);
                resolve();
            };

            request.onerror = () => {
                console.error('❌ Delete audio failed:', request.error);
                reject(request.error);
            };
        });
    }

    /**
     * Get all stored audio records
     */
    getAllAudio() {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('Database not initialized'));
                return;
            }

            const transaction = this.db.transaction([this.storeName], 'readonly');
            const objectStore = transaction.objectStore(this.storeName);
            const request = objectStore.getAll();

            request.onsuccess = () => {
                resolve(request.result);
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    /**
     * Get storage statistics
     */
    async getStorageStats() {
        const records = await this.getAllAudio();
        const totalSize = records.reduce((sum, record) => sum + record.size, 0);

        return {
            count: records.length,
            size: totalSize,
            sizeFormatted: this.formatBytes(totalSize),
            songs: records.map(r => ({
                songId: r.songId,
                size: r.size,
                sizeFormatted: this.formatBytes(r.size),
                downloadedAt: r.downloadedAt,
                lastAccessedAt: r.lastAccessedAt
            }))
        };
    }

    /**
     * Check storage quota
     */
    async checkQuota() {
        if (navigator.storage && navigator.storage.estimate) {
            const estimate = await navigator.storage.estimate();
            const used = estimate.usage || 0;
            const total = estimate.quota || 0;
            const available = total - used;
            const percentUsed = total > 0 ? (used / total) * 100 : 0;

            return {
                used: used,
                total: total,
                available: available,
                percentUsed: percentUsed,
                usedFormatted: this.formatBytes(used),
                totalFormatted: this.formatBytes(total),
                availableFormatted: this.formatBytes(available)
            };
        }

        return null;
    }

    /**
     * Clear all stored audio
     */
    async clearAll() {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('Database not initialized'));
                return;
            }

            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const objectStore = transaction.objectStore(this.storeName);
            const request = objectStore.clear();

            request.onsuccess = () => {
                console.log('✅ All audio cleared from storage');
                resolve();
            };

            request.onerror = () => {
                console.error('❌ Clear all failed:', request.error);
                reject(request.error);
            };
        });
    }

    /**
     * Format bytes to human-readable string
     */
    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';

        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * Close database connection
     */
    close() {
        if (this.db) {
            this.db.close();
            this.db = null;
            console.log('✅ Database connection closed');
        }
    }
}
