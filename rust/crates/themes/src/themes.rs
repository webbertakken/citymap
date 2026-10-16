//! Themes: data over the model, every colour the renderers use. Districts arrive as tint seeds.
use citymap_ground_plan::archetype::Form;
use citymap_ground_plan::fixed::fnv1a;

use crate::colour::{mix, oklch};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ThemeName {
    PaperAtlas,
    NightAtlas,
    Beck,
    Nolli,
    Dracula,
}

impl ThemeName {
    pub const ALL: [Self; 5] = [
        Self::PaperAtlas,
        Self::NightAtlas,
        Self::Beck,
        Self::Nolli,
        Self::Dracula,
    ];

    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::PaperAtlas => "paper-atlas",
            Self::NightAtlas => "night-atlas",
            Self::Beck => "beck",
            Self::Nolli => "nolli",
            Self::Dracula => "dracula",
        }
    }

    #[must_use]
    pub fn parse(name: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|t| t.as_str() == name)
    }
}

/// A theme's fixed colours; its per-district colours are its methods.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Theme {
    pub name: ThemeName,
    pub label: &'static str,
    pub dark: bool,
    pub country: String,
    pub ground: String,
    pub outline: String,
    pub park: String,
    pub plaza: String,
    pub water: String,
    pub waterline: String,
    /// An archipelago's canals: a deeper, more saturated blue than the water, so no district tint matches them.
    pub canal: String,
    pub canalline: String,
    pub casing: String,
    pub road: String,
    pub text: String,
    pub halo: String,
    pub header: String,
    pub header_text: String,
    pub sub_text: String,
}

/// The hue of a district: the root district (the empty key) takes a warm neutral; other districts spread over hues
/// clear of park green.
#[must_use]
pub fn hue_of(district: u32) -> f64 {
    if district == fnv1a("") {
        return 60.0;
    }
    let h = district % 290;
    f64::from(if h >= 95 { h + 70 } else { h })
}

fn form_hue(form: Form) -> f64 {
    match form {
        Form::Radial => 55.0,
        Form::Twin => 235.0,
        Form::Corridor => 95.0,
        Form::Archipelago => 200.0,
        Form::Quarters => 300.0,
        _ => 15.0,
    }
}

fn form_accent(form: Form) -> &'static str {
    match form {
        Form::Radial => "#FFB86C",
        Form::Twin => "#8BE9FD",
        Form::Corridor => "#F1FA8C",
        Form::Archipelago => "#6272A4",
        Form::Quarters => "#BD93F9",
        _ => "#FF79C6",
    }
}

// Dracula (draculatheme.com): background, current line, foreground and the seven accents.
const DRACULA_BACKGROUND: &str = "#282A36";
const DRACULA_LINE: &str = "#44475A";
const DRACULA_FOREGROUND: &str = "#F8F8F2";
const DRACULA_DEEP: &str = "#191A21";
const DRACULA_ACCENTS: [&str; 7] = [
    "#BD93F9", "#FF79C6", "#8BE9FD", "#50FA7B", "#FFB86C", "#F1FA8C", "#FF5555",
];
// Beck: the flat, saturated fields of a transit diagram.
const BECK: [&str; 9] = [
    "#E32017", "#FFD300", "#00782A", "#003688", "#0098D4", "#95CDBA", "#EE7C0E", "#9B0056", "#A0A5A9",
];

fn accent(district: u32) -> &'static str {
    DRACULA_ACCENTS[usize::try_from(district % 7).expect("small")]
}

fn beck(district: u32) -> &'static str {
    BECK[usize::try_from(district % 9).expect("small")]
}

fn s(text: &str) -> String {
    text.to_owned()
}

