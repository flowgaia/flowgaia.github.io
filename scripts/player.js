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

        this.initializeEventListeners();
        this.initializeFromState();
    }

    /**
     * Initialize UI from saved state
     */
    initializeFromState() {
        this.view.updateVolume(this.state.getVolume());
        this.view.updateVolumeButton(this.state.getMuted(), this.state.getVolume());
        this.view.updateSpeed(this.state.getPlaybackRate());
        this.view.updateLoop(this.state.getLoop());
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
     * Load a song
     */
    loadSong(song, autoplay = false, startPosition = 0) {
        if (!song) return;

        console.log('📀 Loading:', song.title, 'at position:', startPosition);

        // Cleanup previous
        this.stopProgressUpdates();
        if (this.howl) {
            this.howl.unload();
        }

        // Update view
        this.view.updateNowPlaying(song);

        // Create new Howler instance
        this.howl = new Howl({
            src: [song.audio],
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
            },
            onplay: () => {
                console.log('▶️ Playing');
                this.state.setPlaying(true);
                this.view.updatePlayPauseButton(true);
                this.startProgressUpdates();
            },
            onpause: () => {
                console.log('⏸️ Paused');
                this.state.setPlaying(false);
                this.view.updatePlayPauseButton(false);
                this.stopProgressUpdates();
            },
            onend: () => {
                console.log('⏹️ Ended');
                this.playNext();
            },
            onstop: () => {
                console.log('⏹️ Stopped');
                this.state.setPlaying(false);
                this.view.updatePlayPauseButton(false);
                this.stopProgressUpdates();
            }
        });
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
        const loopEnabled = this.state.getLoop();

        console.log('⏭️ playNext called:', {
            currentIndex,
            playlistLength,
            isLastSong,
            loopEnabled
        });

        if (isLastSong && !loopEnabled) {
            // At the end and not looping - stop playback completely
            console.log('🏁 End of album (loop disabled) - stopping playback');
            if (this.howl) {
                this.howl.stop();
            }
            this.state.setPlaying(false);
            this.view.updatePlayPauseButton(false);
            return;
        }

        if (isLastSong && loopEnabled) {
            console.log('🔁 End of album (loop enabled) - wrapping to start');
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
     * Toggle loop
     */
    toggleLoop() {
        const newLoop = !this.state.getLoop();
        this.state.setLoop(newLoop);
        this.view.updateLoop(newLoop);

        console.log('🔁 Loop:', newLoop ? 'enabled' : 'disabled');
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
     * Debug: Print state snapshot
     */
    debugState() {
        console.table(this.state.getSnapshot());
    }
}
