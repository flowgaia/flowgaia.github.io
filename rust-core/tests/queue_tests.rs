//! Integration tests for the `Queue` data structure.
//!
//! These tests exercise all public methods of `Queue`, including edge cases
//! around boundary indices, cursor tracking through mutations, and the
//! interaction between `advance` / `clear` / `remove` / `reorder`.

use music_core::model::Queue;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

fn queue_at(track_ids: &[&str], pos: usize) -> Queue {
    Queue {
        track_ids: ids(track_ids),
        current_position: Some(pos),
        source_playlist_position: None,
    }
}

// ---------------------------------------------------------------------------
// Construction and default state
// ---------------------------------------------------------------------------

#[test]
fn new_queue_is_empty() {
    let q = Queue::new();
    assert!(q.is_empty());
    assert_eq!(q.len(), 0);
    assert_eq!(q.current(), None);
    assert_eq!(q.current_position, None);
    assert_eq!(q.source_playlist_position, None);
}

#[test]
fn default_queue_is_empty() {
    let q = Queue::default();
    assert!(q.is_empty());
}

// ---------------------------------------------------------------------------
// add
// ---------------------------------------------------------------------------

#[test]
fn add_increases_length_and_appends() {
    let mut q = Queue::new();
    q.add("x".into());
    q.add("y".into());
    assert_eq!(q.len(), 2);
    assert_eq!(q.track_ids, ids(&["x", "y"]));
}

#[test]
fn add_does_not_change_cursor() {
    let mut q = Queue::new();
    q.add("a".into());
    assert_eq!(q.current_position, None);
}

// ---------------------------------------------------------------------------
// advance
// ---------------------------------------------------------------------------

#[test]
fn advance_on_empty_queue_returns_none() {
    let mut q = Queue::new();
    assert_eq!(q.advance(), None);
    assert_eq!(q.current_position, None);
}

#[test]
fn first_advance_returns_index_0() {
    let mut q = queue_with(&["a", "b", "c"]);
    let id = q.advance().cloned();
    assert_eq!(id.as_deref(), Some("a"));
    assert_eq!(q.current_position, Some(0));
}

#[test]
fn successive_advances_walk_through_all_items() {
    let items = &["a", "b", "c", "d"];
    let mut q = queue_with(items);
    for (i, expected) in items.iter().enumerate() {
        let result = q.advance().cloned();
        assert_eq!(result.as_deref(), Some(*expected), "step {}", i);
        assert_eq!(q.current_position, Some(i));
    }
}

#[test]
fn advance_at_last_element_returns_none() {
    let mut q = queue_with(&["only"]);
    q.advance(); // lands on "only"
    assert_eq!(q.advance(), None);
    // Cursor stays at last position; does not wrap.
    assert_eq!(q.current_position, Some(0));
}

#[test]
fn advance_after_all_consumed_still_returns_none() {
    let mut q = queue_with(&["a", "b"]);
    q.advance(); // a
    q.advance(); // b
    assert_eq!(q.advance(), None);
    assert_eq!(q.advance(), None); // idempotent
}

// ---------------------------------------------------------------------------
// current
// ---------------------------------------------------------------------------

#[test]
fn current_returns_none_without_cursor() {
    let q = queue_with(&["x", "y"]);
    assert_eq!(q.current(), None);
}

#[test]
fn current_returns_track_at_cursor() {
    let q = queue_at(&["x", "y", "z"], 1);
    assert_eq!(q.current().map(String::as_str), Some("y"));
}

// ---------------------------------------------------------------------------
// remove – boundary conditions
// ---------------------------------------------------------------------------

#[test]
fn remove_out_of_bounds_is_a_no_op() {
    let mut q = queue_with(&["a", "b"]);
    q.current_position = Some(0);
    q.remove(99);
    assert_eq!(q.len(), 2);
    assert_eq!(q.current_position, Some(0));
}

#[test]
fn remove_only_element_leaves_empty_queue() {
    let mut q = queue_at(&["a"], 0);
    q.remove(0);
    assert!(q.is_empty());
    assert_eq!(q.current_position, None);
}

#[test]
fn remove_before_cursor_shifts_cursor_back_by_one() {
    let mut q = queue_at(&["a", "b", "c", "d"], 3); // cursor on "d"
    q.remove(1); // remove "b"
    assert_eq!(q.track_ids, ids(&["a", "c", "d"]));
    assert_eq!(q.current_position, Some(2)); // still on "d"
}

