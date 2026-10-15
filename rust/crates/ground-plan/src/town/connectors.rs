//! Loop connectors: lanes joining street ends that stop near each other, so the grid has no needless dead ends.
use crate::city::Road;
use crate::constants::{PAVEMENT, RoadClass, U};
use crate::fixed::Pt;
use crate::town::grid::{Grid, box_of};

/// Two dead ends at most this far apart are joined: three street widths.
pub const LOOP_REACH: i64 = 3 * U;
/// An end within this much of another road's edge meets that road; it is no dead end.
const TOUCH: i64 = 2 * PAVEMENT;
/// An end this close to the town's outline is an exit, not a dead end.
const EDGE: i64 = 2 * U;

fn sub(a: Pt, b: Pt) -> Pt {
    Pt::new(a.x - b.x, a.y - b.y)
}

fn cross(a: Pt, b: Pt) -> i64 {
    a.x * b.y - a.y * b.x
}

fn dot(a: Pt, b: Pt) -> i64 {
    a.x * b.x + a.y * b.y
}

/// True when p lies within `reach` of the segment a-b, exactly.
fn within(p: Pt, a: Pt, b: Pt, reach: i64) -> bool {
    let ab = sub(b, a);
    let ap = sub(p, a);
    let r2 = i128::from(reach) * i128::from(reach);
    let along = dot(ap, ab);
    let length2 = dot(ab, ab);
    if along <= 0 || length2 == 0 {
        return i128::from(dot(ap, ap)) <= r2;
    }
    if along >= length2 {
        return i128::from(dot(sub(p, b), sub(p, b))) <= r2;
    }
    let c = i128::from(cross(ab, ap));
    c * c <= r2 * i128::from(length2)
}

fn near_path(p: Pt, pts: &[Pt], reach: i64, closed: bool) -> bool {
    let n = pts.len();
    (0..n).any(|i| (i > 0 || closed) && within(p, pts[(i + n - 1) % n], pts[i], reach))
}

/// Which side of p-q the point r lies on: -1, 0 or 1.
fn orient(p: Pt, q: Pt, r: Pt) -> i64 {
    cross(sub(q, p), sub(r, p)).signum()
}

/// True when r, on the line through p and q, lies between them.
fn on(p: Pt, q: Pt, r: Pt) -> bool {
    dot(sub(r, p), sub(q, p)) >= 0 && dot(sub(r, q), sub(p, q)) >= 0
}

/// True when segments a-b and c-d share any point.
fn meet(a: Pt, b: Pt, c: Pt, d: Pt) -> bool {
    let (o1, o2, o3, o4) = (orient(a, b, c), orient(a, b, d), orient(c, d, a), orient(c, d, b));
    if o1 != o2 && o3 != o4 {
        return true;
    }
    (o1 == 0 && on(a, b, c)) || (o2 == 0 && on(a, b, d)) || (o3 == 0 && on(c, d, a)) || (o4 == 0 && on(c, d, b))
}

/// True when p lies inside the polygon (even-odd), in integers.
fn inside(p: Pt, pts: &[Pt]) -> bool {
    let mut odd = false;
    let n = pts.len();
    let mut j = n.wrapping_sub(1);
    for i in 0..n {
        let a = pts[i];
        let b = pts[j];
        j = i;
        if (a.y > p.y) == (b.y > p.y) {
            continue;
        }
        // p lies left of the edge where it crosses p's row: p.x < a.x + (b.x − a.x)(p.y − a.y) / (b.y − a.y).
        let rise = b.y - a.y;
        let left = (p.x - a.x) * rise;
        let right = (b.x - a.x) * (p.y - a.y);
        if if rise > 0 { left < right } else { left > right } {
            odd = !odd;
        }
    }
    odd
}

/// True when the segment a-b touches the shape: crosses an edge, or lies within it.
fn crosses(a: Pt, b: Pt, shape: &[Pt]) -> bool {
    let n = shape.len();
    (0..n).any(|i| meet(a, b, shape[(i + n - 1) % n], shape[i])) || inside(a, shape)
}

struct End {
    p: Pt,
    r: usize,
}

