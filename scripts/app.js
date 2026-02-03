/**
 * App - Main application logic
 *
 * Copyright © 2026 FlowGaia. All rights reserved.
 *
 * This source code is licensed under the copyright of FlowGaia.
 * Unauthorized copying, distribution, or modification is prohibited.
 */
class App {
    constructor() {
        this.configLoader = new ConfigLoader();
        this.player = new AudioPlayer();
        this.currentSongs = [];
        this.storageManager = null;
        this.downloadManager = null;

        // UI state (model)
        this.artworkModalOpen = false;
        this.storageModalOpen = false;
        this.confirmationModalOpen = false;
        this.confirmationCallback = null;
    }

    /**
     * Initialize the application
     */
    async init() {
        try {
            // Register service worker
            this.registerServiceWorker();

            // Initialize storage and download managers
            await this.initializeStorage();

            // Load configuration
            await this.configLoader.load();

            // Render site info
            this.renderSiteInfo();

            // Render content
            this.renderAlbums();

            // Set up albums and playlist
            const albums = this.configLoader.getAlbums();
            const allSongs = this.configLoader.getAllSongs();
            console.log('🎵 Total songs from config:', allSongs.length);

            // Set albums first (this ensures we always have an album selected)
            this.player.state.setAlbums(albums);

            // Check which album is selected
            const selectedAlbumId = this.player.state.getSelectedAlbum();
            console.log('📂 Selected album:', selectedAlbumId);

            // Set playlist with ALL songs - setPlaylist will filter to selected album
            this.player.setPlaylist(allSongs);

            // Now render songs with the selected album
            this.renderSongs();

            // Setup download UI handlers
            this.setupDownloadHandlers();

            // Listen for player song changes to update UI highlighting
            this.player.on('songchanged', () => {
                this.renderSongs(); // Re-render to update active song highlighting from model

                // If artwork modal is open, update it with new song
                if (this.artworkModalOpen) {
                    this.renderArtworkModal();
                }
            });

            console.log('✨ FlowGaia app initialized successfully');
            console.log('🎵 Total songs:', this.currentSongs.length);

            // Log filter state
            const selectedAlbum = this.player.state.getSelectedAlbum();
            if (selectedAlbum) {
                console.log('📂 Restored album filter:', selectedAlbum);
            }
        } catch (error) {
            console.error('Failed to initialize app:', error);
            this.showError('Failed to load application. Please refresh the page.');
        }
    }

    /**
     * Render site information
     */
    renderSiteInfo() {
        const siteInfo = this.configLoader.getSiteInfo();

        document.getElementById('site-title').textContent = siteInfo.title || 'FlowGaia';
        document.getElementById('site-subtitle').textContent = siteInfo.subtitle || '';
        document.getElementById('site-copyright').textContent = siteInfo.copyright || '';

        // Update page title
        document.title = `${siteInfo.title} - ${siteInfo.subtitle}`;
    }

    /**
     * Render featured section
     */
    renderFeatured() {
        const featured = this.configLoader.getFeaturedSongs();
        const container = document.getElementById('featured-content');

        if (featured.length === 0) {
            container.innerHTML = '<p class="empty-message">No featured songs available</p>';
            return;
        }

        container.innerHTML = featured.map(song => `
            <div class="featured-card" data-song-id="${song.id}">
                <div class="featured-image">
                    <img src="${song.image || song.album?.cover || 'assets/images/placeholder.jpg'}"
                         alt="${song.title}"
                         loading="lazy">
                    <div class="play-overlay">
                        <svg class="play-button" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M8 5v14l11-7z"/>
                        </svg>
                    </div>
                </div>
                <div class="featured-info">
                    <h3 class="featured-title">${song.title}</h3>
                    ${song.subtitle ? `<p class="featured-subtitle">${song.subtitle}</p>` : ''}
                    <p class="featured-artist">${song.artist}</p>
                    ${song.description ? `<p class="featured-description">${song.description}</p>` : ''}
                </div>
            </div>
        `).join('');

        // Add click handlers
        container.querySelectorAll('.featured-card').forEach(card => {
            card.addEventListener('click', () => {
                const songId = card.dataset.songId;
                this.playSong(songId);
            });
        });
    }

