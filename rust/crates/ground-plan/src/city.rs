//! The city model: plain data in integer coordinates, which every consumer reads.
use std::sync::Arc;

use serde::{Deserialize, Serialize};

use crate::archetype::Form;
use crate::constants::RoadClass;
use crate::error::{CitymapError, ErrorCode, Result};
use crate::fixed::Pt;
use crate::json::{canonical_json, parse_json, validate};
use crate::land_use::LandUse;
use crate::region::separate::{SEPARATIONS, Separation};

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
    /// An archipelago's canals, drawn deeper than water; written only when the town has any.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub canals: Vec<Vec<Pt>>,
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
    /// Present (true) when the root manifests declare workspaces, which then decide apps and packages.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub declared: Option<bool>,
    pub highways: Vec<Road>,
    /// Present ("unfetchable") when a partial clone could not fetch its root manifests: its workspaces are not known.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub manifests: Option<String>,
    pub repository: String,
    /// The separations that would change this city's layout, in `SEPARATIONS` order; absent when none would.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub separable: Option<Vec<Separation>>,
    pub towns: Vec<Arc<Town>>,
}

/// The city as canonical JSON.
pub fn serialise_city(city: &City) -> Result<String> {
    canonical_json(city)
}

/// A city's shape fault at a pointer.
fn bad_shape(pointer: &str, message: &str) -> CitymapError {
    CitymapError::new(ErrorCode::CityBadShape, format!("{pointer}: {message}")).with("pointer", &pointer)
}

/// Checks what a city records of its separations: known names, once each, in `SEPARATIONS` order, not none; and a
/// declaration that is true.
fn check_separations(value: &serde_json::Value) -> Result<()> {
    let Some(object) = value.as_object() else {
        return Ok(());
    };
    if let Some(list) = object.get("separable") {
        let rank = |item: &serde_json::Value| {
            let separation = Separation::parse(item.as_str()?)?;
            SEPARATIONS.iter().position(|&s| s == separation)
        };
        let ranks: Option<Vec<usize>> = list.as_array().and_then(|items| items.iter().map(rank).collect());
        if !ranks.is_some_and(|r| !r.is_empty() && r.windows(2).all(|w| w[0] < w[1])) {
            return Err(bad_shape(
                "/separable",
                "the separations a city records are named once each, in order",
            ));
        }
    }
    if object
        .get("declared")
        .is_some_and(|d| *d != serde_json::Value::Bool(true))
    {
        return Err(bad_shape("/declared", "a city declares workspaces with true"));
    }
    if object
        .get("manifests")
        .is_some_and(|m| m.as_str() != Some(crate::snapshot::UNFETCHABLE))
    {
        return Err(bad_shape(
            "/manifests",
            "a city's manifests are unfetchable or not said",
        ));
    }
    Ok(())
}

/// Parses and validates a serialised city: every town has a key of its own, and its separations are recorded in order.
pub fn parse_city(text: &str) -> Result<City> {
    let value = parse_json(text, ErrorCode::CityBadJson)?;
    check_separations(&value)?;
    let city: City = validate(value, ErrorCode::CityBadShape)?;
    let mut keys: Vec<&str> = city.towns.iter().map(|t| t.key.as_str()).collect();
    keys.sort_unstable();
    if keys.windows(2).any(|w| w[0] == w[1]) {
        return Err(bad_shape("/towns", "every town has a key of its own"));
    }
    Ok(city)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn city() -> City {
        City {
            commit: "0".repeat(40),
            declared: None,
            highways: vec![],
            manifests: None,
            repository: "demo".into(),
            separable: None,
            towns: vec![],
        }
    }

    #[test]
    fn round_trips_the_separations_a_city_records_and_its_declaration() {
        let recorded = City {
            separable: Some(vec![Separation::Workspaces, Separation::Plugins]),
            declared: Some(true),
            manifests: Some(crate::snapshot::UNFETCHABLE.to_owned()),
            ..city()
        };
        let text = serialise_city(&recorded).expect("json");
        assert!(text.contains("\"highways\":[],\"manifests\":\"unfetchable\",\"repository\""));
        assert!(text.starts_with(&format!("{{\"commit\":\"{}\",\"declared\":true,", "0".repeat(40))));
        assert!(text.contains("\"separable\":[\"workspaces\",\"plugins\"]"));
        assert_eq!(parse_city(&text).expect("a city"), recorded);
        assert!(!serialise_city(&city()).expect("json").contains("separable"));
    }

    #[test]
    fn rejects_recorded_separations_that_are_unknown_repeated_out_of_order_or_none_and_a_false_declaration() {
        let with = |key: &str, value: serde_json::Value| {
            let mut json: serde_json::Value =
                serde_json::from_str(&serialise_city(&city()).expect("json")).expect("json");
            json[key] = value;
            parse_city(&json.to_string()).expect_err("a rejection").to_string()
        };
        for separable in [
            serde_json::json!(["split"]),
            serde_json::json!(["apps", "apps"]),
            serde_json::json!(["plugins", "apps"]),
            serde_json::json!([]),
            serde_json::json!(null),
        ] {
            assert!(with("separable", separable).starts_with("city/bad-shape: /separable"));
        }
        assert!(with("declared", serde_json::json!(false)).starts_with("city/bad-shape: /declared"));
        assert!(with("manifests", serde_json::json!("held")).starts_with("city/bad-shape: /manifests"));
    }
}
