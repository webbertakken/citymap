//! Water along a cut: a twin's river and an archipelago's canals, each crossed by bridges.
use crate::constants::{PAVEMENT, RoadClass, U};
use crate::fixed::{DIRECTION, Poly, Pt, Rounding, chord, clip, isqrt, mul_div, negate, round_div};
use crate::plat::CutRecord;
use crate::town::context::Ctx;

/// A twin's river, 2.5 u wide, and an archipelago's first canal.
pub const RIVER: i64 = 5 * U / 2;
/// An archipelago's other canals, 1.5 u wide.
pub const CANAL: i64 = 3 * U / 2;

/// Where the band of water goes: a twin's water or an archipelago's canals.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Into {
    Water,
    Canals,
}

/// Water along a remembered cut, a band of the given width, crossed by one bridge, or two at a third and two thirds of
/// a chord longer than 12 u. The cut crosses its land: a decision keeps only cuts that do.
pub fn waterway(ctx: &mut Ctx, poly: &Poly, r: &CutRecord, width: i64, into: Into) {
    let [a, b] = chord(&poly.p, r.n, r.c).expect("a decided cut crosses its land");
    let half = width / 2 * DIRECTION;
    // The band holds the chord, so the water is never empty.
    let band = clip(&clip(poly, r.n, r.c + half, 0), negate(r.n), -(r.c - half), 0).p;
    match into {
        Into::Water => ctx.water.push(band),
        Into::Canals => ctx.canals.push(band),
    }
    let length = isqrt((b.x - a.x).pow(2) + (b.y - a.y).pow(2));
    let reach_out = width / 2 + 2 * PAVEMENT;
    let bridges: &[(i64, i64)] = if length > 12 * U { &[(1, 3), (2, 3)] } else { &[(1, 2)] };
    for &(num, den) in bridges {
        let m = Pt::new(
            a.x + round_div((b.x - a.x) * num, den),
            a.y + round_div((b.y - a.y) * num, den),
        );
        let dx = mul_div(r.n[0], reach_out, DIRECTION, Rounding::Round);
        let dy = mul_div(r.n[1], reach_out, DIRECTION, Rounding::Round);
        ctx.road(
            Some(vec![Pt::new(m.x - dx, m.y - dy), Pt::new(m.x + dx, m.y + dy)]),
            RoadClass::Street,
            None,
        );
    }
}
