/**
 * AudioPlayer - Controller coordinating audio playback, state, and view
 *
 * Copyright © 2026 FlowGaia. All rights reserved.
 *
 * This source code is licensed under the copyright of FlowGaia.
 * Unauthorized copying, distribution, or modification is prohibited.
 */
class AudioPlayer {
    constructor() {
        // MVC components
        this.state = new PlaybackState();
        this.view = new PlayerView();

        // Howler instance
        this.howl = null;

        // Progress update interval
        this.progressInterval = null;

        // Storage manager (will be set by App)
        this.storageManager = null;

        // Current blob URL (needs cleanup)
        this.currentBlobUrl = null;

        // Event listeners for external components
        this.listeners = {};

        this.initializeEventListeners();
        this.initializeFromState();
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
     * Set storage manager for offline playback
     */
    setStorageManager(storageManager) {
        this.storageManager = storageManager;
    }

    /**
     * Initialize UI from saved state
     */
    initializeFromState() {
        this.view.updateVolume(this.state.getVolume());
        this.view.updateVolumeButton(this.state.getMuted(), this.state.getVolume());
        this.view.updateSpeed(this.state.getPlaybackRate());
        this.view.updateRepeatMode(this.state.getRepeatMode());
    }

    /**
     * Initialize all event listeners
     */
    initializeEventListeners() {
        // Playback controls
        this.view.on('playPauseBtn', 'click', () => this.togglePlayPause());
        this.view.on('prevBtn', 'click', () => this.playPrevious());
        this.view.on('nextBtn', 'click', () => this.playNext());

        // Progress seeking
        this.view.on('progressSlider', 'input', (e) => {
            this.view.setSeekingState(true);
            const percent = this.view.getProgressValue();
            this.view.elements.progressSlider.style.setProperty('--progress', `${percent}%`);
        });

        this.view.on('progressSlider', 'change', (e) => {
            const percent = this.view.getProgressValue();
            const duration = this.state.getDuration();
            const seekTo = (percent / 100) * duration;

            console.log('⏩ Seeking to:', seekTo.toFixed(2), 'seconds');

            if (this.howl && duration > 0) {
                this.howl.seek(seekTo);
                this.state.setPosition(seekTo);
            }

            setTimeout(() => {
                this.view.setSeekingState(false);
            }, 100);
        });

        // Volume control
        this.view.on('volumeSlider', 'input', () => {
            const volume = this.view.getVolumeValue();
            this.setVolume(volume);
        });

        this.view.on('volumeBtn', 'click', () => this.toggleMute());

        // Playback speed control
        this.view.on('speedBtn', 'click', () => this.cyclePlaybackSpeed());

        // Loop control
        this.view.on('loopBtn', 'click', () => this.toggleLoop());

        // Save state before page unload
        window.addEventListener('beforeunload', () => {
            this.state.persist();
        });
    }

    /**
     * Set playlist
     */
    setPlaylist(songs) {
        this.state.setPlaylist(songs);

        // Try to restore previous playback
        const restored = this.state.restorePlayback();
        if (restored) {
            console.log('🔄 Restoring previous session');
            this.loadSong(restored.song, false, restored.position);
        } else if (songs.length > 0) {
            // Load first song if no restoration
            this.state.setCurrentIndex(0);
            this.loadSong(this.state.getCurrentSong(), false);
        }
    }

    /**
     * Load a song (check cache first, fallback to streaming)
     */
    async loadSong(song, autoplay = false, startPosition = 0) {
        if (!song) return;

        console.log('📀 Loading:', song.title, 'at position:', startPosition);

        // Cleanup previous
        this.stopProgressUpdates();
        if (this.howl) {
            this.howl.unload();
        }

        // Cleanup previous blob URL
        if (this.currentBlobUrl) {
            URL.revokeObjectURL(this.currentBlobUrl);
            this.currentBlobUrl = null;
        }

        // Update view
        this.view.updateNowPlaying(song);

        // Update page title and OS media controls
        this.updatePageTitle(song);
        this.updateMediaSession(song);

        // Emit song changed event for external listeners (e.g., App)
        this.emit('songchanged', { song });

        // Check if song is cached (offline mode)
        let audioSrc = song.audio;
        let isOffline = false;
        let audioFormat = null;

        if (this.storageManager) {
            try {
                const cachedAudio = await this.storageManager.getAudio(song.id);
                if (cachedAudio && cachedAudio.blob) {
                    // Create blob URL from cached audio
                    this.currentBlobUrl = URL.createObjectURL(cachedAudio.blob);
                    audioSrc = this.currentBlobUrl;
                    isOffline = true;

                    // Extract format from mimeType (e.g., "audio/mpeg" -> "mp3")
                    if (cachedAudio.mimeType) {
                        const formatMap = {
                            'audio/mpeg': 'mp3',
                            'audio/mp3': 'mp3',
                            'audio/wav': 'wav',
                            'audio/ogg': 'ogg',
                            'audio/webm': 'webm',
                            'audio/aac': 'aac',
                            'audio/flac': 'flac',
                            'audio/m4a': 'm4a'
                        };
                        audioFormat = formatMap[cachedAudio.mimeType] || 'mp3';
                    }

                    console.log('📥 Playing from cache (offline mode), format:', audioFormat);
                } else {
                    console.log('📡 Streaming from network');
                }
            } catch (error) {
                console.error('❌ Error checking cache:', error);
                // Fallback to streaming
            }
        }

        // Update offline indicator in view
        this.view.updateOfflineStatus(isOffline);

        // Create new Howler instance
        const howlOptions = {
            src: [audioSrc],
            html5: true,
            volume: this.state.getVolume() / 100,
            mute: this.state.getMuted(),
            rate: this.state.getPlaybackRate(),
            onload: () => {
                console.log('✅ Audio loaded, duration:', this.howl.duration());
                const duration = this.howl.duration();
                this.state.setDuration(duration);
                this.view.updateDuration(duration);

                // Seek to start position if specified
                if (startPosition > 0 && startPosition < duration) {
                    console.log('⏭️ Seeking to restored position:', startPosition);
                    this.howl.seek(startPosition);
                    this.state.setPosition(startPosition);
                    this.view.updateProgress(startPosition, duration);
                }

                // Auto-play if requested
                if (autoplay) {
                    this.play();
                }
            },
            onloaderror: (id, error) => {
                console.error('❌ Load error:', error);
                // If offline mode failed, try streaming
                if (isOffline) {
                    console.log('🔄 Retrying with network stream...');
                    this.view.updateOfflineStatus(false);
                    this.loadSong(song, autoplay, startPosition);
                }
            },
            onplay: () => {
                console.log('▶️ Playing');
                this.state.setPlaying(true);
                this.view.updatePlayPauseButton(true);
                this.startProgressUpdates();
                if ('mediaSession' in navigator) {
                    navigator.mediaSession.playbackState = 'playing';
                }
            },
            onpause: () => {
                console.log('⏸️ Paused');
                this.state.setPlaying(false);
                this.view.updatePlayPauseButton(false);
                this.stopProgressUpdates();
                if ('mediaSession' in navigator) {
                    navigator.mediaSession.playbackState = 'paused';
                }
            },
            onend: () => {
                console.log('⏹️ Ended');
                // Check if repeat one is enabled
                if (this.state.getRepeatMode() === 'one') {
                    console.log('🔂 Repeat one - replaying current song');
                    this.howl.seek(0);
                    this.howl.play();
                } else {
                    this.playNext();
                }
            },
            onstop: () => {
                console.log('⏹️ Stopped');
                this.state.setPlaying(false);
                this.view.updatePlayPauseButton(false);
                this.stopProgressUpdates();
                if ('mediaSession' in navigator) {
                    navigator.mediaSession.playbackState = 'paused';
                }
            }
        };

        // Add format option if playing from cache (blob URL needs explicit format)
        if (isOffline && audioFormat) {
            howlOptions.format = [audioFormat];
        }

        // Instantiate Howl with options
        this.howl = new Howl(howlOptions);
    }

    /**
     * Play
     */
    play() {
        if (this.howl) {
            this.howl.play();
        }
    }

    /**
     * Pause
     */
    pause() {
        if (this.howl) {
            this.howl.pause();
        }
    }

    /**
     * Toggle play/pause
     */
    togglePlayPause() {
        if (!this.howl) return;

        if (this.state.getPlaying()) {
            this.pause();
        } else {
            this.play();
        }
    }

    /**
     * Play previous track
     */
    playPrevious() {
        const song = this.state.previous();
        if (song) {
            this.loadSong(song, true);
        }
    }

    /**
     * Play next track
     */
    playNext() {
        // Check if we're at the end of the playlist
        const currentIndex = this.state.getCurrentIndex();
        const playlistLength = this.state.getPlaylist().length;
        const isLastSong = currentIndex >= playlistLength - 1;
        const repeatMode = this.state.getRepeatMode();

        console.log('⏭️ playNext called:', {
            currentIndex,
            playlistLength,
            isLastSong,
            repeatMode
        });

        if (isLastSong && repeatMode === 'off') {
            // Try to advance to the next album
            const nextSong = this.state.switchToNextAlbum();
            if (nextSong) {
                console.log('⏭️ End of album - advancing to next album');
                this.loadSong(nextSong, true);
                return;
            }
            // No next album - stop playback completely
            console.log('🏁 End of all albums - stopping playback');
            if (this.howl) {
                this.howl.stop();
            }
            this.state.setPlaying(false);
            this.view.updatePlayPauseButton(false);
            return;
        }

        if (isLastSong && repeatMode === 'all') {
            console.log('🔁 End of album (repeat all) - wrapping to start');
        }

        const song = this.state.next();
        if (song) {
            this.loadSong(song, true);
        } else {
            console.warn('⚠️ next() returned no song - stopping');
            this.pause();
        }
    }

    /**
     * Set volume
     */
    setVolume(volume) {
        this.state.setVolume(volume);
        if (this.howl) {
            this.howl.volume(volume / 100);
        }
        this.view.updateVolume(volume);
        this.view.updateVolumeButton(this.state.getMuted(), volume);
    }

    /**
     * Toggle mute
     */
    toggleMute() {
        const newMuted = !this.state.getMuted();
        this.state.setMuted(newMuted);

        if (this.howl) {
            this.howl.mute(newMuted);
        }

        this.view.updateVolumeButton(newMuted, this.state.getVolume());
    }

    /**
     * Cycle through playback speeds
     */
    cyclePlaybackSpeed() {
        const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2];
        const currentRate = this.state.getPlaybackRate();

        // Find next speed
        let nextIndex = speeds.findIndex(s => s > currentRate);
        if (nextIndex === -1) {
            nextIndex = 0; // Loop back to slowest
        }

        const newRate = speeds[nextIndex];
        this.setPlaybackSpeed(newRate);

        console.log('🎚️ Playback speed:', newRate + '×');
    }

