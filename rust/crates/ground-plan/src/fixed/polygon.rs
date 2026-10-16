//! Convex polygons in fixed units: areas, centroids, clipping, insets, chords and the offsets that split their land.
use serde::{Deserialize, Serialize};

use super::arithmetic::{Rounding, floor_div, mul_div};
use super::direction::{DIRECTION, Dir, dir, normalise};

/// An integer point in fixed units.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Pt {
    pub x: i64,
    pub y: i64,
}

impl Pt {
    #[must_use]
    pub const fn new(x: i64, y: i64) -> Self {
        Self { x, y }
    }
}

/// A convex polygon, anticlockwise; `w[i]` is the road width on the edge from `p[i]` to `p[i + 1]`.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Poly {
    pub p: Vec<Pt>,
    pub w: Vec<i64>,
}

impl Poly {
    /// A polygon whose every edge has the same width.
    #[must_use]
    pub fn uniform(pts: &[Pt], width: i64) -> Self {
        Self {
            p: pts.to_vec(),
            w: vec![width; pts.len()],
        }
    }

    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.p.is_empty()
    }
}

fn next<T: Copy>(list: &[T], i: usize) -> T {
    list[(i + 1) % list.len()]
}

/// Twice the signed area (the shoelace sum), measured from the first vertex so terms stay small.
#[must_use]
pub fn area2(pts: &[Pt]) -> i64 {
    let Some(o) = pts.first() else { return 0 };
    let mut sum = 0;
    for i in 1..pts.len().saturating_sub(1) {
        let a = pts[i];
        let b = pts[i + 1];
        sum += (a.x - o.x) * (b.y - o.y) - (b.x - o.x) * (a.y - o.y);
    }
    sum
}

/// The centre of mass, rounded half up; the first point for a degenerate polygon.
#[must_use]
pub fn centroid(pts: &[Pt]) -> Pt {
    let Some(&o) = pts.first() else { return Pt::default() };
    let (mut a, mut cx, mut cy) = (0i128, 0i128, 0i128);
    for i in 1..pts.len().saturating_sub(1) {
        let p = pts[i];
        let q = pts[i + 1];
        let (px, py) = (i128::from(p.x - o.x), i128::from(p.y - o.y));
        let (qx, qy) = (i128::from(q.x - o.x), i128::from(q.y - o.y));
        let c = px * qy - qx * py;
        a += c;
        cx += (px + qx) * c;
        cy += (py + qy) * c;
    }
    if a == 0 {
        return o;
    }
    let div = |n: i128| {
        let d = 3 * a;
        let (num, den) = if d < 0 { (-n, -d) } else { (n, d) };
        i64::try_from((2 * num + den).div_euclid(2 * den)).expect("a centroid lies within its polygon")
    };
    Pt::new(o.x + div(cx), o.y + div(cy))
}

/// n·q − c: negative or zero on the kept side of a line.
#[must_use]
#[inline]
pub fn side(n: Dir, c: i64, q: Pt) -> i64 {
    n[0] * q.x + n[1] * q.y - c
}

/// The point where segment a→b crosses the line, given the sides sa and sb of its ends (of opposite sign).
fn crossing(a: Pt, b: Pt, sa: i64, sb: i64) -> Pt {
    let (num, den) = if sa - sb < 0 { (-sa, sb - sa) } else { (sa, sa - sb) };
    Pt::new(
        a.x + mul_div(b.x - a.x, num, den, Rounding::Round),
        a.y + mul_div(b.y - a.y, num, den, Rounding::Round),
    )
}

fn tidy(pts: Vec<Pt>, widths: Vec<i64>) -> Poly {
    let mut p: Vec<Pt> = Vec::with_capacity(pts.len());
    let mut w: Vec<i64> = Vec::with_capacity(pts.len());
    for (q, width) in pts.into_iter().zip(widths) {
        if p.last() == Some(&q) {
            *w.last_mut().expect("a width per point") = width;
            continue;
        }
        p.push(q);
        w.push(width);
    }
    if p.len() > 1 && p.first() == p.last() {
        p.pop();
        w.pop();
    }
    if p.len() >= 3 { Poly { p, w } } else { Poly::default() }
}

