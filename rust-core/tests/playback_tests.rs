//! Integration tests for the playback state machine.
//!
//! Each test exercises the `Controller::dispatch` method directly without
//! going through the WASM boundary, so these run under normal `cargo test`.

use music_core::controller::{Command, Controller, Event};
use music_core::model::{Album, PlaybackState, RepeatMode, Track};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn make_track(id: &str, title: &str, track_number: u32) -> Track {
    Track {
        id: id.to_string(),
        title: title.to_string(),
        artist: "Test Artist".to_string(),
        album: "Test Album".to_string(),
        duration: 200.0,
        track_number,
        uri: format!("file://{}.mp3", id),
        artwork_url: String::new(),
    }
}

fn make_album(id: &str, track_ids: Vec<&str>) -> Album {
    Album {
        id: id.to_string(),
        name: "Test Album".to_string(),
        artist: "Test Artist".to_string(),
        artwork_url: String::new(),
        track_ids: track_ids.into_iter().map(String::from).collect(),
    }
}

/// Build a controller pre-loaded with `n` tracks and one album containing all
/// of them, with the album set as the active playlist.
fn controller_with_tracks(n: u32) -> Controller {
    let mut ctrl = Controller::new();

    let tracks: Vec<Track> = (1..=n)
        .map(|i| make_track(&format!("t{}", i), &format!("Track {}", i), i))
        .collect();
    let track_ids: Vec<&str> = tracks.iter().map(|t| t.id.as_str()).collect();
    let album = make_album("album1", track_ids);

    ctrl.dispatch(Command::LoadTracks(tracks));
    ctrl.dispatch(Command::LoadAlbums(vec![album]));
    ctrl.dispatch(Command::LoadAlbum("album1".into()));
    ctrl
}

/// Extract the first `TrackChanged` event from a list of events, panicking if
/// none is found.
fn track_changed_id(events: &[Event]) -> String {
    for e in events {
        if let Event::TrackChanged(info) = e {
            return info.track_id.clone();
        }
    }
    panic!("No TrackChanged event in: {:?}", events);
}

/// Return `true` if the events contain a `PlaybackStateChanged` with `state`.
fn has_state(events: &[Event], state: &str) -> bool {
    events
        .iter()
        .any(|e| matches!(e, Event::PlaybackStateChanged(s) if s == state))
}

fn has_stopped(events: &[Event]) -> bool {
    has_state(events, "stopped")
}

fn has_playing(events: &[Event]) -> bool {
    has_state(events, "playing")
}

// ---------------------------------------------------------------------------
// Basic play / pause
// ---------------------------------------------------------------------------

#[test]
fn play_sets_playing_state() {
    let mut ctrl = controller_with_tracks(3);
    let events = ctrl.dispatch(Command::Play);
    assert!(has_playing(&events));
    assert_eq!(ctrl.state.playback_state, PlaybackState::Playing);
}

#[test]
fn pause_sets_paused_state() {
    let mut ctrl = controller_with_tracks(3);
    ctrl.dispatch(Command::Play);
    let events = ctrl.dispatch(Command::Pause);
    assert!(has_state(&events, "paused"));
    assert_eq!(ctrl.state.playback_state, PlaybackState::Paused);
}

#[test]
fn play_does_not_emit_track_changed() {
    // Play (resume) must NOT emit TrackChanged — the track has not changed.
    // Re-emitting TrackChanged causes audio.js to reassign audio.src, which
    // resets audio.currentTime to 0 and discards any paused-seek position.
    let mut ctrl = controller_with_tracks(3);
    ctrl.dispatch(Command::Next); // land on t1
    ctrl.dispatch(Command::Pause);
    let events = ctrl.dispatch(Command::Play);
    assert!(
        has_playing(&events),
        "Play must emit PlaybackStateChanged(playing)"
    );
    let has_track_changed = events.iter().any(|e| matches!(e, Event::TrackChanged(_)));
    assert!(!has_track_changed, "Play must NOT emit TrackChanged");
}

// ---------------------------------------------------------------------------
// Next – RepeatMode::Off
// ---------------------------------------------------------------------------

#[test]
fn next_advances_through_playlist_repeat_off() {
    let mut ctrl = controller_with_tracks(3);

    // First Next from unset cursor → t1
    let e = ctrl.dispatch(Command::Next);
    assert_eq!(track_changed_id(&e), "t1");

    // Second Next → t2
    let e = ctrl.dispatch(Command::Next);
    assert_eq!(track_changed_id(&e), "t2");

    // Third Next → t3
    let e = ctrl.dispatch(Command::Next);
    assert_eq!(track_changed_id(&e), "t3");
}

