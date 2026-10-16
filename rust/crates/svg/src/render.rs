//! A city drawn as one SVG document, in a theme, in plan or 2:1 dimetric view: the same floating-point operations in
//! the same order as the TypeScript renderer, so the document is the same bytes.
use std::collections::HashSet;
use std::fmt::Write as _;

use citymap_ground_plan::city::{BlockKind, City, Road};
use citymap_ground_plan::constants::RoadClass;
use citymap_ground_plan::fixed::{Pt, UNIT, area2, centroid, fnv1a};
use citymap_ground_plan::organic::regions::{Region, city_regions};
use citymap_themes::{Theme, ThemeName};

use crate::number::{js_number, to_fixed};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Camera {
    Plan,
    Dimetric,
}

impl Camera {
    #[must_use]
    pub fn parse(name: &str) -> Option<Self> {
        match name {
            "plan" => Some(Self::Plan),
            "dimetric" => Some(Self::Dimetric),
            _ => None,
        }
    }
}

/// What the sheet shows and how.
#[derive(Clone, Debug)]
pub struct RenderOptions {
    pub title: String,
    pub subtitle: String,
    pub theme: ThemeName,
    pub camera: Camera,
    /// Width of the sheet in pixels; the height follows the city.
    pub width: f64,
    /// Fill each top-level folder's region (the land nearer its lots than any other's) beneath the blocks.
    pub regions: bool,
}

const HEADER: f64 = 64.0;
#[allow(clippy::cast_precision_loss)]
const PAD: f64 = (40 * (UNIT / 8)) as f64;