#[test]
fn remove_at_cursor_clears_cursor() {
    let mut q = queue_at(&["a", "b", "c"], 1); // cursor on "b"
    q.remove(1);
    assert_eq!(q.track_ids, ids(&["a", "c"]));
    assert_eq!(q.current_position, None);
}

#[test]
fn remove_after_cursor_does_not_change_cursor() {
    let mut q = queue_at(&["a", "b", "c"], 0); // cursor on "a"
    q.remove(2); // remove "c"
    assert_eq!(q.track_ids, ids(&["a", "b"]));
    assert_eq!(q.current_position, Some(0));
}

#[test]
fn remove_first_element_no_cursor() {
    let mut q = queue_with(&["a", "b", "c"]);
    q.remove(0);
    assert_eq!(q.track_ids, ids(&["b", "c"]));
    assert_eq!(q.current_position, None);
}

#[test]
fn remove_last_element_no_cursor() {
    let mut q = queue_with(&["a", "b", "c"]);
    q.remove(2);
    assert_eq!(q.track_ids, ids(&["a", "b"]));
}

// ---------------------------------------------------------------------------
// reorder – ordering correctness
// ---------------------------------------------------------------------------

#[test]
fn reorder_moves_item_forward() {
    let mut q = queue_with(&["a", "b", "c", "d"]);
    q.reorder(0, 3);
    assert_eq!(q.track_ids, ids(&["b", "c", "d", "a"]));
}

#[test]
fn reorder_moves_item_backward() {
    let mut q = queue_with(&["a", "b", "c", "d"]);
    q.reorder(3, 0);
    assert_eq!(q.track_ids, ids(&["d", "a", "b", "c"]));
}

#[test]
fn reorder_adjacent_forward() {
    let mut q = queue_with(&["a", "b", "c"]);
    q.reorder(0, 1);
    assert_eq!(q.track_ids, ids(&["b", "a", "c"]));
}

#[test]
fn reorder_adjacent_backward() {
    let mut q = queue_with(&["a", "b", "c"]);
    q.reorder(2, 1);
    assert_eq!(q.track_ids, ids(&["a", "c", "b"]));
}

#[test]
fn reorder_same_index_is_no_op() {
    let mut q = queue_at(&["a", "b", "c"], 1);
    q.reorder(1, 1);
    assert_eq!(q.track_ids, ids(&["a", "b", "c"]));
    assert_eq!(q.current_position, Some(1));
}

#[test]
fn reorder_out_of_bounds_from_is_a_no_op() {
    let mut q = queue_with(&["a", "b"]);
    q.reorder(99, 0);
    assert_eq!(q.track_ids, ids(&["a", "b"]));
}

#[test]
fn reorder_out_of_bounds_to_is_a_no_op() {
    let mut q = queue_with(&["a", "b"]);
    q.reorder(0, 99);
    assert_eq!(q.track_ids, ids(&["a", "b"]));
}

// ---------------------------------------------------------------------------
// reorder – cursor tracking
// ---------------------------------------------------------------------------

#[test]
fn reorder_cursor_follows_moved_track_forward() {
    // Cursor is on "a" (index 0); move "a" to index 3.
    let mut q = queue_at(&["a", "b", "c", "d"], 0);
    q.reorder(0, 3);
    assert_eq!(q.current_position, Some(3));
    assert_eq!(q.track_ids[3], "a");
}

#[test]
fn reorder_cursor_follows_moved_track_backward() {
    // Cursor is on "d" (index 3); move "d" to index 0.
    let mut q = queue_at(&["a", "b", "c", "d"], 3);
    q.reorder(3, 0);
    assert_eq!(q.current_position, Some(0));
    assert_eq!(q.track_ids[0], "d");
}

#[test]
fn reorder_cursor_shifts_back_when_earlier_item_moves_past_it() {
    // Cursor on "c" (index 2); move "a" from 0 to 3 (past the cursor).
    let mut q = queue_at(&["a", "b", "c", "d"], 2);
    q.reorder(0, 3);
    // "a" moved from before the cursor to after, so cursor shifts back.
    assert_eq!(q.current_position, Some(1));
    assert_eq!(q.track_ids[1], "c");
}

#[test]
fn reorder_cursor_shifts_forward_when_later_item_moves_before_it() {
    // Cursor on "b" (index 1); move "d" from 3 to 0 (before the cursor).
    let mut q = queue_at(&["a", "b", "c", "d"], 1);
    q.reorder(3, 0);
    // "d" moved from after cursor to before, so cursor shifts forward.
    assert_eq!(q.current_position, Some(2));
    assert_eq!(q.track_ids[2], "b");
}