#[test]
fn next_at_end_of_playlist_stops_repeat_off() {
    let mut ctrl = controller_with_tracks(2);
    ctrl.dispatch(Command::Next); // t1
    ctrl.dispatch(Command::Next); // t2

    let events = ctrl.dispatch(Command::Next); // exhausted
    assert!(has_stopped(&events));
    assert_eq!(ctrl.state.playback_state, PlaybackState::Stopped);
}

// ---------------------------------------------------------------------------
// Next – RepeatMode::All
// ---------------------------------------------------------------------------

#[test]
fn next_wraps_at_end_repeat_all() {
    let mut ctrl = controller_with_tracks(2);
    ctrl.dispatch(Command::SetRepeat("all".into()));

    ctrl.dispatch(Command::Next); // t1
    ctrl.dispatch(Command::Next); // t2

    // Should wrap to t1
    let events = ctrl.dispatch(Command::Next);
    assert!(has_playing(&events));
    assert_eq!(track_changed_id(&events), "t1");
    assert_eq!(ctrl.state.current_playlist.current_position, Some(0));
}

// ---------------------------------------------------------------------------
// Next – RepeatMode::One
// ---------------------------------------------------------------------------

#[test]
fn next_replays_current_track_repeat_one() {
    let mut ctrl = controller_with_tracks(3);
    ctrl.dispatch(Command::Next); // t1
    ctrl.dispatch(Command::SetRepeat("one".into()));

    // Next should replay t1, not advance to t2
    let events = ctrl.dispatch(Command::Next);
    assert!(has_playing(&events));
    assert_eq!(track_changed_id(&events), "t1");
    // Playlist cursor must remain at 0
    assert_eq!(ctrl.state.current_playlist.current_position, Some(0));
}

// ---------------------------------------------------------------------------
// Previous – RepeatMode::Off
// ---------------------------------------------------------------------------

#[test]
fn previous_goes_back_one_track() {
    let mut ctrl = controller_with_tracks(3);
    ctrl.dispatch(Command::Next); // t1
    ctrl.dispatch(Command::Next); // t2

    let events = ctrl.dispatch(Command::Previous);
    assert_eq!(track_changed_id(&events), "t1");
    assert_eq!(ctrl.state.current_playlist.current_position, Some(0));
}

#[test]
fn previous_at_start_does_nothing_repeat_off() {
    let mut ctrl = controller_with_tracks(3);
    ctrl.dispatch(Command::Next); // t1

    // At the start – Previous should not crash and should NOT change the track.
    let events = ctrl.dispatch(Command::Previous);
    // No TrackChanged expected; just a state event.
    assert!(!events.iter().any(|e| matches!(e, Event::TrackChanged(_))));
}

// ---------------------------------------------------------------------------
// Previous – RepeatMode::All
// ---------------------------------------------------------------------------

#[test]
fn previous_at_start_wraps_to_last_repeat_all() {
    let mut ctrl = controller_with_tracks(3);
    ctrl.dispatch(Command::SetRepeat("all".into()));
    ctrl.dispatch(Command::Next); // t1

    let events = ctrl.dispatch(Command::Previous); // should wrap to t3
    assert_eq!(track_changed_id(&events), "t3");
    assert_eq!(ctrl.state.current_playlist.current_position, Some(2));
}

// ---------------------------------------------------------------------------
// Previous – RepeatMode::One
// ---------------------------------------------------------------------------

#[test]
fn previous_replays_current_track_repeat_one() {
    let mut ctrl = controller_with_tracks(3);
    ctrl.dispatch(Command::Next); // t1
    ctrl.dispatch(Command::Next); // t2
    ctrl.dispatch(Command::SetRepeat("one".into()));

    // Previous should replay t2, not go back to t1
    let events = ctrl.dispatch(Command::Previous);
    assert_eq!(track_changed_id(&events), "t2");
    assert_eq!(ctrl.state.current_playlist.current_position, Some(1));
}

// ---------------------------------------------------------------------------
// Queue → Playlist resumption
// ---------------------------------------------------------------------------

#[test]
fn queue_tracks_play_before_playlist_resumes() {
    let mut ctrl = controller_with_tracks(3);
    // Land on t1 in the playlist.
    ctrl.dispatch(Command::Next); // playlist pos = 0 (t1)

    // Add q1 and q2 to the queue.
    let q1 = make_track("q1", "Queue Track 1", 1);
    let q2 = make_track("q2", "Queue Track 2", 2);
    ctrl.dispatch(Command::LoadTracks(vec![q1, q2]));
    ctrl.dispatch(Command::AddToQueue("q1".into()));
    ctrl.dispatch(Command::AddToQueue("q2".into()));

    // Next should enter the queue.
    let e = ctrl.dispatch(Command::Next);
    assert_eq!(track_changed_id(&e), "q1");
    assert!(ctrl.state.current_queue.current_position.is_some());

    let e = ctrl.dispatch(Command::Next);
    assert_eq!(track_changed_id(&e), "q2");

    // Queue exhausted – next Next should resume the playlist from t2.
    let e = ctrl.dispatch(Command::Next);
    assert_eq!(track_changed_id(&e), "t2");
    // Queue should be cleared.
    assert!(ctrl.state.current_queue.track_ids.is_empty());
}

