use serde::{Deserialize, Serialize};

use crate::model::{Album, PlaybackState, PlayerState, Playlist, Queue, RepeatMode, Track};
use crate::search::{search_albums, search_tracks};
use crate::shuffle::fisher_yates_shuffle;

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/// Every action the UI can request.
///
/// Serialised with `serde` using an internally-tagged representation so the
/// JavaScript side can send `{ "type": "Play" }` or
/// `{ "type": "PlayTrack", "payload": "track-id-123" }`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload")]
pub enum Command {
    /// Resume playback of the current track.
    Play,
    /// Pause playback.
    Pause,
    /// Advance to the next track (respects repeat mode and queue).
    Next,
    /// Go back to the previous track.
    Previous,
    /// Seek to a position (seconds) within the current track.
    Seek(f64),
    /// Start playback of a specific track by ID (must exist in the playlist).
    PlayTrack(String),
    /// Load an album as the current playlist by album ID.
    LoadAlbum(String),
    /// Append a track (by ID) to the end of the transient queue.
    AddToQueue(String),
    /// Remove the track at `index` from the queue.
    RemoveFromQueue(usize),
    /// Move a queue entry from one index to another.
    ReorderQueue { from: usize, to: usize },
    /// Toggle shuffle on/off for the current playlist.
    ToggleShuffle,
    /// Set the repeat mode: `"off"`, `"all"`, or `"one"`.
    SetRepeat(String),
    /// Full-text search across the library.
    Search(String),
    /// Replace (merge) the track catalogue with the supplied list.
    LoadTracks(Vec<Track>),
    /// Replace the album catalogue with the supplied list.
    LoadAlbums(Vec<Album>),
    /// Inform the core which track IDs are stored locally.
    SetDownloaded(Vec<String>),
    /// Load the downloaded tracks as the current playlist.
    LoadDownloaded,
    /// Restore a previously-persisted playback session (playlist, queue,
    /// shuffle, repeat, last track).  The library (tracks + albums) must
    /// already be loaded before this command is issued.
    RestoreState(PersistedState),
}

// ---------------------------------------------------------------------------
// Persisted session state
// ---------------------------------------------------------------------------

/// A lightweight snapshot of the session saved to IndexedDB and sent back via
/// `RestoreState` on the next app launch.  The library (tracks + albums) is
/// **not** included — it is always reloaded from `music.json`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PersistedState {
    /// The track that was playing when the session was saved.
    pub current_track_id: Option<String>,
    /// The ordered list of track IDs in the current playlist.
    pub playlist_track_ids: Vec<String>,
    /// Cursor position in the playlist.
    pub playlist_position: Option<usize>,
    /// Un-shuffled order preserved so shuffle-off restores the original sequence.
    pub original_playlist_order: Vec<String>,
    /// Serialised `RepeatMode` variant name (`"Off"`, `"All"`, `"One"`).
    pub repeat_mode: RepeatMode,
    /// Whether shuffle is currently enabled.
    pub shuffle_enabled: bool,
    /// The album that was loaded when the session was saved.  Used to restore
    /// `current_album_index` for cross-album navigation on the next launch.
    /// Absent in older saved states — treated as `None`.
    #[serde(default)]
    pub current_album_id: Option<String>,
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

/// Everything the core can emit back to the UI.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload")]
pub enum Event {
    /// The active track changed.
    TrackChanged(NowPlayingInfo),
    /// `"playing"`, `"paused"`, or `"stopped"`.
    PlaybackStateChanged(String),
    /// The transient queue was modified.
    QueueUpdated(QueueInfo),
    /// The active playlist was modified or re-ordered.
    PlaylistUpdated(PlaylistInfo),
    /// Results from a `Search` command.
    SearchResults(SearchResultsInfo),
    /// A human-readable error message.
    Error(String),
    /// Shuffle state changed; payload is the new value.
    ShuffleChanged(bool),
    /// Repeat mode changed; payload is `"off"`, `"all"`, or `"one"`.
    RepeatChanged(String),
    /// The downloaded-tracks playlist was built and is ready.
    DownloadedLoaded(PlaylistInfo),
}