    /**
     * Set playback speed
     */
    setPlaybackSpeed(rate) {
        this.state.setPlaybackRate(rate);

        if (this.howl) {
            this.howl.rate(rate);
        }

        this.view.updateSpeed(rate);
    }

    /**
     * Cycle through repeat modes (off -> all -> one -> off)
     */
    toggleLoop() {
        const newMode = this.state.cycleRepeatMode();
        this.view.updateRepeatMode(newMode);

        const modeLabels = {
            'off': 'Repeat off',
            'all': 'Repeat all',
            'one': 'Repeat single'
        };
        console.log('🔁', modeLabels[newMode]);
    }

    /**
     * Start progress updates
     */
    startProgressUpdates() {
        this.stopProgressUpdates();

        this.progressInterval = setInterval(() => {
            if (this.howl && this.state.getPlaying()) {
                const position = this.howl.seek();
                const duration = this.howl.duration();

                if (isFinite(position) && isFinite(duration)) {
                    this.state.setPosition(position);
                    this.view.updateProgress(position, duration);

                    if ('mediaSession' in navigator && duration > 0) {
                        try {
                            navigator.mediaSession.setPositionState({
                                duration,
                                playbackRate: this.state.getPlaybackRate(),
                                position
                            });
                        } catch (e) {
                            // setPositionState not supported in all browsers
                        }
                    }
                }
            }
        }, 250);
    }