/// The lanes that join the town's dead ends: ends of streets and lanes that meet no other road and lie inside the
/// town, each joined to the nearest such end of another road within `LOOP_REACH`, closest pairs first, never across a
/// shape that must stay whole (lots, parks, greens, plazas).
#[must_use]
pub fn loop_connectors(roads: &[Road], shapes: &[&[Pt]], outline: &[Pt]) -> Vec<Road> {
    // Each road under the box its touching distance reaches; each end then checks only the roads near it.
    let mut reach = Grid::new(4 * U);
    for road in roads {
        reach.add(box_of(&road.pts, road.drawn_width() / 2 + TOUCH));
    }
    let mut ends: Vec<End> = Vec::new();
    for (r, road) in roads.iter().enumerate() {
        if road.cls != RoadClass::Street && road.cls != RoadClass::Lane {
            continue;
        }
        for p in [road.pts[0], road.pts[road.pts.len() - 1]] {
            let meets = reach
                .near(box_of(&[p], 0))
                .into_iter()
                .any(|o| o != r && near_path(p, &roads[o].pts, roads[o].drawn_width() / 2 + TOUCH, false));
            if !meets && !near_path(p, outline, EDGE, true) {
                ends.push(End { p, r });
            }
        }
    }
    let mut end_grid = Grid::new(LOOP_REACH);
    for e in &ends {
        end_grid.add(box_of(&[e.p], 0));
    }
    let mut pairs: Vec<(usize, usize, i64)> = Vec::new();
    for (i, e) in ends.iter().enumerate() {
        for j in end_grid.near(box_of(&[e.p], LOOP_REACH)) {
            if j <= i {
                continue;
            }
            let f = &ends[j];
            let d2 = dot(sub(e.p, f.p), sub(e.p, f.p));
            if e.r != f.r && d2 > 0 && d2 <= LOOP_REACH * LOOP_REACH {
                pairs.push((i, j, d2));
            }
        }
    }
    let mut shape_grid = Grid::new(4 * U);
    for shape in shapes {
        shape_grid.add(box_of(shape, 0));
    }
    let mut used = vec![false; ends.len()];
    let mut lanes = Vec::new();
    // Closest first; the sort is stable, so pairs equally far apart keep the order of their ends.
    pairs.sort_by_key(|&(_, _, d2)| d2);
    for (i, j, _) in pairs {
        if used[i] || used[j] {
            continue;
        }
        let (a, b) = (ends[i].p, ends[j].p);
        if shape_grid
            .near(box_of(&[a, b], 0))
            .into_iter()
            .any(|k| crosses(a, b, shapes[k]))
        {
            continue;
        }
        used[i] = true;
        used[j] = true;
        lanes.push(Road {
            cls: RoadClass::Lane,
            pts: vec![a, b],
            width: None,
        });
    }
    lanes
}

#[cfg(test)]
mod tests {
    use super::*;

    fn street(a: (i64, i64), b: (i64, i64)) -> Road {
        Road {
            cls: RoadClass::Street,
            pts: vec![Pt::new(a.0, a.1), Pt::new(b.0, b.1)],
            width: None,
        }
    }

    #[test]
    fn joins_nearby_dead_ends_of_different_roads() {
        let outline = [
            Pt::new(-2000, -2000),
            Pt::new(2000, -2000),
            Pt::new(2000, 2000),
            Pt::new(-2000, 2000),
        ];
        let roads = [street((-1000, 0), (0, 0)), street((100, 0), (1000, 0))];
        let lanes = loop_connectors(&roads, &[], &outline);
        assert_eq!(
            lanes,
            vec![Road {
                cls: RoadClass::Lane,
                pts: vec![Pt::new(0, 0), Pt::new(100, 0)],
                width: None
            }]
        );
    }

    #[test]
    fn never_crosses_a_shape() {
        let outline = [
            Pt::new(-2000, -2000),
            Pt::new(2000, -2000),
            Pt::new(2000, 2000),
            Pt::new(-2000, 2000),
        ];
        let roads = [street((-1000, 0), (0, 0)), street((100, 0), (1000, 0))];
        let lot = [Pt::new(40, -10), Pt::new(60, -10), Pt::new(60, 10), Pt::new(40, 10)];
        assert_eq!(loop_connectors(&roads, &[&lot], &outline), Vec::<Road>::new());
    }

    #[test]
    fn tests_points_inside_polygons_in_integers() {
        let square = [Pt::new(0, 0), Pt::new(10, 0), Pt::new(10, 10), Pt::new(0, 10)];
        assert!(inside(Pt::new(5, 5), &square));
        assert!(!inside(Pt::new(15, 5), &square));
        assert!(within(Pt::new(5, 3), Pt::new(0, 0), Pt::new(10, 0), 3));
        assert!(!within(Pt::new(5, 4), Pt::new(0, 0), Pt::new(10, 0), 3));
    }
}
