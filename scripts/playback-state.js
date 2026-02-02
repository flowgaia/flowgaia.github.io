/**
 * PlaybackState - Model for managing playback state and persistence
 *
 * Copyright © 2026 FlowGaia. All rights reserved.
 *
 * This source code is licensed under the copyright of FlowGaia.
 * Unauthorized copying, distribution, or modification is prohibited.
 */
class PlaybackState {
    constructor() {
        this.currentSong = null;
        this.currentIndex = -1;
        this.playlist = [];
        this.allSongs = []; // All songs across all albums
        this.allAlbums = []; // All albums for reference
        this.position = 0; // Current playback position in seconds
        this.duration = 0;
        this.volume = 70; // 0-100
        this.isMuted = false;
        this.isPlaying = false;
        this.playbackRate = 1.0; // 0.5 to 2.0
        this.loop = false; // Loop playlist
        this.selectedAlbumId = null; // Will be set to first album by default

        // Load persisted state
        this.loadFromStorage();

        // Auto-save interval
        this.autoSaveInterval = null;
    }

    /**
     * Set albums (must be called before setPlaylist)
     */
    setAlbums(albums) {
        console.log('📚 setAlbums called with', albums.length, 'albums');
        this.allAlbums = albums;

        // If no album selected, default to first album
        if (!this.selectedAlbumId && albums.length > 0) {
            this.selectedAlbumId = albums[0].id;
            console.log('📌 Defaulting to first album:', this.selectedAlbumId);
        }

        // Validate that selected album exists
        if (this.selectedAlbumId) {
            const albumExists = albums.some(a => a.id === this.selectedAlbumId);
            if (!albumExists) {
                console.warn('⚠️ Selected album no longer exists, defaulting to first');
                this.selectedAlbumId = albums[0]?.id || null;
            }
        }
    }

    /**
     * Set the playlist (should always be filtered to selected album)
     */
    setPlaylist(songs) {
        console.log('📝 setPlaylist called with', songs.length, 'songs');
        console.log('📝 Current selectedAlbumId:', this.selectedAlbumId);

        // Store all songs for reference
        this.allSongs = songs;

        // Playlist should match the selected album
        if (this.selectedAlbumId) {
            this.playlist = songs.filter(song =>
                song.album && song.album.id === this.selectedAlbumId
            );
            console.log('📋 Filtered playlist to', this.playlist.length, 'songs for album:', this.selectedAlbumId);
        } else {
            // No album selected - should not happen, but fallback to first song's album
            this.playlist = songs;
            if (songs.length > 0 && songs[0].album) {
                this.selectedAlbumId = songs[0].album.id;
                console.log('📌 Auto-selected album from first song:', this.selectedAlbumId);
            }
        }

        this.persist();
    }

    /**
     * Get the playlist
     */
    getPlaylist() {
        return this.playlist;
    }

    /**
     * Set current song by index
     */
    setCurrentIndex(index) {
        if (index >= 0 && index < this.playlist.length) {
            this.currentIndex = index;
            this.currentSong = this.playlist[index];
            this.position = 0; // Reset position for new song
            this.persist();
            return this.currentSong;
        }
        return null;
    }

    /**
     * Set current song by ID
     */
    setCurrentSongById(songId) {
        const index = this.playlist.findIndex(s => s.id === songId);
        if (index !== -1) {
            return this.setCurrentIndex(index);
        }
        return null;
    }

    /**
     * Get current song
     */
    getCurrentSong() {
        return this.currentSong;
    }

    /**
     * Get current index
     */
    getCurrentIndex() {
        return this.currentIndex;
    }

    /**
     * Get next song index
     */
    getNextIndex() {
        if (this.playlist.length === 0) return -1;
        return (this.currentIndex + 1) % this.playlist.length;
    }

    /**
     * Get previous song index
     */
    getPreviousIndex() {
        if (this.playlist.length === 0) return -1;
        return (this.currentIndex - 1 + this.playlist.length) % this.playlist.length;
    }

    /**
     * Move to next song
     */
    next() {
        return this.setCurrentIndex(this.getNextIndex());
    }

    /**
     * Move to previous song
     */
    previous() {
        return this.setCurrentIndex(this.getPreviousIndex());
    }

    /**
     * Update playback position
     */
    setPosition(position) {
        this.position = position;
    }

    /**
     * Get playback position
     */
    getPosition() {
        return this.position;
    }

    /**
     * Set duration
     */
    setDuration(duration) {
        this.duration = duration;
    }

    /**
     * Get duration
     */
    getDuration() {
        return this.duration;
    }

    /**
     * Set volume
     */
    setVolume(volume) {
        this.volume = Math.max(0, Math.min(100, volume));
        this.persist();
    }

    /**
     * Get volume
     */
    getVolume() {
        return this.volume;
    }

    /**
     * Set muted state
     */
    setMuted(muted) {
        this.isMuted = muted;
        this.persist();
    }

    /**
     * Get muted state
     */
    getMuted() {
        return this.isMuted;
    }

    /**
     * Set playing state
     */
    setPlaying(playing) {
        this.isPlaying = playing;

        if (playing) {
            this.startAutoSave();
        } else {
            this.stopAutoSave();
            this.persist();
        }
    }

    /**
     * Get playing state
     */
    getPlaying() {
        return this.isPlaying;
    }

    /**
     * Set playback rate
     */
    setPlaybackRate(rate) {
        this.playbackRate = Math.max(0.5, Math.min(2.0, rate));
        this.persist();
    }

