//! District regions for the organic layer: each top-level folder of a town takes the land nearer its lots than any
//! other folder's (a Voronoi diagram of lot centres, merged per folder). Presentation only: it never touches the plat.
use std::collections::HashSet;

use indexmap::IndexMap;

use crate::city::{City, Town};
use crate::constants::U;
use crate::fixed::{Pt, area2, centroid, compare_keys, densify};
use crate::organic::delaunay::delaunay;

/// A folder's region, from the repository's root, and its outline, anticlockwise.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Region {
    pub path: String,
    pub pts: Vec<Pt>,
}

/// The outline is sampled this often; the samples close every region inside the town.
const GHOST_STEP: i64 = U;

/// n / d rounded half up, for a positive d.
fn round_div(n: i128, d: i128) -> i64 {
    i64::try_from((2 * n + d).div_euclid(2 * d)).expect("a centre within the plane")
}

/// The circumcentre of a triangle, rounded to whole fixed units (exact before rounding).
fn circumcentre(a: Pt, b: Pt, c: Pt) -> Pt {
    let w = i128::from;
    let (ax, ay, bx, by, cx, cy) = (w(a.x), w(a.y), w(b.x), w(b.y), w(c.x), w(c.y));
    // Twice the triangle's orientation: positive, as every triangle is anticlockwise.
    let d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
    let (a2, b2, c2) = (ax * ax + ay * ay, bx * bx + by * by, cx * cx + cy * cy);
    Pt::new(
        round_div(a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by), d),
        round_div(a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax), d),
    )
}

/// The regions of one town, its folders `depth` levels deep, sorted by path.
fn town_regions(town: &Town, depth: usize) -> Vec<Region> {
    let mut seen: HashSet<Pt> = HashSet::new();
    let mut points: Vec<Pt> = Vec::new();
    let mut labels: Vec<Option<String>> = Vec::new();
    // Coincident points keep the first.
    let mut add = |p: Pt, label: Option<String>, points: &mut Vec<Pt>, labels: &mut Vec<Option<String>>| {
        if seen.insert(p) {
            points.push(p);
            labels.push(label);
        }
    };
    for lot in &town.lots {
        let segments: Vec<&str> = lot.path.split('/').collect();
        if !lot.vacant && segments.len() > depth {
            add(
                centroid(&lot.pts),
                Some(segments[..depth].join("/")),
                &mut points,
                &mut labels,
            );
        }
    }
    if points.is_empty() {
        return vec![];
    }
    for p in densify(&town.outline, GHOST_STEP, true) {
        add(p, None, &mut points, &mut labels);
    }
    let t = delaunay(&points);
    let centres: Vec<Pt> = t
        .triangles
        .iter()
        .map(|&[a, b, c]| circumcentre(points[a], points[b], points[c]))
        .collect();
    // Each Voronoi edge between a folder's cell and another's, turning anticlockwise round the folder.
    let mut edges: IndexMap<&str, IndexMap<Pt, Vec<Pt>>> = IndexMap::new();
    for (ti, tri) in t.triangles.iter().enumerate() {
        for k in 0..3 {
            let (u, v) = (tri[(k + 1) % 3], tri[(k + 2) % 3]);
            let Some(mine) = labels[u].as_deref() else { continue };
            let beyond = t.neighbours[ti][k];
            if Some(mine) == labels[v].as_deref() || beyond < 0 {
                continue;
            }
            let (from, to) = (centres[usize::try_from(beyond).expect("a triangle")], centres[ti]);
            if from == to {
                continue;
            }
            edges.entry(mine).or_default().entry(from).or_default().push(to);
        }
    }
    // Chain each folder's edges into rings; its region is the largest.
    let mut sorted: Vec<(&str, IndexMap<Pt, Vec<Pt>>)> = edges.into_iter().collect();
    sorted.sort_by(|a, b| compare_keys(a.0, b.0));
    sorted
        .into_iter()
        .map(|(path, mut by_start)| {
            let mut rings: Vec<Vec<Pt>> = Vec::new();
            let starts: Vec<Pt> = by_start.keys().copied().collect();
            for start in starts {
                while !by_start[&start].is_empty() {
                    let mut ring = Vec::new();
                    let mut here = start;
                    while let Some(next) = by_start.get_mut(&here).and_then(Vec::pop) {
                        ring.push(next);
                        here = next;
                        if here == start {
                            break;
                        }
                    }
                    rings.push(ring);
                }
            }
            let pts = rings.into_iter().fold(
                Vec::new(),
                |best, ring| if area2(&ring) > area2(&best) { ring } else { best },
            );
            Region {
                path: path.to_owned(),
                pts,
            }
        })
        .collect()
}