    /**
     * Render albums section
     */
    renderAlbums() {
        const albums = this.configLoader.getAlbums();
        const container = document.getElementById('albums-content');

        if (albums.length === 0) {
            container.innerHTML = '<p class="empty-message">No albums available</p>';
            return;
        }

        container.innerHTML = albums.map(album => `
            <div class="album-card" data-album-id="${album.id}">
                <div class="album-cover">
                    <img src="${album.cover || 'assets/images/placeholder.jpg'}"
                         alt="${album.title}"
                         loading="lazy">
                    <div class="album-overlay">
                        <div class="album-info-overlay">
                            <p class="album-song-count">${album.songs?.length || 0} ${album.songs?.length === 1 ? 'song' : 'songs'}</p>
                        </div>
                    </div>
                </div>
                <div class="album-info">
                    <h3 class="album-title">${album.title}</h3>
                    <p class="album-artist">${album.artist}</p>
                    <p class="album-year">${album.year}</p>
                </div>
            </div>
        `).join('');

        // Add click handlers - filter to show only album songs
        container.querySelectorAll('.album-card').forEach(card => {
            card.addEventListener('click', () => {
                const albumId = card.dataset.albumId;
                this.filterByAlbum(albumId);
            });
        });
    }

    /**
     * Render songs list
     */
    renderSongs() {
        // Get filtered songs from the model (always filtered by album)
        const songs = this.player.state.getFilteredSongs();
        const container = document.getElementById('songs-content');

        console.log('🎨 renderSongs called - rendering', songs.length, 'songs');

        // Get current album info
        const currentAlbum = this.player.state.getCurrentAlbum();

        // Update section title with download album buttons
        const sectionTitle = document.querySelector('.songs-section .section-title');
        if (sectionTitle && currentAlbum) {
            const downloadedCount = songs.filter(song =>
                this.downloadManager && this.downloadManager.getDownloadStatus(song.id) === 'downloaded'
            ).length;

            let buttonsHtml = '';
            if (this.downloadManager) {
                // Show download button if not all songs are downloaded
                if (downloadedCount < songs.length) {
                    buttonsHtml += `
                        <button class="album-download-btn" id="album-download-btn" data-album-id="${currentAlbum.id}">
                            <svg viewBox="0 0 24 24" fill="currentColor">
                                <path d="M19 12v7H5v-7H3v7c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-7h-2zm-6 .67l2.59-2.58L17 11.5l-5 5-5-5 1.41-1.41L11 12.67V3h2z"/>
                            </svg>
                            Download Album ${downloadedCount > 0 ? `(${downloadedCount}/${songs.length})` : ''}
                        </button>
                    `;
                }

                // Show remove button if some songs are downloaded
                if (downloadedCount > 0) {
                    buttonsHtml += `
                        <button class="album-undownload-btn" id="album-undownload-btn" data-album-id="${currentAlbum.id}">
                            <svg viewBox="0 0 24 24" fill="currentColor">
                                <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                            </svg>
                            Remove Downloads (${downloadedCount})
                        </button>
                    `;
                }
            }

            sectionTitle.innerHTML = `
                ${currentAlbum.title}
                <div class="album-actions">
                    ${buttonsHtml}
                </div>
            `;
        }

        if (songs.length === 0) {
            container.innerHTML = '<p class="empty-message">No songs available in this album</p>';
            return;
        }

        container.innerHTML = songs.map((song, index) => {
            const downloadStatus = this.downloadManager ? this.downloadManager.getDownloadStatus(song.id) : 'not-downloaded';
            const downloadIcon = downloadStatus === 'downloaded'
                ? '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>'
                : '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 12v7H5v-7H3v7c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-7h-2zm-6 .67l2.59-2.58L17 11.5l-5 5-5-5 1.41-1.41L11 12.67V3h2z"/></svg>';
            const downloadClass = downloadStatus === 'downloaded' ? 'downloaded' : '';
            const downloadTitle = downloadStatus === 'downloaded' ? 'Delete download' : 'Download for offline';

            return `
                <div class="song-item ${this.isCurrentSong(song.id) ? 'active' : ''}"
                     data-song-id="${song.id}"
                     data-index="${index}">
                    <div class="song-number">${index + 1}</div>
                    <div class="song-thumbnail">
                        <img src="${song.image || song.album?.cover || 'assets/images/placeholder.jpg'}"
                             alt="${song.title}">
                    </div>
                    <div class="song-details">
                        <div class="song-title-group">
                            <span class="song-title">${song.title}</span>
                            ${song.subtitle ? `<span class="song-subtitle">${song.subtitle}</span>` : ''}
                        </div>
                        <div class="song-meta">
                            <span class="song-artist">${song.artist}</span>
                        </div>
                    </div>
                    <div class="song-tags">
                        ${song.tags ? song.tags.map(tag => `<span class="tag">${tag}</span>`).join('') : ''}
                    </div>
                    <button class="download-btn ${downloadClass}"
                            data-song-id="${song.id}"
                            title="${downloadTitle}"
                            aria-label="${downloadTitle}">
                        ${downloadIcon}
                    </button>
                </div>
            `;
        }).join('');

        // Add click handlers for songs
        container.querySelectorAll('.song-item').forEach(item => {
            item.addEventListener('click', (e) => {
                // Don't play if clicking download button
                if (e.target.closest('.download-btn')) {
                    return;
                }
                const songId = item.dataset.songId;
                this.playSong(songId);
            });
        });

        // Add download button handlers
        container.querySelectorAll('.download-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const songId = btn.dataset.songId;
                this.handleSongDownload(songId);
            });
        });

        // Add album download button handler
        const albumDownloadBtn = document.getElementById('album-download-btn');
        if (albumDownloadBtn) {
            albumDownloadBtn.addEventListener('click', () => {
                const albumId = albumDownloadBtn.dataset.albumId;
                this.handleAlbumDownload(albumId);
            });
        }

        // Add album undownload button handler
        const albumUndownloadBtn = document.getElementById('album-undownload-btn');
        if (albumUndownloadBtn) {
            albumUndownloadBtn.addEventListener('click', () => {
                const albumId = albumUndownloadBtn.dataset.albumId;
                this.handleAlbumUndownload(albumId);
            });
        }
    }

    /**
     * Play a specific song by ID
     */
    playSong(songId) {
        const song = this.configLoader.getSongById(songId);
        if (!song) {
            console.error(`Song not found: ${songId}`);
            return;
        }

        // Find index in the current playlist (filtered by album)
        const index = this.player.state.getPlaylist().findIndex(s => s.id === songId);
        if (index !== -1) {
            this.player.state.setCurrentIndex(index);
            this.player.loadSong(song, true);
            // Note: UI will update automatically via 'songchanged' event listener
        } else {
            console.error(`Song "${songId}" not found in current album playlist`);
        }
    }

    /**
     * Check if a song is currently playing
     */
    isCurrentSong(songId) {
        const currentSong = this.player.getCurrentSong();
        return currentSong && currentSong.id === songId;
    }

    /**
     * Switch to a different album
     */
    filterByAlbum(albumId) {
        // Update model state (this updates the playlist to the new album)
        this.player.state.setSelectedAlbum(albumId);

        // Load the first song from the new album (but don't auto-play)
        const firstSong = this.player.state.getPlaylist()[0];
        if (firstSong) {
            this.player.state.setCurrentIndex(0);
            this.player.loadSong(firstSong, false);
        }

        // Re-render songs list for the new album
        this.renderSongs();

        // Scroll to songs section
        document.querySelector('.songs-section')?.scrollIntoView({ behavior: 'smooth' });

        console.log('🎵 Switched to album:', albumId);
    }

    /**
     * Initialize storage and download managers
     */
    async initializeStorage() {
        try {
            // Initialize storage manager
            this.storageManager = new StorageManager();
            await this.storageManager.init();

            // Set storage manager in player
            this.player.setStorageManager(this.storageManager);

            // Initialize download manager
            this.downloadManager = new DownloadManager(this.storageManager, this.player.state);

            // Setup download event listeners
            this.downloadManager.on('start', (data) => {
                // Re-render to show downloading state
                this.renderSongs();
            });

            this.downloadManager.on('progress', (data) => {
                // Progress updates don't need full re-render
                this.updateDownloadProgress(data.songId, data.percent);
            });

            this.downloadManager.on('complete', (data) => {
                // Re-render to show downloaded state
                this.renderSongs();
            });

            this.downloadManager.on('error', (data) => {
                // Re-render to reset button state
                this.renderSongs();
                this.showError(`Download failed: ${data.title}`);
            });

            this.downloadManager.on('cancelled', (data) => {
                // Re-render to reset button state
                this.renderSongs();
            });

            this.downloadManager.on('deleted', (data) => {
                // Re-render to show not-downloaded state
                this.renderSongs();
            });

            console.log('✅ Storage and download managers initialized');
        } catch (error) {
            console.error('❌ Failed to initialize storage:', error);
        }
    }

    /**
     * Register service worker for PWA support
     */
    registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/service-worker.js')
                .then((registration) => {
                    console.log('✅ Service Worker registered:', registration.scope);
                })
                .catch((error) => {
                    console.error('❌ Service Worker registration failed:', error);
                });
        } else {
            console.log('⚠️ Service Worker not supported in this browser');
        }
    }

    /**
     * Setup download UI event handlers
     */
    setupDownloadHandlers() {
        // Storage modal
        const openModalBtn = document.getElementById('open-storage-modal');
        const closeModalBtn = document.getElementById('storage-modal-close');
        const modalOverlay = document.getElementById('storage-modal-overlay');
        const clearAllBtn = document.getElementById('clear-all-downloads');

        if (openModalBtn) {
            openModalBtn.addEventListener('click', () => this.openStorageModal());
        }

        if (closeModalBtn) {
            closeModalBtn.addEventListener('click', () => this.closeStorageModal());
        }

        if (modalOverlay) {
            modalOverlay.addEventListener('click', () => this.closeStorageModal());
        }

        if (clearAllBtn) {
            clearAllBtn.addEventListener('click', () => this.clearAllDownloads());
        }

        // Artwork modal
        const playerArtwork = document.getElementById('player-artwork');
        const artworkModalClose = document.getElementById('artwork-modal-close');
        const artworkModalOverlay = document.getElementById('artwork-modal-overlay');

        if (playerArtwork) {
            playerArtwork.addEventListener('click', () => this.openArtworkModal());
            playerArtwork.style.cursor = 'pointer';
        }

        if (artworkModalClose) {
            artworkModalClose.addEventListener('click', () => this.closeArtworkModal());
        }

        if (artworkModalOverlay) {
            artworkModalOverlay.addEventListener('click', () => this.closeArtworkModal());
        }

        // Close artwork modal on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeArtworkModal();
                this.handleCancel(); // Close confirmation modal too
            }
        });

        // Confirmation modal handlers
        const confirmBtn = document.getElementById('confirmation-confirm');
        const cancelBtn = document.getElementById('confirmation-cancel');
        const confirmOverlay = document.getElementById('confirmation-modal-overlay');

        if (confirmBtn) {
            confirmBtn.addEventListener('click', () => this.handleConfirm());
        }

        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => this.handleCancel());
        }

        if (confirmOverlay) {
            confirmOverlay.addEventListener('click', () => this.handleCancel());
        }
    }

    /**
     * Handle song download button click
     */
    async handleSongDownload(songId) {
        const song = this.configLoader.getSongById(songId);
        if (!song) return;

        const status = this.downloadManager.getDownloadStatus(songId);

        if (status === 'downloaded') {
            // Confirm delete
            this.showConfirmation({
                title: 'Delete Download',
                message: `Remove "${song.title}" from offline storage?`,
                confirmText: 'Delete',
                cancelText: 'Cancel',
                type: 'warning',
                onConfirm: async () => {
                    try {
                        await this.downloadManager.deleteSong(songId);
                        this.updateDownloadButton(songId, 'not-downloaded');
                        this.showToast('Download removed', 'success');
                    } catch (error) {
                        this.showToast('Failed to delete download', 'error');
                    }
                }
            });
        } else if (status === 'downloading') {
            // Cancel download
            this.downloadManager.cancelDownload(songId);
            this.updateDownloadButton(songId, 'not-downloaded');
        } else {
            // Start download
            this.updateDownloadButton(songId, 'downloading');
            try {
                await this.downloadManager.downloadSong(song);
            } catch (error) {
                console.error('Download failed:', error);
            }
        }
    }

    /**
     * Handle album download
     */
    async handleAlbumDownload(albumId) {
        const album = this.player.state.getAllAlbums().find(a => a.id === albumId);
        if (!album) return;

        const allSongs = this.configLoader.getAllSongs().filter(s => s.album && s.album.id === albumId);

        // Filter out already downloaded songs
        const songsToDownload = allSongs.filter(song =>
            this.downloadManager.getDownloadStatus(song.id) !== 'downloaded'
        );

        if (songsToDownload.length === 0) {
            this.showToast('All songs already downloaded!', 'info');
            return;
        }

        const alreadyDownloaded = allSongs.length - songsToDownload.length;
        const message = alreadyDownloaded > 0
            ? `Download ${songsToDownload.length} remaining songs? (${alreadyDownloaded} already downloaded)`
            : `Download all ${songsToDownload.length} songs from "${album.title}"?`;

        this.showConfirmation({
            title: 'Download Album',
            message: message,
            confirmText: 'Download',
            cancelText: 'Cancel',
            type: 'info',
            onConfirm: async () => {
                console.log(`📥 Starting album download: ${album.title}`);
                this.showToast(`Downloading ${album.title}...`, 'info');

                await this.downloadManager.downloadMultiple(songsToDownload, {
                    onProgress: ({ completed, failed, total }) => {
                        console.log(`📥 Progress: ${completed}/${total} songs downloaded, ${failed} failed`);
                        // Update the album download button to show progress
                        const btn = document.getElementById('album-download-btn');
                        if (btn) {
                            btn.textContent = `Downloading... (${completed}/${total})`;
                        }
                    },
                    onComplete: ({ completed, failed, total }) => {
                        console.log(`✅ Album download complete: ${completed} succeeded, ${failed} failed`);
                        if (failed > 0) {
                            this.showToast(`${completed} songs downloaded, ${failed} failed`, 'error', 5000);
                        } else {
                            this.showToast(`All ${completed} songs downloaded!`, 'success');
                        }
                        this.renderSongs(); // Refresh UI
                    }
                });
            }
        });
    }

    /**
     * Handle album undownload (delete all downloads)
     */
    async handleAlbumUndownload(albumId) {
        const album = this.player.state.getAllAlbums().find(a => a.id === albumId);
        if (!album) return;

        const allSongs = this.configLoader.getAllSongs().filter(s => s.album && s.album.id === albumId);
        const downloadedSongs = allSongs.filter(song =>
            this.downloadManager.getDownloadStatus(song.id) === 'downloaded'
        );

        if (downloadedSongs.length === 0) {
            this.showToast('No downloaded songs in this album', 'info');
            return;
        }

        this.showConfirmation({
            title: 'Remove Album Downloads',
            message: `Delete all ${downloadedSongs.length} downloaded songs from "${album.title}"?`,
            confirmText: 'Delete All',
            cancelText: 'Cancel',
            type: 'warning',
            onConfirm: async () => {
                try {
                    for (const song of downloadedSongs) {
                        await this.downloadManager.deleteSong(song.id);
                    }
                    this.showToast(`Removed ${downloadedSongs.length} downloads`, 'success');
                    this.renderSongs(); // Refresh UI
                } catch (error) {
                    this.showToast('Failed to remove some downloads', 'error');
                }
            }
        });
    }

    /**
     * Update download button state
     * Re-renders the songs list to reflect model state
     */
    updateDownloadButton(songId, state) {
        // Instead of directly manipulating DOM, re-render to ensure view matches model
        this.renderSongs();
    }

    /**
     * Update download progress
     */
    updateDownloadProgress(songId, percent) {
        const btn = document.querySelector(`[data-song-id="${songId}"] .download-btn`);
        if (btn && btn.classList.contains('downloading')) {
            // Could update a progress indicator here if needed
        }
    }

    /**
     * Open storage modal (updates model, then renders view)
     */
    async openStorageModal() {
        // Update model
        this.storageModalOpen = true;

        // Render view based on model
        await this.renderStorageModal();
    }

    /**
     * Close storage modal (updates model, then renders view)
     */
    closeStorageModal() {
        // Update model
        this.storageModalOpen = false;

        // Render view based on model
        this.renderStorageModal();
    }

    /**
     * Render storage modal (view derived from model state)
     */
    async renderStorageModal() {
        const modal = document.getElementById('storage-modal');
        if (!modal) return;

        if (this.storageModalOpen) {
            // Get storage stats
            const stats = await this.downloadManager.getStats();

            // Update stats display
            document.getElementById('stat-song-count').textContent = stats.downloaded;
            document.getElementById('stat-storage-used').textContent = stats.totalSizeFormatted;

            if (stats.quota) {
                document.getElementById('stat-storage-available').textContent = stats.quota.availableFormatted;
                document.getElementById('storage-bar-fill').style.width = stats.quota.percentUsed + '%';
                document.getElementById('storage-percent').textContent = stats.quota.percentUsed.toFixed(1) + '% used';
            }

            // Render downloaded songs list
            await this.renderDownloadedSongs();

            // Show modal
            modal.style.display = 'block';
        } else {
            // Hide modal
            modal.style.display = 'none';
        }
    }

    /**
     * Render downloaded songs in modal
     */
    async renderDownloadedSongs() {
        const container = document.getElementById('downloaded-songs-content');
        if (!container) return;

        const storageStats = await this.storageManager.getStorageStats();

        if (storageStats.songs.length === 0) {
            container.innerHTML = '<p class="empty-message">No downloaded songs</p>';
            return;
        }

        container.innerHTML = storageStats.songs.map(item => {
            const song = this.configLoader.getSongById(item.songId);
            const title = song ? song.title : item.songId;

            return `
                <div class="downloaded-song-item" data-song-id="${item.songId}">
                    <div class="song-info">
                        <span class="song-title">${title}</span>
                        <span class="song-size">${item.sizeFormatted}</span>
                    </div>
                    <button class="btn-icon delete-download-btn" data-song-id="${item.songId}" title="Delete">
                        <svg viewBox="0 0 24 24" fill="currentColor">
                            <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                        </svg>
                    </button>
                </div>
            `;
        }).join('');

        // Add delete handlers
        container.querySelectorAll('.delete-download-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const songId = btn.dataset.songId;
                await this.handleSongDownload(songId);
                await this.renderDownloadedSongs();
                this.renderSongs(); // Refresh main UI
            });
        });
    }

    /**
     * Clear all downloads
     */
    async clearAllDownloads() {
        this.showConfirmation({
            title: 'Clear All Downloads',
            message: 'Delete all downloaded songs? This cannot be undone.',
            confirmText: 'Delete All',
            cancelText: 'Cancel',
            type: 'warning',
            onConfirm: async () => {
                try {
                    await this.downloadManager.clearAll();
                    await this.renderDownloadedSongs();
                    this.renderSongs(); // Refresh main UI
                    this.closeStorageModal();
                    this.showToast('All downloads cleared', 'success');
                } catch (error) {
                    this.showToast('Failed to clear downloads', 'error');
                }
            }
        });
    }

    /**
     * Open artwork modal (updates model, then renders view)
     */
    openArtworkModal() {
        const currentSong = this.player.getCurrentSong();
        if (!currentSong) return;

        // Update model
        this.artworkModalOpen = true;

        // Render view based on model
        this.renderArtworkModal();
    }

    /**
     * Close artwork modal (updates model, then renders view)
     */
    closeArtworkModal() {
        // Update model
        this.artworkModalOpen = false;

        // Render view based on model
        this.renderArtworkModal();
    }

    /**
     * Render artwork modal (view derived from model state)
     */
    renderArtworkModal() {
        const modal = document.getElementById('artwork-modal');
        if (!modal) return;

        if (this.artworkModalOpen) {
            // Get current song from model
            const currentSong = this.player.getCurrentSong();
            if (!currentSong) {
                this.artworkModalOpen = false;
                return;
            }

            // Update modal content
            const image = document.getElementById('artwork-modal-image');
            const title = document.getElementById('artwork-modal-title');
            const artist = document.getElementById('artwork-modal-artist');

            if (image && title && artist) {
                const artworkUrl = currentSong.image || currentSong.album?.cover || '';
                image.src = artworkUrl;
                image.alt = `${currentSong.title} artwork`;

                const fullTitle = currentSong.subtitle
                    ? `${currentSong.title} - ${currentSong.subtitle}`
                    : currentSong.title;
                title.textContent = fullTitle;
                artist.textContent = currentSong.artist;
            }

            // Show modal
            modal.style.display = 'flex';
        } else {
            // Hide modal
            modal.style.display = 'none';
        }
    }

    /**
     * Show confirmation modal
     */
    showConfirmation(options) {
        const {
            title = 'Confirm',
            message,
            confirmText = 'Confirm',
            cancelText = 'Cancel',
            type = 'warning', // warning, info, success
            onConfirm,
            onCancel
        } = options;

        // Update model
        this.confirmationModalOpen = true;
        this.confirmationCallback = { onConfirm, onCancel };

        // Render view
        this.renderConfirmationModal(title, message, confirmText, cancelText, type);
    }

    /**
     * Render confirmation modal
     */
    renderConfirmationModal(title, message, confirmText, cancelText, type) {
        const modal = document.getElementById('confirmation-modal');
        if (!modal) return;

        if (this.confirmationModalOpen) {
            const titleEl = document.getElementById('confirmation-title');
            const messageEl = document.getElementById('confirmation-message');
            const confirmBtn = document.getElementById('confirmation-confirm');
            const cancelBtn = document.getElementById('confirmation-cancel');
            const iconEl = document.getElementById('confirmation-icon');

            if (titleEl) titleEl.textContent = title;
            if (messageEl) messageEl.textContent = message;
            if (confirmBtn) confirmBtn.textContent = confirmText;
            if (cancelBtn) cancelBtn.textContent = cancelText;

            // Set icon based on type
            if (iconEl) {
                iconEl.className = `confirmation-icon ${type}`;
                const icons = {
                    warning: '⚠️',
                    info: 'ℹ️',
                    success: '✓'
                };
                iconEl.textContent = icons[type] || icons.warning;
            }

            modal.style.display = 'flex';
        } else {
            modal.style.display = 'none';
        }
    }

    /**
     * Handle confirmation
     */
    handleConfirm() {
        if (this.confirmationCallback && this.confirmationCallback.onConfirm) {
            this.confirmationCallback.onConfirm();
        }
        this.confirmationModalOpen = false;
        this.confirmationCallback = null;
        this.renderConfirmationModal();
    }

    /**
     * Handle cancel
     */
    handleCancel() {
        if (this.confirmationCallback && this.confirmationCallback.onCancel) {
            this.confirmationCallback.onCancel();
        }
        this.confirmationModalOpen = false;
        this.confirmationCallback = null;
        this.renderConfirmationModal();
    }

    /**
     * Show toast notification
     */
    showToast(message, type = 'info', duration = 3000) {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;

        const icons = {
            success: '<svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>',
            error: '<svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>',
            info: '<svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>'
        };

        toast.innerHTML = `
            <div class="toast-icon ${type}">
                ${icons[type] || icons.info}
            </div>
            <div class="toast-content">
                <div class="toast-message">${message}</div>
            </div>
            <button class="toast-close" aria-label="Close">
                <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                </svg>
            </button>
        `;

        container.appendChild(toast);

        // Close button handler
        const closeBtn = toast.querySelector('.toast-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                toast.remove();
            });
        }

        // Auto-remove after duration
        if (duration > 0) {
            setTimeout(() => {
                toast.style.opacity = '0';
                setTimeout(() => toast.remove(), 300);
            }, duration);
        }
    }

    /**
     * Show error message (deprecated, use showToast instead)
     */
    showError(message) {
        this.showToast(message, 'error', 4000);
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const app = new App();
    app.init();
});
