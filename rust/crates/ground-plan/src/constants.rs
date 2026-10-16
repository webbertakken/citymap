//! Dimensions of the ground plan in fixed units (64 per u); provenance in the blueprint's DEFAULTS.md.
use serde::{Deserialize, Serialize};

/// Road classes, smallest first.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RoadClass {
    Lane,
    Street,
    Collector,
    Avenue,
    Boulevard,
    Highway,
}

impl RoadClass {
    pub const ALL: [Self; 6] = [
        Self::Lane,
        Self::Street,
        Self::Collector,
        Self::Avenue,
        Self::Boulevard,
        Self::Highway,
    ];

    /// The class's width in fixed units.
    #[must_use]
    pub const fn width(self) -> i64 {
        match self {
            Self::Lane => 40,
            Self::Street => 64,
            Self::Collector => 96,
            Self::Avenue => 144,
            Self::Boulevard => 208,
            Self::Highway => 176,
        }
    }

    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Lane => "lane",
            Self::Street => "street",
            Self::Collector => "collector",
            Self::Avenue => "avenue",
            Self::Boulevard => "boulevard",
            Self::Highway => "highway",
        }
    }

    /// Its index in `ALL`, smallest first.
    #[must_use]
    pub const fn rank(self) -> usize {
        self as usize
    }
}

/// One local street width.
pub const U: i64 = 64;
pub const BLOCK_SHORT: i64 = 6 * U;
pub const BLOCK_LONG: i64 = 12 * U;
/// Lot frontage unit, 0.5 u.
pub const MODULE: i64 = 32;
pub const PAVEMENT: i64 = 12;
/// Land of one lot: one module of frontage, half a block deep.
pub const LOT_AREA: i64 = MODULE * (BLOCK_SHORT / 2);
/// Half a street plus pavement round a neighbourhood's land.
pub const MARGIN: i64 = U / 2 + PAVEMENT;
/// A folder under this many blocks of land flattens into one neighbourhood.
pub const FLATTEN_BLOCKS: i64 = 9;
pub const FLATTEN_LIMIT: i64 = FLATTEN_BLOCKS * (BLOCK_SHORT + U) * (BLOCK_LONG + U);
/// A flat folder stays flat up to this share of the limit, and a district flattens below its inverse, in per cent.
pub const FLATTEN_HYSTERESIS_PCT: i64 = 150;
/// A new cut, partition or town gives each side this share of its demand as room to grow, in per cent.
pub const GROWTH_PCT: i64 = 135;
/// Mass (‰ of a file) at which land enters the village, town and city tiers; each tier lifts its roads one class.
pub const TIER_MASS_MILLE: [i64; 4] = [30_000, 300_000, 3_000_000, 30_000_000];
/// A laid road moves up a tier at its threshold × this, and down below its threshold ÷ this, in per cent.
pub const TIER_BAND_PCT: i64 = 125;
