/**
 * ConfigLoader - Loads and parses the YAML configuration file
 *
 * Copyright © 2026 FlowGaia. All rights reserved.
 *
 * This source code is licensed under the copyright of FlowGaia.
 * Unauthorized copying, distribution, or modification is prohibited.
 */
class ConfigLoader {
    constructor(configPath = 'config.yaml') {
        this.configPath = configPath;
        this.config = null;
        this.albums = [];
        this.allSongs = [];
    }

    /**
     * Load and parse the YAML configuration
     */
    async load() {
        try {
            // Add cache-busting timestamp to prevent stale configs
            const timestamp = new Date().getTime();
            const configUrl = `${this.configPath}?t=${timestamp}`;

            const response = await fetch(configUrl, {
                cache: 'no-store', // Prevent browser caching
                headers: {
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Pragma': 'no-cache',
                    'Expires': '0'
                }
            });

            if (!response.ok) {
                throw new Error(`Failed to load config: ${response.statusText}`);
            }
            const yamlText = await response.text();
            this.config = jsyaml.load(yamlText);
            this.processConfig();
            return this.config;
        } catch (error) {
            console.error('Error loading configuration:', error);
            throw error;
        }
    }

    /**
     * Process the loaded configuration
     */
    processConfig() {
        if (!this.config || !this.config.albums) {
            return;
        }

        this.albums = this.config.albums;

        // Flatten all songs from all albums
        this.allSongs = [];
        this.albums.forEach(album => {
            if (album.songs && Array.isArray(album.songs)) {
                album.songs.forEach(song => {
                    // Add album reference to song
                    song.album = {
                        id: album.id,
                        title: album.title,
                        artist: album.artist,
                        cover: album.cover
                    };
                    this.allSongs.push(song);
                });
            }
        });
    }

    /**
     * Get site metadata
     */
    getSiteInfo() {
        return this.config?.site || {};
    }

    /**
     * Get all albums
     */
    getAlbums() {
        return this.albums;
    }

    /**
     * Get all songs (flattened from all albums)
     */
    getAllSongs() {
        return this.allSongs;
    }

    /**
     * Get a specific song by ID
     */
    getSongById(songId) {
        return this.allSongs.find(song => song.id === songId);
    }

    /**
     * Get a specific album by ID
     */
    getAlbumById(albumId) {
        return this.albums.find(album => album.id === albumId);
    }

    /**
     * Get featured songs (first song from each album)
     */
    getFeaturedSongs() {
        return this.albums
            .filter(album => album.songs && album.songs.length > 0)
            .map(album => album.songs[0]);
    }

    /**
     * Get songs by tag
     */
    getSongsByTag(tag) {
        return this.allSongs.filter(song =>
            song.tags && song.tags.includes(tag)
        );
    }
}