/// Keeps the part where n·q ≤ c; the new edge along the cut gets `cut_width`.
#[must_use]
pub fn clip(poly: &Poly, n: Dir, c: i64, cut_width: i64) -> Poly {
    let len = poly.p.len();
    let mut out = Vec::with_capacity(len + 2);
    let mut widths = Vec::with_capacity(len + 2);
    for i in 0..len {
        let cur = poly.p[i];
        let nxt = next(&poly.p, i);
        let sc = side(n, c, cur);
        let sn = side(n, c, nxt);
        if sc <= 0 {
            out.push(cur);
            widths.push(poly.w[i]);
            if sn > 0 {
                out.push(crossing(cur, nxt, sc, sn));
                widths.push(cut_width);
            }
        } else if sn <= 0 {
            out.push(crossing(cur, nxt, sc, sn));
            widths.push(poly.w[i]);
        }
    }
    tidy(out, widths)
}

/// Moves every edge inward by half its road width plus the pavement; empty when it collapses.
#[must_use]
pub fn inset(poly: &Poly, pavement: i64) -> Poly {
    let mut result = Poly {
        p: poly.p.clone(),
        w: vec![0; poly.p.len()],
    };
    for i in 0..poly.p.len() {
        let a = poly.p[i];
        let b = next(&poly.p, i);
        if a == b {
            continue;
        }
        let n = normalise(b.y - a.y, a.x - b.x);
        let d = floor_div(poly.w[i], 2) + pavement;
        result = clip(&result, n, n[0] * a.x + n[1] * a.y - d * DIRECTION, 0);
        if result.p.len() < 3 {
            return Poly::default();
        }
    }
    let w = vec![0; result.p.len()];
    Poly { p: result.p, w }
}

/// The two crossings of the line n·q = c through the polygon, in edge order, or none.
#[must_use]
pub fn chord(pts: &[Pt], n: Dir, c: i64) -> Option<[Pt; 2]> {
    let mut first = None;
    for (i, &a) in pts.iter().enumerate() {
        let b = next(pts, i);
        let sa = side(n, c, a);
        let sb = side(n, c, b);
        if (sa <= 0 && sb > 0) || (sa > 0 && sb <= 0) {
            let hit = crossing(a, b, sa, sb);
            match first {
                None => first = Some(hit),
                Some(f) => return Some([f, hit]),
            }
        }
    }
    None
}

/// The least and greatest n·q over the points.
#[must_use]
pub fn extent(pts: &[Pt], n: Dir) -> (i64, i64) {
    let mut lo = i64::MAX;
    let mut hi = i64::MIN;
    for q in pts {
        let t = n[0] * q.x + n[1] * q.y;
        lo = lo.min(t);
        hi = hi.max(t);
    }
    (lo, hi)
}

/// The direction of the longest edge (squared length; ties to the first).
#[must_use]
pub fn longest_edge(pts: &[Pt]) -> Dir {
    let mut best = -1;
    let mut vector = [1, 0];
    for (i, &a) in pts.iter().enumerate() {
        let b = next(pts, i);
        let (dx, dy) = (b.x - a.x, b.y - a.y);
        let length = dx * dx + dy * dy;
        if length > best {
            best = length;
            vector = [dx, dy];
        }
    }
    normalise(vector[0], vector[1])
}

/// The least integer offset c such that the land with n·q ≤ c holds at least num/den of the polygon's area.
#[must_use]
pub fn offset_for(poly: &Poly, n: Dir, num: i64, den: i64) -> i64 {
    let total = i128::from(area2(&poly.p)) * i128::from(num);
    let (mut lo, mut hi) = extent(&poly.p, n);
    while lo < hi {
        let mid = lo + floor_div(hi - lo, 2);
        if i128::from(area2(&clip(poly, n, mid, 0).p)) * i128::from(den) >= total {
            hi = mid;
        } else {
            lo = mid + 1;
        }
    }
    lo
}

