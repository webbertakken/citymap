//! Hashes, seeds and the engine's only string order.
use std::cmp::Ordering;

const OFFSET: u32 = 0x811c_9dc5;
const PRIME: u32 = 0x0100_0193;

/// 32-bit FNV-1a over the key's UTF-8 bytes, unsigned.
#[must_use]
#[inline]
pub fn fnv1a(key: &str) -> u32 {
    fnv1a_bytes(key.bytes())
}

/// 32-bit FNV-1a over bytes.
#[must_use]
#[inline]
pub fn fnv1a_bytes(bytes: impl IntoIterator<Item = u8>) -> u32 {
    bytes
        .into_iter()
        .fold(OFFSET, |h, byte| (h ^ u32::from(byte)).wrapping_mul(PRIME))
}

/// The seed of a plat key: its hash with pinwheel separators removed, so sub-keys keep their parent's tint.
#[must_use]
pub fn seed_of(key: &str) -> u32 {
    // `>` is one byte in UTF-8 and never part of a longer sequence, so skipping its bytes removes the character.
    fnv1a_bytes(key.bytes().filter(|&b| b != b'>'))
}

/// A deterministic integer in [0, 1000) from a key.
#[must_use]
pub fn unit_mille(key: &str) -> i64 {
    i64::from(u32::try_from((u64::from(fnv1a(key)) * 1000) >> 32).expect("below 1000"))
}

/// Byte-wise (UTF-8) order, which is code point order: the only string comparison the engine uses.
#[must_use]
#[inline]
pub fn compare_keys(a: &str, b: &str) -> Ordering {
    a.as_bytes().cmp(b.as_bytes())
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;

    #[test]
    fn matches_the_published_fnv1a_vectors() {
        assert_eq!(fnv1a(""), 0x811c_9dc5);
        assert_eq!(fnv1a("a"), 0xe40c_292c);
        assert_eq!(fnv1a("foobar"), 0xbf9c_f968);
    }

    #[test]
    fn hashes_utf8_bytes_not_utf16_code_units() {
        let h = [0xc3u32, 0xa9].iter().fold(OFFSET, |h, b| (h ^ b).wrapping_mul(PRIME));
        assert_eq!(fnv1a("é"), h);
    }

    #[test]
    fn seeds_ignore_pinwheel_separators() {
        assert_eq!(seed_of("src>L>R"), fnv1a("srcLR"));
    }

    #[test]
    fn orders_by_code_point_as_utf8_bytes_do() {
        assert_eq!(compare_keys("\u{ff5e}", "\u{1f600}"), Ordering::Less);
        assert_eq!(compare_keys("a", "b"), Ordering::Less);
        assert_eq!(compare_keys("b", "a"), Ordering::Greater);
        assert_eq!(compare_keys("a/b", "a/b"), Ordering::Equal);
        assert_eq!(compare_keys("a", "ab"), Ordering::Less);
    }

    proptest! {
        #[test]
        fn unit_mille_stays_in_range(key in ".*") {
            let v = unit_mille(&key);
            prop_assert!((0..1000).contains(&v));
        }

        #[test]
        fn code_point_order_is_byte_order(a in ".*", b in ".*") {
            let points = a.chars().cmp(b.chars());
            prop_assert_eq!(compare_keys(&a, &b), points);
        }
    }
}
