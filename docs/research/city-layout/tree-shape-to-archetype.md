# Tree shape to city archetype

How to read the shape of a folder hierarchy, choose a city archetype for it at every level of nesting, and keep that
choice stable while the repository grows. Based on measurements of 20 public repositories, a perturbation experiment
and a history replay, all run for this report.

## Summary

- **Depth hardly grows with size; breadth does.** Across 20 repos spanning 115 to 96,080 files, mean file depth stays
  between 1.2 and 6.3 and maximum depth never passes 14. The largest fan-out of a single folder grows from 5 to 545.
  A city for a big repo has to sprawl outwards (more blocks, more districts). It does not need more nesting levels.
  About five visual levels are enough: city, district, neighbourhood, block, parcel.
- **Raw file counts lie about shape.** Tests and fixtures make up 84% of rust-lang/rust, 78% of deno and 91% of babel
  (fixtures alone). Vendored code makes up 17% of kubernetes. If you classify on raw counts you are classifying the
  test suite. Classify on a **weighted mass** instead, where each file's weight depends on its land use.
- **The archetype has two independent axes.**
  - **Form** is the street pattern: hamlet, street village, archipelago, radial old town, twin city, gridiron or
    polycentric.
  - **Tier** is the scale on the settlement hierarchy: hamlet, village, town, city or metropolis.
  - Form comes from five continuous features of a node's children. Tier comes from mass, binned by decade.
- **Hysteresis works when built as a Schmitt trigger per boundary.**
  - Each form has a margin. A cold start enters a form when its margin is at least 0. An incumbent form stays down to a
    margin of -0.15. A challenger needs a margin of at least +0.1.
  - Test: random edits to 2% of a repo's files, over 436 classified nodes in 20 repos. Form flips per node fell from
    1.18% (stateless) to 0.03%.
  - With 5% edits, flips fell from 2.57% to 0.12%. Tier flips fell from 2.28% to 0.01%.
  - A stay band without a challenge margin only got flips down to 0.42% and 1.15%.
- **Hysteresis needs state. Get it deterministically by folding over first-parent git history.** Replaying real
  history shows the archetype changing exactly when a repo was restructured:
  - facebook/react went from twin to archipelago when it moved to `packages/` with workspaces (between 2017-07 and
    2018-01).
  - vitejs/vite went from twin to archipelago with the Vite 2 monorepo (between 2020-07 and 2021-01).
  - vercel/turborepo had a one-snapshot stateless flip to radial in 2024-07, which hysteresis suppressed.
- **Features must be continuous in the input.** A hard "ignore children under 1% of mass" filter made django's
  `contrib/*/locale` grids flip on 5.9% of perturbations. Removing the cut-off dropped that to 0.33%.
- **Workspace manifests are the strongest signal of a monorepo.** The relevant manifests are `pnpm-workspace.yaml`,
  `package.json#workspaces`, Cargo `[workspace]`, `go.work`, uv, deno, Gradle and Maven. They are cheap to read and
  they decide the archipelago form. The fallback is "directory contains a package manifest", which covers Rails'
  gemspecs.

## 1. Empirical background

### 1.1 Prior study: file-system namespaces

