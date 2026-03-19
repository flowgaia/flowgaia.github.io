use std::collections::HashMap;
use serde::{Deserialize, Serialize};

/// A single music track with all associated metadata.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Track {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    /// Duration in seconds.
    pub duration: f64,
    pub track_number: u32,
    /// URI pointing to the audio resource (e.g. a blob URL or remote URL).
    pub uri: String,
    /// URL for the album artwork image.
    pub artwork_url: String,
}

/// An album containing ordered references to tracks.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Album {
    pub id: String,
    pub name: String,
    pub artist: String,
    pub artwork_url: String,
    /// Ordered list of track IDs belonging to this album.
    pub track_ids: Vec<String>,
}

/// Controls how playback repeats after the current track or playlist ends.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub enum RepeatMode {
    /// No repeat — stop at end of playlist.
    Off,
    /// Repeat the entire playlist from the beginning when exhausted.
    All,
    /// Repeat the current track indefinitely.
    One,
}

/// High-level playback state.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub enum PlaybackState {
    Playing,
    Paused,
    Stopped,
}

/// An ordered list of track IDs with an optional cursor indicating which
/// track is currently selected.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Playlist {
    pub track_ids: Vec<String>,
    /// Index into `track_ids` for the currently active track, or `None` if
    /// no track has been selected yet.
    pub current_position: Option<usize>,
}

/// A transient queue of tracks that interrupts the main playlist. Tracks are
/// consumed in FIFO order; once exhausted, playback returns to the playlist.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Queue {
    pub track_ids: Vec<String>,
    /// Current cursor within the queue, or `None` if playback has not yet
    /// entered the queue.
    pub current_position: Option<usize>,
    /// Snapshot of the playlist position at the moment the queue was entered,
    /// so we can resume the playlist after the queue is exhausted.
    pub source_playlist_position: Option<usize>,
}

/// The complete, serialisable state of the music player.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct PlayerState {
    /// All known tracks, keyed by their `id`.
    pub tracks: HashMap<String, Track>,
    /// Ordered list of albums available in the library.
    pub albums: Vec<Album>,
    /// The active playlist (may be shuffled).
    pub current_playlist: Playlist,
    /// Tracks queued to play before the playlist resumes.
    pub current_queue: Queue,
    pub repeat_mode: RepeatMode,
    pub playback_state: PlaybackState,
    pub shuffle_enabled: bool,
    /// The un-shuffled ordering of the current playlist, preserved so that
    /// turning shuffle off restores the original sequence.
    pub original_playlist_order: Vec<String>,
}

impl Default for PlayerState {
    fn default() -> Self {
        Self {
            tracks: HashMap::new(),
            albums: Vec::new(),
            current_playlist: Playlist {
                track_ids: Vec::new(),
                current_position: None,
            },
            current_queue: Queue {
                track_ids: Vec::new(),
                current_position: None,
                source_playlist_position: None,
            },
            repeat_mode: RepeatMode::Off,
            playback_state: PlaybackState::Stopped,
            shuffle_enabled: false,
            original_playlist_order: Vec::new(),
        }
    }
}
