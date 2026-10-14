# Fixed-point core

Derived from [ground plan](../ground-plan.md) § Invariants (determinism, integer core). Every number the plat holds, and
every coordinate the city model emits, is an integer computed by the rules below. Module:
`packages/ground-plan/src/fixed/`.

## Numbers

- All values are JavaScript `number`s holding integers in the safe range (|v| < 2^53), checked by `Number.isSafeInteger`
  in debug assertions. A product that may exceed 2^53 goes through `mulDiv`, which uses `bigint` exactly when
  `|a × b| ≥ 2^53` and `number` otherwise; both paths give the same integer.
- Division never uses `/` on its own. Two rounding functions exist, and every call site names one:
  - `floorDiv(a, b)`: ⌊a / b⌋ for b > 0 (toward −∞).
  - `roundDiv(a, b)`: ⌊(2a + b) / (2b)⌋ for b > 0 (half toward +∞).
  - `mulDiv(a, b, c, rounding)`: a × b / c with the named rounding, exact for any safe a, b, c.
- `isqrt(n)`: ⌊√n⌋ for 0 ≤ n < 2^53, by Newton iteration on integers from `2^⌈bits/2⌉`; `isqrt` of a negative is a
  `RangeError` named `fixed/negative-sqrt`.
- Ratios (shares, densities, weights) are integers in **per mille** (‰, 0 to 1000) or **per cent**, named by suffix:
  `densityPct`, `weightPermille`, `shareMille`.

## Units

| Constant      | Value | Meaning                                                                 |
| ------------- | ----- | ----------------------------------------------------------------------- |
| `UNIT`        | 64    | Fixed units per u (one local street width). 1 fixed unit = 1/64 u.      |
| `DIRECTION`   | 4096  | Length of a direction vector (a "unit" vector scaled to 2^12).          |
| `TURN`        | 4096  | Angle steps per full turn; an angle is an integer index into the table. |
| `COORD_LIMIT` | 2^21  | Largest absolute coordinate; `checkExtent` rejects a city reaching it.  |

- Coordinates are integers in fixed units, x east, y north. With |x|, |y| < 2^21 and direction components ≤ 2^12, every
  dot product n·p < 2^34, every doubled polygon area of up to 2^10 vertices < 2^53.
- Areas are held **doubled** (`area2`, the shoelace sum), so they stay integer; land demands are in fixed units² and
  compared with `area2` by doubling.

## Directions and angles

- An angle is an integer `a` (taken modulo `TURN`); `dir(a)` is `[cos, sin] × DIRECTION` from `COSINE`, a quarter-wave
  table of 1,025 integers (`round(cos(2π i / TURN) × DIRECTION)`, i = 0 to 1,024) in `src/fixed/directions.ts`. With
  quadrant `q = ⌊a / 1024⌋` and `r = a mod 1024`, `c = COSINE[r]`, `s = COSINE[1024 − r]`, and the pair is `(c, s)`,
  `(−s, c)`, `(−c, −s)` or `(s, −c)` for q = 0 to 3. The table is data: generated once by
  `scripts/generate-directions.ts` (which may use floating point), committed, and covered by a checksum test; no
  implementation recomputes it.
- `normalise(vx, vy)`: the direction of an integer vector,
  `[roundDiv(vx × DIRECTION, len), roundDiv(vy × DIRECTION, len)]` with `len = isqrt(vx² + vy²)` (via `mulDiv` when
  large). A zero vector is `fixed/zero-direction`.
- `perp([x, y]) = [−y, x]`; `negate` flips both.
- `rotate(v, a)`: `[roundDiv(vx·c − vy·s, DIRECTION), roundDiv(vx·s + vy·c, DIRECTION)]` with `(c, s) = dir(a)`.

## Hashes and seeds

- `fnv1a(key)`: 32-bit FNV-1a over the key's **UTF-8 bytes** (offset 0x811c9dc5, prime 0x01000193), unsigned.
- `seedOf(key)`: `fnv1a` of the key with every `>` removed (so pinwheel sub-keys keep their parent's tint).
- `unitMille(key) = floorDiv(fnv1a(key) × 1000, 2^32)`, an integer in [0, 1000).
- Byte-wise order: strings compare by Unicode code point (equal to UTF-8 byte order); `compareKeys` is the only string
  comparison the engine uses. Locale-aware comparison is banned (lint rule).

## Polygons

A `Poly` is a convex polygon, counter-clockwise, as integer points `p[]` with `w[i]`, the road width (fixed units) of
the edge from `p[i]` to `p[i+1]`. Functions, all pure:

- `area2(p)`: the shoelace sum. Positive for counter-clockwise.
- `centroid(p)`: `(Σ (xi + xi+1) ci, Σ (yi + yi+1) ci) / (3 × area2)` with `roundDiv`; a degenerate polygon (area2 = 0)
  returns `p[0]`.
- `side(n, c, q) = n·q − c`, in units of fixed × DIRECTION.
- `clip(poly, n, c, cutWidth)`: keeps `n·q ≤ c`. An edge crossing the line yields the intersection
  `cur + (next − cur) × sc / (sc − sn)`, each coordinate by `mulDiv(Δ, sc, sc − sn, round)`. The new edge along the cut
  takes `cutWidth`. Consecutive equal points are dropped; fewer than 3 points is the empty polygon.
- `inset(poly, pavement)`: clips by every edge's inward-moved line, `c − (w/2 + pavement) × DIRECTION`, edge normals
  from `normalise(edge.y, −edge.x)`; empty when it collapses.
- `chord(p, n, c)`: the two crossings of the line, in edge order, or none.
- `extent(p, n)`: `[min, max]` of `n·q`.
- `longestEdge(p)`: the direction of the longest edge (squared length, ties to the lower index).
- `offsetFor(poly, n, share)`: the integer `c` in `extent` such that `area2(clip(poly, n, c, 0))` first reaches `share`
  of `area2(poly)`, by integer bisection (`share` as a numerator/denominator pair, compared by cross multiplication); at
  most 40 steps.
- `reach(p, centre, a)`: the distance from `centre` along `dir(a)` to the boundary, in fixed units, `floorDiv`.

## Noise and warp

- `lattice(seed, i, j)`: the prototype's 32-bit integer hash, giving an integer in [−32768, 32767].
- `noise(seed, x, y, wavelength)`: value noise at `(x / wavelength, y / wavelength)`, with the cell index by `floorDiv`
  and the fraction in 1/65536 steps; the quintic fade `t³(t(6t − 15) + 10)` evaluated in 1/65536 fixed point with
  `floorDiv` after each product. Result in [−32768, 32767].
- `warp(seed, octaves)(q)`: per octave `[amplitude, wavelength]` (fixed units), `dx += noise × amplitude / 32768`
  (`roundDiv`), likewise `dy` with the second seed. Topology preserving because every amplitude stays below a fifth of
  its wavelength (asserted).
- `densify(pts, step, closed)`: splits each segment into `⌈len / step⌉` parts at `roundDiv` positions.

## Tests

- Property tests (fast-check style, seeded): `floorDiv`/`roundDiv` against `bigint` reference; `mulDiv` across the 2^53
  boundary; `isqrt(n)² ≤ n < (isqrt(n)+1)²`; `clip` of a square by random lines conserves area2 within the rounding
  bound (edges × 1 unit); `inset` never grows; `offsetFor` returns the least `c` reaching the share.
- Golden: the direction table checksum; `fnv1a("citymap") = 0x…` (value recorded in the test).
