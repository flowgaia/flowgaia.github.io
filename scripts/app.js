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
    }

    /**
     * Initialize the application
     */
    async init() {
        try {
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

            // Store all songs in the model for filtering
            this.player.state.allSongs = allSongs;

            // Check which album is selected
            const selectedAlbumId = this.player.state.getSelectedAlbum();
            console.log('📂 Selected album:', selectedAlbumId);

            // Get songs for the selected album only
            const albumSongs = this.player.state.getFilteredSongs();
            console.log('🎵 Album songs:', albumSongs.length);

            // Set playlist to the selected album's songs
            this.player.setPlaylist(albumSongs);

            // Now render songs with the selected album
            this.renderSongs();

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

        // Update section title
        const sectionTitle = document.querySelector('.songs-section .section-title');
        if (sectionTitle && currentAlbum) {
            sectionTitle.textContent = currentAlbum.title;
        }

        if (songs.length === 0) {
            container.innerHTML = '<p class="empty-message">No songs available in this album</p>';
            return;
        }

        container.innerHTML = songs.map((song, index) => `
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
            </div>
        `).join('');

        // Add click handlers for songs
        container.querySelectorAll('.song-item').forEach(item => {
            item.addEventListener('click', () => {
                const songId = item.dataset.songId;
                this.playSong(songId);
            });
        });
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
            this.updateActiveSong(songId);
        } else {
            console.error(`Song "${songId}" not found in current album playlist`);
        }
    }

    /**
     * Update active song styling in UI
     */
    updateActiveSong(songId) {
        // Remove active class from all songs
        document.querySelectorAll('.song-item').forEach(item => {
            item.classList.remove('active');
        });

        // Add active class to current song
        const activeSong = document.querySelector(`.song-item[data-song-id="${songId}"]`);
        if (activeSong) {
            activeSong.classList.add('active');
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
     * Show error message
     */
    showError(message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.textContent = message;
        document.body.insertBefore(errorDiv, document.body.firstChild);
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const app = new App();
    app.init();
});