/// The distance from centre along angle step a to the polygon's boundary, in fixed units (floor).
#[must_use]
pub fn reach(pts: &[Pt], centre: Pt, a: i64) -> i64 {
    let [dx, dy] = dir(a);
    let mut best = 0;
    for (i, &p) in pts.iter().enumerate() {
        let q = next(pts, i);
        let (ex, ey) = (q.x - p.x, q.y - p.y);
        let mut den = dx * ey - dy * ex;
        let mut t_num = (p.x - centre.x) * ey - (p.y - centre.y) * ex;
        let mut u_num = (p.x - centre.x) * dy - (p.y - centre.y) * dx;
        if den == 0 {
            continue;
        }
        if den < 0 {
            den = -den;
            t_num = -t_num;
            u_num = -u_num;
        }
        if t_num <= 0 || u_num < 0 || u_num > den {
            continue;
        }
        best = best.max(mul_div(t_num, DIRECTION, den, Rounding::Floor));
    }
    best
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;

    fn rect(w: i64, h: i64) -> Poly {
        Poly::uniform(&[Pt::new(0, 0), Pt::new(w, 0), Pt::new(w, h), Pt::new(0, h)], 0)
    }

    #[test]
    fn measures_doubled_areas_and_centroids() {
        let square = rect(10, 10);
        assert_eq!(area2(&square.p), 200);
        assert_eq!(centroid(&square.p), Pt::new(5, 5));
        assert_eq!(area2(&[]), 0);
        assert_eq!(centroid(&[Pt::new(1, 2), Pt::new(1, 2), Pt::new(1, 2)]), Pt::new(1, 2));
    }

    #[test]
    fn clips_keeping_the_inner_side_and_marks_the_cut_edge() {
        let half = clip(&rect(10, 10), [DIRECTION, 0], 5 * DIRECTION, 7);
        assert_eq!(
            half.p,
            vec![Pt::new(0, 0), Pt::new(5, 0), Pt::new(5, 10), Pt::new(0, 10)]
        );
        assert_eq!(half.w, vec![0, 7, 0, 0]);
        assert!(clip(&rect(10, 10), [DIRECTION, 0], -DIRECTION, 0).is_empty());
    }

    #[test]
    fn insets_by_half_the_road_and_the_pavement() {
        let poly = Poly::uniform(&rect(100, 100).p, 20);
        let inner = inset(&poly, 5);
        assert_eq!(
            inner.p,
            vec![Pt::new(15, 15), Pt::new(85, 15), Pt::new(85, 85), Pt::new(15, 85)]
        );
        assert!(inset(&rect(10, 10), 6).is_empty());
    }

    #[test]
    fn finds_chords_extents_and_reaches() {
        let square = rect(10, 10);
        assert_eq!(
            chord(&square.p, [DIRECTION, 0], 5 * DIRECTION),
            Some([Pt::new(5, 0), Pt::new(5, 10)])
        );
        assert_eq!(chord(&square.p, [DIRECTION, 0], 20 * DIRECTION), None);
        assert_eq!(extent(&square.p, [DIRECTION, 0]), (0, 10 * DIRECTION));
        assert_eq!(reach(&square.p, Pt::new(5, 5), 0), 5);
        assert_eq!(longest_edge(&rect(20, 10).p), [DIRECTION, 0]);
    }

    #[test]
    fn offset_for_finds_the_least_offset_reaching_the_share() {
        let square = rect(100, 100);
        let c = offset_for(&square, [DIRECTION, 0], 1, 4);
        assert_eq!(c, 100_352);
        assert!(area2(&clip(&square, [DIRECTION, 0], c - 1, 0).p) * 4 < area2(&square.p));
    }

    proptest! {
        #[test]
        fn clipping_a_square_conserves_area_within_rounding(a in 0i64..4096, c in -400i64..400) {
            let square = rect(400, 400);
            let n = dir(a);
            let off = n[0] * 200 + n[1] * 200 + c * DIRECTION / 4;
            let left = area2(&clip(&square, n, off, 0).p);
            let right = area2(&clip(&square, [-n[0], -n[1]], -off, 0).p);
            prop_assert!((left + right - area2(&square.p)).abs() <= 8 * 400);
        }

        #[test]
        fn inset_never_grows(w in 0i64..200, h in 0i64..200, pavement in 0i64..20) {
            let poly = rect(w + 3, h + 3);
            prop_assert!(area2(&inset(&poly, pavement).p) <= area2(&poly.p));
        }
    }
}
