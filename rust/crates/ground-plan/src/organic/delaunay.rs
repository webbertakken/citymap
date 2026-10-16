//! An exact Delaunay triangulation of integer points (Bowyer-Watson), for the organic layer's district regions.
use std::collections::{HashMap, HashSet};

use ethnum::I256;

use crate::fixed::{Pt, floor_div};

/// Anticlockwise triangles as indices into the points, and for each the triangle across the edge opposite each of its
/// vertices, or −1 on the hull.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Triangulation {
    pub triangles: Vec<[usize; 3]>,
    pub neighbours: Vec<[i64; 3]>,
}

struct Tri {
    v: [usize; 3],
    n: [i64; 3],
    alive: bool,
}

/// Twice the signed area of a, b, c: positive when anticlockwise (exact).
fn orient(a: Pt, b: Pt, c: Pt) -> i128 {
    let w = i128::from;
    (w(b.x) - w(a.x)) * (w(c.y) - w(a.y)) - (w(b.y) - w(a.y)) * (w(c.x) - w(a.x))
}

/// Positive when d lies inside the circle through the anticlockwise triangle a, b, c (exact, in 256 bits).
fn in_circle(a: Pt, b: Pt, c: Pt, d: Pt) -> I256 {
    let w = |v: i64| I256::from(v);
    let (ax, ay) = (w(a.x) - w(d.x), w(a.y) - w(d.y));
    let (bx, by) = (w(b.x) - w(d.x), w(b.y) - w(d.y));
    let (cx, cy) = (w(c.x) - w(d.x), w(c.y) - w(d.y));
    (ax * ax + ay * ay) * (bx * cy - cx * by) - (bx * bx + by * by) * (ax * cy - cx * ay)
        + (cx * cx + cy * cy) * (ax * by - bx * ay)
}

fn index(i: usize) -> i64 {
    i64::try_from(i).expect("small")
}

fn at(i: i64) -> usize {
    usize::try_from(i).expect("an existing triangle")
}