    /**
     * Get playback rate
     */
    getPlaybackRate() {
        return this.playbackRate;
    }

    /**
     * Set loop state
     */
    setLoop(loop) {
        this.loop = loop;
        this.persist();
    }

    /**
     * Get loop state
     */
    getLoop() {
        return this.loop;
    }

    /**
     * Set selected album and update playlist to only include that album's songs
     */
    setSelectedAlbum(albumId) {
        this.selectedAlbumId = albumId;

        // Update playlist to only contain songs from the selected album
        const filteredSongs = this.allSongs.filter(song =>
            song.album && song.album.id === albumId
        );

        console.log('📂 Switching to album:', albumId, '(' + filteredSongs.length + ' songs)');

        // Update the playlist
        this.playlist = filteredSongs;

        // Reset playback position since we're changing albums
        this.currentIndex = -1;
        this.currentSong = null;

        this.persist(); // Save immediately when filter changes
    }

    /**
     * Get selected album ID
     */
    getSelectedAlbum() {
        return this.selectedAlbumId;
    }

    /**
     * Get all albums
     */
    getAllAlbums() {
        return this.allAlbums;
    }

    /**
     * Get filtered songs based on selected album
     * Returns the current playlist (which is always filtered to the selected album)
     */
    getFilteredSongs() {
        console.log('🔍 getFilteredSongs called:', {
            selectedAlbumId: this.selectedAlbumId,
            playlistLength: this.playlist.length
        });

        // The playlist is always filtered to match the selected album
        return this.playlist;
    }

    /**
     * Get current album info
     */
    getCurrentAlbum() {
        if (!this.selectedAlbumId) return null;
        return this.allAlbums.find(a => a.id === this.selectedAlbumId);
    }

    /**
     * Start auto-save interval
     */
    startAutoSave() {
        this.stopAutoSave();
        this.autoSaveInterval = setInterval(() => {
            this.persist();
        }, 5000); // Save every 5 seconds
    }

    /**
     * Stop auto-save interval
     */
    stopAutoSave() {
        if (this.autoSaveInterval) {
            clearInterval(this.autoSaveInterval);
            this.autoSaveInterval = null;
        }
    }

    /**
     * Persist state to localStorage
     */
    persist() {
        const state = {
            songId: this.currentSong?.id || null,
            currentIndex: this.currentIndex,
            position: this.position,
            volume: this.volume,
            isMuted: this.isMuted,
            playbackRate: this.playbackRate,
            loop: this.loop,
            selectedAlbumId: this.selectedAlbumId,
            timestamp: Date.now()
        };

        localStorage.setItem('flowgaia_playback_state', JSON.stringify(state));
        console.log('💾 State persisted:', state);
    }

    /**
     * Load state from localStorage
     */
    loadFromStorage() {
        try {
            const saved = localStorage.getItem('flowgaia_playback_state');
            if (saved) {
                const state = JSON.parse(saved);

                // Restore volume and mute state
                if (state.volume !== undefined) {
                    this.volume = state.volume;
                }
                if (state.isMuted !== undefined) {
                    this.isMuted = state.isMuted;
                }
                if (state.playbackRate !== undefined) {
                    this.playbackRate = state.playbackRate;
                }
                if (state.loop !== undefined) {
                    this.loop = state.loop;
                }
                // Only restore selectedAlbumId if it's a valid non-null value
                if (state.selectedAlbumId) {
                    this.selectedAlbumId = state.selectedAlbumId;
                    console.log('✅ Restored selectedAlbumId:', this.selectedAlbumId);
                }

                // Store the saved state for later restoration after playlist is loaded
                this.savedState = state;

                console.log('📂 State loaded from storage:', state);
                return state;
            }
        } catch (error) {
            console.error('Error loading state from storage:', error);
        }
        return null;
    }

    /**
     * Restore playback after playlist is loaded
     * Call this after setPlaylist()
     */
    restorePlayback() {
        if (!this.savedState) return null;

        const state = this.savedState;

        // Find the song in the playlist
        if (state.songId && this.playlist.length > 0) {
            const index = this.playlist.findIndex(s => s.id === state.songId);
            if (index !== -1) {
                this.currentIndex = index;
                this.currentSong = this.playlist[index];
                this.position = state.position || 0;

                // IMPORTANT: Set selectedAlbumId based on the restored song's album
                // This ensures the UI shows the correct album when restoring
                if (this.currentSong.album && this.currentSong.album.id) {
                    this.selectedAlbumId = this.currentSong.album.id;
                    console.log('📂 Set album from restored song:', this.selectedAlbumId);
                    // Persist the corrected album selection
                    this.persist();
                }

                console.log('🔄 Restoring playback:', {
                    song: this.currentSong.title,
                    album: this.selectedAlbumId,
                    position: this.position
                });

                return {
                    song: this.currentSong,
                    position: this.position
                };
            }
        }

        return null;
    }

    /**
     * Clear persisted state
     */
    clearStorage() {
        localStorage.removeItem('flowgaia_playback_state');
        this.savedState = null;
    }

    /**
     * Get state snapshot for debugging
     */
    getSnapshot() {
        return {
            currentSong: this.currentSong?.title || 'None',
            currentIndex: this.currentIndex,
            position: this.position,
            duration: this.duration,
            volume: this.volume,
            isMuted: this.isMuted,
            isPlaying: this.isPlaying,
            playlistLength: this.playlist.length
        };
    }
}
