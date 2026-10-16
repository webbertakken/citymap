//! The plat: the persistent state of a city, everything the layout remembers between commits.
use std::sync::Arc;

use indexmap::IndexMap;
use serde::{Deserialize, Deserializer, Serialize};

use crate::archetype::Form;
use crate::city::Town;
use crate::constants::RoadClass;
use crate::error::{CitymapError, ErrorCode, Result};
use crate::fixed::{Dir, Pt};
use crate::json::{Record, canonical_json, parse_json, sorted, validate};
use crate::tree::Shares;

pub const PLAT_VERSION: u32 = 1;

#[expect(
    clippy::trivially_copy_pass_by_ref,
    reason = "serde's skip_serializing_if passes a reference"
)]
const fn is_false(value: &bool) -> bool {
    !*value
}

/// `river` is `true` or absent.
fn literal_true<'de, D: Deserializer<'de>>(deserializer: D) -> std::result::Result<bool, D::Error> {
    if bool::deserialize(deserializer)? {
        Ok(true)
    } else {
        Err(serde::de::Error::custom("river is true or absent"))
    }
}

/// A remembered cut: its line, its class, the items on each side, and each side's land cap before it must move.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct CutRecord {
    pub c: i64,
    pub cap_left: i64,
    pub cap_right: i64,
    pub cls: RoadClass,
    pub left: Vec<String>,
    pub n: Dir,
    pub right: Vec<String>,
    /// A twin's cut: a river with bridges instead of a road.
    #[serde(default, skip_serializing_if = "is_false", deserialize_with = "literal_true")]
    pub river: bool,
    /// The class whose width the cut's land was laid at: room for the class to grow without taking lots.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub row: Option<RoadClass>,
}

impl CutRecord {
    /// The class whose width a cut's land was laid at; a cut laid before rights of way existed has its own class.
    #[must_use]
    pub fn right_of_way(&self) -> RoadClass {
        self.row.unwrap_or(self.cls)
    }
}

/// A remembered radial layout: core item, start angle step, ring order, sector bounds, core scale (‰) and caps.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct RadialRecord {
    pub bounds: Vec<i64>,
    pub caps: Record<i64>,
    pub core: String,
    pub order: Vec<String>,
    pub scale_mille: i64,
    pub start: i64,
}

/// A neighbourhood's park line.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ParkLine {
    pub c: i64,
    pub n: Dir,
}

/// Lot key to slot id, in the order lots took their slots.
pub type Slots = IndexMap<Arc<str>, String>;

/// A remembered neighbourhood grid: direction, origin, pitches, lot class, green, high street, park line, slots.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct GridRecord {
    pub a0: i64,
    pub b0: i64,
    #[serde(deserialize_with = "positive")]
    pub col_pitch: i64,
    pub dir: Dir,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub green: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub high: Option<i64>,
    pub park: Option<ParkLine>,
    #[serde(deserialize_with = "positive")]
    pub row_pitch: i64,
    #[serde(serialize_with = "sorted")]
    pub slots: Slots,
    #[serde(deserialize_with = "natural")]
    pub span: i64,
}

fn positive<'de, D: Deserializer<'de>>(deserializer: D) -> std::result::Result<i64, D::Error> {
    let v = i64::deserialize(deserializer)?;
    if v > 0 {
        Ok(v)
    } else {
        Err(serde::de::Error::custom(format!("a pitch is positive, not {v}")))
    }
}

fn natural<'de, D: Deserializer<'de>>(deserializer: D) -> std::result::Result<i64, D::Error> {
    let v = i64::deserialize(deserializer)?;
    if v >= 0 {
        Ok(v)
    } else {
        Err(serde::de::Error::custom(format!("expected a natural number, not {v}")))
    }
}

fn sorted_shares<S: serde::Serializer>(shares: &Arc<Shares>, serializer: S) -> std::result::Result<S::Ok, S::Error> {
    sorted(shares, serializer)
}

/// Everything the layout remembers about one town between commits.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct TownPlat {
    pub addresses: Record<String>,
    #[serde(deserialize_with = "natural")]
    pub area2: i64,
    #[serde(deserialize_with = "natural")]
    pub cap2: i64,
    pub centre: Option<Pt>,
    pub cuts: Record<CutRecord>,
    #[serde(deserialize_with = "natural")]
    pub diameter: i64,
    pub forms: Record<Form>,
    pub grids: Record<GridRecord>,
    pub radial: Record<RadialRecord>,
    /// The town's shares, as its tree made them; layout reads them and never changes them.
    #[serde(serialize_with = "sorted_shares")]
    pub shares: Arc<Shares>,
}

/// A town kept whole by an archetype switch.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct OldTown {
    /// Per lot key, the identities whose life keeps the lot lit.
    pub members: Record<Vec<String>>,
    pub town: Town,
}