/// The Delaunay triangulation of distinct integer points. Points are inserted in sorted order, each located by walking
/// from the last triangle made; a point cocircular with a triangle does not break it, so the result is deterministic.
#[must_use]
pub fn delaunay(points: &[Pt]) -> Triangulation {
    let n = points.len();
    if n < 3 {
        return Triangulation::default();
    }
    let x0 = points.iter().map(|p| p.x).min().expect("points");
    let x1 = points.iter().map(|p| p.x).max().expect("points");
    let y0 = points.iter().map(|p| p.y).min().expect("points");
    let y1 = points.iter().map(|p| p.y).max().expect("points");
    let span = (x1 - x0).max(y1 - y0).max(1) * 1000;
    let (mx, my) = (floor_div(x0 + x1 + 1, 2), floor_div(y0 + y1 + 1, 2));
    // Three far points round everything; the triangles touching them are dropped at the end.
    let mut pts = points.to_vec();
    pts.extend([
        Pt::new(mx - 3 * span, my - 3 * span),
        Pt::new(mx + 3 * span, my - 3 * span),
        Pt::new(mx, my + 3 * span),
    ]);
    let mut tris = vec![Tri {
        v: [n, n + 1, n + 2],
        n: [-1, -1, -1],
        alive: true,
    }];
    let mut last = 0usize;
    let mut order: Vec<usize> = (0..n).collect();
    order.sort_by(|&a, &b| points[a].x.cmp(&points[b].x).then(points[a].y.cmp(&points[b].y)));
    for i in order {
        let p = pts[i];
        // Locate: walk from the last triangle made toward p.
        let mut t = last;
        loop {
            let tri = &tris[t];
            let step = (0..3).find(|&k| orient(pts[tri.v[(k + 1) % 3]], pts[tri.v[(k + 2) % 3]], p) < 0);
            match step {
                None => break,
                Some(k) => t = at(tri.n[k]),
            }
        }
        // The cavity: every triangle whose circumcircle holds p, reached from the one containing it.
        let mut bad: Vec<usize> = vec![t];
        let mut in_bad: HashSet<usize> = HashSet::from([t]);
        let mut queue = vec![t];
        while let Some(t) = queue.pop() {
            for m in tris[t].n {
                if m < 0 {
                    continue;
                }
                let m = at(m);
                if in_bad.contains(&m) {
                    continue;
                }
                let v = tris[m].v;
                if in_circle(pts[v[0]], pts[v[1]], pts[v[2]], p) > I256::ZERO {
                    in_bad.insert(m);
                    bad.push(m);
                    queue.push(m);
                }
            }
        }
        // Its boundary edges, each with the triangle beyond it, become new triangles fanned from p.
        let mut made: Vec<usize> = Vec::new();
        let mut by_start: HashMap<usize, usize> = HashMap::new();
        for &t in &bad {
            tris[t].alive = false;
            for k in 0..3 {
                let beyond = tris[t].n[k];
                if beyond >= 0 && in_bad.contains(&at(beyond)) {
                    continue;
                }
                let (u, v) = (tris[t].v[(k + 1) % 3], tris[t].v[(k + 2) % 3]);
                let id = tris.len();
                tris.push(Tri {
                    v: [i, u, v],
                    n: [beyond, -1, -1],
                    alive: true,
                });
                if beyond >= 0 {
                    let other = &mut tris[at(beyond)];
                    let slot = other
                        .n
                        .iter()
                        .position(|&x| x == index(t))
                        .expect("a neighbour points back");
                    other.n[slot] = index(id);
                }
                by_start.insert(u, id);
                made.push(id);
            }
        }
        // Neighbours among the fan: the triangle on p-v is the one whose edge starts at v.
        for &id in &made {
            let next = by_start[&tris[id].v[2]];
            tris[id].n[1] = index(next);
            tris[next].n[2] = index(id);
        }
        last = made[0];
    }
    let kept: Vec<usize> = (0..tris.len())
        .filter(|&i| tris[i].alive && tris[i].v.iter().all(|&v| v < n))
        .collect();
    let position: HashMap<usize, i64> = kept.iter().enumerate().map(|(k, &t)| (t, index(k))).collect();
    Triangulation {
        triangles: kept.iter().map(|&t| tris[t].v).collect(),
        neighbours: kept
            .iter()
            .map(|&t| {
                tris[t].n.map(|m| {
                    if m < 0 {
                        -1
                    } else {
                        position.get(&at(m)).copied().unwrap_or(-1)
                    }
                })
            })
            .collect(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn triangulates_a_square_into_two_anticlockwise_triangles() {
        let square = [Pt::new(0, 0), Pt::new(10, 0), Pt::new(10, 10), Pt::new(0, 10)];
        let t = delaunay(&square);
        assert_eq!(t.triangles.len(), 2);
        for tri in &t.triangles {
            assert!(orient(square[tri[0]], square[tri[1]], square[tri[2]]) > 0);
        }
        assert_eq!(delaunay(&square[..2]), Triangulation::default());
    }
}

#[cfg(test)]
mod properties {
    use super::*;

    fn points() -> Vec<Pt> {
        // A deterministic scatter with some repeated rows and columns.
        (0..60i64)
            .map(|i| Pt::new((i * 7919) % 1000 - 500, (i * 104_729) % 700 - 350))
            .collect()
    }

    #[test]
    fn leaves_no_point_inside_any_triangle_s_circumcircle_every_triangle_anticlockwise() {
        let pts = points();
        let t = delaunay(&pts);
        assert_ne!(t.triangles.len(), 0);
        for tri in &t.triangles {
            let (a, b, c) = (pts[tri[0]], pts[tri[1]], pts[tri[2]]);
            assert!(orient(a, b, c) > 0);
            for (i, &p) in pts.iter().enumerate() {
                if !tri.contains(&i) {
                    assert!(in_circle(a, b, c, p) <= I256::ZERO);
                }
            }
        }
    }

    #[test]
    fn names_each_triangle_s_neighbour_across_each_edge_and_is_the_same_every_time() {
        let pts = points();
        let t = delaunay(&pts);
        assert_eq!(t, delaunay(&pts));
        for (i, (tri, n)) in t.triangles.iter().zip(&t.neighbours).enumerate() {
            for k in 0..3 {
                if n[k] < 0 {
                    continue;
                }
                let other = &t.triangles[at(n[k])];
                let (u, v) = (tri[(k + 1) % 3], tri[(k + 2) % 3]);
                assert!(other.contains(&u) && other.contains(&v));
                assert!(t.neighbours[at(n[k])].contains(&index(i)));
            }
        }
    }

    #[test]
    fn returns_nothing_for_points_on_one_line() {
        let line: Vec<Pt> = (0..5).map(|i| Pt::new(i * 10, i * 10)).collect();
        assert_eq!(delaunay(&line).triangles.len(), 0);
    }
}