/// The district regions of every town of a city, in town order. Old towns, frozen as they stood, get none.
#[must_use]
pub fn city_regions(city: &City) -> Vec<Vec<Region>> {
    city.towns
        .iter()
        .map(|town| {
            if town.old {
                return vec![];
            }
            let root = if town.key == city.repository {
                ""
            } else {
                &town.key[city.repository.len() + 1..]
            };
            town_regions(
                town,
                if root.is_empty() {
                    1
                } else {
                    root.split('/').count() + 1
                },
            )
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use super::*;
    use crate::archetype::Form;
    use crate::city::{Lot, TownStats};
    use crate::land_use::LandUse;

    fn square(x: i64, y: i64, s: i64) -> Vec<Pt> {
        vec![
            Pt::new(x, y),
            Pt::new(x + s, y),
            Pt::new(x + s, y + s),
            Pt::new(x, y + s),
        ]
    }

    fn lot(path: &str, x: i64, y: i64, vacant: bool) -> Lot {
        Lot {
            pts: square(x, y, 32),
            key: path.into(),
            address: path.into(),
            vacant,
            path: if vacant { String::new() } else { path.into() },
            land_use: LandUse::Source,
            district: 0,
            form: None,
        }
    }

    fn town(key: &str, lots: Vec<Lot>, old: bool) -> Arc<Town> {
        Arc::new(Town {
            key: key.into(),
            name: key.into(),
            form: Form::Polycentric,
            old,
            outline: square(0, 0, 2000),
            water: vec![],
            canals: vec![],
            roads: vec![],
            blocks: vec![],
            lots,
            districts: vec![],
            stats: TownStats::default(),
        })
    }

    fn grid(folder: &str, x0: i64, x1: i64) -> Vec<Lot> {
        (0..30)
            .map(|i| {
                lot(
                    &format!("{folder}/f{i}.ts"),
                    x0 + (i * 97) % (x1 - x0 - 40),
                    100 + (i * 61) % 1700,
                    false,
                )
            })
            .collect()
    }

    fn inside(p: Pt, pts: &[Pt]) -> bool {
        let mut odd = false;
        let mut j = pts.len() - 1;
        for i in 0..pts.len() {
            let (a, b) = (pts[i], pts[j]);
            #[allow(clippy::cast_precision_loss)]
            let cross = ((b.x - a.x) * (p.y - a.y)) as f64 / (b.y - a.y) as f64 + a.x as f64;
            #[allow(clippy::cast_precision_loss)]
            if (a.y > p.y) != (b.y > p.y) && (p.x as f64) < cross {
                odd = !odd;
            }
            j = i;
        }
        odd
    }

    fn centre(l: &Lot) -> Pt {
        Pt::new(l.pts[0].x + 16, l.pts[0].y + 16)
    }

    fn city(towns: Vec<Arc<Town>>) -> City {
        City {
            manifests: None,
            repository: "demo".into(),
            commit: "c".into(),
            highways: vec![],
            towns,
            separable: None,
            declared: None,
        }
    }

    #[test]
    fn gives_each_top_level_folder_the_land_nearer_its_lots_inside_the_town() {
        let mut lots = grid("lib", 100, 900);
        lots.extend(grid("src", 1100, 1900));
        lots.push(lot("src/gone.ts", 1500, 900, true));
        let city = city(vec![town("demo", lots, false)]);
        let regions = &city_regions(&city)[0];
        assert_eq!(
            regions.iter().map(|r| r.path.as_str()).collect::<Vec<_>>(),
            ["lib", "src"]
        );
        for region in regions {
            assert!(area2(&region.pts) > 0);
            assert!(
                region
                    .pts
                    .iter()
                    .all(|p| (0..=2000).contains(&p.x) && (0..=2000).contains(&p.y))
            );
        }
        assert!(
            grid("lib", 100, 900)
                .iter()
                .all(|l| inside(centre(l), &regions[0].pts) && !inside(centre(l), &regions[1].pts))
        );
        assert!(
            grid("src", 1100, 1900)
                .iter()
                .all(|l| inside(centre(l), &regions[1].pts))
        );
        assert_eq!(city_regions(&city), city_regions(&city));
    }

    #[test]
    fn takes_a_split_town_s_folders_below_its_root_and_leaves_old_towns_without() {
        let mut lots = grid("apps/web/app", 100, 900);
        lots.extend(grid("apps/web/lib", 1100, 1900));
        let regions = city_regions(&city(vec![
            town("demo/apps/web", lots, false),
            town("demo old town", grid("x", 100, 900), true),
        ]));
        assert_eq!(
            regions[0].iter().map(|r| r.path.as_str()).collect::<Vec<_>>(),
            ["apps/web/app", "apps/web/lib"]
        );
        assert_eq!(regions[1], vec![]);
    }

    #[test]
    fn gives_one_folder_one_region_two_lots_on_one_spot_one_point_and_no_lots_none() {
        let mut twice = grid("lib", 100, 1900);
        twice.push(Lot {
            key: "twin".into(),
            path: "lib/twin.ts".into(),
            ..grid("lib", 100, 1900)[0].clone()
        });
        let regions = city_regions(&city(vec![
            town("demo", twice, false),
            town("demo/empty", vec![], false),
        ]));
        assert_eq!(regions[0].iter().map(|r| r.path.as_str()).collect::<Vec<_>>(), ["lib"]);
        assert_eq!(regions[1], vec![]);
    }
}