impl Theme {
    /// The theme of a name.
    #[must_use]
    pub fn of(name: ThemeName) -> Self {
        match name {
            ThemeName::PaperAtlas => Self {
                name,
                label: "Paper atlas",
                dark: false,
                country: s("#E4E6D6"),
                ground: s("#F2EEE6"),
                outline: s("#D3CCBD"),
                park: s("#BFD8A6"),
                plaza: s("#E9DFCB"),
                water: s("#A9CCE3"),
                waterline: s("#7FAFD0"),
                canal: oklch(0.66, 0.1, 235.0),
                canalline: oklch(0.52, 0.1, 235.0),
                casing: s("#C3BBAC"),
                road: s("#FFFFFF"),
                text: s("#1E1E24"),
                halo: s("#F2EEE6"),
                header: s("#FFFFFF"),
                header_text: s("#1E1E24"),
                sub_text: s("#4A4A55"),
            },
            ThemeName::NightAtlas => Self {
                name,
                label: "Night atlas",
                dark: true,
                country: s("#11151C"),
                ground: s("#1B212B"),
                outline: s("#2C3440"),
                park: oklch(0.36, 0.05, 140.0),
                plaza: s("#2A303A"),
                water: s("#22384D"),
                waterline: s("#34536F"),
                canal: oklch(0.38, 0.1, 240.0),
                canalline: oklch(0.5, 0.11, 240.0),
                casing: s("#0D1117"),
                road: s("#59606B"),
                text: s("#ECEAE4"),
                halo: s("#1B212B"),
                header: s("#0D1117"),
                header_text: s("#ECEAE4"),
                sub_text: s("#B4B8C0"),
            },
            ThemeName::Beck => Self {
                name,
                label: "Beck schematic",
                dark: false,
                country: s("#FFFFFF"),
                ground: s("#F7F7F2"),
                outline: s("#E2E2DC"),
                park: s("#C7E3B5"),
                plaza: s("#F7F7F2"),
                water: s("#B9DCF2"),
                waterline: s("#B9DCF2"),
                canal: oklch(0.52, 0.14, 245.0),
                canalline: oklch(0.4, 0.12, 245.0),
                casing: s("#FFFFFF"),
                road: s("#FFFFFF"),
                text: s("#10141A"),
                halo: s("#FFFFFF"),
                header: s("#FFFFFF"),
                header_text: s("#10141A"),
                sub_text: s("#4A4E57"),
            },
            ThemeName::Nolli => Self {
                name,
                label: "Nolli noir",
                dark: false,
                country: s("#E9E5DC"),
                ground: s("#F4F1EA"),
                outline: s("#2A2A2A"),
                park: s("#D9D6CF"),
                plaza: s("#F4F1EA"),
                water: s("#CFCBC2"),
                waterline: s("#B3AEA4"),
                canal: oklch(0.68, 0.04, 235.0),
                canalline: oklch(0.55, 0.05, 235.0),
                casing: s("#F4F1EA"),
                road: s("#F4F1EA"),
                text: s("#111111"),
                halo: s("#F4F1EA"),
                header: s("#F4F1EA"),
                header_text: s("#111111"),
                sub_text: s("#3A3A3A"),
            },
            ThemeName::Dracula => Self {
                name,
                label: "Dracula",
                dark: true,
                country: s("#1E1F29"),
                ground: s(DRACULA_BACKGROUND),
                outline: s(DRACULA_LINE),
                park: mix(DRACULA_BACKGROUND, "#50FA7B", 0.28),
                plaza: mix(DRACULA_BACKGROUND, DRACULA_FOREGROUND, 0.16),
                water: mix(DRACULA_BACKGROUND, "#8BE9FD", 0.3),
                waterline: mix(DRACULA_BACKGROUND, "#8BE9FD", 0.6),
                canal: mix(DRACULA_BACKGROUND, "#8BE9FD", 0.5),
                canalline: mix(DRACULA_BACKGROUND, "#8BE9FD", 0.8),
                casing: s(DRACULA_DEEP),
                road: s(DRACULA_LINE),
                text: s(DRACULA_FOREGROUND),
                halo: s(DRACULA_BACKGROUND),
                header: s(DRACULA_DEEP),
                header_text: s(DRACULA_FOREGROUND),
                sub_text: s("#BFC1D0"),
            },
        }
    }

    #[must_use]
    pub fn block(&self, d: u32) -> String {
        match self.name {
            ThemeName::PaperAtlas => oklch(0.915, 0.025, hue_of(d)),
            ThemeName::NightAtlas => oklch(0.25, 0.025, hue_of(d)),
            ThemeName::Beck => mix("#FFFFFF", beck(d), 0.18),
            ThemeName::Nolli => s("#F4F1EA"),
            ThemeName::Dracula => mix(DRACULA_BACKGROUND, accent(d), 0.1),
        }
    }

    #[must_use]
    pub fn lot(&self, d: u32, source: bool) -> String {
        match self.name {
            ThemeName::PaperAtlas => oklch(
                if source { 0.84 } else { 0.87 },
                if source { 0.05 } else { 0.025 },
                hue_of(d),
            ),
            ThemeName::NightAtlas => oklch(
                if source { 0.4 } else { 0.34 },
                if source { 0.06 } else { 0.03 },
                hue_of(d),
            ),
            ThemeName::Beck => mix("#FFFFFF", beck(d), if source { 0.62 } else { 0.4 }),
            ThemeName::Nolli => s(if source { "#111111" } else { "#3A3A3A" }),
            ThemeName::Dracula => mix(DRACULA_BACKGROUND, accent(d), if source { 0.5 } else { 0.32 }),
        }
    }

    #[must_use]
    pub fn plinth(&self, d: u32) -> String {
        match self.name {
            ThemeName::PaperAtlas => oklch(0.7, 0.04, hue_of(d)),
            ThemeName::NightAtlas => oklch(0.18, 0.03, hue_of(d)),
            ThemeName::Beck => mix("#10141A", beck(d), 0.55),
            ThemeName::Nolli => s("#000000"),
            ThemeName::Dracula => mix(DRACULA_DEEP, accent(d), 0.3),
        }
    }

