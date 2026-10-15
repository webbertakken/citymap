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
pub fn with_approach(town: &mut Town, toward: Pt) {
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
    town.roads.push(Road {
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
