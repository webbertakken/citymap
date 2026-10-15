//! Highways: roads across open country that continue a road of the highest class both towns offer at their edges.
use crate::city::{Road, Town};
use crate::constants::RoadClass;
use crate::fixed::{Pt, centroid};

const RANK: [RoadClass; 5] = [
    RoadClass::Lane,
    RoadClass::Street,
    RoadClass::Collector,
    RoadClass::Avenue,
    RoadClass::Boulevard,
];

fn distance2(a: Pt, b: Pt) -> i64 {
    (a.x - b.x).pow(2) + (a.y - b.y).pow(2)
}

/// A road end and the rank of its road's class (−1 for a class beyond the ranks).
#[derive(Clone, Copy, Debug)]
struct End {
    p: Pt,
    rank: i64,
}

fn rank_of(cls: RoadClass) -> i64 {
    RANK.iter()
        .position(|&c| c == cls)
        .map_or(-1, |i| i64::try_from(i).expect("small"))
}

/// A town ready to be joined: one without roads gains an approach street from its edge nearest `toward` to its heart.
pub fn with_approach(town: &mut std::sync::Arc<Town>, toward: Pt) {
    if !town.roads.is_empty() {
        return;
    }
    let c = centroid(&town.outline);
    let door = town.outline.iter().copied().reduce(|a, b| {
        if distance2(b, toward) < distance2(a, toward) {
            b
        } else {
            a
        }
    });
    let door = door.expect("a town has an outline");
    std::sync::Arc::make_mut(town).roads.push(Road {
        cls: RoadClass::Street,
        pts: vec![door, c],
        width: None,
    });
}

/// The road ends at a town's edge (at least 80 % of its reach from its heart), or every end when none reach it.
fn edge_ends(town: &Town) -> Vec<End> {
    let c = centroid(&town.outline);
    let reach2 = town.outline.iter().map(|&p| distance2(p, c)).max().unwrap_or(i64::MIN);
    let all: Vec<End> = town
        .roads
        .iter()
        .flat_map(|r| {
            let rank = rank_of(r.cls);
            [
                End { p: r.pts[0], rank },
                End {
                    p: r.pts[r.pts.len() - 1],
                    rank,
                },
            ]
        })
        .collect();
    let edge: Vec<End> = all
        .iter()
        .copied()
        .filter(|e| distance2(e.p, c) * 100 >= 64 * reach2)
        .collect();
    if edge.is_empty() { all } else { edge }
}

/// A highway between two towns (each with roads): it joins the closest pair of edge road ends of the highest class
/// both offer, and takes that class, so it reads as one road.
#[must_use]
pub fn highway_between(from: &Town, to: &Town) -> Road {
    let a = edge_ends(from);
    let b = edge_ends(to);
    let top = |list: &[End]| list.iter().map(|e| e.rank).max().unwrap_or(i64::MIN);
    let rank = top(&a).min(top(&b)).max(0);
    let pick = |list: &[End]| -> Vec<End> {
        if list.iter().any(|e| e.rank == rank) {
            list.iter().copied().filter(|e| e.rank == rank).collect()
        } else {
            list.to_vec()
        }
    };
    let mut best = [a[0].p, b[0].p];
    let mut best_length = i64::MAX;
    for x in pick(&a) {
        for y in pick(&b) {
            let length = distance2(x.p, y.p);
            if length < best_length {
                best_length = length;
                best = [x.p, y.p];
            }
        }
    }
    Road {
        cls: RANK[usize::try_from(rank).expect("not negative")],
        pts: best.to_vec(),
        width: None,
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use super::*;
    use crate::archetype::Form;
    use crate::city::TownStats;

    fn square(x: i64, size: i64) -> Vec<Pt> {
        vec![
            Pt::new(x, 0),
            Pt::new(x + size, 0),
            Pt::new(x + size, size),
            Pt::new(x, size),
        ]
    }

    fn town(x: i64, roads: Vec<Road>) -> Town {
        Town {
            key: format!("t{x}"),
            name: format!("t{x}"),
            form: Form::Polycentric,
            old: false,
            outline: square(x, 1000),
            water: vec![],
            roads,
            blocks: vec![],
            lots: vec![],
            districts: vec![],
            stats: TownStats::default(),
        }
    }

    fn road(x0: i64, y0: i64, x1: i64, y1: i64, cls: RoadClass) -> Road {
        Road {
            pts: vec![Pt::new(x0, y0), Pt::new(x1, y1)],
            cls,
            width: None,
        }
    }

    #[test]
    fn gives_a_town_without_roads_a_street_from_its_nearest_corner_to_its_heart() {
        let mut bare = Arc::new(town(0, vec![]));
        with_approach(&mut bare, Pt::new(5000, 0));
        assert_eq!(bare.roads, vec![road(1000, 0, 500, 500, RoadClass::Street)]);
        let mut built = Arc::new(town(0, vec![road(0, 500, 1000, 500, RoadClass::Avenue)]));
        let before = built.clone();
        with_approach(&mut built, Pt::new(0, 0));
        assert!(Arc::ptr_eq(&built, &before));
    }

    #[test]
    fn keeps_the_ends_near_the_edge_or_every_end_when_none_reach_it() {
        let ends = edge_ends(&town(0, vec![road(0, 0, 500, 500, RoadClass::Street)]));
        assert_eq!(ends.iter().map(|e| e.p).collect::<Vec<_>>(), [Pt::new(0, 0)]);
        assert_eq!(
            edge_ends(&town(0, vec![road(450, 500, 550, 500, RoadClass::Street)])).len(),
            2
        );
    }

    #[test]
    fn joins_the_closest_edge_ends_of_the_highest_class_both_towns_offer() {
        let a = town(
            0,
            vec![
                road(0, 0, 1000, 1000, RoadClass::Avenue),
                road(0, 1000, 1000, 0, RoadClass::Street),
            ],
        );
        let b = town(
            3000,
            vec![
                road(3000, 0, 4000, 1000, RoadClass::Avenue),
                road(3000, 1000, 4000, 0, RoadClass::Boulevard),
            ],
        );
        assert_eq!(highway_between(&a, &b), road(1000, 1000, 3000, 0, RoadClass::Avenue));
        let a = town(0, vec![road(0, 500, 1000, 500, RoadClass::Collector)]);
        let b = town(
            3000,
            vec![
                road(3000, 500, 4000, 500, RoadClass::Lane),
                road(3500, 0, 3500, 1000, RoadClass::Avenue),
            ],
        );
        assert_eq!(highway_between(&a, &b).cls, RoadClass::Collector);
    }
}