#[test]
fn queue_source_playlist_position_is_saved_correctly() {
    let mut ctrl = controller_with_tracks(4);
    ctrl.dispatch(Command::Next); // t1
    ctrl.dispatch(Command::Next); // t2 (playlist pos = 1)

    let q = make_track("q1", "Queue Track", 1);
    ctrl.dispatch(Command::LoadTracks(vec![q]));
    ctrl.dispatch(Command::AddToQueue("q1".into()));

    // Enter queue
    ctrl.dispatch(Command::Next); // q1 – saves playlist pos 1

    assert_eq!(ctrl.state.current_queue.source_playlist_position, Some(1));

    // Exit queue → should continue from t3 (pos 2)
    let e = ctrl.dispatch(Command::Next);
    assert_eq!(track_changed_id(&e), "t3");
}

// ---------------------------------------------------------------------------
// Previous while in queue
// ---------------------------------------------------------------------------

#[test]
fn previous_while_in_queue_goes_back_in_queue() {
    let mut ctrl = controller_with_tracks(3);
    ctrl.dispatch(Command::Next); // t1

    let q1 = make_track("q1", "Queue Track 1", 1);
    let q2 = make_track("q2", "Queue Track 2", 2);
    ctrl.dispatch(Command::LoadTracks(vec![q1, q2]));
    ctrl.dispatch(Command::AddToQueue("q1".into()));
    ctrl.dispatch(Command::AddToQueue("q2".into()));

    ctrl.dispatch(Command::Next); // q1
    ctrl.dispatch(Command::Next); // q2

    let e = ctrl.dispatch(Command::Previous); // should go back to q1
    assert_eq!(track_changed_id(&e), "q1");
    assert_eq!(ctrl.state.current_queue.current_position, Some(0));
}

#[test]
fn previous_at_start_of_queue_falls_back_to_playlist() {
    let mut ctrl = controller_with_tracks(3);
    ctrl.dispatch(Command::Next); // t1 (playlist pos = 0)
    ctrl.dispatch(Command::Next); // t2 (playlist pos = 1)

    let q = make_track("q1", "Queue Track", 1);
    ctrl.dispatch(Command::LoadTracks(vec![q]));
    ctrl.dispatch(Command::AddToQueue("q1".into()));

    ctrl.dispatch(Command::Next); // enter queue at q1

    // Previous from start of queue → should land back in playlist at t2
    let e = ctrl.dispatch(Command::Previous);
    // Queue should be cleared.
    assert!(ctrl.state.current_queue.track_ids.is_empty());
    // TrackChanged should reflect the playlist track.
    assert_eq!(track_changed_id(&e), "t2");
}

// ---------------------------------------------------------------------------
// PlayTrack
// ---------------------------------------------------------------------------

#[test]
fn play_track_jumps_to_given_track() {
    let mut ctrl = controller_with_tracks(5);
    let events = ctrl.dispatch(Command::PlayTrack("t3".into()));
    assert_eq!(track_changed_id(&events), "t3");
    assert_eq!(ctrl.state.current_playlist.current_position, Some(2));
}

#[test]
fn play_track_clears_queue() {
    let mut ctrl = controller_with_tracks(3);

    let q = make_track("q1", "Queue Track", 1);
    ctrl.dispatch(Command::LoadTracks(vec![q]));
    ctrl.dispatch(Command::AddToQueue("q1".into()));

    ctrl.dispatch(Command::PlayTrack("t2".into()));
    assert!(ctrl.state.current_queue.track_ids.is_empty());
}

#[test]
fn play_track_not_in_playlist_returns_error() {
    let mut ctrl = controller_with_tracks(3);
    let events = ctrl.dispatch(Command::PlayTrack("nonexistent".into()));
    assert!(events.iter().any(|e| matches!(e, Event::Error(_))));
}

// ---------------------------------------------------------------------------
// LoadAlbum
// ---------------------------------------------------------------------------

#[test]
fn load_album_sets_playlist() {
    let mut ctrl = Controller::new();

    let tracks: Vec<Track> = vec![make_track("a", "Alpha", 1), make_track("b", "Beta", 2)];
    let album = make_album("alb", vec!["a", "b"]);
    ctrl.dispatch(Command::LoadTracks(tracks));
    ctrl.dispatch(Command::LoadAlbums(vec![album]));

    let events = ctrl.dispatch(Command::LoadAlbum("alb".into()));
    assert!(events
        .iter()
        .any(|e| matches!(e, Event::PlaylistUpdated(_))));
    assert_eq!(
        ctrl.state.current_playlist.track_ids,
        vec!["a".to_string(), "b".to_string()]
    );
}

