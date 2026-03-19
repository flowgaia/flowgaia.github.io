use crate::model::{Album, Track};

/// Return all tracks whose title, artist, or album field contains `query`
/// (case-insensitive). An empty query returns every track unchanged.
pub fn search_tracks<'a>(tracks: &'a [&Track], query: &str) -> Vec<&'a Track> {
    let q = query.to_lowercase();
    if q.is_empty() {
        return tracks.to_vec();
    }
    tracks
        .iter()
        .filter(|t| {
            t.title.to_lowercase().contains(&q)
                || t.artist.to_lowercase().contains(&q)
                || t.album.to_lowercase().contains(&q)
        })
        .copied()
        .collect()
}

/// Return all albums whose name or artist field contains `query`
/// (case-insensitive). An empty query returns every album unchanged.
pub fn search_albums<'a>(albums: &'a [Album], query: &str) -> Vec<&'a Album> {
    let q = query.to_lowercase();
    if q.is_empty() {
        return albums.iter().collect();
    }
    albums
        .iter()
        .filter(|a| {
            a.name.to_lowercase().contains(&q)
                || a.artist.to_lowercase().contains(&q)
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{Album, Track};

    fn make_track(id: &str, title: &str, artist: &str, album: &str) -> Track {
        Track {
            id: id.to_string(),
            title: title.to_string(),
            artist: artist.to_string(),
            album: album.to_string(),
            duration: 180.0,
            track_number: 1,
            uri: String::new(),
            artwork_url: String::new(),
        }
    }

    fn make_album(id: &str, name: &str, artist: &str) -> Album {
        Album {
            id: id.to_string(),
            name: name.to_string(),
            artist: artist.to_string(),
            artwork_url: String::new(),
            track_ids: vec![],
        }
    }

    #[test]
    fn empty_query_returns_all_tracks() {
        let t1 = make_track("1", "Song A", "Artist X", "Album 1");
        let t2 = make_track("2", "Song B", "Artist Y", "Album 2");
        let tracks = vec![&t1, &t2];
        let results = search_tracks(&tracks, "");
        assert_eq!(results.len(), 2);
    }

    #[test]
    fn matches_by_title_case_insensitive() {
        let t1 = make_track("1", "Bohemian Rhapsody", "Queen", "A Night at the Opera");
        let t2 = make_track("2", "Under Pressure", "Queen", "Hot Space");
        let tracks = vec![&t1, &t2];
        let results = search_tracks(&tracks, "BOHEMIAN");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].id, "1");
    }

    #[test]
    fn matches_by_artist() {
        let t1 = make_track("1", "Song A", "David Bowie", "Album 1");
        let t2 = make_track("2", "Song B", "Queen", "Album 2");
        let tracks = vec![&t1, &t2];
        let results = search_tracks(&tracks, "bowie");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].id, "1");
    }

    #[test]
    fn matches_by_album() {
        let t1 = make_track("1", "Song A", "Artist X", "Dark Side of the Moon");
        let t2 = make_track("2", "Song B", "Artist Y", "Wish You Were Here");
        let tracks = vec![&t1, &t2];
        let results = search_tracks(&tracks, "dark side");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].id, "1");
    }

    #[test]
    fn no_match_returns_empty() {
        let t1 = make_track("1", "Song A", "Artist X", "Album 1");
        let tracks = vec![&t1];
        let results = search_tracks(&tracks, "zzznomatch");
        assert!(results.is_empty());
    }

    #[test]
    fn empty_query_returns_all_albums() {
        let a1 = make_album("1", "Album One", "Artist A");
        let a2 = make_album("2", "Album Two", "Artist B");
        let albums = vec![a1, a2];
        let results = search_albums(&albums, "");
        assert_eq!(results.len(), 2);
    }

    #[test]
    fn album_search_matches_name() {
        let a1 = make_album("1", "Nevermind", "Nirvana");
        let a2 = make_album("2", "In Utero", "Nirvana");
        let albums = vec![a1, a2];
        let results = search_albums(&albums, "nevermind");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].id, "1");
    }

    #[test]
    fn album_search_matches_artist() {
        let a1 = make_album("1", "Nevermind", "Nirvana");
        let a2 = make_album("2", "OK Computer", "Radiohead");
        let albums = vec![a1, a2];
        let results = search_albums(&albums, "radiohead");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].id, "2");
    }
}