#[test]
fn reorder_cursor_unchanged_when_move_does_not_cross_it() {
    // Cursor on "b" (index 1); move "c" from 2 to 3 (both after cursor).
    let mut q = queue_at(&["a", "b", "c", "d"], 1);
    q.reorder(2, 3);
    assert_eq!(q.current_position, Some(1)); // unchanged
    assert_eq!(q.track_ids[1], "b");
}

// ---------------------------------------------------------------------------
// clear
// ---------------------------------------------------------------------------

#[test]
fn clear_empties_all_fields() {
    let mut q = Queue {
        track_ids: ids(&["a", "b", "c"]),
        current_position: Some(1),
        source_playlist_position: Some(7),
    };
    q.clear();
    assert!(q.is_empty());
    assert_eq!(q.current_position, None);
    assert_eq!(q.source_playlist_position, None);
}

#[test]
fn clear_on_empty_queue_is_safe() {
    let mut q = Queue::new();
    q.clear(); // must not panic
    assert!(q.is_empty());
}

// ---------------------------------------------------------------------------
// Interaction between operations
// ---------------------------------------------------------------------------

#[test]
fn add_then_advance_then_remove_current_clears_cursor() {
    let mut q = Queue::new();
    q.add("a".into());
    q.add("b".into());
    q.add("c".into());

    q.advance(); // pos = 0 ("a")
    q.advance(); // pos = 1 ("b") – now on "b"
    assert_eq!(q.current().map(String::as_str), Some("b"));

    q.remove(1); // remove "b" which is at the cursor
    assert_eq!(q.current_position, None);
    assert_eq!(q.track_ids, ids(&["a", "c"]));
}

#[test]
fn reorder_then_advance_yields_correct_track() {
    let mut q = queue_with(&["a", "b", "c"]);
    q.reorder(2, 0); // "c" moves to front → ["c", "a", "b"]

    let id = q.advance().cloned();
    assert_eq!(id.as_deref(), Some("c"));
}

#[test]
fn remove_multiple_items_before_cursor_keeps_cursor_on_correct_track() {
    // Start:  ["a", "b", "c", "d", "e"]  cursor = 4 ("e")
    let mut q = queue_at(&["a", "b", "c", "d", "e"], 4);

    q.remove(0); // remove "a" → cursor shifts to 3
    q.remove(0); // remove "b" → cursor shifts to 2
    q.remove(0); // remove "c" → cursor shifts to 1

    // Remaining: ["d", "e"], cursor on "e" which is now at index 1
    assert_eq!(q.current_position, Some(1));
    assert_eq!(q.track_ids, ids(&["d", "e"]));
    assert_eq!(q.current().map(String::as_str), Some("e"));
}

#[test]
fn advance_exhaust_then_add_does_not_auto_advance() {
    let mut q = queue_with(&["x"]);
    q.advance(); // x – exhausted
    assert_eq!(q.advance(), None);

    q.add("y".into());
    // advance from exhausted state: next_pos = Some(0) + 1 = 1, len = 2 → advances to "y"
    let id = q.advance().cloned();
    assert_eq!(id.as_deref(), Some("y"));
}

#[test]
fn source_playlist_position_is_preserved_through_mutations() {
    let mut q = Queue {
        track_ids: ids(&["a", "b"]),
        current_position: Some(0),
        source_playlist_position: Some(42),
    };

    q.remove(0); // modifying the queue must not touch source_playlist_position
    assert_eq!(q.source_playlist_position, Some(42));

    q.add("c".into());
    assert_eq!(q.source_playlist_position, Some(42));
}

#[test]
fn is_empty_reflects_state_correctly_after_mutations() {
    let mut q = Queue::new();
    assert!(q.is_empty());

    q.add("a".into());
    assert!(!q.is_empty());

    q.remove(0);
    assert!(q.is_empty());
}

#[test]
fn len_is_consistent_with_track_ids() {
    let mut q = Queue::new();
    for i in 0..5 {
        q.add(format!("t{}", i));
        assert_eq!(q.len(), i + 1);
        assert_eq!(q.len(), q.track_ids.len());
    }
    q.remove(2);
    assert_eq!(q.len(), 4);
    assert_eq!(q.len(), q.track_ids.len());
}