    /// A reserve plot's fill and stroke.
    #[must_use]
    pub fn reserve(&self, d: u32) -> (String, String) {
        match self.name {
            ThemeName::PaperAtlas => (oklch(0.94, 0.018, hue_of(d)), oklch(0.86, 0.03, hue_of(d))),
            ThemeName::NightAtlas => (oklch(0.22, 0.015, hue_of(d)), oklch(0.32, 0.03, hue_of(d))),
            ThemeName::Beck => (mix("#FFFFFF", beck(d), 0.08), mix("#FFFFFF", beck(d), 0.3)),
            ThemeName::Nolli => (s("#F4F1EA"), s("#C9C4B8")),
            ThemeName::Dracula => (
                mix(DRACULA_BACKGROUND, accent(d), 0.05),
                mix(DRACULA_BACKGROUND, accent(d), 0.3),
            ),
        }
    }

    /// A district form's colour, for blocks or lots.
    #[must_use]
    pub fn form(&self, f: Form, lot: bool) -> String {
        match self.name {
            ThemeName::PaperAtlas => oklch(
                if lot { 0.82 } else { 0.92 },
                if lot { 0.08 } else { 0.03 },
                form_hue(f),
            ),
            ThemeName::NightAtlas => oklch(
                if lot { 0.45 } else { 0.26 },
                if lot { 0.09 } else { 0.03 },
                form_hue(f),
            ),
            ThemeName::Beck => mix("#FFFFFF", form_accent(f), if lot { 0.7 } else { 0.2 }),
            ThemeName::Nolli => {
                if lot {
                    mix("#111111", form_accent(f), 0.35)
                } else {
                    s("#F4F1EA")
                }
            }
            ThemeName::Dracula => mix(DRACULA_BACKGROUND, form_accent(f), if lot { 0.5 } else { 0.12 }),
        }
    }
}

#[cfg(test)]
mod parity {
    use super::*;

    fn form(name: &str) -> Form {
        match name {
            "radial" => Form::Radial,
            "twin" => Form::Twin,
            "corridor" => Form::Corridor,
            "archipelago" => Form::Archipelago,
            "quarters" => Form::Quarters,
            _ => Form::Polycentric,
        }
    }

    /// Every colour the TypeScript themes gave (`scripts/parity-fixtures.ts`) is the same here.
    #[test]
    fn colours_as_the_typescript_themes_do() {
        let text = include_str!("../../../fixtures/colours.tsv");
        let mut count = 0;
        for line in text.lines() {
            let fields: Vec<&str> = line.split('\t').collect();
            let theme = Theme::of(ThemeName::parse(fields[0]).expect("a theme"));
            let d = || fields[2].parse::<u32>().expect("a district");
            let actual = match fields[1] {
                "country" => theme.country.clone(),
                "ground" => theme.ground.clone(),
                "outline" => theme.outline.clone(),
                "park" => theme.park.clone(),
                "plaza" => theme.plaza.clone(),
                "water" => theme.water.clone(),
                "waterline" => theme.waterline.clone(),
                "canal" => theme.canal.clone(),
                "canalline" => theme.canalline.clone(),
                "casing" => theme.casing.clone(),
                "road" => theme.road.clone(),
                "text" => theme.text.clone(),
                "halo" => theme.halo.clone(),
                "header" => theme.header.clone(),
                "headerText" => theme.header_text.clone(),
                "subText" => theme.sub_text.clone(),
                "block" => theme.block(d()),
                "lot-source" => theme.lot(d(), true),
                "lot" => theme.lot(d(), false),
                "plinth" => theme.plinth(d()),
                "reserve" => {
                    let (fill, stroke) = theme.reserve(d());
                    format!("{fill} {stroke}")
                }
                "form-block" => theme.form(form(fields[2]), false),
                "form-lot" => theme.form(form(fields[2]), true),
                other => panic!("unknown colour {other}"),
            };
            assert_eq!(actual, fields[3], "{line}");
            count += 1;
        }
        assert!(count > 7000);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::colour::contrast;

    #[test]
    fn keeps_labels_and_header_text_at_wcag_aa_contrast() {
        for name in ThemeName::ALL {
            let t = Theme::of(name);
            assert!(contrast(&t.text, &t.halo) >= 4.5, "{name:?} text");
            assert!(contrast(&t.header_text, &t.header) >= 4.5, "{name:?} header");
            assert!(contrast(&t.sub_text, &t.header) >= 4.5, "{name:?} subtitle");
        }
    }

    #[test]
    fn spreads_district_hues_clear_of_park_green_the_root_warm() {
        assert!((hue_of(fnv1a("")) - 60.0).abs() < f64::EPSILON);
        for d in (0..2000).step_by(7) {
            let h = hue_of(d);
            assert!(!(95.0..165.0).contains(&h), "{d}: {h}");
        }
    }
}
