//! The city model: plain data in integer coordinates, which every consumer reads.
use std::sync::Arc;

use serde::{Deserialize, Serialize};

use crate::archetype::Form;
use crate::constants::RoadClass;
use crate::error::{CitymapError, ErrorCode, Result};
use crate::fixed::Pt;
use crate::json::{canonical_json, parse_json, validate};
use crate::land_use::LandUse;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Road {
    pub cls: RoadClass,
    pub pts: Vec<Pt>,
    /// Fixed units, when the road is drawn narrower than its class: a class that outgrew its right of way.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub width: Option<i64>,
}

impl Road {
    /// A road's drawn width: its own, when its right of way caps it, else its class's.
    #[must_use]
    pub fn drawn_width(&self) -> i64 {
        self.width.unwrap_or_else(|| self.cls.width())
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum BlockKind {
    Built,
    Reserve,
    Park,
    Plaza,
    Green,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Block {
    /// Tint seed of the district the block lies in.
    pub district: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub form: Option<Form>,
    pub kind: BlockKind,
    pub pts: Vec<Pt>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Lot {
    pub address: String,
    pub district: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub form: Option<Form>,
    pub key: String,
    /// The path of the lot's oldest live member; empty for a vacant lot.
    pub path: String,
    pub pts: Vec<Pt>,
    #[serde(rename = "use")]
    pub land_use: LandUse,
    pub vacant: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct District {
    pub depth: i64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub form: Option<Form>,
    pub mass_mille: i64,
    pub name: String,
    pub path: String,
    pub pts: Vec<Pt>,
    pub ward: bool,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct TownStats {
    pub docs: i64,
    /// Twice the town's land, in fixed units².
    pub land_area2: i64,
    /// Twice the area covered by lots, in fixed units².
    pub lot_area2: i64,
    pub lots: i64,
    pub off_land: i64,
    pub overflow: i64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Town {
    pub blocks: Vec<Block>,
    pub districts: Vec<District>,
    pub form: Form,
    pub key: String,
    pub lots: Vec<Lot>,
    pub name: String,
    pub old: bool,
    pub outline: Vec<Pt>,
    pub roads: Vec<Road>,
    pub stats: TownStats,
    pub water: Vec<Vec<Pt>>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct City {
    pub commit: String,
    pub highways: Vec<Road>,
    pub repository: String,
    pub towns: Vec<Arc<Town>>,
}

/// The city as canonical JSON.
pub fn serialise_city(city: &City) -> Result<String> {
    canonical_json(city)
}

/// Parses and validates a serialised city: every town has a key of its own.
pub fn parse_city(text: &str) -> Result<City> {
    let city: City = validate(parse_json(text, ErrorCode::CityBadJson)?, ErrorCode::CityBadShape)?;
    let mut keys: Vec<&str> = city.towns.iter().map(|t| t.key.as_str()).collect();
    keys.sort_unstable();
    if keys.windows(2).any(|w| w[0] == w[1]) {
        return Err(
            CitymapError::new(ErrorCode::CityBadShape, "/towns: every town has a key of its own")
                .with("pointer", &"/towns"),
        );
    }
    Ok(city)
}
