use crate::model::Queue;

// The Queue methods are part of the public API consumed by integration tests
// and the controller. The dead_code lint fires because cargo check does not
// analyse integration-test crates; suppress it here.
#[allow(dead_code)]
impl Queue {
    /// Create an empty queue with no current position.
    pub fn new() -> Self {
        Queue {
            track_ids: Vec::new(),
            current_position: None,
            source_playlist_position: None,
        }
    }

    /// Append a track to the end of the queue.
    pub fn add(&mut self, track_id: String) {
        self.track_ids.push(track_id);
    }

    /// Remove the track at `index`.
    ///
    /// The `current_position` cursor is adjusted so that it continues to
    /// reference the same logical track after the removal:
    /// - If the removed item was before the cursor, the cursor shifts back by 1.
    /// - If the removed item *is* the cursor, the cursor is cleared.
    /// - If the removed item is after the cursor, the cursor is unchanged.
    pub fn remove(&mut self, index: usize) {
        if index >= self.track_ids.len() {
            return;
        }
        self.track_ids.remove(index);
        if let Some(pos) = self.current_position {
            if index < pos {
                self.current_position = Some(pos - 1);
            } else if index == pos {
                self.current_position = None;
            }
            // index > pos: cursor unchanged
        }
    }

    /// Move the track at `from` to position `to`, updating the cursor so it
    /// continues to point at the same track.
    pub fn reorder(&mut self, from: usize, to: usize) {
        let len = self.track_ids.len();
        if from >= len || to >= len || from == to {
            return;
        }
        let item = self.track_ids.remove(from);
        self.track_ids.insert(to, item);

        if let Some(pos) = self.current_position {
            self.current_position = Some(if pos == from {
                // The currently-playing track was the one moved.
                to
            } else if from < pos && pos <= to {
                // A track before the cursor moved past it: shift back.
                pos - 1
            } else if to <= pos && pos < from {
                // A track after the cursor moved before it: shift forward.
                pos + 1
            } else {
                pos
            });
        }
    }

    /// Return `true` if the queue contains no tracks.
    pub fn is_empty(&self) -> bool {
        self.track_ids.is_empty()
    }

    /// Return the number of tracks in the queue.
    pub fn len(&self) -> usize {
        self.track_ids.len()
    }

    /// Return a reference to the track ID at the current cursor position, or
    /// `None` if no track is currently active.
    pub fn current(&self) -> Option<&String> {
        self.current_position.and_then(|p| self.track_ids.get(p))
    }

    /// Advance the cursor to the next track and return a reference to it, or
    /// `None` if the queue is exhausted.
    ///
    /// - If the cursor has not yet been set and the queue is non-empty, the
    ///   cursor advances to index 0.
    /// - If the cursor is at the last track, `None` is returned (the caller
    ///   should resume the playlist).
    pub fn advance(&mut self) -> Option<&String> {
        match self.current_position {
            None if !self.track_ids.is_empty() => {
                self.current_position = Some(0);
                self.track_ids.get(0)
            }
            Some(pos) if pos + 1 < self.track_ids.len() => {
                let next = pos + 1;
                self.current_position = Some(next);
                self.track_ids.get(next)
            }
            _ => None,
        }
    }

    /// Clear all tracks and reset the cursor.
    pub fn clear(&mut self) {
        self.track_ids.clear();
        self.current_position = None;
        self.source_playlist_position = None;
    }
}

impl Default for Queue {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ids(strs: &[&str]) -> Vec<String> {
        strs.iter().map(|s| s.to_string()).collect()
    }

    fn queue_with(track_ids: &[&str]) -> Queue {
        Queue {
            track_ids: ids(track_ids),
            current_position: None,
            source_playlist_position: None,
        }
    }

    // --- basic state ---

    #[test]
    fn new_queue_is_empty() {
        let q = Queue::new();
        assert!(q.is_empty());
        assert_eq!(q.len(), 0);
        assert_eq!(q.current(), None);
    }

    #[test]
    fn add_increases_length() {
        let mut q = Queue::new();
        q.add("a".into());
        q.add("b".into());
        assert_eq!(q.len(), 2);
        assert!(!q.is_empty());
    }

    // --- advance ---

    #[test]
    fn advance_on_empty_queue_returns_none() {
        let mut q = Queue::new();
        assert_eq!(q.advance(), None);
    }

    #[test]
    fn first_advance_goes_to_index_0() {
        let mut q = queue_with(&["a", "b", "c"]);
        let id = q.advance().cloned();
        assert_eq!(id.as_deref(), Some("a"));
        assert_eq!(q.current_position, Some(0));
    }

