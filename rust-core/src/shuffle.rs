use getrandom::getrandom;

/// Shuffle `items` in-place using the Fisher-Yates algorithm.
///
/// Randomness is sourced from the platform's CSPRNG via `getrandom`, which
/// maps to `crypto.getRandomValues` when compiled to WASM.
pub fn fisher_yates_shuffle(items: &mut Vec<String>) {
    let n = items.len();
    if n <= 1 {
        return;
    }
    for i in (1..n).rev() {
        let j = random_usize(i + 1);
        items.swap(i, j);
    }
}

/// Return a cryptographically random `usize` in `[0, max)`.
fn random_usize(max: usize) -> usize {
    let mut buf = [0u8; 8];
    getrandom(&mut buf).unwrap_or_default();
    let val = u64::from_le_bytes(buf);
    (val as usize) % max
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_slice_is_a_no_op() {
        let mut v: Vec<String> = vec![];
        fisher_yates_shuffle(&mut v);
        assert!(v.is_empty());
    }

    #[test]
    fn single_element_is_unchanged() {
        let mut v = vec!["a".to_string()];
        fisher_yates_shuffle(&mut v);
        assert_eq!(v, vec!["a"]);
    }

    #[test]
    fn shuffle_preserves_all_elements() {
        let original: Vec<String> = (0..20).map(|i| i.to_string()).collect();
        let mut shuffled = original.clone();
        fisher_yates_shuffle(&mut shuffled);
        // Same length and same set of elements (order may differ).
        assert_eq!(shuffled.len(), original.len());
        let mut sorted_original = original.clone();
        let mut sorted_shuffled = shuffled.clone();
        sorted_original.sort();
        sorted_shuffled.sort();
        assert_eq!(sorted_original, sorted_shuffled);
    }
}