// ---------------------------------------------------------------------------
// Rich payloads
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NowPlayingInfo {
    pub track_id: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub artwork_url: String,
    pub duration: f64,
    /// Index in the active playlist, if known.
    pub playlist_position: Option<usize>,
    /// Index in the transient queue, if playback is in queue mode.
    pub queue_position: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueueInfo {
    pub tracks: Vec<TrackSummary>,
    pub current_position: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlaylistInfo {
    pub tracks: Vec<TrackSummary>,
    pub current_position: Option<usize>,
    /// Display name for the playlist (usually an album name).
    pub album_name: Option<String>,
    /// The album ID for the current playlist, if loaded from an album.
    /// Used by the JS layer to persist and restore which album is loaded.
    pub album_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrackSummary {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub duration: f64,
    pub track_number: u32,
    pub artwork_url: String,
    /// Whether this track is locally stored.
    pub is_downloaded: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResultsInfo {
    pub tracks: Vec<TrackSummary>,
    pub albums: Vec<AlbumSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AlbumSummary {
    pub id: String,
    pub name: String,
    pub artist: String,
    pub artwork_url: String,
    pub track_count: usize,
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

/// The central state machine.  All mutations flow through `dispatch`.
pub struct Controller {
    pub state: PlayerState,
    /// Track IDs that are present in local storage.
    pub downloaded_track_ids: Vec<String>,
}

impl Controller {
    pub fn new() -> Self {
        Controller {
            state: PlayerState::default(),
            downloaded_track_ids: Vec::new(),
        }
    }

    /// Route a `Command` to the appropriate handler and return the resulting
    /// `Event`s.  The caller is responsible for applying side-effects (e.g.
    /// actually starting/stopping audio) described by the events.
    pub fn dispatch(&mut self, cmd: Command) -> Vec<Event> {
        match cmd {
            Command::Play => self.handle_play(),
            Command::Pause => self.handle_pause(),
            Command::Next => self.handle_next(),
            Command::Previous => self.handle_previous(),
            Command::Seek(_pos) => vec![Event::PlaybackStateChanged("seeking".into())],
            Command::PlayTrack(id) => self.handle_play_track(id),
            Command::LoadAlbum(id) => self.handle_load_album(id),
            Command::AddToQueue(id) => self.handle_add_to_queue(id),
            Command::RemoveFromQueue(idx) => self.handle_remove_from_queue(idx),
            Command::ReorderQueue { from, to } => self.handle_reorder_queue(from, to),
            Command::ToggleShuffle => self.handle_toggle_shuffle(),
            Command::SetRepeat(mode) => self.handle_set_repeat(mode),
            Command::Search(query) => self.handle_search(query),
            Command::LoadTracks(tracks) => self.handle_load_tracks(tracks),
            Command::LoadAlbums(albums) => self.handle_load_albums(albums),
            Command::SetDownloaded(ids) => {
                self.downloaded_track_ids = ids;
                vec![]
            }
            Command::LoadDownloaded => self.handle_load_downloaded(),
            Command::RestoreState(saved) => self.handle_restore_state(saved),
        }
    }

    // -----------------------------------------------------------------------
    // Command handlers
    // -----------------------------------------------------------------------

    fn handle_play(&mut self) -> Vec<Event> {
        self.state.playback_state = PlaybackState::Playing;
        let mut events = vec![Event::PlaybackStateChanged("playing".into())];
        if let Some(info) = self.now_playing_info() {
            events.push(Event::TrackChanged(info));
        }
        events
    }

    fn handle_pause(&mut self) -> Vec<Event> {
        self.state.playback_state = PlaybackState::Paused;
        vec![Event::PlaybackStateChanged("paused".into())]
    }

    fn handle_next(&mut self) -> Vec<Event> {
        // RepeatMode::One – replay the current track.
        if self.state.repeat_mode == RepeatMode::One {
            self.state.playback_state = PlaybackState::Playing;
            if let Some(info) = self.now_playing_info() {
                return vec![
                    Event::TrackChanged(info),
                    Event::PlaybackStateChanged("playing".into()),
                ];
            }
        }

        // Try to advance within the transient queue first.
        if let Some(track_id) = self.try_advance_queue() {
            self.state.playback_state = PlaybackState::Playing;
            let info = self.make_now_playing(&track_id);
            let queue_info = self.make_queue_info();
            return vec![
                Event::TrackChanged(info),
                Event::PlaybackStateChanged("playing".into()),
                Event::QueueUpdated(queue_info),
            ];
        }

        // Queue exhausted or empty – check whether we were in queue mode and
        // need to restore the playlist cursor before advancing.
        let was_in_queue = !self.state.current_queue.track_ids.is_empty()
            && self.state.current_queue.current_position.is_some();

        if was_in_queue {
            if let Some(saved_pos) = self.state.current_queue.source_playlist_position {
                self.state.current_playlist.current_position = Some(saved_pos);
            }
            self.state.current_queue = Queue::new();
        }

        // Advance the playlist.
        match self.try_advance_playlist() {
            Some(track_id) => {
                self.state.playback_state = PlaybackState::Playing;
                let info = self.make_now_playing(&track_id);
                let playlist_info = self.make_playlist_info();
                vec![
                    Event::TrackChanged(info),
                    Event::PlaybackStateChanged("playing".into()),
                    Event::PlaylistUpdated(playlist_info),
                ]
            }
            None => {
                // End of playlist — attempt to advance to the next album.
                if let Some(album_events) = self.try_advance_to_next_album() {
                    album_events
                } else {
                    // Truly at the end of the library (repeat off).
                    self.state.playback_state = PlaybackState::Stopped;
                    vec![Event::PlaybackStateChanged("stopped".into())]
                }
            }
        }
    }

    fn handle_previous(&mut self) -> Vec<Event> {
        // RepeatMode::One – replay the current track.
        if self.state.repeat_mode == RepeatMode::One {
            self.state.playback_state = PlaybackState::Playing;
            if let Some(info) = self.now_playing_info() {
                return vec![
                    Event::TrackChanged(info),
                    Event::PlaybackStateChanged("playing".into()),
                ];
            }
        }

        // If we are actively inside the queue, try to go back within it.
        let in_queue = self.state.current_queue.current_position.is_some();
        if in_queue {
            let pos = self.state.current_queue.current_position.unwrap();
            if pos > 0 {
                // Go back one step within the queue.
                let prev = pos - 1;
                self.state.current_queue.current_position = Some(prev);
                let track_id = self.state.current_queue.track_ids[prev].clone();
                self.state.playback_state = PlaybackState::Playing;
                let info = self.make_now_playing(&track_id);
                let queue_info = self.make_queue_info();
                return vec![
                    Event::TrackChanged(info),
                    Event::PlaybackStateChanged("playing".into()),
                    Event::QueueUpdated(queue_info),
                ];
            }
            // At the start of the queue – abandon the queue and resume the
            // playlist at the track we were on before entering the queue.
            // We do NOT retreat further; the playlist cursor is restored as-is.
            let saved_pos = self.state.current_queue.source_playlist_position;
            self.state.current_queue = Queue::new();
            if let Some(p) = saved_pos {
                self.state.current_playlist.current_position = Some(p);
                if let Some(id) = self.state.current_playlist.track_ids.get(p).cloned() {
                    self.state.playback_state = PlaybackState::Playing;
                    let info = self.make_now_playing(&id);
                    let playlist_info = self.make_playlist_info();
                    return vec![
                        Event::TrackChanged(info),
                        Event::PlaybackStateChanged("playing".into()),
                        Event::PlaylistUpdated(playlist_info),
                    ];
                }
            }
            // No saved position; fall through to normal playlist retreat.
        }

        // Retreat in the playlist.
        match self.try_retreat_playlist() {
            Some(track_id) => {
                self.state.playback_state = PlaybackState::Playing;
                let info = self.make_now_playing(&track_id);
                let playlist_info = self.make_playlist_info();
                vec![
                    Event::TrackChanged(info),
                    Event::PlaybackStateChanged("playing".into()),
                    Event::PlaylistUpdated(playlist_info),
                ]
            }
            None => {
                // Start of playlist — attempt to retreat to the previous album.
                if let Some(album_events) = self.try_retreat_to_prev_album() {
                    album_events
                } else {
                    vec![Event::PlaybackStateChanged(self.state_str())]
                }
            }
        }
    }

    fn handle_play_track(&mut self, id: String) -> Vec<Event> {
        match self
            .state
            .current_playlist
            .track_ids
            .iter()
            .position(|t| *t == id)
        {
            Some(pos) => {
                self.state.current_playlist.current_position = Some(pos);
                self.state.current_queue = Queue::new();
                self.state.playback_state = PlaybackState::Playing;
                let info = self.make_now_playing(&id);
                let playlist_info = self.make_playlist_info();
                vec![
                    Event::TrackChanged(info),
                    Event::PlaybackStateChanged("playing".into()),
                    Event::PlaylistUpdated(playlist_info),
                ]
            }
            None => vec![Event::Error(format!("Track {} not in playlist", id))],
        }
    }

    fn handle_load_album(&mut self, album_id: String) -> Vec<Event> {
        match self.state.albums.iter().find(|a| a.id == album_id).cloned() {
            Some(album) => {
                let track_ids = album.track_ids.clone();
                self.state.original_playlist_order = track_ids.clone();
                self.state.current_playlist = Playlist {
                    track_ids: track_ids.clone(),
                    current_position: None,
                };
                self.state.current_queue = Queue::new();
                // Track which album is loaded for cross-album navigation.
                self.state.current_album_index =
                    self.state.albums.iter().position(|a| a.id == album_id);
                self.state.current_album_id = Some(album_id.clone());
                if self.state.shuffle_enabled {
                    fisher_yates_shuffle(&mut self.state.current_playlist.track_ids);
                }
                let playlist_info = self.make_playlist_info_with_album(&album.name);
                vec![Event::PlaylistUpdated(playlist_info)]
            }
            None => vec![Event::Error(format!("Album {} not found", album_id))],
        }
    }

    fn handle_add_to_queue(&mut self, id: String) -> Vec<Event> {
        if !self.state.tracks.contains_key(&id) {
            return vec![Event::Error(format!("Track {} not found", id))];
        }
        self.state.current_queue.add(id);
        let queue_info = self.make_queue_info();
        vec![Event::QueueUpdated(queue_info)]
    }

    fn handle_remove_from_queue(&mut self, idx: usize) -> Vec<Event> {
        self.state.current_queue.remove(idx);
        let queue_info = self.make_queue_info();
        vec![Event::QueueUpdated(queue_info)]
    }

    fn handle_reorder_queue(&mut self, from: usize, to: usize) -> Vec<Event> {
        self.state.current_queue.reorder(from, to);
        let queue_info = self.make_queue_info();
        vec![Event::QueueUpdated(queue_info)]
    }

    fn handle_toggle_shuffle(&mut self) -> Vec<Event> {
        self.state.shuffle_enabled = !self.state.shuffle_enabled;

        if self.state.shuffle_enabled {
            // Capture the currently-playing track ID before shuffling.
            let current_track: Option<String> = self
                .state
                .current_playlist
                .current_position
                .and_then(|p| self.state.current_playlist.track_ids.get(p).cloned());

            fisher_yates_shuffle(&mut self.state.current_playlist.track_ids);

            // Ensure the playing track stays at the front so the user doesn't
            // jump mid-listen.
            if let Some(ref ct) = current_track {
                if let Some(pos) = self
                    .state
                    .current_playlist
                    .track_ids
                    .iter()
                    .position(|t| t == ct)
                {
                    self.state.current_playlist.track_ids.swap(0, pos);
                    self.state.current_playlist.current_position = Some(0);
                }
            }
        } else {
            // Restore the un-shuffled order.
            let current_track: Option<String> = self
                .state
                .current_playlist
                .current_position
                .and_then(|p| self.state.current_playlist.track_ids.get(p).cloned());

            self.state.current_playlist.track_ids = self.state.original_playlist_order.clone();

            // Re-locate the cursor in the restored order.
            if let Some(ref ct) = current_track {
                self.state.current_playlist.current_position = self
                    .state
                    .current_playlist
                    .track_ids
                    .iter()
                    .position(|t| t == ct);
            }
        }

        let playlist_info = self.make_playlist_info();
        vec![
            Event::ShuffleChanged(self.state.shuffle_enabled),
            Event::PlaylistUpdated(playlist_info),
        ]
    }

    fn handle_set_repeat(&mut self, mode: String) -> Vec<Event> {
        self.state.repeat_mode = match mode.as_str() {
            "one" => RepeatMode::One,
            "all" => RepeatMode::All,
            _ => RepeatMode::Off,
        };
        let mode_str = self.repeat_str();
        vec![Event::RepeatChanged(mode_str)]
    }

    fn handle_search(&mut self, query: String) -> Vec<Event> {
        let tracks: Vec<&Track> = self.state.tracks.values().collect();
        let matched_tracks = search_tracks(&tracks, &query);
        let matched_albums = search_albums(&self.state.albums, &query);

        let track_summaries: Vec<TrackSummary> = matched_tracks
            .iter()
            .map(|t| self.track_to_summary(t))
            .collect();
        let album_summaries: Vec<AlbumSummary> = matched_albums
            .iter()
            .map(|a| AlbumSummary {
                id: a.id.clone(),
                name: a.name.clone(),
                artist: a.artist.clone(),
                artwork_url: a.artwork_url.clone(),
                track_count: a.track_ids.len(),
            })
            .collect();

        vec![Event::SearchResults(SearchResultsInfo {
            tracks: track_summaries,
            albums: album_summaries,
        })]
    }

    fn handle_load_tracks(&mut self, tracks: Vec<Track>) -> Vec<Event> {
        for track in tracks {
            self.state.tracks.insert(track.id.clone(), track);
        }
        vec![]
    }

    fn handle_load_albums(&mut self, albums: Vec<Album>) -> Vec<Event> {
        self.state.albums = albums;
        vec![]
    }

    fn handle_restore_state(&mut self, saved: PersistedState) -> Vec<Event> {
        // Restore playlist (only track IDs known to the library are kept).
        let valid_ids: Vec<String> = saved
            .playlist_track_ids
            .into_iter()
            .filter(|id| self.state.tracks.contains_key(id))
            .collect();

        let original_order: Vec<String> = if saved.original_playlist_order.is_empty() {
            valid_ids.clone()
        } else {
            saved
                .original_playlist_order
                .into_iter()
                .filter(|id| self.state.tracks.contains_key(id))
                .collect()
        };

        // Clamp the cursor to the new length.
        let position = saved.playlist_position.filter(|&p| p < valid_ids.len());

        self.state.current_playlist = Playlist {
            track_ids: valid_ids,
            current_position: position,
        };
        self.state.original_playlist_order = original_order;
        self.state.shuffle_enabled = saved.shuffle_enabled;
        self.state.repeat_mode = saved.repeat_mode;
        // Restore as Paused — never auto-play on startup (blocks mobile autoplay).
        self.state.playback_state = PlaybackState::Paused;

        // Restore cross-album navigation state.
        if let Some(ref album_id) = saved.current_album_id {
            self.state.current_album_id = Some(album_id.clone());
            self.state.current_album_index =
                self.state.albums.iter().position(|a| &a.id == album_id);
        }

        let mut events: Vec<Event> = vec![
            Event::ShuffleChanged(self.state.shuffle_enabled),
            Event::RepeatChanged(self.repeat_str()),
            Event::PlaylistUpdated(self.make_playlist_info()),
        ];

        // Emit TrackChanged so the mini-player shows the last track.
        if let Some(track_id) = &saved.current_track_id {
            if self.state.tracks.contains_key(track_id.as_str()) {
                events.push(Event::TrackChanged(self.make_now_playing(track_id)));
                events.push(Event::PlaybackStateChanged("paused".into()));
            }
        }

        events
    }

    fn handle_load_downloaded(&mut self) -> Vec<Event> {
        let track_ids = self.downloaded_track_ids.clone();

        let mut summaries: Vec<TrackSummary> = track_ids
            .iter()
            .filter_map(|id| self.state.tracks.get(id))
            .map(|t| self.track_to_summary(t))
            .collect();

        // Sort by artist → album → track number for a predictable library view.
        summaries.sort_by(|a, b| {
            a.artist
                .cmp(&b.artist)
                .then(a.album.cmp(&b.album))
                .then(a.track_number.cmp(&b.track_number))
        });

        let new_track_ids: Vec<String> = summaries.iter().map(|s| s.id.clone()).collect();

        self.state.current_playlist = Playlist {
            track_ids: new_track_ids.clone(),
            current_position: None,
        };
        self.state.original_playlist_order = new_track_ids;
        self.state.current_queue = Queue::new();

        let playlist_info = PlaylistInfo {
            tracks: summaries,
            current_position: None,
            album_name: Some("Downloaded".into()),
            album_id: None,
        };

        vec![Event::DownloadedLoaded(playlist_info)]
    }

    // -----------------------------------------------------------------------
    // Navigation helpers
    // -----------------------------------------------------------------------

    /// Try to move the queue cursor one step forward.
    ///
    /// Saves the playlist position the first time playback enters the queue so
    /// that we can restore it when the queue is exhausted.
    ///
    /// Returns `Some(track_id)` on success or `None` when the queue is empty /
    /// already at its last entry.
    fn try_advance_queue(&mut self) -> Option<String> {
        if self.state.current_queue.track_ids.is_empty() {
            return None;
        }

        // Record where in the playlist we were the first time we dip into the
        // queue.
        if self.state.current_queue.current_position.is_none() {
            self.state.current_queue.source_playlist_position =
                self.state.current_playlist.current_position;
        }

        let next_pos = match self.state.current_queue.current_position {
            None => 0,
            Some(p) => p + 1,
        };

        if next_pos < self.state.current_queue.track_ids.len() {
            self.state.current_queue.current_position = Some(next_pos);
            Some(self.state.current_queue.track_ids[next_pos].clone())
        } else {
            None
        }
    }

    /// Advance the playlist cursor by one position and return the track ID.
    ///
    /// Returns `None` when the end of the playlist is reached.  The caller
    /// (`handle_next`) is responsible for deciding whether to advance to the
    /// next album or stop.
    fn try_advance_playlist(&mut self) -> Option<String> {
        let len = self.state.current_playlist.track_ids.len();
        if len == 0 {
            return None;
        }

        let next_pos = match self.state.current_playlist.current_position {
            None => 0,
            Some(p) => p + 1,
        };

        if next_pos < len {
            self.state.current_playlist.current_position = Some(next_pos);
            Some(self.state.current_playlist.track_ids[next_pos].clone())
        } else {
            None
        }
    }

    /// Retreat the playlist cursor by one position and return the track ID.
    ///
    /// Returns `None` when already at the beginning.  The caller
    /// (`handle_previous`) is responsible for deciding whether to retreat to
    /// the previous album or stay.
    fn try_retreat_playlist(&mut self) -> Option<String> {
        let len = self.state.current_playlist.track_ids.len();
        if len == 0 {
            return None;
        }

        match self.state.current_playlist.current_position {
            None | Some(0) => None,
            Some(p) => {
                let prev = p - 1;
                self.state.current_playlist.current_position = Some(prev);
                Some(self.state.current_playlist.track_ids[prev].clone())
            }
        }
    }

    /// Attempt to advance to the first track of the next album in the library.
    ///
    /// - If a next album exists, it is loaded and its first track starts playing.
    /// - If we are on the last album and `RepeatMode::All` is set, wrap around
    ///   to the first album.
    /// - Otherwise (last album + repeat off) return `None` so the caller can stop.
    fn try_advance_to_next_album(&mut self) -> Option<Vec<Event>> {
        let current_idx = self.state.current_album_index?;
        let num_albums = self.state.albums.len();

        let next_idx = if current_idx + 1 < num_albums {
            current_idx + 1
        } else if self.state.repeat_mode == RepeatMode::All && num_albums > 0 {
            0
        } else {
            return None;
        };

        let album_id = self.state.albums[next_idx].id.clone();
        // Load the album — sets up playlist, queue, and current_album_index.
        let mut events = self.handle_load_album(album_id);

        // Start playing the first track immediately.
        if let Some(track_id) = self.state.current_playlist.track_ids.first().cloned() {
            self.state.current_playlist.current_position = Some(0);
            self.state.playback_state = PlaybackState::Playing;
            let info = self.make_now_playing(&track_id);
            let playlist_info = self.make_playlist_info();
            events.push(Event::TrackChanged(info));
            events.push(Event::PlaybackStateChanged("playing".into()));
            events.push(Event::PlaylistUpdated(playlist_info));
        }

        Some(events)
    }

    /// Attempt to retreat to the last track of the previous album in the library.
    ///
    /// - If a previous album exists, it is loaded and its last track starts playing.
    /// - If we are on the first album and `RepeatMode::All` is set, wrap around
    ///   to the last album.
    /// - Otherwise (first album + repeat off) return `None` so the caller can stay.
    fn try_retreat_to_prev_album(&mut self) -> Option<Vec<Event>> {
        let current_idx = self.state.current_album_index?;
        let num_albums = self.state.albums.len();

        let prev_idx = if current_idx > 0 {
            current_idx - 1
        } else if self.state.repeat_mode == RepeatMode::All && num_albums > 0 {
            num_albums - 1
        } else {
            return None;
        };

        let album_id = self.state.albums[prev_idx].id.clone();
        // Load the album — sets up playlist, queue, and current_album_index.
        let mut events = self.handle_load_album(album_id);

        // Start playing the last track (going backwards).
        let last_pos = self.state.current_playlist.track_ids.len().checked_sub(1)?;
        let track_id = self.state.current_playlist.track_ids[last_pos].clone();
        self.state.current_playlist.current_position = Some(last_pos);
        self.state.playback_state = PlaybackState::Playing;
        let info = self.make_now_playing(&track_id);
        let playlist_info = self.make_playlist_info();
        events.push(Event::TrackChanged(info));
        events.push(Event::PlaybackStateChanged("playing".into()));
        events.push(Event::PlaylistUpdated(playlist_info));

        Some(events)
    }

    // -----------------------------------------------------------------------
    // Info builders
    // -----------------------------------------------------------------------

    /// Return the current `NowPlayingInfo`, preferring the queue cursor over
    /// the playlist cursor when the queue is active.
    fn now_playing_info(&self) -> Option<NowPlayingInfo> {
        if let Some(pos) = self.state.current_queue.current_position {
            if let Some(id) = self.state.current_queue.track_ids.get(pos) {
                return Some(self.make_now_playing(id));
            }
        }
        if let Some(pos) = self.state.current_playlist.current_position {
            if let Some(id) = self.state.current_playlist.track_ids.get(pos) {
                return Some(self.make_now_playing(id));
            }
        }
        None
    }

    fn make_now_playing(&self, track_id: &str) -> NowPlayingInfo {
        match self.state.tracks.get(track_id) {
            Some(track) => NowPlayingInfo {
                track_id: track_id.to_string(),
                title: track.title.clone(),
                artist: track.artist.clone(),
                album: track.album.clone(),
                artwork_url: track.artwork_url.clone(),
                duration: track.duration,
                playlist_position: self.state.current_playlist.current_position,
                queue_position: self.state.current_queue.current_position,
            },
            None => NowPlayingInfo {
                track_id: track_id.to_string(),
                title: "Unknown".into(),
                artist: "Unknown".into(),
                album: "Unknown".into(),
                artwork_url: String::new(),
                duration: 0.0,
                playlist_position: None,
                queue_position: None,
            },
        }
    }

    fn make_queue_info(&self) -> QueueInfo {
        QueueInfo {
            tracks: self
                .state
                .current_queue
                .track_ids
                .iter()
                .filter_map(|id| self.state.tracks.get(id))
                .map(|t| self.track_to_summary(t))
                .collect(),
            current_position: self.state.current_queue.current_position,
        }
    }

    fn make_playlist_info(&self) -> PlaylistInfo {
        let album_name = self.current_album_name();
        self.make_playlist_info_with_album_opt(album_name)
    }

    fn make_playlist_info_with_album(&self, album_name: &str) -> PlaylistInfo {
        self.make_playlist_info_with_album_opt(Some(album_name.to_string()))
    }

    fn make_playlist_info_with_album_opt(&self, album_name: Option<String>) -> PlaylistInfo {
        PlaylistInfo {
            tracks: self
                .state
                .current_playlist
                .track_ids
                .iter()
                .filter_map(|id| self.state.tracks.get(id))
                .map(|t| self.track_to_summary(t))
                .collect(),
            current_position: self.state.current_playlist.current_position,
            album_name,
            album_id: self.state.current_album_id.clone(),
        }
    }

    /// Derive a display name for the current playlist from the first track's
    /// album field.
    fn current_album_name(&self) -> Option<String> {
        self.state
            .current_playlist
            .track_ids
            .first()
            .and_then(|id| self.state.tracks.get(id))
            .map(|t| t.album.clone())
    }

    fn track_to_summary(&self, track: &Track) -> TrackSummary {
        TrackSummary {
            id: track.id.clone(),
            title: track.title.clone(),
            artist: track.artist.clone(),
            album: track.album.clone(),
            duration: track.duration,
            track_number: track.track_number,
            artwork_url: track.artwork_url.clone(),
            is_downloaded: self.downloaded_track_ids.contains(&track.id),
        }
    }

    // -----------------------------------------------------------------------
    // String helpers
    // -----------------------------------------------------------------------

    fn state_str(&self) -> String {
        match self.state.playback_state {
            PlaybackState::Playing => "playing".into(),
            PlaybackState::Paused => "paused".into(),
            PlaybackState::Stopped => "stopped".into(),
        }
    }

    fn repeat_str(&self) -> String {
        match self.state.repeat_mode {
            RepeatMode::Off => "off".into(),
            RepeatMode::All => "all".into(),
            RepeatMode::One => "one".into(),
        }
    }
}

impl Default for Controller {
    fn default() -> Self {
        Self::new()
    }
}
