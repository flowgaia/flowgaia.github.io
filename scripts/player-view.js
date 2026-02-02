/**
 * PlayerView - View for managing player UI updates
 *
 * Copyright © 2026 FlowGaia. All rights reserved.
 *
 * This source code is licensed under the copyright of FlowGaia.
 * Unauthorized copying, distribution, or modification is prohibited.
 */
class PlayerView {
    constructor() {
        // Cache DOM elements
        this.elements = {
            playPauseBtn: document.getElementById('play-pause-btn'),
            prevBtn: document.getElementById('prev-btn'),
            nextBtn: document.getElementById('next-btn'),
            progressSlider: document.getElementById('progress-slider'),
            currentTime: document.getElementById('current-time'),
            durationTime: document.getElementById('duration-time'),
            volumeSlider: document.getElementById('volume-slider'),
            volumeBtn: document.getElementById('volume-btn'),
            playerTitle: document.getElementById('player-title'),
            playerArtist: document.getElementById('player-artist'),
            playerArtwork: document.getElementById('player-artwork'),
            playerCopyright: document.getElementById('player-copyright'),
            playIcon: document.querySelector('.play-icon'),
            pauseIcon: document.querySelector('.pause-icon'),
            volumeIcon: document.querySelector('.volume-icon'),
            muteIcon: document.querySelector('.mute-icon'),
            speedBtn: document.getElementById('speed-btn'),
            speedLabel: document.querySelector('.speed-label'),
            loopBtn: document.getElementById('loop-btn')
        };

        this.isSeeking = false;
    }

    /**
     * Update now playing information
     */
    updateNowPlaying(song) {
        if (!song) {
            this.elements.playerTitle.textContent = 'No song playing';
            this.elements.playerArtist.textContent = '';
            this.elements.playerArtwork.src = '';
            this.elements.playerCopyright.textContent = '';
            return;
        }

        // Show title with subtitle if available (e.g., "Hollow Men - Disco Slap")
        const fullTitle = song.subtitle
            ? `${song.title} - ${song.subtitle}`
            : song.title;

        this.elements.playerTitle.textContent = fullTitle;
        this.elements.playerArtist.textContent = song.artist;
        this.elements.playerArtwork.src = song.image || song.album?.cover || '';
        this.elements.playerArtwork.alt = `${fullTitle} artwork`;

        const copyrightText = `© ${song.year || ''} ${song.copyright || ''}`.trim();
        this.elements.playerCopyright.textContent = copyrightText;

        console.log('🎵 Now playing:', fullTitle);
    }

    /**
     * Update play/pause button
     */
    updatePlayPauseButton(isPlaying) {
        if (isPlaying) {
            this.elements.playIcon.style.display = 'none';
            this.elements.pauseIcon.style.display = 'block';
        } else {
            this.elements.playIcon.style.display = 'block';
            this.elements.pauseIcon.style.display = 'none';
        }
    }

    /**
     * Update progress slider (only if not currently seeking)
     */
    updateProgress(position, duration) {
        if (duration > 0 && !this.isSeeking) {
            const percent = (position / duration) * 100;
            this.elements.progressSlider.value = percent;
            this.elements.progressSlider.style.setProperty('--progress', `${percent}%`);
        }

        this.elements.currentTime.textContent = this.formatTime(position);
    }

    /**
     * Update duration display
     */
    updateDuration(duration) {
        this.elements.durationTime.textContent = this.formatTime(duration);
    }

    /**
     * Update volume slider
     */
    updateVolume(volume) {
        this.elements.volumeSlider.value = volume;
    }

    /**
     * Update volume/mute button icon
     */
    updateVolumeButton(isMuted, volume) {
        if (isMuted || volume === 0) {
            this.elements.volumeIcon.style.display = 'none';
            this.elements.muteIcon.style.display = 'block';
        } else {
            this.elements.volumeIcon.style.display = 'block';
            this.elements.muteIcon.style.display = 'none';
        }
    }

    /**
     * Get progress slider value
     */
    getProgressValue() {
        return parseFloat(this.elements.progressSlider.value);
    }

    /**
     * Get volume slider value
     */
    getVolumeValue() {
        return parseFloat(this.elements.volumeSlider.value);
    }

    /**
     * Set seeking state
     */
    setSeekingState(seeking) {
        this.isSeeking = seeking;
    }

    /**
     * Update playback speed display
     */
    updateSpeed(rate) {
        if (this.elements.speedLabel) {
            this.elements.speedLabel.textContent = `${rate}×`;
        }
    }

    /**
     * Update loop button state
     */
    updateLoop(isLooping) {
        if (this.elements.loopBtn) {
            if (isLooping) {
                this.elements.loopBtn.classList.add('active');
            } else {
                this.elements.loopBtn.classList.remove('active');
            }
        }
    }

    /**
     * Format time in seconds to MM:SS
     */
    formatTime(seconds) {
        if (!isFinite(seconds) || seconds < 0) return '0:00';

        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    /**
     * Attach event listener to an element
     */
    on(elementName, event, handler) {
        const element = this.elements[elementName];
        if (element) {
            element.addEventListener(event, handler);
        } else {
            console.warn(`Element "${elementName}" not found in view`);
        }
    }
}