#[test]
fn load_nonexistent_album_returns_error() {
    let mut ctrl = Controller::new();
    let events = ctrl.dispatch(Command::LoadAlbum("no-such-album".into()));
    assert!(events.iter().any(|e| matches!(e, Event::Error(_))));
}

// ---------------------------------------------------------------------------
// Shuffle
// ---------------------------------------------------------------------------

#[test]
fn toggle_shuffle_on_preserves_all_track_ids() {
    let mut ctrl = controller_with_tracks(10);
    ctrl.dispatch(Command::Next); // position at t1

    ctrl.dispatch(Command::ToggleShuffle);
    assert!(ctrl.state.shuffle_enabled);

    // All track IDs must still be present.
    let mut original: Vec<String> = (1..=10).map(|i| format!("t{}", i)).collect();
    let mut shuffled = ctrl.state.current_playlist.track_ids.clone();
    original.sort();
    shuffled.sort();
    assert_eq!(original, shuffled);
}

#[test]
fn toggle_shuffle_off_restores_original_order() {
    let mut ctrl = controller_with_tracks(5);
    ctrl.dispatch(Command::Next); // position at t1

    ctrl.dispatch(Command::ToggleShuffle); // on
    ctrl.dispatch(Command::ToggleShuffle); // off

    assert!(!ctrl.state.shuffle_enabled);
    let expected: Vec<String> = (1..=5).map(|i| format!("t{}", i)).collect();
    assert_eq!(ctrl.state.current_playlist.track_ids, expected);
}

#[test]
fn shuffle_keeps_current_track_at_front() {
    let mut ctrl = controller_with_tracks(5);
    ctrl.dispatch(Command::PlayTrack("t3".into()));

    ctrl.dispatch(Command::ToggleShuffle);

    assert_eq!(ctrl.state.current_playlist.track_ids[0], "t3");
    assert_eq!(ctrl.state.current_playlist.current_position, Some(0));
}

// ---------------------------------------------------------------------------
// RepeatMode cycling
// ---------------------------------------------------------------------------