/// The persistent state of a city.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Plat {
    pub old: Record<Vec<OldTown>>,
    pub root_forms: Record<Form>,
    /// The land and split setting this plat was laid for: each setting has its own plat.
    pub setting: String,
    pub towns: Record<TownPlat>,
    pub version: u32,
}

impl Plat {
    /// An empty plat for a setting.
    #[must_use]
    pub fn empty(setting: &str) -> Self {
        Self {
            old: Record::new(),
            root_forms: Record::new(),
            setting: setting.to_owned(),
            towns: Record::new(),
            version: PLAT_VERSION,
        }
    }
}

/// The plat as canonical JSON: sorted keys, integers only, one text per plat.
pub fn serialise_plat(plat: &Plat) -> Result<String> {
    canonical_json(plat)
}

/// Validates a parsed JSON value as a plat: `plat/too-new`, `plat/bad-version` or `plat/bad-shape` when it is not one.
pub fn plat_from_value(value: serde_json::Value) -> Result<Plat> {
    let version = value
        .get("version")
        .filter(|_| value.is_object())
        .and_then(serde_json::Value::as_f64);
    if let Some(v) = version
        && v > f64::from(PLAT_VERSION)
    {
        return Err(CitymapError::new(
            ErrorCode::PlatTooNew,
            format!("plat version {v} is newer than {PLAT_VERSION}"),
        )
        .with("version", &v));
    }
    if version != Some(f64::from(PLAT_VERSION)) {
        return Err(CitymapError::new(
            ErrorCode::PlatBadVersion,
            "the plat's version is not supported",
        ));
    }
    validate(value, ErrorCode::PlatBadShape)
}

/// Parses and validates a serialised plat.
pub fn parse_plat(text: &str) -> Result<Plat> {
    plat_from_value(parse_json(text, ErrorCode::PlatBadJson)?)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> Plat {
        let mut plat = Plat::empty("assets|split:apps");
        let mut town = TownPlat {
            area2: 10,
            cap2: 13,
            centre: Some(Pt::new(1, -2)),
            ..TownPlat::default()
        };
        town.cuts.insert(
            "src".into(),
            CutRecord {
                c: -5,
                cap_left: 1,
                cap_right: 2,
                cls: RoadClass::Street,
                left: vec!["a".into()],
                n: [4096, 0],
                right: vec![],
                river: true,
                row: None,
            },
        );
        let mut slots = Slots::new();
        slots.insert("z@1".into(), "0,0,0,1".into());
        slots.insert("a@0".into(), "0,0,0,0".into());
        town.grids.insert(
            "src".into(),
            GridRecord {
                a0: 0,
                b0: 0,
                col_pitch: 832,
                dir: [0, 4096],
                green: None,
                high: Some(2),
                park: None,
                row_pitch: 448,
                slots,
                span: 2,
            },
        );
        town.forms.insert("src".into(), Form::StreetVillage);
        plat.towns.insert("demo".into(), town);
        plat
    }

    #[test]
    fn serialises_sorted_and_round_trips() {
        let text = serialise_plat(&sample()).unwrap();
        assert!(
            text.starts_with("{\"old\":{},\"rootForms\":{},\"setting\":\"assets|split:apps\",\"towns\":{\"demo\":{")
        );
        assert!(text.contains("\"slots\":{\"a@0\":\"0,0,0,0\",\"z@1\":\"0,0,0,1\"},\"span\":2"));
        assert!(text.contains("\"river\":true"));
        assert!(text.contains("\"park\":null"));
        let parsed = parse_plat(&text).unwrap();
        assert_eq!(serialise_plat(&parsed).unwrap(), text);
        // Parsing keeps the text's order, as JSON.parse does.
        let keys: Vec<&str> = parsed.towns["demo"].grids["src"].slots.keys().map(|k| &**k).collect();
        assert_eq!(keys, ["a@0", "z@1"]);
    }

    #[test]
    fn rejects_bad_versions_and_shapes() {
        assert_eq!(parse_plat("nope").unwrap_err().code, ErrorCode::PlatBadJson);
        assert_eq!(parse_plat("{\"version\":2}").unwrap_err().code, ErrorCode::PlatTooNew);
        assert_eq!(
            parse_plat("{\"version\":0}").unwrap_err().code,
            ErrorCode::PlatBadVersion
        );
        assert_eq!(parse_plat("[1]").unwrap_err().code, ErrorCode::PlatBadVersion);
        let extra = serialise_plat(&sample())
            .unwrap()
            .replacen("{\"old\"", "{\"extra\":1,\"old\"", 1);
        assert_eq!(parse_plat(&extra).unwrap_err().code, ErrorCode::PlatBadShape);
        let river = serialise_plat(&sample())
            .unwrap()
            .replace("\"river\":true", "\"river\":false");
        assert_eq!(parse_plat(&river).unwrap_err().code, ErrorCode::PlatBadShape);
    }
}