/// Text as SVG character data: repository names and paths are untrusted.
#[must_use]
pub fn escape_text(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

#[allow(clippy::cast_precision_loss)]
fn float(v: i64) -> f64 {
    v as f64
}

/// The screen projection of a city: plan or dimetric, scaled to the sheet.
struct Sheet {
    dimetric: bool,
    min_x: f64,
    min_y: f64,
    scale: f64,
}

impl Sheet {
    fn project(dimetric: bool, p: Pt) -> (f64, f64) {
        let (x, y) = (float(p.x), float(p.y));
        if dimetric {
            (
                (x - y) * std::f64::consts::FRAC_1_SQRT_2,
                -(x + y) * std::f64::consts::FRAC_1_SQRT_2 * 0.5,
            )
        } else {
            (x, -y)
        }
    }

    fn screen(&self, p: Pt) -> (f64, f64) {
        let (x, y) = Self::project(self.dimetric, p);
        ((x - self.min_x) * self.scale, (y - self.min_y) * self.scale + HEADER)
    }

    fn px(&self, out: &mut String, p: Pt) {
        let (x, y) = self.screen(p);
        out.push_str(&to_fixed(x, 1));
        out.push(',');
        out.push_str(&to_fixed(y, 1));
    }

    fn path(&self, pts: &[Pt], closed: bool) -> String {
        let mut out = String::from("M");
        for (i, &p) in pts.iter().enumerate() {
            if i > 0 {
                out.push('L');
            }
            self.px(&mut out, p);
        }
        if closed {
            out.push('Z');
        }
        out
    }

    fn sw(&self, w: f64) -> String {
        to_fixed(w * self.scale * if self.dimetric { 0.85 } else { 1.0 }, 2)
    }

    #[allow(clippy::cast_precision_loss)]
    fn thin(&self, w: f64) -> String {
        to_fixed(0.5f64.max(w * self.scale * (UNIT / 8) as f64), 2)
    }
}

const ORDER: [RoadClass; 6] = [
    RoadClass::Lane,
    RoadClass::Street,
    RoadClass::Collector,
    RoadClass::Avenue,
    RoadClass::Boulevard,
    RoadClass::Highway,
];

fn road_path(sheet: &Sheet, theme: &Theme, pts: &[Pt], road: i64, casing: bool) -> String {
    format!(
        r#"<path d="{}" fill="none" stroke="{}" stroke-width="{}" stroke-linecap="butt" stroke-linejoin="round"/>"#,
        sheet.path(pts, false),
        if casing { &theme.casing } else { &theme.road },
        sheet.sw(float(road + if casing { 16 } else { 0 }))
    )
}

/// Labels placed so far, as screen boxes, and the names already used.
struct Labels {
    placed: Vec<[f64; 4]>,
    named: HashSet<String>,
}

/// Draws a city as one SVG document in a theme, in plan or 2:1 dimetric view.
#[must_use]
pub fn render_city(city: &City, options: &RenderOptions) -> String {
    let theme = Theme::of(options.theme);
    let dimetric = options.camera == Camera::Dimetric;
    let extent: Vec<(f64, f64)> = city
        .towns
        .iter()
        .flat_map(|t| t.outline.iter().map(|&p| Sheet::project(dimetric, p)))
        .collect();
    let fold = |init: f64, pick: fn(&(f64, f64)) -> f64, keep: fn(f64, f64) -> f64| {
        if extent.is_empty() {
            0.0
        } else {
            extent.iter().map(pick).fold(init, keep)
        }
    };
    let min_x = fold(f64::INFINITY, |p| p.0, f64::min) - PAD;
    let max_x = fold(f64::NEG_INFINITY, |p| p.0, f64::max) + PAD;
    let min_y = fold(f64::INFINITY, |p| p.1, f64::min) - PAD;
    let max_y = fold(f64::NEG_INFINITY, |p| p.1, f64::max) + PAD;
    let width = options.width;
    let scale = width / (max_x - min_x);
    let height = ((max_y - min_y) * scale).ceil() + HEADER;
    let sheet = Sheet {
        dimetric,
        min_x,
        min_y,
        scale,
    };
    let mut out = String::new();
    let _ = write!(
        out,
        r#"<rect width="{}" height="{}" fill="{}"/>"#,
        js_number(width),
        js_number(height),
        theme.country
    );
    let regions: Vec<Vec<Region>> = if options.regions { city_regions(city) } else { vec![] };

    for (ti, town) in city.towns.iter().enumerate() {
        let dash = if town.old {
            format!(r#" stroke-dasharray="{} {}""#, sheet.sw(80.0), sheet.sw(48.0))
        } else {
            String::new()
        };
        let outline = sheet.path(&town.outline, true);
        let _ = write!(out, r#"<clipPath id="town{ti}"><path d="{outline}"/></clipPath>"#);
        let _ = write!(
            out,
            r#"<path d="{outline}" fill="{}" stroke="{}" stroke-width="{}"{dash}/>"#,
            theme.ground,
            theme.outline,
            sheet.sw(32.0)
        );
        let _ = write!(out, r#"<g clip-path="url(#town{ti})">"#);
        let town_regions = regions.get(ti).map_or(&[][..], Vec::as_slice);
        for region in town_regions {
            let _ = write!(
                out,
                r#"<path class="region" d="{}" fill="{}" stroke="{}" stroke-width="{}"/>"#,
                sheet.path(&region.pts, true),
                theme.block(fnv1a(&region.path)),
                theme.outline,
                sheet.thin(0.6)
            );
        }
        for b in &town.blocks {
            if b.kind == BlockKind::Reserve {
                let (fill, stroke) = theme.reserve(b.district);
                let _ = write!(
                    out,
                    r#"<path d="{}" fill="{fill}" stroke="{stroke}" stroke-width="{}" stroke-dasharray="{} {}"/>"#,
                    sheet.path(&b.pts, true),
                    sheet.thin(0.8),
                    sheet.thin(3.0),
                    sheet.thin(2.0)
                );
                continue;
            }
            let fill = match b.kind {
                BlockKind::Park | BlockKind::Green => theme.park.clone(),
                BlockKind::Plaza => theme.plaza.clone(),
                _ => theme.block(b.district),
            };
            let _ = write!(out, r#"<path d="{}" fill="{fill}"/>"#, sheet.path(&b.pts, true));
        }
        for w in &town.water {
            let _ = write!(
                out,
                r#"<path d="{}" fill="{}" stroke="{}" stroke-width="{}"/>"#,
                sheet.path(w, true),
                theme.water,
                theme.waterline,
                sheet.thin(0.6)
            );
        }
        for w in &town.canals {
            let _ = write!(
                out,
                r#"<path d="{}" fill="{}" stroke="{}" stroke-width="{}"/>"#,
                sheet.path(w, true),
                theme.canal,
                theme.canalline,
                sheet.thin(0.6)
            );
        }
        // Roads: every casing, then every fill, smallest class first, so junctions merge.
        let mut roads: Vec<&Road> = town.roads.iter().collect();
        roads.sort_by_key(|r| ORDER.iter().position(|&c| c == r.cls));
        for r in &roads {
            out.push_str(&road_path(&sheet, &theme, &r.pts, r.drawn_width(), true));
        }
        for r in &roads {
            out.push_str(&road_path(&sheet, &theme, &r.pts, r.drawn_width(), false));
        }
        let mut lots: Vec<&citymap_ground_plan::city::Lot> = town.lots.iter().collect();
        if dimetric {
            lots.sort_by(|a, b| {
                let (ca, cb) = (centroid(&a.pts), centroid(&b.pts));
                (cb.x + cb.y - (ca.x + ca.y)).cmp(&0)
            });
        }
        for lot in lots {
            if lot.vacant {
                // A vacant lot keeps its place until renewal: an empty plot with a dashed edge.
                let (fill, stroke) = theme.reserve(lot.district);
                let _ = write!(
                    out,
                    r#"<path d="{}" fill="{fill}" stroke="{stroke}" stroke-width="{}" stroke-dasharray="{} {}"/>"#,
                    sheet.path(&lot.pts, true),
                    sheet.thin(0.5),
                    sheet.thin(1.5),
                    sheet.thin(1.0)
                );
                continue;
            }
            let fill = theme.lot(
                lot.district,
                lot.land_use == citymap_ground_plan::land_use::LandUse::Source,
            );
            let d = sheet.path(&lot.pts, true);
            if dimetric {
                let _ = write!(
                    out,
                    r#"<path d="{d}" transform="translate(0 {})" fill="{}"/>"#,
                    to_fixed(24.0 * scale, 2),
                    theme.plinth(lot.district)
                );
            }
            let _ = write!(
                out,
                r#"<path d="{d}" fill="{fill}" stroke="{}" stroke-width="{}"/>"#,
                theme.ground,
                to_fixed(0.8f64.min(2.8 * scale), 2)
            );
        }
        for region in town_regions {
            let _ = write!(
                out,
                r#"<path class="region-edge" d="{}" fill="none" stroke="{}" stroke-width="{}" stroke-linejoin="round"/>"#,
                sheet.path(&region.pts, true),
                theme.outline,
                sheet.thin(1.6)
            );
        }
        out.push_str("</g>");
    }
    // Highways continue the roads they join: same class, same casing and fill, over the town edges.
    for h in &city.highways {
        out.push_str(&road_path(&sheet, &theme, &h.pts, h.drawn_width(), true));
    }
    for h in &city.highways {
        out.push_str(&road_path(&sheet, &theme, &h.pts, h.drawn_width(), false));
    }

    // Labels: towns, then districts by mass; a label that would overlap one already placed is left out.
    let mut labels = Labels {
        placed: Vec::new(),
        named: HashSet::new(),
    };
    let mut label = |out: &mut String, at: Pt, text: &str, size: f64, weight: u32, spacing: f64| {
        let (sx, sy) = sheet.screen(at);
        let x: f64 = to_fixed(sx, 1).parse().expect("a number");
        let y: f64 = to_fixed(sy, 1).parse().expect("a number");
        #[allow(clippy::cast_precision_loss)]
        let length = text.encode_utf16().count() as f64;
        let w = length * size * (0.6 + spacing / size);
        let b = [x - w / 2.0, y - size / 2.0, x + w / 2.0, y + size / 2.0];
        let lower = text.to_lowercase();
        if b[0] < 0.0 || b[2] > width || b[1] < HEADER || labels.named.contains(&lower) {
            return;
        }
        if labels
            .placed
            .iter()
            .any(|p| p[0] < b[2] && b[0] < p[2] && p[1] < b[3] && b[1] < p[3])
        {
            return;
        }
        labels.placed.push(b);
        labels.named.insert(lower);
        let _ = write!(
            out,
            r#"<text x="{}" y="{}" font-size="{}" font-weight="{weight}" letter-spacing="{}" text-anchor="middle" dominant-baseline="central" fill="{}" stroke="{}" stroke-width="3.5" paint-order="stroke" stroke-linejoin="round">{}</text>"#,
            to_fixed(x, 1),
            to_fixed(y, 1),
            js_number(size),
            js_number(spacing),
            theme.text,
            theme.halo,
            escape_text(text)
        );
    };
    for town in &city.towns {
        label(
            &mut out,
            centroid(&town.outline),
            &town.name.to_uppercase(),
            24.0,
            800,
            3.0,
        );
    }
    let mut districts: Vec<&citymap_ground_plan::city::District> =
        city.towns.iter().flat_map(|t| &t.districts).collect();
    districts.sort_by_key(|d| std::cmp::Reverse(d.mass_mille));
    let heaviest = districts.iter().map(|d| d.mass_mille).fold(1, i64::max);
    let largest = city.towns.iter().map(|t| area2(&t.outline)).fold(1, i64::max);
    for d in districts.iter().take(60) {
        let a2 = area2(&d.pts);
        if float(a2) * 1000.0 < float(largest) * 8.0 || (float(a2) / 2.0) * scale * scale < 3000.0 {
            continue;
        }
        let major = d.depth == 1 || d.mass_mille * 100 >= 8 * heaviest;
        let name = if major { d.name.to_uppercase() } else { d.name.clone() };
        let (size, weight, spacing) = if major { (14.0, 700, 1.5) } else { (11.0, 600, 0.0) };
        label(&mut out, centroid(&d.pts), &name, size, weight, spacing);
    }
    let _ = write!(
        out,
        r#"<rect width="{}" height="{}" fill="{}"/>"#,
        js_number(width),
        HEADER,
        theme.header
    );
    let _ = write!(
        out,
        r#"<text x="20" y="28" font-size="22" font-weight="700" fill="{}">{}</text>"#,
        theme.header_text,
        escape_text(&options.title)
    );
    let _ = write!(
        out,
        r#"<text x="20" y="52" font-size="15" fill="{}">{}</text>"#,
        theme.sub_text,
        escape_text(&options.subtitle)
    );
    format!(
        r#"<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" font-family="Noto Sans, DejaVu Sans, sans-serif">{out}</svg>"#,
        w = js_number(width),
        h = js_number(height)
    )
}

#[cfg(test)]
mod parity {
    use super::*;
    use citymap_ground_plan::city::parse_city;

    fn digest(text: &str) -> String {
        let nul = format!("\u{0}{text}");
        format!("{:08x}{:08x}", fnv1a(text), fnv1a(&nul))
    }

    fn assert_same(actual: &str, expected: &str) {
        if actual != expected {
            let at = actual
                .bytes()
                .zip(expected.bytes())
                .position(|(a, b)| a != b)
                .unwrap_or(0);
            let from = at.saturating_sub(120);
            panic!(
                "differs at byte {at}:\n  rust: {}\n  ts:   {}",
                &actual[from..(at + 120).min(actual.len())],
                &expected[from..(at + 120).min(expected.len())]
            );
        }
    }

    /// The folded synthetic city draws the same document as the TypeScript renderer in every theme, camera and
    /// region setting (`scripts/parity-fixtures.ts`).
    #[test]
    fn draws_as_the_typescript_renderer_does() {
        let fold: serde_json::Value =
            serde_json::from_str(include_str!("../../../fixtures/fold.json")).expect("fixture");
        let city = parse_city(fold["city"].as_str().expect("a city")).expect("a valid city");
        for line in include_str!("../../../fixtures/svg.tsv").lines() {
            let fields: Vec<&str> = line.split('\t').collect();
            let options = RenderOptions {
                title: "synthetic <&>".into(),
                subtitle: "0000 · 2 towns".into(),
                theme: ThemeName::parse(fields[0]).expect("a theme"),
                camera: Camera::parse(fields[1]).expect("a camera"),
                width: 1600.0,
                regions: fields[2] == "true",
            };
            let svg = render_city(&city, &options);
            if fields[0] == "paper-atlas" && fields[1] == "plan" && fields[2] == "true" {
                assert_same(&svg, include_str!("../../../fixtures/city.svg"));
            }
            assert_eq!(
                (svg.encode_utf16().count().to_string(), digest(&svg)),
                (fields[3].to_owned(), fields[4].to_owned()),
                "{line}"
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use super::*;
    use citymap_ground_plan::fixed::compare_keys;
    use citymap_ground_plan::fold::initial_state;
    use citymap_ground_plan::land_use::default_land_uses;
    use citymap_ground_plan::region::compose::{Options, lay_city};
    use citymap_ground_plan::snapshot::{FileEntry, Snapshot};
    use citymap_ground_plan::town::context::{Jog, Order};

    fn files(folder: &str, n: i64, born: i64) -> Vec<FileEntry> {
        (0..n)
            .map(|i| {
                let path = format!("{folder}/f{i:03}.ts");
                FileEntry::new(&path, &format!("{path}@{}", born + i), born + i)
            })
            .collect()
    }

    fn lay(mut entries: Vec<FileEntry>, repository: &str) -> City {
        entries.sort_by(|a, b| compare_keys(&a.path, &b.path));
        let snapshot = Snapshot {
            repository: repository.into(),
            commit: "worktree".into(),
            index: 0,
            files: Arc::new(entries),
            folder_first_seen: Arc::new(std::collections::HashMap::new()),
            workspaces: None,
        };
        let options = Options {
            density_pct: 50,
            land_uses: default_land_uses(),
            order: Order::CentreOut,
            jog: Jog::TopLevel,
            warp: true,
            loops: true,
            split: vec!["apps".into()],
            toggles: citymap_ground_plan::toggles::DEFAULT_TOGGLES.to_vec(),
        };
        lay_city(&snapshot, &mut initial_state(&options, None, false), &options)
            .expect("a city")
            .0
    }

    fn twin() -> City {
        let mut all = files("lib", 300, 0);
        all.extend(files("kit", 250, 400));
        all.extend(files("misc", 50, 800));
        lay(all, "demo")
    }

    fn render(city: &City, title: &str, subtitle: &str, camera: Camera, regions: bool) -> String {
        let options = RenderOptions {
            title: title.into(),
            subtitle: subtitle.into(),
            theme: ThemeName::PaperAtlas,
            camera,
            width: 1600.0,
            regions,
        };
        render_city(city, &options)
    }

    #[test]
    fn draws_a_whole_city_as_one_svg_document_the_same_every_time() {
        let city = twin();
        let svg = render(&city, "demo", "a twin", Camera::Plan, false);
        assert!(svg.starts_with("<svg ") && svg.ends_with("</svg>"));
        assert!(svg.contains(&Theme::of(ThemeName::PaperAtlas).water));
        assert_eq!(render(&city, "demo", "a twin", Camera::Plan, false), svg);
        assert!(!svg.contains(r#"class="region""#));
        assert!(render(&city, "demo", "a twin", Camera::Plan, true).contains(r#"class="region""#));
    }

    #[test]
    fn lifts_lots_on_plinths_in_the_dimetric_view() {
        let city = twin();
        assert!(render(&city, "t", "s", Camera::Dimetric, false).contains("translate(0 "));
        assert!(!render(&city, "t", "s", Camera::Plan, false).contains("translate(0 "));
    }

    #[test]
    fn escapes_every_text_it_draws() {
        let svg = render(
            &lay(files("<script>&", 30, 0), "a<b>&c"),
            "<t>",
            "&s",
            Camera::Plan,
            false,
        );
        assert!(!svg.contains("<script>"));
        assert!(svg.contains("&lt;t&gt;") && svg.contains("&amp;s") && svg.contains("A&lt;B&gt;&amp;C"));
    }

    #[test]
    fn dashes_old_towns_and_vacant_lots_and_draws_an_empty_city_as_a_sheet_with_its_header() {
        let mut city = twin();
        let mut old = (*city.towns[0]).clone();
        old.key = "old".into();
        old.old = true;
        for (i, lot) in old.lots.iter_mut().enumerate() {
            lot.vacant = i % 2 == 0;
        }
        city.towns.push(Arc::new(old));
        assert!(render(&city, "t", "s", Camera::Plan, false).contains("stroke-dasharray"));
        let empty = City {
            repository: "x".into(),
            commit: "worktree".into(),
            towns: vec![],
            highways: vec![],
        };
        assert!(render(&empty, "empty", "", Camera::Plan, false).contains(">empty</text>"));
    }
}