#[test]
fn set_repeat_cycles_through_modes() {
    let mut ctrl = Controller::new();

    ctrl.dispatch(Command::SetRepeat("all".into()));
    assert_eq!(ctrl.state.repeat_mode, RepeatMode::All);

    ctrl.dispatch(Command::SetRepeat("one".into()));
    assert_eq!(ctrl.state.repeat_mode, RepeatMode::One);

    ctrl.dispatch(Command::SetRepeat("off".into()));
    assert_eq!(ctrl.state.repeat_mode, RepeatMode::Off);

    // Unknown string → Off
    ctrl.dispatch(Command::SetRepeat("random-garbage".into()));
    assert_eq!(ctrl.state.repeat_mode, RepeatMode::Off);
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

#[test]
fn search_returns_matching_tracks() {
    let mut ctrl = Controller::new();
    let tracks = vec![
        make_track("1", "Bohemian Rhapsody", 1),
        make_track("2", "Under Pressure", 2),
    ];
    ctrl.dispatch(Command::LoadTracks(tracks));

    let events = ctrl.dispatch(Command::Search("bohemian".into()));
    let results = events.iter().find_map(|e| {
        if let Event::SearchResults(r) = e {
            Some(r.clone())
        } else {
            None
        }
    });
    let results = results.expect("Expected SearchResults event");
    assert_eq!(results.tracks.len(), 1);
    assert_eq!(results.tracks[0].id, "1");
}

#[test]
fn search_empty_query_returns_all_tracks() {
    let mut ctrl = Controller::new();
    let tracks: Vec<Track> = (1..=5)
        .map(|i| make_track(&format!("t{}", i), &format!("Track {}", i), i))
        .collect();
    ctrl.dispatch(Command::LoadTracks(tracks));

    let events = ctrl.dispatch(Command::Search("".into()));
    let results = events
        .iter()
        .find_map(|e| {
            if let Event::SearchResults(r) = e {
                Some(r.clone())
            } else {
                None
            }
        })
        .unwrap();
    assert_eq!(results.tracks.len(), 5);
}

// ---------------------------------------------------------------------------
// SetDownloaded / LoadDownloaded
// ---------------------------------------------------------------------------

#[test]
fn load_downloaded_creates_sorted_playlist() {
    let mut ctrl = Controller::new();

    // Artist B has two tracks; Artist A has one. Expect A sorted before B.
    let tracks = vec![
        Track {
            id: "b2".into(),
            title: "B Track 2".into(),
            artist: "Artist B".into(),
            album: "Album B".into(),
            duration: 200.0,
            track_number: 2,
            uri: String::new(),
            artwork_url: String::new(),
        },
        Track {
            id: "b1".into(),
            title: "B Track 1".into(),
            artist: "Artist B".into(),
            album: "Album B".into(),
            duration: 180.0,
            track_number: 1,
            uri: String::new(),
            artwork_url: String::new(),
        },
        Track {
            id: "a1".into(),
            title: "A Track 1".into(),
            artist: "Artist A".into(),
            album: "Album A".into(),
            duration: 210.0,
            track_number: 1,
            uri: String::new(),
            artwork_url: String::new(),
        },
    ];

    ctrl.dispatch(Command::LoadTracks(tracks));
    ctrl.dispatch(Command::SetDownloaded(vec![
        "b2".into(),
        "b1".into(),
        "a1".into(),
    ]));

    let events = ctrl.dispatch(Command::LoadDownloaded);
    let payload = events
        .iter()
        .find_map(|e| {
            if let Event::DownloadedLoaded(p) = e {
                Some(p.clone())
            } else {
                None
            }
        })
        .expect("Expected DownloadedLoaded");

    // Sorted: a1, b1, b2
    assert_eq!(payload.tracks[0].id, "a1");
    assert_eq!(payload.tracks[1].id, "b1");
    assert_eq!(payload.tracks[2].id, "b2");
    assert_eq!(payload.album_name.as_deref(), Some("Downloaded"));
}

#[test]
fn is_downloaded_flag_set_correctly() {
    let mut ctrl = controller_with_tracks(3);
    ctrl.dispatch(Command::SetDownloaded(vec!["t1".into(), "t3".into()]));

    let events = ctrl.dispatch(Command::Search("Track".into()));
    let results = events
        .iter()
        .find_map(|e| {
            if let Event::SearchResults(r) = e {
                Some(r.clone())
            } else {
                None
            }
        })
        .unwrap();

    for summary in &results.tracks {
        match summary.id.as_str() {
            "t1" | "t3" => assert!(summary.is_downloaded, "{} should be downloaded", summary.id),
            "t2" => assert!(!summary.is_downloaded, "t2 should not be downloaded"),
            _ => {}
        }
    }
}

// ---------------------------------------------------------------------------
// AddToQueue / RemoveFromQueue edge cases
// ---------------------------------------------------------------------------

#[test]
fn add_unknown_track_to_queue_returns_error() {
    let mut ctrl = Controller::new();
    let events = ctrl.dispatch(Command::AddToQueue("ghost".into()));
    assert!(events.iter().any(|e| matches!(e, Event::Error(_))));
}

#[test]
fn add_to_queue_emits_queue_updated() {
    let mut ctrl = controller_with_tracks(3);
    let events = ctrl.dispatch(Command::AddToQueue("t2".into()));
    assert!(events.iter().any(|e| matches!(e, Event::QueueUpdated(_))));
    assert_eq!(ctrl.state.current_queue.len(), 1);
}

#[test]
fn remove_from_queue_emits_queue_updated() {
    let mut ctrl = controller_with_tracks(3);
    ctrl.dispatch(Command::AddToQueue("t1".into()));
    ctrl.dispatch(Command::AddToQueue("t2".into()));

    let events = ctrl.dispatch(Command::RemoveFromQueue(0));
    assert!(events.iter().any(|e| matches!(e, Event::QueueUpdated(_))));
    assert_eq!(ctrl.state.current_queue.len(), 1);
    assert_eq!(ctrl.state.current_queue.track_ids[0], "t2");
}

// ---------------------------------------------------------------------------
// Greet (WASM smoke test helper – callable without WASM boundary in unit tests)
// ---------------------------------------------------------------------------

#[test]
fn controller_default_state_is_stopped() {
    let ctrl = Controller::new();
    assert_eq!(ctrl.state.playback_state, PlaybackState::Stopped);
    assert!(!ctrl.state.shuffle_enabled);
    assert_eq!(ctrl.state.repeat_mode, RepeatMode::Off);
    assert!(ctrl.state.tracks.is_empty());
    assert!(ctrl.state.albums.is_empty());
}

// ---------------------------------------------------------------------------
// RestoreState
// ---------------------------------------------------------------------------

#[test]
fn restore_state_restores_playlist_and_cursor() {
    use music_core::controller::PersistedState;

    let mut ctrl = controller_with_tracks(3);
    // Library is loaded. Now simulate a restore from a previous session.
    let saved = PersistedState {
        current_track_id: Some("t2".into()),
        playlist_track_ids: vec!["t1".into(), "t2".into(), "t3".into()],
        playlist_position: Some(1),
        original_playlist_order: vec!["t1".into(), "t2".into(), "t3".into()],
        repeat_mode: music_core::model::RepeatMode::All,
        shuffle_enabled: false,
        current_album_id: None,
        queue_track_ids: vec![],
    };
    let events = ctrl.dispatch(Command::RestoreState(saved));

    assert_eq!(ctrl.state.current_playlist.current_position, Some(1));
    assert_eq!(ctrl.state.repeat_mode, music_core::model::RepeatMode::All);
    assert!(!ctrl.state.shuffle_enabled);
    // Must emit TrackChanged with the restored track.
    assert_eq!(track_changed_id(&events), "t2");
    // Restored state is always paused (no auto-play on startup).
    assert!(events
        .iter()
        .any(|e| matches!(e, Event::PlaybackStateChanged(s) if s == "paused")));
}

#[test]
fn restore_state_filters_unknown_track_ids() {
    use music_core::controller::PersistedState;

    let mut ctrl = controller_with_tracks(2);
    let saved = PersistedState {
        current_track_id: None,
        // "ghost" doesn't exist in the library.
        playlist_track_ids: vec!["t1".into(), "ghost".into(), "t2".into()],
        playlist_position: Some(0),
        original_playlist_order: vec!["t1".into(), "ghost".into(), "t2".into()],
        repeat_mode: music_core::model::RepeatMode::Off,
        shuffle_enabled: false,
        current_album_id: None,
        queue_track_ids: vec![],
    };
    ctrl.dispatch(Command::RestoreState(saved));

    // Only the two known tracks should survive.
    assert_eq!(ctrl.state.current_playlist.track_ids, vec!["t1", "t2"]);
}

#[test]
fn restore_state_clamps_out_of_bounds_cursor() {
    use music_core::controller::PersistedState;

    let mut ctrl = controller_with_tracks(2);
    let saved = PersistedState {
        current_track_id: None,
        playlist_track_ids: vec!["t1".into(), "t2".into()],
        // position 99 is out of range → should be clamped to None.
        playlist_position: Some(99),
        original_playlist_order: vec!["t1".into(), "t2".into()],
        repeat_mode: music_core::model::RepeatMode::Off,
        shuffle_enabled: false,
        current_album_id: None,
        queue_track_ids: vec![],
    };
    ctrl.dispatch(Command::RestoreState(saved));

    assert_eq!(ctrl.state.current_playlist.current_position, None);
}

// ---------------------------------------------------------------------------
// Cross-album navigation
// ---------------------------------------------------------------------------

/// Build a controller with two albums:
///   album1: t1, t2
///   album2: t3, t4
/// The first album is loaded as the active playlist.
fn controller_with_two_albums() -> Controller {
    let mut ctrl = Controller::new();

    let tracks = vec![
        make_track("t1", "Track 1", 1),
        make_track("t2", "Track 2", 2),
        make_track("t3", "Track 3", 1),
        make_track("t4", "Track 4", 2),
    ];
    let album1 = make_album("album1", vec!["t1", "t2"]);
    let album2 = make_album("album2", vec!["t3", "t4"]);

    ctrl.dispatch(Command::LoadTracks(tracks));
    ctrl.dispatch(Command::LoadAlbums(vec![album1, album2]));
    ctrl.dispatch(Command::LoadAlbum("album1".into()));
    ctrl
}

#[test]
fn next_at_end_of_album_advances_to_next_album() {
    let mut ctrl = controller_with_two_albums();

    ctrl.dispatch(Command::Next); // t1
    ctrl.dispatch(Command::Next); // t2

    // End of album1 — should advance to album2's first track.
    let events = ctrl.dispatch(Command::Next);
    assert!(has_playing(&events));
    assert_eq!(track_changed_id(&events), "t3");
    assert_eq!(ctrl.state.current_playlist.current_position, Some(0));
    assert_eq!(ctrl.state.current_album_id.as_deref(), Some("album2"));
    assert_eq!(ctrl.state.current_album_index, Some(1));
}

#[test]
fn next_at_end_of_last_album_stops_repeat_off() {
    let mut ctrl = controller_with_two_albums();
    ctrl.dispatch(Command::LoadAlbum("album2".into()));

    ctrl.dispatch(Command::Next); // t3
    ctrl.dispatch(Command::Next); // t4

    // End of last album, repeat off — should stop.
    let events = ctrl.dispatch(Command::Next);
    assert!(has_stopped(&events));
    assert_eq!(ctrl.state.playback_state, PlaybackState::Stopped);
}

#[test]
fn next_at_end_of_last_album_wraps_to_first_repeat_all() {
    let mut ctrl = controller_with_two_albums();
    ctrl.dispatch(Command::SetRepeat("all".into()));
    ctrl.dispatch(Command::LoadAlbum("album2".into()));

    ctrl.dispatch(Command::Next); // t3
    ctrl.dispatch(Command::Next); // t4

    // End of last album, repeat all — should wrap to album1's first track.
    let events = ctrl.dispatch(Command::Next);
    assert!(has_playing(&events));
    assert_eq!(track_changed_id(&events), "t1");
    assert_eq!(ctrl.state.current_album_id.as_deref(), Some("album1"));
    assert_eq!(ctrl.state.current_album_index, Some(0));
}

#[test]
fn next_wraps_at_end_single_album_repeat_all() {
    // With a single album and repeat-all, wrapping should loop back to
    // the same album's first track (via try_advance_to_next_album).
    let mut ctrl = controller_with_tracks(2);
    ctrl.dispatch(Command::SetRepeat("all".into()));

    ctrl.dispatch(Command::Next); // t1
    ctrl.dispatch(Command::Next); // t2

    // Should wrap to t1.
    let events = ctrl.dispatch(Command::Next);
    assert!(has_playing(&events));
    assert_eq!(track_changed_id(&events), "t1");
    assert_eq!(ctrl.state.current_playlist.current_position, Some(0));
}

#[test]
fn previous_at_start_of_album_retreats_to_prev_album_last_track() {
    let mut ctrl = controller_with_two_albums();
    ctrl.dispatch(Command::LoadAlbum("album2".into()));

    ctrl.dispatch(Command::Next); // t3

    // At start of album2 — Previous should land on album1's last track (t2).
    let events = ctrl.dispatch(Command::Previous);
    assert!(has_playing(&events));
    assert_eq!(track_changed_id(&events), "t2");
    assert_eq!(ctrl.state.current_album_id.as_deref(), Some("album1"));
    assert_eq!(ctrl.state.current_album_index, Some(0));
}

#[test]
fn previous_at_start_of_first_album_wraps_to_last_album_repeat_all() {
    let mut ctrl = controller_with_two_albums();
    ctrl.dispatch(Command::SetRepeat("all".into()));

    ctrl.dispatch(Command::Next); // t1

    // At start of album1 with repeat-all — Previous should land on album2's last track.
    let events = ctrl.dispatch(Command::Previous);
    assert!(has_playing(&events));
    assert_eq!(track_changed_id(&events), "t4");
    assert_eq!(ctrl.state.current_album_id.as_deref(), Some("album2"));
    assert_eq!(ctrl.state.current_album_index, Some(1));
}

#[test]
fn previous_at_start_of_first_album_stays_repeat_off() {
    let mut ctrl = controller_with_two_albums();

    ctrl.dispatch(Command::Next); // t1

    // At start of album1, repeat off — Previous should not emit TrackChanged.
    let events = ctrl.dispatch(Command::Previous);
    assert!(!events.iter().any(|e| matches!(e, Event::TrackChanged(_))));
}

#[test]
fn restore_state_restores_current_album_id() {
    use music_core::controller::PersistedState;

    let mut ctrl = controller_with_two_albums();

    let saved = PersistedState {
        current_track_id: Some("t3".into()),
        playlist_track_ids: vec!["t3".into(), "t4".into()],
        playlist_position: Some(0),
        original_playlist_order: vec!["t3".into(), "t4".into()],
        repeat_mode: music_core::model::RepeatMode::Off,
        shuffle_enabled: false,
        current_album_id: Some("album2".into()),
        queue_track_ids: vec![],
    };
    ctrl.dispatch(Command::RestoreState(saved));

    // Album index should be resolved from the saved album ID.
    assert_eq!(ctrl.state.current_album_id.as_deref(), Some("album2"));
    assert_eq!(ctrl.state.current_album_index, Some(1));
}

#[test]
fn restore_state_no_track_changed_when_current_track_unknown() {
    use music_core::controller::PersistedState;

    let mut ctrl = controller_with_tracks(2);
    let saved = PersistedState {
        current_track_id: Some("ghost".into()), // not in library
        playlist_track_ids: vec!["t1".into(), "t2".into()],
        playlist_position: Some(0),
        original_playlist_order: vec!["t1".into(), "t2".into()],
        repeat_mode: music_core::model::RepeatMode::Off,
        shuffle_enabled: false,
        current_album_id: None,
        queue_track_ids: vec![],
    };
    let events = ctrl.dispatch(Command::RestoreState(saved));

    // No TrackChanged since the track isn't in the catalogue.
    assert!(!events.iter().any(|e| matches!(e, Event::TrackChanged(_))));
}

// ---------------------------------------------------------------------------
// ReorderPlaylist
// ---------------------------------------------------------------------------

#[test]
fn reorder_playlist_moves_track_and_emits_playlist_updated() {
    let mut ctrl = controller_with_tracks(4);

    // Initial order: t1, t2, t3, t4. Move t1 from index 0 to index 2.
    let events = ctrl.dispatch(Command::ReorderPlaylist { from: 0, to: 2 });
    let payload = events
        .iter()
        .find_map(|e| {
            if let Event::PlaylistUpdated(p) = e {
                Some(p.clone())
            } else {
                None
            }
        })
        .expect("Expected PlaylistUpdated");

    // [t2, t3, t1, t4]
    assert_eq!(payload.tracks[0].id, "t2");
    assert_eq!(payload.tracks[1].id, "t3");
    assert_eq!(payload.tracks[2].id, "t1");
    assert_eq!(payload.tracks[3].id, "t4");
}

#[test]
fn reorder_playlist_cursor_follows_playing_track() {
    let mut ctrl = controller_with_tracks(4);
    ctrl.dispatch(Command::PlayTrack("t1".into()));

    // Playing t1 (position 0). Move t1 to position 3.
    let events = ctrl.dispatch(Command::ReorderPlaylist { from: 0, to: 3 });
    let payload = events
        .iter()
        .find_map(|e| {
            if let Event::PlaylistUpdated(p) = e {
                Some(p.clone())
            } else {
                None
            }
        })
        .expect("Expected PlaylistUpdated");

    // Cursor should follow t1 to its new position 3.
    assert_eq!(payload.current_position, Some(3));
    assert_eq!(payload.tracks[3].id, "t1");
}

// ---------------------------------------------------------------------------
// Queue persistence (RestoreState with queue_track_ids)
// ---------------------------------------------------------------------------

#[test]
fn restore_state_restores_queue() {
    use music_core::controller::PersistedState;

    let mut ctrl = controller_with_tracks(4);
    let saved = PersistedState {
        current_track_id: Some("t1".into()),
        playlist_track_ids: vec!["t1".into(), "t2".into(), "t3".into(), "t4".into()],
        playlist_position: Some(0),
        original_playlist_order: vec!["t1".into(), "t2".into(), "t3".into(), "t4".into()],
        repeat_mode: music_core::model::RepeatMode::Off,
        shuffle_enabled: false,
        current_album_id: None,
        queue_track_ids: vec!["t3".into(), "t4".into()],
    };

    let events = ctrl.dispatch(Command::RestoreState(saved));

    // QueueUpdated should be emitted with the restored queue.
    let queue_info = events.iter().find_map(|e| {
        if let Event::QueueUpdated(q) = e {
            Some(q.clone())
        } else {
            None
        }
    });
    let queue_info = queue_info.expect("Expected QueueUpdated event");
    assert_eq!(queue_info.tracks.len(), 2);
    assert_eq!(queue_info.tracks[0].id, "t3");
    assert_eq!(queue_info.tracks[1].id, "t4");
}

#[test]
fn restore_state_queue_skips_unknown_tracks() {
    use music_core::controller::PersistedState;

    let mut ctrl = controller_with_tracks(3);
    let saved = PersistedState {
        current_track_id: None,
        playlist_track_ids: vec!["t1".into()],
        playlist_position: Some(0),
        original_playlist_order: vec!["t1".into()],
        repeat_mode: music_core::model::RepeatMode::Off,
        shuffle_enabled: false,
        current_album_id: None,
        // "ghost" is not in the library; "t2" is valid.
        queue_track_ids: vec!["ghost".into(), "t2".into()],
    };

    let events = ctrl.dispatch(Command::RestoreState(saved));

    let queue_info = events.iter().find_map(|e| {
        if let Event::QueueUpdated(q) = e {
            Some(q.clone())
        } else {
            None
        }
    });
    let queue_info = queue_info.expect("Expected QueueUpdated event");
    // "ghost" is filtered out; only "t2" survives.
    assert_eq!(queue_info.tracks.len(), 1);
    assert_eq!(queue_info.tracks[0].id, "t2");
}

#[test]
fn restore_state_empty_queue_no_queue_updated_event() {
    use music_core::controller::PersistedState;

    let mut ctrl = controller_with_tracks(3);
    let saved = PersistedState {
        current_track_id: None,
        playlist_track_ids: vec!["t1".into()],
        playlist_position: None,
        original_playlist_order: vec!["t1".into()],
        repeat_mode: music_core::model::RepeatMode::Off,
        shuffle_enabled: false,
        current_album_id: None,
        queue_track_ids: vec![],
    };

    let events = ctrl.dispatch(Command::RestoreState(saved));

    // No QueueUpdated emitted when queue is empty.
    assert!(!events.iter().any(|e| matches!(e, Event::QueueUpdated(_))));
}