Agrawal et al. studied file-system metadata over five years. That is general desktop file systems, not repositories,
but it is the best large-sample prior on folder trees. Findings
([FAST '07 paper](https://www.usenix.org/legacy/events/fast07/tech/full_papers/agrawal/agrawal.pdf)):

- 65-67% of directories contain no subdirectories.
- 90% have two or fewer subdirectories and 20 or fewer entries.
- The median directory holds 2 files.
- The depth of directories fits a Poisson distribution with λ between 6.03 and 6.88.
- A generative model reproduces the depth distribution: each new directory picks its parent with probability
  proportional to c(d) + 2, where c(d) is the parent's current subdirectory count.

That model is preferential attachment. It predicts what we also see in repos: a heavy tail in fan-out with bounded
depth. It also suggests a growth intuition for the city: busy districts attract more streets.

I found no peer-reviewed large-sample study of GitHub repository folder depth or files per folder (unverified gap).
The measurements below are our own.

### 1.2 Our measurements (20 repositories)

Method:

- Shallow, blob-less clones (`git clone --depth 1 --filter=blob:none --no-checkout`), then
  `git ls-tree -r --name-only HEAD`, taken on the day of writing.
- Metrics computed in bun/TypeScript.
- Gitlinks (submodules) count as files. File sizes were not fetched, so mass is file-count based (see open questions).
- HEAD SHAs: babel b8bcd42f43, ripgrep 3fce3b5bb0, deno a18ce33715, django dab0a5c47f, express a419aa7350,
  react b618bbb442, go 966c78ed74, kubernetes b27a4f0d47, vscode cc3fec8846, nx 200edc8fb5, flask d086db856b,
  rails 48dc419a79, rust 92f3cfc688, ky 3541888878, petclinic 500158f732, okhttp 42e5888d45,
  create-t3-turbo 8f945b7bb3, linux 3857c2fe54, turborepo 34e2556842, vite 3b72997d42.

Column definitions:

- **Depth** of a file is the number of folders above it.
- **branch** is the subfolder count of folders that have subfolders.
- **leafDir** is the share of folders with no subfolders.
- **rootTop** is the share of all files under the largest top-level folder.
- **rootEff** is the inverse Simpson index (effective number) of the top-level folders, weighted by file count.
- **pkgs** counts outermost folders with a package manifest, outside fixture and vendored areas.

| repo | files | dirs | maxDepth | depthMean | depthP90 | leafDir | branchP50 | branchP90 | branchMax | filesPerDirP50 | filesPerDirP90 | filesPerDirMax | rootDirs | rootTop | rootEff | pkgs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| sindresorhus/ky | 115 | 12 | 2 | 1.23 | 2 | 0.667 | 4 | 5 | 5 | 8 | 21 | 40 | 5 | 0.40 | 3.06 | 0 |
| spring-projects/spring-petclinic | 132 | 50 | 8 | 5.08 | 8 | 0.560 | 1 | 4 | 6 | 2 | 6 | 14 | 6 | 0.81 | 1.21 | 0 |
| t3-oss/create-t3-turbo | 141 | 57 | 7 | 2.59 | 4 | 0.544 | 2 | 5 | 6 | 2 | 5 | 10 | 6 | 0.44 | 3.03 | 13 |
| expressjs/express | 214 | 74 | 5 | 1.90 | 3 | 0.622 | 1 | 4 | 25 | 1 | 4 | 70 | 6 | 0.52 | 2.23 | 0 |
| pallets/flask | 236 | 52 | 7 | 2.13 | 4 | 0.481 | 1 | 4 | 6 | 2 | 11 | 31 | 6 | 0.37 | 3.73 | 0 |
| BurntSushi/ripgrep | 237 | 63 | 4 | 2.38 | 3 | 0.651 | 2 | 9 | 12 | 3 | 8 | 18 | 9 | 0.62 | 2.08 | 11 |
| square/okhttp | 845 | 503 | 8 | 5.31 | 7 | 0.342 | 1 | 2 | 37 | 0 | 4 | 89 | 37 | 0.43 | 4.67 | 36 |
| vitejs/vite | 2,866 | 934 | 11 | 3.68 | 7 | 0.692 | 2 | 6 | 78 | 2 | 6 | 51 | 7 | 0.63 | 2.01 | 4 |
| rails/rails | 5,007 | 1,115 | 11 | 3.89 | 5 | 0.658 | 1 | 7 | 31 | 1 | 9 | 199 | 20 | 0.27 | 7.56 | 14 |
| vercel/turborepo | 5,976 | 2,577 | 11 | 4.30 | 6 | 0.534 | 2 | 3 | 102 | 1 | 5 | 103 | 16 | 0.28 | 5.54 | 101 |
| django/django | 7,084 | 3,279 | 9 | 4.13 | 6 | 0.539 | 1 | 1 | 216 | 2 | 4 | 397 | 9 | 0.52 | 2.40 | 0 |
| facebook/react | 7,252 | 642 | 10 | 5.66 | 8 | 0.636 | 2 | 4 | 40 | 3 | 15 | 2,700 | 8 | 0.59 | 2.26 | 45 |
| nrwl/nx | 10,868 | 3,758 | 14 | 4.69 | 7 | 0.666 | 1 | 10 | 41 | 1 | 6 | 226 | 26 | 0.60 | 2.59 | 110 |
| denoland/deno | 14,945 | 4,347 | 10 | 4.09 | 5 | 0.746 | 1 | 3 | 461 | 3 | 6 | 134 | 12 | 0.84 | 1.39 | 60 |
| golang/go | 16,086 | 1,825 | 13 | 3.87 | 6 | 0.752 | 1 | 7 | 202 | 2 | 12 | 1,937 | 8 | 0.77 | 1.56 | 2 |
| microsoft/vscode | 20,342 | 4,611 | 14 | 6.02 | 9 | 0.619 | 1 | 4 | 112 | 1 | 9 | 780 | 15 | 0.61 | 2.09 | 10 |
| babel/babel | 27,831 | 13,099 | 11 | 6.26 | 7 | 0.874 | 2 | 17 | 545 | 2 | 3 | 96 | 14 | 0.99 | 1.03 | 157 |
| kubernetes/kubernetes | 31,421 | 6,097 | 14 | 6.13 | 9 | 0.640 | 1 | 5 | 69 | 2 | 9 | 1,473 | 16 | 0.54 | 2.90 | 35 |
| rust-lang/rust | 63,565 | 4,792 | 13 | 3.86 | 6 | 0.715 | 1 | 5 | 441 | 3 | 22 | 2,568 | 6 | 0.70 | 1.84 | 131 |
| torvalds/linux | 96,080 | 6,285 | 10 | 3.83 | 6 | 0.788 | 2 | 10 | 144 | 6 | 31 | 1,521 | 24 | 0.40 | 4.43 | 2 |

Spearman rank correlation with file count, n = 20:

| metric | ρ with file count |
| --- | --- |
| branchMax | 0.85 |
| filesPerDirMax | 0.83 |
| maxDepth | 0.82 |
| rootDirs | 0.58 |
| leafDirRatio | 0.53 |
| depthMean | 0.51 |
| branchP90 | 0.40 |

What the data says:

1. **The repo fits the file-system prior.**
   - The median fan-out of folders that have subfolders is 1-2 in every repo, and branchP90 is at most 17.
   - 34-87% of folders are leaves, which brackets Agrawal's 65-67%.
   - The median folder holds 0-8 files.
2. **Size goes into breadth and into the tails.**
   - Max depth grows only from 2 to 14 while file count grows 800-fold.
   - Max fan-out (5 to 545) and max files per folder (14 to 2,700) grow fastest.
   - In the city, giants appear as **wide grid districts** and **very long streets**, not as deeper rings.
3. **Single-child corridors are common.** Examples: `src/main/java/org/...` (Maven convention,
   [Maven standard layout](https://maven.apache.org/guides/introduction/introduction-to-the-standard-directory-layout.html)),
   `staging/src/k8s.io`, `src/vs`. These must collapse into one avenue, or they waste rings of empty city.
4. **Very large folders exist.** Examples: react's 2,700-file fixtures folder, Go's 1,937-file `test/fixedbugs`, Linux
   headers. A flat folder is its own urban form, a long street, not a degenerate grid.

### 1.3 Land use dominates the file counts

Each file was tagged by path rules modelled on GitHub Linguist. Linguist's
[`vendor.yml`](https://github.com/github-linguist/linguist/blob/main/lib/linguist/vendor.yml),
[`documentation.yml`](https://github.com/github-linguist/linguist/blob/main/lib/linguist/documentation.yml) and
[`generated.rb`](https://github.com/github-linguist/linguist/blob/main/lib/linguist/generated.rb) are MIT licensed.
Users override them with `linguist-vendored`, `linguist-generated` and `linguist-documentation` in `.gitattributes`
([overrides.md](https://github.com/github-linguist/linguist/blob/main/docs/overrides.md)). The first matching rule
wins, in this order: vendored, generated, fixtures, tests, examples, docs, ci/tooling, assets, config, source.

Percentages of files:

| repo | source | tests | fixtures | examples | docs | vendored | generated | ci/tools | config | assets |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| sindresorhus/ky | 47 | 40 | 0 | 0 | 3 | 0 | 0 | 2 | 7 | 2 |
| spring-petclinic | 38 | 16 | 0 | 23 | 4 | 0 | 0 | 5 | 5 | 10 |
| create-t3-turbo | 60 | 0 | 0 | 0 | 1 | 0 | 0 | 7 | 29 | 4 |
| express | 4 | 43 | 10 | 37 | 1 | 0 | 0 | 3 | 3 | 0 |
| flask | 11 | 29 | 0 | 14 | 40 | 0 | 0 | 3 | 3 | 0 |
| ripgrep | 61 | 12 | 0 | 1 | 13 | 0 | 0 | 4 | 8 | 0 |
| okhttp | 69 | 9 | 0 | 11 | 8 | 0 | 0 | 1 | 2 | 0 |
| vite | 10 | 8 | 10 | 58 | 6 | 1 | 0 | 1 | 2 | 3 |
| rails | 39 | 41 | 15 | 0 | 2 | 0 | 0 | 1 | 1 | 1 |
| turborepo | 14 | 6 | 33 | 27 | 11 | 2 | 3 | 1 | 3 | 0 |
| django | 51 | 36 | 1 | 0 | 11 | 1 | 0 | 1 | 0 | 1 |
| react | 24 | 8 | 58 | 1 | 2 | 2 | 0 | 3 | 2 | 1 |
| nx | 42 | 26 | 1 | 4 | 9 | 0 | 2 | 2 | 9 | 4 |
| deno | 11 | 78 | 6 | 0 | 1 | 2 | 1 | 1 | 1 | 0 |
| go | 30 | 35 | 27 | 0 | 1 | 7 | 0 | 0 | 0 | 0 |
| vscode | 49 | 28 | 6 | 0 | 2 | 0 | 6 | 2 | 4 | 2 |
| babel | 3 | 3 | 91 | 0 | 1 | 0 | 0 | 0 | 2 | 0 |
| kubernetes | 26 | 16 | 32 | 1 | 1 | 17 | 5 | 1 | 1 | 0 |
| rust | 6 | 84 | 2 | 0 | 3 | 0 | 0 | 5 | 0 | 0 |
| linux | 76 | 1 | 0 | 0 | 12 | 0 | 0 | 10 | 0 | 0 |

The conclusion is unavoidable. A city drawn in proportion to raw file count makes babel an enormous warehouse district
with a tiny town attached, and makes rust-lang/rust a test range with a compiler suburb. The archetype must be chosen on
weighted mass. The *area* each land use receives can be a separate, user-tunable decision (open question 1).

## 2. Metric vector

Every metric is computed per node (folder), in one O(files) pass, from the weighted mass `m` of each file. The default
weights:

| land use | weight |
| --- | --- |
| source | 1.0 |
| config, assets, ci/tools, docs | 0.5 |
| tests, examples | 0.3 |
| fixtures, generated, vendored | 0.05 |

These weights are a design choice. They are not derived from any source.

For node `n` with child folders `c_1..c_k` (sorted by mass) and its own files' mass `m_0`:

| feature | definition | role | continuity |
| --- | --- | --- | --- |
| `mass` | Σ m over the subtree | tier, hamlet test | continuous |
| `s1`, `s2` | mass share of the largest and second-largest child | radial, twin, gridiron | continuous |
| `f0` | `m_0 / mass`, the share of files sitting directly in the node | street village | continuous |
| `neff` | inverse Simpson `1 / Σ p_i²` over all children plus `m_0` ([Hill numbers](https://en.wikipedia.org/wiki/Diversity_index)) | how many centres the node really has | continuous; tiny children barely move it |
| `members`, `memberCover` | workspace members inside the node, and their share of mass | archipelago | `members` is an integer (see §4.4) |
| corridor | the chain of dominant children (≥ 90% of mass, own files < 10%) below the node | collapse into one avenue | thresholded; give it its own band |
| depth p50/p90, height | file depth below the node | number of ring or road classes needed | continuous |
| age (optional) | first-commit time of the node, from git | old town versus new suburb, ring order | continuous |

Metrics that were considered and rejected as primary drivers:

- **Gini over children.** Many tiny folders, such as a lone `.github`, push Gini to 0.8+ in almost every big repo, so
  it cannot tell linux `drivers/` from vscode `src/vs`. It is useful for statistics overlays, not for the form choice.
  Gini was first used on software metrics by [Vasa et al. 2009](https://doi.org/10.1109/icsm.2009.5306322).
- **Tree balance indices** (Sackin, Colless and relatives, surveyed in
  [Fischer et al. 2023](https://doi.org/10.1007/978-3-031-39800-1)). They were designed for phylogenetic trees and
  mostly assume binary or leaf-labelled shapes. Their fit to wide, weighted folder trees was not verified, so they
  stay out of the decision rule.
- **A hard significance cut-off** (ignore children under 1% of mass). See §4.3: it creates discontinuities and flips.

## 3. Archetypes

Two orthogonal axes: **tier** (how big) and **form** (what street pattern). Keeping them separate avoids a
combinatorial zoo. A gridiron can be a village or a metropolis. The tier sets how many road classes exist (lanes only,
up to motorway plus ring roads), density and building height caps.

### 3.1 Tiers, after the settlement hierarchy

The settlement hierarchy runs: isolated dwelling, hamlet, village, small town, large town, city, conurbation
([settlement hierarchy](https://en.wikipedia.org/wiki/Settlement_hierarchy);
[central place theory](https://en.wikipedia.org/wiki/Central_place_theory) for the idea that higher orders carry more
functions). Bins are by decade of weighted mass, because perception of scale is roughly logarithmic and repo sizes span
four orders of magnitude:

| tier | weighted mass | road classes | examples (root) |
| --- | --- | --- | --- |
| hamlet | < 30 | one loop or lane | babel in early 2014 (13 files) |
| village | 30 to 300 | lanes and a high street | ky, express, flask, ripgrep, create-t3-turbo, petclinic |
| town | 300 to 3,000 | plus arterials | react, vite, rails, babel, turborepo, okhttp |
| city | 3,000 to 30,000 | plus ring road | django, go, vscode, kubernetes, nx, rust, deno |
| metropolis | ≥ 30,000 | plus motorways, satellite towns | linux |

Hysteresis: move up at threshold × 1.25, move down at threshold ÷ 1.25.

### 3.2 Forms

Each form names an urban pattern and the shape condition it answers. The conditions are tested in the order listed.

| # | form | urban precedent | enters when (cold start) | real examples from our runs |
| --- | --- | --- | --- | --- |
| 1 | **Hamlet** | cluster of houses round a green | mass < 25 | `ripgrep/benchsuite`, tiny folders |
| 2 | **Street village** | [linear settlement](https://en.wikipedia.org/wiki/Linear_settlement), houses fronting one road | `f0 ≥ 0.6`, or no child folders | go `src/runtime` (f0 0.80), `src/syscall`, `test/fixedbugs`, django `docs/releases`, flask `src/flask` |
| 3 | **Archipelago** | islands joined by bridges and ferries | ≥ 3 workspace members covering ≥ 50% of mass | nx, turborepo, rails, deno, react, vite, create-t3-turbo, kubernetes `staging/` |
| 4 | **Radial old town** | monocentric core in concentric rings ([Burgess concentric zones](https://en.wikipedia.org/wiki/Concentric_zone_model)) | `s1 ≥ 0.6` | django (`django/` 0.76), go root (`src` 0.83), vscode root, most Rails gems, nx packages (`packages/nx/src`) |
| 5 | **Twin city** | two cores across a river ([twin cities](https://en.wikipedia.org/wiki/Twin_cities)) | `s2 ≥ 0.3` and `s1 + s2 ≥ 0.75` | express (test plus examples), okhttp `src` (main plus test), react 2014-2017 (src plus docs), vite 2020 |
| 6 | **Gridiron** | [grid plan](https://en.wikipedia.org/wiki/Grid_plan) of comparable blocks | `neff ≥ 7` and `s1 ≤ 0.25` | linux `drivers/`, `arch/`; go `src/`; kubernetes `pkg/`; rust `compiler/`; django `tests/`, `contrib/`; turborepo `examples/` |
| 7 | **Polycentric** | a few comparable centres joined by arterials | otherwise (2.5 ≲ neff < 7, no dominant child) | linux root, vscode `src/vs`, rust root, flask, ky, `library/` |

**Corridor** is not a form but a pre-step. When a node's dominant child holds at least 90% of its mass and the node's
own files are under 10%, the node is collapsed into an avenue or gateway leading into that child. The small siblings
become wayside parcels along it. Examples: `staging/src/k8s.io`, `src/vs`, `src/main/kotlin/okhttp3`.

Design notes for each form:

- **Hamlet** has no internal hierarchy. Parcels (files) sit round a green, which is the folder's own index or README.
- **Street village** is the right answer for big flat folders. A street of 300 parcels is long but legible: it bends
  and can grow side alleys. This is where an EvoStreets-style layout fits, with buildings along streets laid out by
  hierarchy ([Steinbrückner and Lewerentz 2010](https://doi.org/10.1145/1879211.1879239)). SoftVis3D offers an
  "evostreet" layout next to the CodeCity district layout
  ([repo](https://github.com/stefanrinderle/softvis3d), LGPL-3.0, last push 2023-09).
- **Archipelago** gives every workspace member its own island. Group folders such as `apps/`, `packages/` and `crates/`
  become island chains. Mass not inside any member (root tooling, `scripts/`, `docs/`) is the **mainland**.
  - Kubernetes shows this hybrid: `staging/` is 34 module islands covering 0.60 of mass, and `pkg/` and `cmd/` form
    the mainland.
  - Water is the natural [edge (Lynch)](https://en.wikipedia.org/wiki/The_Image_of_the_City) between separately
    published units. Dependencies between members are bridges (§5).
- **Radial old town** puts the dominant child at the centre. The other children take ring sectors, ordered outward by
  land use: civic and public API first, then residential (source), then industrial and utilities (tests, tooling,
  vendored). This ordering mirrors the concentric zone model. Ring order within a land use should be by age (first
  commit), so new folders join the outer ring and nothing already placed moves.
- **Twin city** has two cores and a river between them, with bridges sized by the dependencies between the halves.
  This is a common, recognisable shape: `lib` plus `test`, `client` plus `server`, `src` plus `docs`. Without it,
  these cases bounce between radial and polycentric.
- **Gridiron** fits when many children are comparable and none dominates. The blocks are uniform and new blocks are
  appended at the grid frontier (stable). Linux `drivers/` (neff 10.6) is the textbook case.
- **Polycentric** is the honest default for 3-6 comparable centres: each centre gets its own local form, linked by
  arterials.

## 4. Decision procedure with hysteresis

### 4.1 Margins and the Schmitt trigger

Each form has a scalar margin `m(f)`. `m ≥ 0` means "this form's condition holds", and the size of `m` says by how
much. Compound conditions take the minimum of their parts. This is a
[Schmitt trigger](https://en.wikipedia.org/wiki/Schmitt_trigger) per boundary: one threshold to enter, a lower one to
stay.

```ts
// Margins as used in the experiments (classify.ts). m >= 0 enters on a cold start.
const RULES = [
  { form: "hamlet",      margin: (f) => Math.log(25 / f.mass) },
  { form: "street",      margin: (f) => (f.k === 0 ? 1 : f.f0 - 0.6) },
  { form: "archipelago", margin: (f) => Math.min((f.members - 3) / 3, f.memberCover - 0.5) },
  { form: "radial",      margin: (f) => f.s1 - 0.6 },
  { form: "twin",        margin: (f) => Math.min(f.s2 - 0.3, f.s1 + f.s2 - 0.75) },
  { form: "gridiron",    margin: (f) => Math.min(Math.log(f.neff / 7), 0.25 - f.s1) },
  { form: "polycentric", margin: () => 1 },
];
const STAY = 0.15, CHALLENGE = 0.1;

function classify(f, previous) {
  if (!previous) return RULES.find((r) => r.margin(f) >= 0).form;          // cold start
  const i = RULES.findIndex((r) => r.form === previous);
  const earlier = RULES.slice(0, i).find((r) => r.margin(f) >= CHALLENGE); // higher priority must win clearly
  if (earlier) return earlier.form;
  if (RULES[i].margin(f) >= -STAY) return previous;                         // incumbent keeps its seat
  return RULES.slice(i + 1).find((r) => r.margin(f) >= CHALLENGE)?.form ?? "polycentric";
}
```

The challenge margin matters as much as the stay band. Priority order means a lower-priority incumbent, such as a
polycentric node sitting at `s1 = 0.59`, otherwise gets taken over by radial as soon as `s1` touches 0.60.

### 4.2 Perturbation experiment

Setup:

- For each of the 20 repos, 40 seeded trials.
- Each trial edits 2% or 5% of the file count: 40% delete a random file, 40% add a sibling file, 20% add a new 4-file
  folder next to a random file.
- The full plan (form and tier at every node with mass ≥ 25 and ≥ 5% of its parent, down to 3 levels) is recomputed
  three ways:
  - stateless;
  - with a stay band only;
  - with stay band plus challenge margin.
- Each way is compared with the unperturbed plan. 436 nodes were checked per trial.

| perturbation | form flips, stateless | stay band only | stay + challenge | tier flips, stateless | tier with ±25% band |
| --- | --- | --- | --- | --- | --- |
| 2% of files | 1.18% | 0.42% | **0.03%** | 0.93% | **0.00%** |
| 5% of files | 2.57% | 1.15% | **0.12%** | 2.28% | **0.01%** |

Rates are node-weighted means over all nodes and trials. The worst repo with full hysteresis at 5% was turborepo
(0.49%), followed by okhttp (0.42%) and django (0.33%). The remaining flips sit in small nodes (mass 25-60), where a
5% edit is a large relative change. A mass-dependent stay band (`STAY + 1/√mass`) is an obvious refinement, but it
was not decisive in a quick test.

Caveat: the perturbations are synthetic. Real commits are spatially clustered, with many files in one feature folder.
That probably stresses single nodes harder and the tree as a whole less (unverified).

### 4.3 Lesson: continuity before hysteresis

An earlier variant computed `neff` and Gini only over children holding at least 1% of the node's mass. In django
`contrib/sites/locale`, roughly 100 language folders each hold about 1% of the mass. Small edits pushed them back and
forth across the cut-off, `neff` jumped, and the node flipped between gridiron and polycentric on 5.9% of
perturbations, even with hysteresis. After switching to all-children inverse Simpson (continuous), the same node set
flipped on 0.33%.

Rule: **every feature must be a continuous (ideally Lipschitz) function of the file masses.** Hysteresis only absorbs
noise of bounded size. It cannot absorb a feature that jumps.

### 4.4 Discrete signals

`members` (the workspace member count) is an integer. One new package moves the archipelago margin by 1/3. Two
mitigations:

- (a) The margin also requires `memberCover`, which is continuous.
- (b) The challenge margin of 0.1 means a cold-started hamlet or polycentric node needs 3+ members *and* ≥ 60% cover to
  convert.

In the turborepo history (§4.6) this delayed the archipelago by one snapshot (2022-01 → 2022-07). That is acceptable
and arguably right.

### 4.5 Where the state comes from (determinism)

Hysteresis makes the plan a function of (tree, previous plan). "Same input, same map" therefore needs the previous plan
to be part of the input. Options:

| option | deterministic? | cost | notes |
| --- | --- | --- | --- |
| **Fold over first-parent git history** (sample per release tag or every N commits, cache the result) | yes: the history is in the repo | O(snapshots × files); cacheable, incremental per new commit | also yields node age, which drives old town versus new suburb |
| Committed lockfile (`citymap.lock.json`) | yes, if committed | trivial | a team can pin a city; merge conflicts possible |
| Local state (IndexedDB on the web, file for Rust) | per machine only | trivial | two machines can differ; acceptable for non-git folders |
| Stateless with wide bands | yes | none | flips 1-3% of nodes per small change; violates the requirement |

The recommended order: fold over git history where it exists, then a committed lock if present, then local state.
Cold start is the fallback for shallow clones and plain folders.

Pitfall found while doing this: GitHub's `GET /repos/{o}/{r}/commits?until=` picks the newest commit *by date among
all ancestors*. In babel that alternates between the monorepo (17,000+ files) and old side histories of 44-55 files
from merged branches. Running `git rev-list --first-parent --before=<date>` locally gave the mainline commit instead
(e.g. 2017-01: `3855f28` first-parent versus `39cda64` any-ancestor). **Always fold over `--first-parent`.**

### 4.6 History replay

Snapshots every six months via the GitHub trees API. Members came from `package.json#workspaces`, `lerna.json` and
`pnpm-workspace.yaml` at each snapshot.

| repo | period | stateless | with hysteresis | what happened |
| --- | --- | --- | --- | --- |
| facebook/react | 2013-07 → 2017-07 | polycentric, then twin (src plus docs) | same | single package |
| facebook/react | 2018-01 → 2023-07 | archipelago | same | moved to `packages/*` with workspaces (12 members at 2018-01) |
| vitejs/vite | 2020-07 | twin (src plus playground) | same | Vite 1 |
| vitejs/vite | 2021-01 → 2026-07 | archipelago | same | Vite 2 monorepo, 4 → 80 members |
| vercel/turborepo | 2021 | hamlet | same | 13-14 files |
| vercel/turborepo | 2022-01 | archipelago | polycentric | 3 members: below the challenge margin |
| vercel/turborepo | 2022-07 → 2024-01 | archipelago | archipelago | Go CLI plus crates and packages |
| vercel/turborepo | 2024-07 | **radial** (s1 0.64) | **archipelago** | one-off concentration in a single folder; hysteresis held |
| vercel/turborepo | 2025-01 → 2026-07 | archipelago | archipelago | |

The archetype changes only where the repository fundamentally changed shape. That is exactly the owner's requirement.

## 5. Mapping at every level of nesting

1. **Recursion.** Classify every node whose mass is at least 25 and at least 5% of its parent's mass. Smaller children
   are not districts: they become blocks or parcel clusters in the parent's form. Each node's form decides how *its*
   children are arranged. A gridiron city can contain a radial old town, which can contain a street village.
   - Observed: linux root (polycentric metropolis) contains `drivers/` (gridiron), which contains `drivers/gpu`
     (radial, corridor into `drm`).
   - Observed: go root (radial) contains `src/` (gridiron), which contains `src/runtime` (street village).
2. **The parent sets the footprint shape.** The child lays out inside it.
   - gridiron parent: rectangular lots;
   - radial parent: annular sectors;
   - archipelago parent: organic island polygons with a shoreline;
   - street village parent: deep, narrow frontage lots;
   - twin parent: two banks.
   - So each form's layout must accept an arbitrary simple polygon as its boundary. That belongs to the geometry
     research angle.
3. **Depth budget.** Corridor collapse handles chains. Beyond about five visible levels (city, district,
   neighbourhood, block, parcel), any node below block size flattens its descendants into a single block, with parcels
   addressed by relative path. The data supports this: depthP90 is at most 9 in every repo.
4. **Identity.** Hysteresis state is keyed by node path. Folder renames should carry state: if most files of folder A
   reappear under folder B in one commit, B inherits A's state. git's rename detection (`-M`,
   [git diff](https://git-scm.com/docs/git-diff)) gives the file-level signal. Folder-level inference is our design and
   unverified in practice.
5. **Land use is not form.** Land use (below) sets zoning, texture and building typology. Form sets the street
   pattern. One exception: **archipelago requires the members to be production land use.** vite's `playground/**` is
   declared as 78 pnpm members, but it is an exhibition ground, not 78 towns. The experiment classed it as an
   archipelago, which is wrong.

## 6. Urban vocabulary for repository concepts

The mental model follows [Lynch's five elements](https://en.wikipedia.org/wiki/The_Image_of_the_City): paths, edges,
districts, nodes and landmarks. The city stays legible if every repo concept maps to exactly one of them.

| repo concept | city element | detection | rationale |
| --- | --- | --- | --- |
| root folder | city centre square with town hall | root | Lynch *node*: everyone starts here |
| root files (README, LICENCE, manifests, lockfiles) | town hall, charter, registry office on the square | root-level files | civic, few and important |
| workspace member or package | island, borough or municipality | manifests (§7) | a separately versioned unit has its own administration |
| folder | district, neighbourhood, then block, by level | tree | Lynch *district* |
| file | parcel (building comes later) | tree | addressable unit for game and statistics |
| tree edges (parent to child) | streets; road class by level and mass | tree | *paths* that always exist and are stable |
| entry points (`src/main.rs`, `src/bin/*`, `package.json` `bin`, `main` or `exports`, Go `cmd/*`, `__main__.py`) | gates and stations on the arterial ring; the main entry is the central station | Cargo layout ([cargo guide](https://doc.rust-lang.org/cargo/guide/project-layout.html)); manifests | where traffic enters the city |
| public API (`src/lib.rs`, `index.ts`, exports) | high-street frontage or market square of the district | as above | the shop window |
| `internal/` (Go: importable only from within the module, [go.dev layout](https://go.dev/doc/modules/layout)) | gated estate, no through-roads from outside | path segment | encodes real access rules |
| source | residential or commercial mixed use, density by size | default | the lived-in city |
| tests (`test/`, `tests/`, `__tests__`, `*_test.go`, `*.spec.ts`) | co-located: workshops behind the houses; top-level `tests/`: testing grounds or industrial estate at the edge | path rules | they serve the city and sit beside it |
| fixtures, snapshots, `testdata/` | warehouses and storage yards | path rules | bulky, inert, rarely visited |
| examples, demos, playgrounds, samples | exhibition grounds or a model village (show homes) | Linguist documentation rules | built to be looked at |
| docs | civic quarter: library, museum | Linguist documentation rules | public knowledge |
| assets (images, fonts, media) | parks, gardens, public art | extension | decorative, low-rise |
| CI, scripts, tools, `.github`, `hack/` | utilities: depot, power station, water works | path rules | infrastructure that runs the city |
| config and lockfiles | utility substations, small and many | extension | |
| generated code | factories, low walls, uniform | Linguist `generated.rb`, `linguist-generated` | machine-made |
| vendored or third-party | foreign quarter or free port near the docks | Linguist `vendor.yml`, `linguist-vendored` | imported goods, not ours to build |
| i18n (`locale/`) | uniform terraced housing | path segment | many identical small units, gridiron in practice |
| module dependencies within a package | not drawn by default; on demand as tram lines | import graph | changes often; would churn the roads |
| dependencies between workspace members | bridges and causeways (archipelago), viaducts (elsewhere); width by import count | manifests plus import graph | rare, structural, meaningful |
| external dependencies | port and airport at the city edge, shipping lanes off-map | lockfiles | the outside world |
| old versus new areas | old town (earliest first commit) at the core, newer suburbs outward; a "strangler" district grows round an old one with construction sites at the seam ([strangler fig](https://martinfowler.com/bliki/StranglerFigApplication.html)) | git age per node | |
| ownership (CODEOWNERS) | wards and councils (optional overlay) | CODEOWNERS | unverified that it adds value |

Roads come from the folder tree, not from dependencies. The tree is the stable skeleton. Dependencies are an overlay
transit network that can change daily without moving a single street. Later centrality analysis, such as which street
is "main", can use space syntax integration on that road graph ([space syntax](https://en.wikipedia.org/wiki/Space_syntax)).

## 7. Monorepo and workspace detection

| ecosystem | signal | members field | source |
| --- | --- | --- | --- |
| pnpm | `pnpm-workspace.yaml` | `packages:` globs, `!` exclusions | [pnpm docs](https://pnpm.io/pnpm-workspace_yaml) |
| npm, yarn, bun | `package.json` | `workspaces` (array or `{packages}`) | [npm](https://docs.npmjs.com/cli/v10/using-npm/workspaces), [bun](https://bun.sh/docs/install/workspaces) |
| Lerna | `lerna.json` | `packages` | [lerna](https://lerna.js.org/docs/api-reference/configuration) |
| Turborepo | `turbo.json` plus package-manager workspaces; recommends `apps/` and `packages/`; nested packages (`apps/a/b`) are an error | n/a | [turborepo](https://turborepo.com/docs/crafting-your-repository/structuring-a-repository) |
| Nx | `nx.json`; projects from `project.json` or `package.json` | inferred | [nx](https://nx.dev/docs/reference/project-configuration) |
| Cargo | root `Cargo.toml` `[workspace]`, which may be virtual (no `[package]`) | `members` globs | [cargo](https://doc.rust-lang.org/cargo/reference/workspaces.html) |
| Go | `go.work` | `use (...)` | [go ref](https://go.dev/ref/mod#workspaces) |
| Python (uv) | `pyproject.toml` `[tool.uv.workspace]` | `members` | [uv](https://docs.astral.sh/uv/concepts/projects/workspaces/) |
| Deno | `deno.json` | `workspace` array | [deno](https://docs.deno.com/runtime/fundamentals/workspaces/) |
| Gradle | `settings.gradle(.kts)` `include(...)` | includes | [gradle](https://docs.gradle.org/current/userguide/multi_project_builds.html) |
| Maven | parent `pom.xml` `<modules>` | modules | Maven docs (not checked here) |
| Bazel | each `BUILD` file defines a package | every BUILD directory | [bazel](https://bazel.build/concepts/build-files) |
| Rush | `rush.json` `projects` | projects | rushjs.io did not respond at writing time (unverified) |
| fallback | outermost folder containing a manifest (`package.json`, `Cargo.toml`, `go.mod`, `pyproject.toml`, `*.gemspec`, `pom.xml`, ...) outside fixture and vendored areas | n/a | our heuristic; covers Rails' 12 gems |

What we observed:

- Our script did not parse Gradle, so okhttp (36 Gradle modules) came out polycentric rather than archipelago. Gradle
  and Maven parsing is therefore required.
- Linux and Go have no member manifests and are classified purely structurally. The result (polycentric metropolis
  with gridiron `drivers/`; radial with gridiron `src/`) is plausible.
- Large monorepos at Google scale use a single repository with directory-based ownership
  ([Potvin and Levenberg 2016](https://doi.org/10.1145/2854146)). Their shape is a pure structural gridiron of
  projects. That is unverified for a public example here.

## 8. Ranked recommendation

1. **Adopt the two-axis archetype (form × tier), decided per node on weighted mass.** Use the 7 forms and 5 tiers
   above, with corridor collapse as a pre-step. This matched intuition on all 20 repos with a handful of exceptions, and
   each exception has a principled fix: vite playground (land-use gate on archipelago), okhttp (Gradle parsing), rust
   root (test weight).
2. **Implement hysteresis as margins plus a Schmitt trigger** (enter ≥ 0, stay ≥ -0.15, challenge ≥ +0.1; tiers with
   ±25% bands). Insist that every feature is continuous. This took flips under 2-5% edits from 1-3% to 0.03-0.12%.
3. **Derive state by folding over first-parent git history.** Cache it and update it incrementally. Use a committed
   lockfile as an override and local state for non-git folders. This keeps "same input, same map" literally true and
   yields node age for old-town rings and strangler districts.
4. **Read workspace manifests first, then the structural fallback.** Start with pnpm, npm/yarn/bun, Cargo, go.work and
   Gradle; add uv, deno, Maven and Nx after.
5. **Use Linguist-style land-use rules with `.gitattributes` overrides** for zoning and mass weights. Keep roads tied
   to the tree and draw dependencies as bridges and transit overlays.
6. **Next validation step:** replay full first-parent histories of about 50 repos with real (clustered) commits. Fit
   the thresholds to minimise flips while keeping the restructuring events, as react 2017 and vite 2020 show.

## 9. Open questions for the owner

1. Should land area follow raw size (babel becomes a vast warehouse district) or weighted mass (babel becomes a town of
   parser and plugin islands with storage yards)? Or should it be a toggle?
2. What is "mass": file count, lines of code, or bytes? This report used file count, because blob-less clones carry no
   sizes. LOC needs blob fetches, which costs bandwidth on the web.
3. Is a git-history fold acceptable as part of the input (slower first load, shallow clones fall back to cold start)?
   Or must a map be computable from a single snapshot, accepting a committed lockfile for stability?
4. Should tests sit co-located (workshops behind the houses) or be pooled into a test district at the edge, when a repo
   has a top-level `tests/`? rust-lang/rust and deno are mostly tests.
5. Should dependencies inside a package ever reshape the layout (e.g. place tightly coupled folders next to each
   other)? Or must they always stay an overlay, so roads never move because of an import?
6. Is the extra twin-city form wanted (two cores and a river)? Or should two-core nodes be treated as polycentric?

## 10. Sources

Studies and papers:

- Agrawal, Bolosky, Douceur, Lorch, "A Five-Year Study of File-System Metadata", FAST 2007:
  https://www.usenix.org/legacy/events/fast07/tech/full_papers/agrawal/agrawal.pdf
- Wettel and Lanza, "CodeCity", ICSE 2008 companion: https://doi.org/10.1145/1370175.1370188, and
  https://wettel.github.io/codecity.html
- Wettel and Lanza, "Visual Exploration of Large-Scale System Evolution", WCRE 2008: https://doi.org/10.1109/wcre.2008.55
- Steinbrückner and Lewerentz, "Representing development history in software cities", SoftVis 2010:
  https://doi.org/10.1145/1879211.1879239
- SoftVis3D (LGPL-3.0): https://github.com/stefanrinderle/softvis3d
- Sondag, Speckmann, Verbeek, "Stable Treemaps via Local Moves", IEEE TVCG 2018: https://doi.org/10.1109/tvcg.2017.2745140
- Vasa, Lumpe, Branch, Nierstrasz, "Comparative analysis of evolving software systems using the Gini coefficient",
  ICSM 2009: https://doi.org/10.1109/icsm.2009.5306322
- Fischer et al., "Tree Balance Indices: A Comprehensive Survey", Springer 2023: https://doi.org/10.1007/978-3-031-39800-1
- Potvin and Levenberg, "Why Google stores billions of lines of code in a single repository", CACM 2016:
  https://doi.org/10.1145/2854146

Urban form and indices:

- Lynch, The Image of the City: https://en.wikipedia.org/wiki/The_Image_of_the_City
- Settlement hierarchy: https://en.wikipedia.org/wiki/Settlement_hierarchy
- Central place theory: https://en.wikipedia.org/wiki/Central_place_theory
- Concentric zone model: https://en.wikipedia.org/wiki/Concentric_zone_model
- Grid plan: https://en.wikipedia.org/wiki/Grid_plan
- Linear settlement: https://en.wikipedia.org/wiki/Linear_settlement
- Twin cities: https://en.wikipedia.org/wiki/Twin_cities
- Space syntax: https://en.wikipedia.org/wiki/Space_syntax
- Schmitt trigger: https://en.wikipedia.org/wiki/Schmitt_trigger
- Diversity index (inverse Simpson, Hill numbers): https://en.wikipedia.org/wiki/Diversity_index
- Gini coefficient: https://en.wikipedia.org/wiki/Gini_coefficient
- Strangler fig application: https://martinfowler.com/bliki/StranglerFigApplication.html

Land-use classification (GitHub Linguist, MIT):

- https://github.com/github-linguist/linguist/blob/main/lib/linguist/vendor.yml
- https://github.com/github-linguist/linguist/blob/main/lib/linguist/documentation.yml
- https://github.com/github-linguist/linguist/blob/main/lib/linguist/generated.rb
- https://github.com/github-linguist/linguist/blob/main/docs/overrides.md

Layout conventions and workspaces:

- Maven standard layout: https://maven.apache.org/guides/introduction/introduction-to-the-standard-directory-layout.html
- Cargo project layout: https://doc.rust-lang.org/cargo/guide/project-layout.html
- Cargo workspaces: https://doc.rust-lang.org/cargo/reference/workspaces.html
- Go module layout (internal): https://go.dev/doc/modules/layout
- Go workspaces: https://go.dev/ref/mod#workspaces
- Python src versus flat layout: https://packaging.python.org/en/latest/discussions/src-layout-vs-flat-layout/
- pnpm-workspace.yaml: https://pnpm.io/pnpm-workspace_yaml
- npm workspaces: https://docs.npmjs.com/cli/v10/using-npm/workspaces
- Bun workspaces: https://bun.sh/docs/install/workspaces
- Lerna configuration: https://lerna.js.org/docs/api-reference/configuration
- Turborepo repository structure: https://turborepo.com/docs/crafting-your-repository/structuring-a-repository
- Nx project configuration: https://nx.dev/docs/reference/project-configuration
- uv workspaces: https://docs.astral.sh/uv/concepts/projects/workspaces/
- Deno workspaces: https://docs.deno.com/runtime/fundamentals/workspaces/
- Gradle multi-project builds: https://docs.gradle.org/current/userguide/multi_project_builds.html
- Bazel BUILD files: https://bazel.build/concepts/build-files
- git diff rename detection: https://git-scm.com/docs/git-diff

Repositories measured (GitHub):

- sindresorhus/ky, spring-projects/spring-petclinic, t3-oss/create-t3-turbo, expressjs/express, pallets/flask,
  BurntSushi/ripgrep, square/okhttp, vitejs/vite, rails/rails, vercel/turborepo, django/django, facebook/react,
  nrwl/nx, denoland/deno, golang/go, microsoft/vscode, babel/babel, kubernetes/kubernetes, rust-lang/rust,
  torvalds/linux.
- Experiment scripts (bun/TypeScript; not part of this repo) lived in `/tmp/citymap-trees`: `analyse.ts`,
  `classify.ts`, `members.ts`, `perturb.ts`, `history.ts`. The core rules are reproduced in §4.1.