    /**
     * Stop progress updates
     */
    stopProgressUpdates() {
        if (this.progressInterval) {
            clearInterval(this.progressInterval);
            this.progressInterval = null;
        }
    }

    /**
     * Get current song
     */
    getCurrentSong() {
        return this.state.getCurrentSong();
    }

    /**
     * Update the browser page title to show the current song
     */
    updatePageTitle(song) {
        if (!song) return;
        const fullTitle = song.subtitle
            ? `${song.title} - ${song.subtitle}`
            : song.title;
        document.title = `${fullTitle} · FlowGaia`;
    }

    /**
     * Update OS media session metadata and action handlers
     */
    updateMediaSession(song) {
        if (!('mediaSession' in navigator)) return;

        if (!song) {
            navigator.mediaSession.metadata = null;
            return;
        }

        const fullTitle = song.subtitle
            ? `${song.title} - ${song.subtitle}`
            : song.title;

        const artworkUrl = song.image || song.album?.cover || '';
        const artwork = artworkUrl ? [{ src: artworkUrl }] : [];

        navigator.mediaSession.metadata = new MediaMetadata({
            title: fullTitle,
            artist: song.artist || '',
            album: song.album?.title || '',
            artwork
        });

        navigator.mediaSession.setActionHandler('play', () => this.play());
        navigator.mediaSession.setActionHandler('pause', () => this.pause());
        navigator.mediaSession.setActionHandler('previoustrack', () => this.playPrevious());
        navigator.mediaSession.setActionHandler('nexttrack', () => this.playNext());
        navigator.mediaSession.setActionHandler('seekbackward', (details) => {
            if (this.howl) {
                const offset = details.seekOffset || 10;
                this.howl.seek(Math.max(0, this.howl.seek() - offset));
            }
        });
        navigator.mediaSession.setActionHandler('seekforward', (details) => {
            if (this.howl) {
                const offset = details.seekOffset || 10;
                this.howl.seek(Math.min(this.howl.duration(), this.howl.seek() + offset));
            }
        });
        navigator.mediaSession.setActionHandler('seekto', (details) => {
            if (this.howl && details.seekTime !== undefined) {
                this.howl.seek(details.seekTime);
            }
        });
    }

    /**
     * Debug: Print state snapshot
     */
    debugState() {
        console.table(this.state.getSnapshot());
    }
}