    #[test]
    fn successive_advances_walk_through_queue() {
        let mut q = queue_with(&["a", "b", "c"]);
        assert_eq!(q.advance().cloned().as_deref(), Some("a"));
        assert_eq!(q.advance().cloned().as_deref(), Some("b"));
        assert_eq!(q.advance().cloned().as_deref(), Some("c"));
        // exhausted
        assert_eq!(q.advance(), None);
    }

    // --- remove ---

    #[test]
    fn remove_out_of_bounds_is_a_no_op() {
        let mut q = queue_with(&["a", "b"]);
        q.remove(5);
        assert_eq!(q.len(), 2);
    }

    #[test]
    fn remove_before_cursor_shifts_cursor_back() {
        let mut q = queue_with(&["a", "b", "c"]);
        q.current_position = Some(2); // pointing at "c"
        q.remove(0); // remove "a"
        assert_eq!(q.current_position, Some(1)); // still "c"
        assert_eq!(q.track_ids, ids(&["b", "c"]));
    }

    #[test]
    fn remove_at_cursor_clears_cursor() {
        let mut q = queue_with(&["a", "b", "c"]);
        q.current_position = Some(1); // pointing at "b"
        q.remove(1);
        assert_eq!(q.current_position, None);
        assert_eq!(q.track_ids, ids(&["a", "c"]));
    }

    #[test]
    fn remove_after_cursor_does_not_change_cursor() {
        let mut q = queue_with(&["a", "b", "c"]);
        q.current_position = Some(0); // pointing at "a"
        q.remove(2); // remove "c"
        assert_eq!(q.current_position, Some(0));
        assert_eq!(q.track_ids, ids(&["a", "b"]));
    }

    // --- reorder ---

    #[test]
    fn reorder_moves_item_forward() {
        let mut q = queue_with(&["a", "b", "c", "d"]);
        q.reorder(0, 2); // move "a" to index 2
        assert_eq!(q.track_ids, ids(&["b", "c", "a", "d"]));
    }

    #[test]
    fn reorder_moves_item_backward() {
        let mut q = queue_with(&["a", "b", "c", "d"]);
        q.reorder(3, 1); // move "d" to index 1
        assert_eq!(q.track_ids, ids(&["a", "d", "b", "c"]));
    }

    #[test]
    fn reorder_cursor_follows_moved_track() {
        let mut q = queue_with(&["a", "b", "c", "d"]);
        q.current_position = Some(0); // playing "a"
        q.reorder(0, 3); // move "a" to end
        assert_eq!(q.current_position, Some(3));
        assert_eq!(q.track_ids, ids(&["b", "c", "d", "a"]));
    }

    #[test]
    fn reorder_adjusts_cursor_when_item_moves_past_it_forward() {
        let mut q = queue_with(&["a", "b", "c", "d"]);
        q.current_position = Some(2); // playing "c"
        q.reorder(0, 3); // move "a" (before cursor) past cursor
        // "a" moved from 0 to 3, so cursor shifts back from 2 to 1
        assert_eq!(q.current_position, Some(1));
        assert_eq!(q.track_ids[1], "c");
    }

    #[test]
    fn reorder_adjusts_cursor_when_item_moves_past_it_backward() {
        let mut q = queue_with(&["a", "b", "c", "d"]);
        q.current_position = Some(1); // playing "b"
        q.reorder(3, 0); // move "d" (after cursor) before cursor
        // cursor shifts forward from 1 to 2
        assert_eq!(q.current_position, Some(2));
        assert_eq!(q.track_ids[2], "b");
    }

    #[test]
    fn reorder_same_index_is_no_op() {
        let mut q = queue_with(&["a", "b", "c"]);
        q.current_position = Some(1);
        q.reorder(1, 1);
        assert_eq!(q.track_ids, ids(&["a", "b", "c"]));
        assert_eq!(q.current_position, Some(1));
    }

    // --- clear ---

    #[test]
    fn clear_resets_everything() {
        let mut q = queue_with(&["a", "b", "c"]);
        q.current_position = Some(1);
        q.source_playlist_position = Some(5);
        q.clear();
        assert!(q.is_empty());
        assert_eq!(q.current_position, None);
        assert_eq!(q.source_playlist_position, None);
    }

    // --- current ---

    #[test]
    fn current_returns_track_at_cursor() {
        let mut q = queue_with(&["x", "y", "z"]);
        q.current_position = Some(1);
        assert_eq!(q.current().map(String::as_str), Some("y"));
    }

    #[test]
    fn current_returns_none_when_no_cursor() {
        let q = queue_with(&["x", "y"]);
        assert_eq!(q.current(), None);
    }
}
