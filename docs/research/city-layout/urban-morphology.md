# Urban morphology from first principles: rules for a code-city ground plan

Research angle: how real cities are physically structured, how to measure that ourselves without Python, and how to
scale it down into deterministic, stable generator rules for districts, blocks, parcels and roads.

Conventions in this document:

- **Verified** facts carry a URL. Numbers I measured myself are marked **(measured)** and the script is in Appendix A.
- **Proposal** marks our own design inference, not a claim about the world.
- **Unverified** marks anything I could not confirm from a primary or reliable secondary source.

---

## 0. Summary in eight lines

1. Real cities are a **patchwork of locally ordered fabrics**: districts are internally regular, the whole is not.
   Midtown Manhattan measures orientation order φ = 0.99, all of Manhattan 0.67; central Kyoto 0.98, all of Kyoto 0.36.
2. Streets come in a **steep hierarchy**: in US urban systems local streets are 63-75 % of length, arterials a few percent.
3. Blocks cluster in a narrow band: **50-140 m short side**, long side 1-4x the short side; parcels are **modular strips**
   (frontage 5-8 m, frontage:depth 1:2 to 1:6), with depth about half the block depth.
4. **Persistence is the norm**: streets and plot boundaries outlive buildings (Conzen's morphological frame), and
   high-centrality roads stay stable for 200 years (Strano et al.). This is exactly our stability requirement.
5. Growth is **densification then exploration**: infill of backland, plot splitting, alley insertion, then new blocks
   along roads at the urban front, separated by **fringe belts** of parks and institutions.
6. **Lynch's five elements** (paths, edges, districts, nodes, landmarks) give a checklist for recognisability;
   **Nolli's figure-ground** gives the 2D rendering grammar.
7. All key metrics (orientation entropy, node degree, dead-end share, circuity, block shape factor, integration and
   choice) are cheap graph computations we can implement in TypeScript and use as **generator test oracles**.
8. Archetypes (hamlet, radial, grid, organic, cellular-suburban, polycentric) map onto distinct, measurable bands of
   those metrics, which lets us choose and validate archetypes by first principles rather than taste.

---

## 1. Street hierarchy

### 1.1 Functional classes

Road hierarchies balance **mobility** (through movement) against **access** (reaching property): arterials (incl.
controlled-access highways), collectors, local roads, with trips passing through stages "main movement, transition,
distribution, collection, access and termination" ([Wikipedia: Hierarchy of roads](https://en.wikipedia.org/wiki/Hierarchy_of_roads)).

The US Federal Highway Administration gives **guideline ranges of system length per class** for urban systems
("Mileage Extent for All States", derived from 2011 HPMS data)
([FHWA Highway Functional Classification, section 3](https://www.fhwa.dot.gov/planning/processes/statewide/related/highway_functional_classifications/section03.cfm)):

| Urban class | Share of network length |
|---|---|
| Interstate | 1-3 % |
| Other freeways and expressways | 0-2 % |
| Other principal arterial | 4-5 % |
| Minor arterial | 7-14 % |
| Major and minor collector | 7-15 % |
| Local | 63-75 % |

Same source: lane widths 10-12 ft for collectors and locals; locals "account for the largest percentage of all
roadways in terms of mileage" yet carry little through traffic.

Le Corbusier's Chandigarh formalised seven tiers, *les Sept Voies* (V1-V7): highway, central axes, arterials, market
roads, sector circulation roads, residential streets, pedestrian walkways
([Wikipedia: Chandigarh](https://en.wikipedia.org/wiki/Chandigarh)). Each 800 x 1200 m sector "is surrounded on its
four sides by a V3, a road exclusively for fast mechanised traffic"
([Fondation Le Corbusier](https://www.fondationlecorbusier.fr/en/work-architecture/projects-capitol-chandigarh-india-1950-1965/);
[Chandigarh urban planning department](https://urbanplanning.chd.gov.in/index.php/home/page/3)).

Heian-kyō (Kyoto, 794) had a two-tier system: **ōji** (major) and **kōji** (minor) streets; minor streets 4 jō
(about 12 m), the central Suzaku-ōji 28 jō (about 85 m) ([Wikipedia: Heian-kyō](https://en.wikipedia.org/wiki/Heian-ky%C5%8D)).

### 1.2 Measured hierarchy shares in real fabrics (measured)

Share of drivable street length by OSM `highway` class, in about 2-4 km² samples (Appendix A):

| Sample | Arterial-ish (motorway, trunk, primary) | Secondary + tertiary | Local (residential, unclassified, living street) |
|---|---|---|---|
| Midtown Manhattan | 21 % | 40 % | 39 % |
| Barcelona Eixample | 7 % | 48 % | 46 % |
| Portland downtown | 29 % | 48 % | 24 % |
| Amsterdam canal ring | 3 % | 8 % | 90 % |
| Kyoto centre | 21 % | 8 % | 71 % |
| Tokyo Yanaka | 10 % | 19 % | 70 % |
| Paris Étoile | 13 % | 21 % | 67 % |
| Chandigarh (several sectors) | 0 % | 37 % | 63 % |
| Charlotte suburb | 7 % | 19 % | 73 % |

Caveat: OSM class tagging is local convention (Manhattan tags most avenues as secondary), so these are indicative,
not a standard. The lesson that holds: **residential fabrics are about 2/3 to 9/10 local streets; dense commercial
cores invert this.**

### 1.3 Street widths per level (verified ratios)

| City | Local | Middle | Major | Ratio local:major |
|---|---|---|---|---|
| Manhattan 1811 | 60 ft (18 m) streets | 100 ft (30 m) wide crosstown streets | 100 ft (30 m) avenues | 1 : 1.67 |
| Barcelona Cerdà | 20 m | 30 m | 60 m | 1 : 1.5 : 3 |
| Heian-kyō | about 12 m | broader ōji | Suzaku-ōji about 85 m | 1 : 7 (ceremonial axis) |
| US Ordinance-derived grids | 60-80 ft (18-24 m) | | Salt Lake City 120 ft (37 m) | about 1 : 2 |
| Goerck survey, Manhattan | 50 ft (15 m) | | | |

Sources: [Commissioners' Plan of 1811](https://en.wikipedia.org/wiki/Commissioners%27_Plan_of_1811);
[Cerdà Plan](https://en.wikipedia.org/wiki/Cerd%C3%A0_Plan); [Heian-kyō](https://en.wikipedia.org/wiki/Heian-ky%C5%8D).
Haussmann's boulevards were around 30 m (Boulevard Haussmann is described as 30 m wide, a secondary source:
[boulevard-haussmann-de-paris.com](https://www.boulevard-haussmann-de-paris.com/history)), cut through a fabric of
narrow, deep 18th-century plots "often only six metres wide; deep (sometimes forty metres)"
([Haussmann's renovation of Paris](https://en.wikipedia.org/wiki/Haussmann%27s_renovation_of_Paris)).
Back-alley widths: **unverified**, no primary source found in this pass.

---

## 2. Blocks and parcels in real cities

### 2.1 Block dimensions (verified)

| Fabric | Block | Street | Notes |
|---|---|---|---|
| Manhattan 1811 | about 200 ft x 600-920 ft (61 m x 190-280 m); "standard" 264 x 900 ft (80 x 274 m) incl. half-streets | 60 / 100 ft | about 2,000 long narrow blocks, 20 per mile N-S ([1811 plan](https://en.wikipedia.org/wiki/Commissioners%27_Plan_of_1811), [City block](https://en.wikipedia.org/wiki/City_block)) |
| Chicago | 330 x 660 ft (100 x 200 m) | | 16 E-W or 8 N-S blocks per mile ([City block](https://en.wikipedia.org/wiki/City_block)) |
| Portland, Seattle downtown | 200 ft (61 m) square | 60 ft | squares of 3,600-6,400 m² ([1811 plan article](https://en.wikipedia.org/wiki/Commissioners%27_Plan_of_1811), [Siksna 1997](https://journal.urbanform.org/index.php/jum/article/view/4048)) |
| Common US grid | 300 ft (91 m) square | 60-80 ft | Anchorage, Phoenix, Tulsa... ([1811 plan article](https://en.wikipedia.org/wiki/Commissioners%27_Plan_of_1811)) |
| Salt Lake City | 600 ft (180 m) square | 120 ft | ([same](https://en.wikipedia.org/wiki/Commissioners%27_Plan_of_1811)) |
| Barcelona Eixample | 113.3 m square, 45° chamfers of 15 m, 1.24 ha | 20 m standard | built on two of four sides originally; 9 blocks form a *superilla* ([Cerdà Plan](https://en.wikipedia.org/wiki/Cerd%C3%A0_Plan), [City block](https://en.wikipedia.org/wiki/City_block)) |
| Heian-kyō | chō of 40 jō, about 121 m square (axis to axis) | 12 m minor | 16 chō per bō; 4 bō per side per jō strip ([Heian-kyō](https://en.wikipedia.org/wiki/Heian-ky%C5%8D)) |
| Melbourne CBD | 100 x 200 m | | split from square blocks by a narrow lane ([City block](https://en.wikipedia.org/wiki/City_block)) |
| Adelaide initial | 554 x 154 m | | later refined to 60 x 70 m in the retail core ([Siksna 1997 PDF](https://journal.urbanform.org/index.php/jum/article/download/4048/3359)) |
| Chandigarh sector | 800 x 1200 m superblock | V3 around | 3,000-20,000 people each ([chandigarh.gov.in](https://chandigarh.gov.in/le-corbusiers-master-plan)) |
| Milton Keynes grid square | about 1 km between grid roads | grid roads | "leaving the spaces between to develop more organically" ([Milton Keynes](https://en.wikipedia.org/wiki/Milton_Keynes)) |
| Radburn superblock | 149 acres total, 23 acres interior parks | cul-de-sacs | earliest US cul-de-sac superblock ([Radburn](https://en.wikipedia.org/wiki/Radburn,_New_Jersey)) |

**Siksna's performance findings** (12 North American and Australian CBDs,
[Siksna 1997, Urban Morphology 1(1)](https://journal.urbanform.org/index.php/jum/article/download/4048/3359)):

- Pedestrian mesh yardsticks: 60-70 m "very fine, optimal", about 100 m "fine", about 200 m "very coarse".
- Street spacing **80-110 m** is the best compromise for pedestrians and vehicles; **50-70 m** in intense retail cores.
- In an 800 x 800 m reference area the initial layouts had 110 intersections (Portland), 42 (Chicago), 28 (Melbourne),
  12 (Adelaide), that is about 172, 66, 44 and 19 per km². My Overpass measurement of downtown Portland today gives
  **170 per km²** (measured), a pleasing cross-check.
- Coarse blocks get **refined over time by inserted lanes and arcades**: Perth's 300 m and Melbourne's 200 m blocks now
  have meshes of 46-80 m in their retail cores. This is a growth rule (section 6).
- Lots **15-20 m wide and 30-40 m deep** are good modular CBD units; two lots amalgamate into a squarish 30-40 m parcel.
- Back alleys assist subdivision of deep lots.

### 2.2 Parcel (plot) dimensions (verified)

| Fabric | Frontage | Depth | Frontage:depth |
|---|---|---|---|
| Manhattan standard lot | 20 or 25 ft (6-7.6 m) | 100 ft (30.5 m), half the 200 ft block depth | 1:4 to 1:5 ([MCNY Greatest Grid](https://thegreatestgrid.mcny.org/greatest-grid/selling-lots)) |
| Manhattan 19th c. actual | mostly 20-25 ft, 22-23 ft commonest | | ([Gotham Center](https://www.gothamcenter.org/blog/notes-on-19th-century-lot-sizes)) |
| US Land Ordinance 1785 lots | 60 ft (18 m) | 125 ft (38 m) | about 1:2 ([1811 plan article](https://en.wikipedia.org/wiki/Commissioners%27_Plan_of_1811)) |
| Burgage, Cricklade | 2 perches (10 m) | 12 perches (60 m) | 1:6 ([burgage summary](https://en-academic.com/dic.nsf/enwiki/706769)) |
| Burgage, Charmouth charter 1320 | 4 perches (20 m) | 20 perches (100 m) | 1:5 (same) |
| Burgage, Pershore | 4 perches (20.12 m) | 10 perches (50.29 m) | 1:2.5 ([JSTOR 20001722 snippet](https://www.jstor.org/stable/20001722)) |
| Amsterdam canal ring, 17th c. | 18, then 20-26 Amsterdam feet (5.1-7.3 m; 1 voet = 28.13 cm) | **unverified** | ([nl.wikipedia: Grachtenpand](https://nl.wikipedia.org/wiki/Grachtenpand)) |
| Paris, 18th c. | about 6 m | up to about 40 m | about 1:6.7 ([Haussmann renovation](https://en.wikipedia.org/wiki/Haussmann%27s_renovation_of_Paris)) |
| CBD modular lot (Siksna) | 15-20 m | 30-40 m | 1:2 ([Siksna 1997](https://journal.urbanform.org/index.php/jum/article/download/4048/3359)) |

Two structural regularities matter more than any single number:

- **Plots are integer multiples of a module** (the perch of 5 m in English burgages; 25 ft in Manhattan; a few
  standard widths in Amsterdam, where wealthy owners bought two plots for one double-width house). Metrological
  analysis reconstructs plot histories precisely because of this modularity
  ([Whitehand 2001, Urban Morphology 5(2)](https://journal.urbanform.org/index.php/jum/article/download/3896/3218)).
- **Parcel depth is about half the block depth**: plots run back to back from the two long sides of a block.

### 2.3 Block shape factor of the ideal fabrics (computed)

Louf and Barthelemy's shape factor Φ = block area / area of circumscribed circle (section 5). I computed it for the
idealised geometries above (Appendix B):

| Ideal block | Area | Φ |
|---|---|---|
| Barcelona 113.3 m chamfered (15 m) | 12,387 m² (matches the published 1.24 ha) | 0.80 |
| Any square (Portland, Kyoto chō) | 3,721 m² / 11,881 m² | 0.64 |
| Chandigarh sector 800 x 1200 m | 96 ha | 0.59 |
| Chicago 100 x 200 m | 2.0 ha | 0.51 |
| Manhattan 61 x 244 m | 1.5 ha | 0.30 |
| Burgage plot 10 x 60 m | 600 m² | 0.21 |

Louf and Barthelemy observe Manhattan's fingerprint as "two sharp peaks at Φ ≈ 0.3 and Φ ≈ 0.5", the signature of a
grid ([arXiv 1410.2094](https://arxiv.org/abs/1410.2094)); our 0.30 for the 1811 block agrees.

---

## 3. Conzenian morphology: the plan as a long-lived frame

M. R. G. Conzen's study of Alnwick (1960) founded the British town-plan analysis tradition
([Internet Archive record](https://archive.org/details/alnwicknorthumbe00conz)). Core concepts, as summarised by
Whitehand ([Whitehand 2001](https://journal.urbanform.org/index.php/jum/article/download/3896/3218)):

- **Tripartite urban landscape**: town plan (streets, plots, block plans of buildings), building fabric, land use.
  The plan is the most persistent layer.
- **Plan units**: areas of homogeneous plan character. Alnwick's Old Town kernel alone is "made up of no less than
  nine different major plan-units" ([JSTOR 621094 snippet](https://www.jstor.org/stable/621094)).
- **Burgage cycle**: "the progressive filling-in with buildings of the backland of burgages, terminating in the
  clearing of buildings and a period of urban fallow prior to the initiation of a redevelopment cycle". The phases are
  often named institutive, repletive, climax, recessive and fallow (named in a figure caption on
  [ResearchGate](https://www.researchgate.net/publication/329909014_From_system_ecology_to_urban_morphology_towards_a_theory_of_urban_form_resilience);
  phase names otherwise **unverified** against Conzen's text).
- **Fringe belts**: zones that formed at the edge of the built-up area during slumps or behind fixed obstacles (walls,
  rivers), with "large, contiguous vegetated areas, often interspersed with large, often institutional, sometimes
  landmark buildings", "the virtual absence of housing", "a sparse road network, with a low incidence of radial roads".
  They "form boundary zones between historically and morphologically distinct housing areas". Inner Berlin's fringe
  belts (Louis 1936) are the classic illustration. Residential growth zones alternate with fringe belts.
- **Morphological frame**: "the way in which forms are created on the ground ... acts as a long-term constraint on
  subsequent change. Plot boundaries and especially streets exert a powerful long-term influence. Many streets and
  plots survive largely unchanged."
- **Morphological regions**: the climax of the analysis, dividing the town into regions by genetic history.

Why this matters for us: Conzen gives a **ranking of persistence** (streets > plot boundaries > buildings > uses) and a
**vocabulary for growth** (kernel, accretion rings, fringe belts, infill cycles) that maps directly onto "add files
without reshuffling". Section 7 turns it into rules.

---

## 4. Space syntax: configuration and movement

Space syntax analyses a street network as a graph of axial lines or segments and computes how "deep" each is from all
others ([Wikipedia: Space syntax](https://en.wikipedia.org/wiki/Space_syntax); Hillier and Hanson, *The Social Logic of
Space*, 1984).

- **Integration** (closeness): the fewest street-to-street transitions needed to reach all other streets. Can be
  global or local (for example radius 3 or 4 steps).
- **Choice** (betweenness): how often a segment lies on shortest paths; argued to predict through-traffic.
- Formulas, topological version: mean depth MD = TD / (k - 1); relative asymmetry RA = 2 (MD - 1) / (k - 2);
  real relative asymmetry RRA = RA / D(k) with D(k) = 2 {k [log₂((k + 2) / 3) - 1] + 1} / ((k - 1)(k - 2));
  integration = 1 / RRA ([space-syntax-jgraph METRICS.md](https://github.com/HdMiii/space-syntax-jgraph/blob/main/METRICS.md);
  [Open Context RA definition](https://opencontext.org/predicates/c9df6830-63e6-4118-be4c-6befe31cb890)).
- Size-normalised angular measures (Hillier, Yang and Turner 2012): **NACH = log(ACH + 1) / log(ATD + 3)** and
  **NAIN = NC^1.2 / ATD** ([depthmapQ docs](https://github.com/spatialnous/depthmapQ/blob/main/docs/howdoi.md);
  [paper record](https://discovery.ucl.ac.uk/id/eprint/1389938/)).
- Hillier's empirical generalisation that cities form a **"deformed wheel"**, an integrated core with spokes to the
  edge, and a foreground network of long through-routes over a background of local streets: widely cited, **unverified**
  against the primary text in this pass.
- Criticism exists on axial-map reliability and on curvy streets being split into many lines
  ([Space syntax article](https://en.wikipedia.org/wiki/Space_syntax); Pafka et al. 2020).

Use for us: we generate the road graph ourselves, so we can **compute integration and choice in TypeScript**
(`graphology-metrics` provides betweenness and closeness, MIT,
[graphology metrics](https://github.com/graphology/graphology/tree/master/src/metrics)) and assert that the generator's
intended high street really is the most integrated route. Choice also makes a natural "footfall" or "rent" value for a
Monopoly-like game.

---

## 5. Quantitative typologies: Boeing, Louf and Barthelemy, Lämmer

### 5.1 Boeing: orientation entropy and configuration

[Boeing 2019, *Urban spatial order*, Applied Network Science, arXiv 1808.00600](https://arxiv.org/abs/1808.00600):

- Bearings of every street edge (both directions, undirected graph) in **36 bins of 10°**; Shannon entropy Hₒ in nats.
- Hmax = ln 36 = 3.584 (uniform); Hg = ln 4 = 1.386 (perfect four-way grid).
- **Orientation order φ = 1 - ((Hₒ - Hg) / (Hmax - Hg))²**, 0 = disorder, 1 = single perfect grid.
- Companion indicators: median segment length l̃, average node degree k̄, dead-end share P_de, four-way share P_4w,
  circuity ς = network length / great-circle length.
- φ correlates negatively with circuity (r = -0.43) and dead-ends (r = -0.38), positively with k̄ (r = 0.52) and
  P_4w (r = 0.63).

Selected city-wide values from the paper's table (100 cities, drivable networks):

| City | φ | l̃ (m) | ς | k̄ | P_de | P_4w |
|---|---|---|---|---|---|---|
| Chicago | 0.899 | 105.3 | 1.016 | 3.34 | 0.074 | 0.507 |
| Miami | 0.811 | 96.7 | 1.023 | 3.24 | 0.069 | 0.407 |
| Portland | 0.679 | 82.1 | 1.041 | 3.03 | 0.146 | 0.327 |
| Manhattan | 0.669 | 82.2 | 1.017 | 3.51 | 0.027 | 0.572 |
| Kyoto | 0.357 | 49.6 | 1.090 | 2.89 | 0.134 | 0.157 |
| Barcelona | 0.108 | 78.1 | 1.052 | 3.14 | 0.078 | 0.303 |
| Amsterdam | 0.071 | 65.8 | 1.080 | 2.90 | 0.146 | 0.205 |
| Tokyo | 0.050 | 49.7 | 1.046 | 2.95 | 0.119 | 0.186 |
| Paris | 0.016 | 71.5 | 1.023 | 3.11 | 0.050 | 0.240 |
| London | 0.015 | 70.3 | 1.061 | 2.56 | 0.251 | 0.070 |
| Venice | 0.017 | 23.3 | 1.090 | 2.47 | 0.300 | 0.073 |
| Rome | 0.005 | 73.7 | 1.070 | 2.82 | 0.161 | 0.145 |
| Charlotte | 0.002 | 117.2 | 1.067 | 2.55 | 0.288 | 0.139 |

### 5.2 My own district-scale measurements (measured, Appendix A)

| Sample (about 2-4 km², Charlotte 12, Chandigarh 21) | φ | l̃ (m) | k̄ | P_de | P_4w | ς | intersections/km² |
|---|---|---|---|---|---|---|---|
| Midtown Manhattan | 0.99 | 85 | 3.84 | 0.011 | 0.86 | 1.004 | 68 |
| Kyoto centre (Heian grid) | 0.98 | 102 | 3.59 | 0.038 | 0.65 | 1.004 | 91 |
| Portland downtown | 0.83 | 80 | 3.80 | 0.008 | 0.79 | 1.037 | 170 |
| Chandigarh sectors | 0.72 | 57 | 2.85 | 0.126 | 0.11 | 1.028 | 134 |
| Barcelona Eixample | 0.66 * | 117 | 3.59 | 0.027 | 0.61 | 1.006 | 110 |
| Amsterdam canal ring | 0.20 | 84 | 3.33 | 0.069 | 0.42 | 1.045 | 106 |
| Paris Étoile | 0.08 | 81 | 3.26 | 0.022 | 0.28 | 1.021 | 123 |
| Tokyo Yanaka | 0.07 | 53 | 3.00 | 0.104 | 0.21 | 1.048 | 159 |
| Charlotte suburb | 0.03 | 69 | 2.71 | 0.214 | 0.14 | 1.073 | 66 |

\* The Eixample grid runs at about 45°, exactly on a bin boundary of the 10° histogram, so its entropy is inflated.
Orientation entropy is **bin-alignment sensitive**; rotating to the dominant bearing first (or using a circular kernel)
would fix this. Boeing's method has the same property.

**The key insight**: φ is scale dependent. Manhattan 0.67 city-wide vs 0.99 in Midtown; Kyoto 0.36 vs 0.98; Portland
0.68 vs 0.83; Barcelona 0.11 vs 0.66. **A recognisable city is a mosaic of internally coherent districts, each with
its own grain and orientation, stitched together by irregular arterials and seams.** That is our generator's central
rule (section 7).

Other signals visible in the table:

- Grids: k̄ ≥ 3.5, P_4w ≥ 0.6, P_de ≤ 0.04, ς ≤ 1.01.
- Organic and medieval: k̄ ≈ 3.0, P_4w ≈ 0.2, P_de ≈ 0.1, l̃ ≈ 50 m, ς ≈ 1.05.
- Suburban cellular: k̄ < 2.8, P_de > 0.2, ς > 1.07, low intersection density.
- Radial-baroque (Étoile): low φ but few dead-ends and moderate k̄, the "planned but not gridded" signature.
- Chandigarh shows a **low P_4w with high φ**: orthogonal but T-junction-heavy sector interiors with cul-de-sacs.

### 5.3 Louf and Barthelemy: blocks as fingerprints

[Louf and Barthelemy 2014, *A typology of street patterns*, J. R. Soc. Interface 11: 20140924, arXiv 1410.2094](https://arxiv.org/abs/1410.2094):

- Use **blocks** (faces of the planar street graph) rather than streets. Shape factor **Φ = A / A_C**, A_C the
  circumscribed circle's area.
- Fingerprint = conditional distribution P(Φ | A) in two area bins: 10³-10⁴ m² and 10⁴-10⁵ m² (smaller and larger
  blocks ignored). Distance between cities = sum over bins of squared L1 distance between distributions; hierarchical
  clustering over **131 cities**.
- Four groups: (1) Buenos Aires alone, medium blocks, squares and regular rectangles; (2) Athens and similar, dominant
  small blocks with broad shapes; (3) the large majority (77.5 % of cities), various shapes with medium blocks,
  including all European cities except Athens; (4) Mogadishu, small square blocks with some small rectangles.
- Manhattan's fingerprint has peaks at Φ ≈ 0.3 and 0.5 (grid signature); New York's boroughs differ from each other.

### 5.4 Block area distribution

Lämmer, Gehlsen and Helbing analysed the 20 largest German cities: the distribution of cell (block) areas is scale
invariant, a power law with exponents of about **1.9-2.1** across cities (values 1.90-2.09 in their table), and traffic
concentrates on a small fraction of roads with a power-law flow distribution
([arXiv physics/0603257](https://arxiv.org/abs/physics/0603257)).

Proposal: our generated block areas should be heavy-tailed (many small, few large), not uniform, to read as "real".

---

## 6. Recognisability and representation: Lynch and Nolli

### 6.1 Kevin Lynch, *The Image of the City* (1960)

People's mental maps consist of five elements ([Wikipedia summary](https://en.wikipedia.org/wiki/The_Image_of_the_City)):

| Element | Lynch's meaning | Proposal: ground-plan counterpart |
|---|---|---|
| Paths | channels of movement: streets, canals, railways | arterial and collector network; one memorable "high street" per district |
| Edges | boundaries, real or perceived: shorelines, walls, overpasses | rivers, rail lines, parks and fringe belts between top-level areas |
| Districts | medium-large areas with a common character one enters | top-level and second-level folders, each with one consistent fabric (grain, orientation, block shape) |
| Nodes | strategic points, junctions, squares | plazas at arterial junctions and district entrances; the city centre |
| Landmarks | external reference points, unique in context | reserved landmark parcels (later: README, entry points, manifests), placed on axes and at nodes |

Lynch's remark that "the most successful node seemed both to be unique in some way and at the same time to intensify
some surrounding characteristic" (same source) is a good design test for plazas.

### 6.2 Nolli's figure-ground

Giambattista Nolli's 1748 *Pianta Grande di Roma* used figure-ground (built mass dark), but innovated by showing
**enclosed public spaces** such as the Pantheon interior and colonnades as open civic space, and oriented the map to
magnetic north ([Wikipedia: Giambattista Nolli](https://en.wikipedia.org/wiki/Giambattista_Nolli)).

Proposal: a Nolli-style 2D view (parcels and blocks as solid, streets and plazas as void, public interiors carved out)
is the clearest way to make the ground plan legible before any building exists, and it scales from hamlet to metropolis.

---

## 7. How cities grow

| Process | Evidence | What it means for the generator |
|---|---|---|
| Densification then exploration | 200 years of road growth north of Milan: growth is "densification" around existing centres and "exploration" at the urbanisation front; cell shapes homogenise; **high-centrality roads stay stable** and form the backbone ([Strano et al. 2012, arXiv 1203.0300](https://arxiv.org/abs/1203.0300)) | Small changes densify inside existing blocks; only large growth explores outward; arterials never move |
| Local optimisation | A simple local-optimisation model reproduces empirical street statistics without global design ([Barthelemy and Flammini 2008, arXiv 0708.4360](https://arxiv.org/abs/0708.4360)) | Organic districts can be grown by local rules, deterministically seeded |
| Burgage cycle | backland infill, then clearance and fallow, then redevelopment ([Whitehand 2001](https://journal.urbanform.org/index.php/jum/article/download/3896/3218)) | Parcels fill from the frontage backwards; deletions leave fallow parcels, not collapse |
| Plot splitting and amalgamation | modular plots (perch, 25 ft, Amsterdam widths), double houses on two plots ([Grachtenpand](https://nl.wikipedia.org/wiki/Grachtenpand)) | Parcels are integer multiples of a frontage module; growth splits or merges modules |
| Lane insertion | coarse CBD blocks refined to 46-80 m meshes by alleys and arcades ([Siksna 1997](https://journal.urbanform.org/index.php/jum/article/download/4048/3359)) | When a block is over capacity, insert an alley through it before touching neighbours |
| Fringe belts | belts of parks and institutions between growth phases ([Whitehand 2001](https://journal.urbanform.org/index.php/jum/article/download/3896/3218)) | Reserve green belts around districts as growth slack and visual edges |
| Ribbon development | building along routes radiating from a settlement ([Ribbon development](https://en.wikipedia.org/wiki/Ribbon_development)) | Small or fast-growing areas first line an approach road |
| Accretion rings and zones | Burgess concentric zones 1925, Hoyt sectors 1939, Harris and Ullman multiple nuclei 1945 ([Concentric zone model](https://en.wikipedia.org/wiki/Concentric_zone_model); [Multiple nuclei model](https://en.wikipedia.org/wiki/Multiple_nuclei_model)) | Single-root repos grow in rings; monorepos are multi-nuclear |
| Addressing that survives splits | Japanese lot numbers (banchi) get an extension (edaban) when a plot is divided; addresses are by block, not street ([Japanese addressing system](https://en.wikipedia.org/wiki/Japanese_addressing_system)); Heian-kyō addresses read like paths: "Right Capital, Fifth jō, Second bō, Fourteenth chō" ([Heian-kyō](https://en.wikipedia.org/wiki/Heian-ky%C5%8D)) | Parcel IDs derive from the folder path; a split parcel keeps its ID plus a suffix |

---

## 8. Extracting metrics ourselves, without Python

### 8.1 Data sources

- **Overpass API** (OSM): query by bounding box, `out body; >; out skel qt;` gives ways with node IDs, enough to build a
  topological graph. Fair use: under 10,000 queries and 1 GB per day for one-off use; divide by 100 for anything
  regular; identify yourself with a User-Agent ([OSM wiki: Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API)).
  Reliability in practice: during this research the main instance returned 504 and two mirrors returned 500 for about
  half my requests; **cache every response** and prefer extracts for bulk work.
- **Boeing's global indicators**: street network models and indicators for 8,914 urban areas in 178 countries, 160
  million nodes, public on Harvard Dataverse ([publication page](https://geoffboeing.com/publications/street-network-models-indicators-world/));
  the workflow repo is MIT and has been refreshed (Boeing 2026, EPB) ([gboeing/street-network-models](https://github.com/gboeing/street-network-models)).
  Indicators arrive as tables we can read in TypeScript directly. Data licence: OSM-derived, so ODbL obligations very
  likely apply (**unverified** on the Dataverse record).
- **Geofabrik-style PBF extracts** with an npm PBF parser (`osm-pbf-parser` 2.3.0, "MIT and LGPL" per npm) for bulk.

### 8.2 TypeScript toolchain (versions checked on npm today)

- `graphology-metrics` 2.4.2 (MIT): betweenness, closeness for integration and choice.
- `@turf/turf` 7.4.0 (MIT): geodesic lengths, bearings, polygon areas, polygonize for blocks.
- `osmtogeojson` 3.0.0-beta.5 (MIT): Overpass JSON to GeoJSON.
- `d3-delaunay` 6.0.4 (ISC): Voronoi for organic district seeding.
- Reference only (Python, not to be run): `momepy` (BSD-3-Clause), "Urban Morphology Measuring Toolkit"
  ([pysal/momepy](https://github.com/pysal/momepy)), and OSMnx, whose definitions we mirror.

### 8.3 Pipeline (implemented in Appendix A for street metrics)

1. Fetch drivable ways in a bbox; build an undirected adjacency over node IDs.
2. Simplify: keep nodes of degree ≠ 2 (intersections, dead-ends); walk chains between them to get segment length.
3. Ignore nodes in an outer 10 % margin to reduce bbox clipping artefacts.
4. Bearings of segment end-to-end chords, both directions, 36 bins; Hₒ and φ as in Boeing.
5. k̄, P_de, P_4w, median segment length, circuity, intersection density, class length shares.
6. Blocks (not yet implemented): planar face traversal of the simplified graph (sort neighbours by angle, follow
   "next edge clockwise"), drop the outer face, compute area and circumscribed circle (smallest enclosing circle,
   Welzl) to get Φ and P(Φ | A).
7. Integration and choice: build the segment (dual) graph and run closeness and betweenness.

The same code runs unchanged on **our generated maps**, which is the real payoff: metrics become regression tests.

---

## 9. Scaled-down rules for the generator

All of this section is **proposal**, derived from the verified numbers above. Unit: **u = one local street width**.
Real local streets are 12-20 m (Kyoto 12, Goerck 15, Manhattan 18, Barcelona 20), so 1 u ≈ 16 m for intuition.

### 9.1 Road widths by level

Real ratios range 1:1.5 (Barcelona collector), 1:1.67 (Manhattan avenue), 1:2 (Salt Lake), 1:3 (Barcelona major) to
1:7 (Heian ceremonial axis). A geometric progression of about 1.6 fits:

| Level | Width | Role |
|---|---|---|
| Lane / alley / footpath | 0.5 u | inserted through over-full blocks; pedestrian shortcuts |
| Local street | 1 u | parcel frontage |
| Collector / sector road | 1.6 u | bounds neighbourhood units; carries the district's high street |
| Arterial / avenue | 2.5 u | between districts; the "foreground network" |
| Boulevard / highway / ceremonial axis | 4 u (up to 7 u for one civic axis) | between nuclei in polycentric cities; one per city at most for the axis |

Length shares to aim for in residential fabric: local 65-75 %, collectors 10-15 %, arterials and above 10-20 %
(FHWA ranges and section 1.2).

### 9.2 Blocks

- Short side 3-9 u (50-140 m). Default 5-7 u (Siksna's 80-110 m optimum); 3-4 u in dense "core" districts.
- Long side 1-4x short side by fabric: square (Portland, Kyoto, Φ ≈ 0.64), 2:1 (Chicago, Φ ≈ 0.51), 4:1 (Manhattan,
  Φ ≈ 0.30), chamfered square (Barcelona, Φ ≈ 0.80).
- Neighbourhood unit (between collectors): 3-8 blocks across, cf. Barcelona superilla 3 x 3, Heian bō 4 x 4,
  Chandigarh 800 x 1200 m, Milton Keynes about 1 km.
- Area distribution across the city heavy-tailed (power law exponent about 2, Lämmer et al.).

### 9.3 Parcels

- Frontage module m ≈ 0.35-0.5 u (5-8 m; perch 5 m, 25 ft, Amsterdam 5.1-7.3 m). Parcel frontage = k * m, k ∈ {1, 2, 3, 4}.
- Depth = half the block depth (back-to-back plots), giving frontage:depth 1:2 (core, CBD) to 1:6 (historic, burgage).
- Corner parcels get both frontages; in chamfered fabrics the corner is the plaza seed.
- Parcels fill from the frontage backwards (burgage repletion), so backland is the growth reserve.

### 9.4 Edges and district boundaries

- Every top-level boundary is a Lynch edge of a type chosen by the strength of the separation:
  - **Water** (river, canal ring, harbour): strongest; crossing only by bridges, which become nodes.
  - **Rail or highway**: medium; few crossings.
  - **Fringe belt** (park, institutional campus, sparse roads): softest and the default; doubles as growth reserve.
- Districts differ visibly: each picks its own orientation, block shape and grain within its archetype, so the city
  is the mosaic seen in section 5.2 (district φ high, city φ low).

### 9.5 Growth and stability rules

1. **Frame first, frozen**: arterials and district outlines come only from the top one or two folder levels, laid out
   in a stable order (path-name hash, never size rank). Small changes cannot move them (Conzen's frame, Strano's
   stable backbone).
2. **Quantised capacity with slack**: each block and district reserves capacity in module steps. Growth first fills
   vacant parcels and backland, then splits parcels (suffix IDs), then inserts an alley, then consumes the adjacent
   fringe belt. Only after that does exploration add a new ring or ribbon at the urban front.
3. **Hysteresis**: geometry changes only when a threshold is crossed upward by a margin and downward by a larger margin,
   so a file added and removed does not oscillate the map.
4. **Deletion leaves fallow**: removed files leave vacant parcels; compaction happens only on an explicit
   "redevelopment" or an archetype change, and can be shown as a construction site.
5. **Accretion has a visible history**: each growth ring is separated by a thin fringe belt, so old and new areas are
   readable (useful for strangler-pattern views).
6. **Addresses are paths**: Heian-style hierarchical block-lot addresses from the folder path; splits append a suffix
   (Japanese edaban), so an address never changes once issued.

---

## 10. Archetypes and their measurable signatures

Signatures combine section 5 numbers. "Repo signal" is **proposal** with thresholds to be tuned; it should be
computed with hysteresis so the archetype only flips on a real change of shape.

| Archetype | Real exemplars | Street signature | Block signature | Repo signal (proposal) |
|---|---|---|---|---|
| Hamlet: street village or green | ribbon villages, courtyards | one or two streets, many dead-ends, k̄ < 2.5 | few large irregular plots | under ~50 files, ≤ 3 folders |
| Radial-concentric | Paris Étoile, walled towns with rings, Burgess zones | low φ (< 0.1) but low P_de (< 0.03), star junctions | wedge and trapezoid blocks, Φ 0.4-0.6, rings of fringe belts | one dominant root (for example `src/` holds most code), moderate depth |
| Gridiron | Manhattan, Chicago, Portland, Kyoto, Eixample | district φ > 0.8, k̄ ≥ 3.5, P_4w ≥ 0.6, ς ≈ 1.00 | Φ peaks at 0.3-0.64 (or 0.8 chamfered), uniform areas | many sibling folders of similar size (low size inequality), shallow |
| Organic / medieval | Siena, Tokyo Yanaka, Amsterdam centre | φ < 0.2, k̄ ≈ 3.0, P_4w ≈ 0.2, P_de ≈ 0.1, l̃ ≈ 50 m | broad Φ, small blocks (Louf-Barthelemy group 2/3) | deep, irregular trees with skewed sizes |
| Cellular suburban | Radburn, Charlotte, Chandigarh interiors | k̄ < 2.8, P_de > 0.12, low P_4w, ς > 1.05 | large superblocks with cul-de-sac interiors | many leaf-heavy folders with few cross-links (later: low import coupling) |
| Polycentric / archipelago | Milton Keynes grid squares, multiple-nuclei cities | arterial grid of 1 km cells or bridges between islands; each nucleus its own fabric | mixed | `apps/` + `packages/` or workspaces; several heavy top-level roots |

The generator should **compute these metrics on its own output** and assert they fall inside the archetype's band:
that is our test oracle for "looks like a real city of type X".

---

## 11. Ranked recommendation for the project

1. **Adopt "mosaic of coherent districts" as the core model.** Each district has one fabric (grain, orientation, block
   shape); the city-wide plan is irregular arterials and edges between them. This is the single strongest empirical
   finding (section 5.2) and it also localises change, which serves stability.
2. **Build a persistence-ranked layout (Conzen) with explicit slack.** Frame (arterials, edges) from top levels only,
   stable ordering by path hash, quantised capacity, fringe-belt reserves, densify-before-explore growth, fallow on
   deletion, hysteresis on archetype choice. Path-derived, suffix-on-split addresses.
3. **Use real dimensions as ratios in local-street units**: widths 0.5/1/1.6/2.5/4 u, blocks 3-9 u short side and
   1-4:1 aspect, parcels module 0.35-0.5 u with frontage:depth 1:2 to 1:6, neighbourhood units 3-8 blocks.
4. **Ship a TypeScript morphometrics module from day one** (Appendix A extended with blocks, Φ, NAIN/NACH) and run it
   in tests against generated maps, with archetype bands from section 10. Calibrate the bands against Boeing's open
   indicator tables rather than live Overpass calls.
5. **Render the ground plan Nolli-style first**, with Lynch's five elements as a recognisability checklist (one high
   street per district, typed edges, plazas at nodes, reserved landmark parcels on axes).
6. **Choose archetypes from repo-shape signals** (section 10), starting with three: hamlet, gridiron-mosaic and
   polycentric archipelago; add radial and organic once the frame and growth rules are proven.

## 12. Open questions for the owner

1. Which folder levels form the frozen frame: top level only, or top two levels (for example `packages/*`)?
2. What may change on a small edit: parcel contents only, or also block subdivision and alleys? Is a visible
   "construction site" or fallow parcel acceptable for deletions?
3. Should edges carry meaning (water between workspaces, rail for generated or vendored code, parks for docs and tests),
   or stay purely aesthetic?
4. Is a single real-world look preferred (for example European mosaic) or should archetypes deliberately evoke
   different cities (Manhattan grid, Amsterdam rings, Kyoto chō)?
5. Is orientation free per district (more realism) or locked to a few angles for isometric rendering, where 45° steps
   read best?
6. May map units relate to code size (parcel area from lines of code), or is parcel size quantised regardless, with size
   shown only by buildings later?
7. Do you want calibration against Boeing's global dataset (ODbL obligations to confirm), or a curated handful of
   reference cities?

---

## Appendix A: metric extraction script (Bun, TypeScript)

Run: `bun metrics.ts <name> <south,west,north,east>`. Caches responses in `osm/`.
Set `OVP` to choose an Overpass endpoint. This is a tidied version (same logic, reformatted output) of the script that produced sections 5.2 and 1.2.

```ts
const [name, bboxStr] = process.argv.slice(2);
const [s, w, n, e] = bboxStr.split(',').map(Number);
const cache = `osm/${name}.json`;
let data: any;
if (await Bun.file(cache).exists()) data = await Bun.file(cache).json();
else {
  const q = `[out:json][timeout:120];way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link)$"](${s},${w},${n},${e});out body;>;out skel qt;`;
  const r = await fetch(process.env.OVP ?? 'https://overpass-api.de/api/interpreter', {
    method: 'POST', body: 'data=' + encodeURIComponent(q),
    headers: { 'user-agent': 'citymap-research/0.1', 'content-type': 'application/x-www-form-urlencoded' },
  });
  if (!r.ok) { console.error('overpass', r.status); process.exit(1); }
  data = await r.json(); await Bun.write(cache, JSON.stringify(data));
}
const nodes = new Map<number, [number, number]>(); const ways: any[] = [];
for (const el of data.elements) el.type === 'node' ? nodes.set(el.id, [el.lat, el.lon]) : ways.push(el);
const R = 6371000, rad = (d: number) => d * Math.PI / 180;
const dist = (a: [number, number], b: [number, number]) => {
  const x = Math.sin(rad(b[0] - a[0]) / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(rad(b[1] - a[1]) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
};
const bearing = (a: [number, number], b: [number, number]) => {
  const y = Math.sin(rad(b[1] - a[1])) * Math.cos(rad(b[0]));
  const x = Math.cos(rad(a[0])) * Math.sin(rad(b[0])) - Math.sin(rad(a[0])) * Math.cos(rad(b[0])) * Math.cos(rad(b[1] - a[1]));
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
};
const adj = new Map<number, Set<number>>(); const lenByClass: Record<string, number> = {};
for (const wy of ways) {
  const cls = wy.tags.highway.replace('_link', '');
  for (let i = 1; i < wy.nodes.length; i++) {
    const a = wy.nodes[i - 1], b = wy.nodes[i], pa = nodes.get(a), pb = nodes.get(b);
    if (!pa || !pb) continue;
    lenByClass[cls] = (lenByClass[cls] ?? 0) + dist(pa, pb);
    if (!adj.has(a)) adj.set(a, new Set()); if (!adj.has(b)) adj.set(b, new Set());
    adj.get(a)!.add(b); adj.get(b)!.add(a);
  }
}
const isKey = (id: number) => adj.get(id)!.size !== 2;
const inner = (p: [number, number]) => {
  const mh = (n - s) * 0.1, mw = (e - w) * 0.1;
  return p[0] > s + mh && p[0] < n - mh && p[1] > w + mw && p[1] < e - mw;
};
const seen = new Set<string>(); const segLens: number[] = []; const bins = new Array(36).fill(0);
let circNum = 0, circDen = 0;
for (const [id] of adj) {
  if (!isKey(id)) continue;
  for (const nb of adj.get(id)!) {
    let prev = id, cur = nb, L = dist(nodes.get(prev)!, nodes.get(cur)!);
    while (!isKey(cur)) {
      const nx = [...adj.get(cur)!].find(x => x !== prev)!;
      L += dist(nodes.get(cur)!, nodes.get(nx)!); prev = cur; cur = nx; if (cur === id) break;
    }
    const key = id < cur ? `${id}-${cur}-${L.toFixed(1)}` : `${cur}-${id}-${L.toFixed(1)}`;
    if (seen.has(key)) continue; seen.add(key);
    const pa = nodes.get(id)!, pb = nodes.get(cur)!;
    if (!(inner(pa) || inner(pb))) continue;
    segLens.push(L); const gc = dist(pa, pb);
    if (gc > 1) {
      circNum += L; circDen += gc;
      const b1 = bearing(pa, pb);
      for (const b of [b1, (b1 + 180) % 360]) bins[Math.floor(((b + 5) % 360) / 10)]++;
    }
  }
}
const tot = bins.reduce((a, b) => a + b, 0); let H = 0;
for (const c of bins) if (c) { const p = c / tot; H -= p * Math.log(p); }
const phi = 1 - ((H - Math.log(4)) / (Math.log(36) - Math.log(4))) ** 2;
let k = 0, cnt = 0, de = 0, fw = 0;
for (const [id, set] of adj) {
  if (!isKey(id) || !inner(nodes.get(id)!)) continue;
  cnt++; k += set.size; if (set.size === 1) de++; if (set.size >= 4) fw++;
}
segLens.sort((a, b) => a - b);
const totLen = Object.values(lenByClass).reduce((a, b) => a + b, 0);
const areaKm2 = dist([s, w], [n, w]) / 1000 * dist([s, w], [s, e]) / 1000;
console.log(JSON.stringify({
  name, H: +H.toFixed(3), phi: +phi.toFixed(3), medianSegM: +segLens[segLens.length >> 1].toFixed(1),
  kAvg: +(k / cnt).toFixed(2), Pde: +(de / cnt).toFixed(3), P4w: +(fw / cnt).toFixed(3),
  circuity: +(circNum / circDen).toFixed(3),
  intersectionsPerKm2: Math.round((cnt - de) / (areaKm2 * 0.64)), // inner 80 % x 80 % window
  shares: Object.fromEntries(Object.entries(lenByClass).map(([c, l]) => [c, Math.round(100 * l / totLen)])),
}));
```

Bounding boxes used (south, west, north, east): Midtown Manhattan 40.748,-73.995,40.765,-73.970; Barcelona Eixample
41.385,2.150,41.400,2.172; Portland 45.512,-122.690,45.527,-122.672; Amsterdam 52.362,4.877,52.378,4.900; Kyoto
35.000,135.750,35.015,135.770; Tokyo Yanaka 35.718,139.760,35.733,139.778; Paris Étoile 48.866,2.282,48.881,2.305;
Chandigarh 30.720,76.760,30.760,76.810; Charlotte suburb 35.030,-80.870,35.060,-80.830. Siena and Milton Keynes failed
repeatedly on all public Overpass instances and are not reported.

Known limitations: dual carriageways inflate k̄ and P_4w; OSM class tags vary by country; the 10 % margin only partly
removes clipping artefacts; orientation bins are not rotated to the dominant bearing.

## Appendix B: shape factor of ideal blocks

```ts
const rect = (a: number, b: number) => (a * b) / (Math.PI * (a * a + b * b) / 4);
const chamfered = (side: number, leg: number) => {
  const area = side * side - 2 * leg * leg;           // four corner triangles of leg²/2
  const r = Math.hypot(side / 2, side / 2 - leg);      // farthest vertex from centre
  return area / (Math.PI * r * r);
};
// rect(61, 244) = 0.300; rect(100, 200) = 0.509; rect(61, 61) = 0.637; chamfered(113.3, 15) = 0.798
```

---

## Sources

- Boeing, G. (2019) Urban spatial order: street network orientation, configuration, and entropy. https://arxiv.org/abs/1808.00600 (PDF https://arxiv.org/pdf/1808.00600v3)
- Boeing, G. Street network models and indicators for every urban area in the world. https://geoffboeing.com/publications/street-network-models-indicators-world/
- gboeing/street-network-models (MIT). https://github.com/gboeing/street-network-models
- Louf, R. and Barthelemy, M. (2014) A typology of street patterns. https://arxiv.org/abs/1410.2094
- Lämmer, S., Gehlsen, B. and Helbing, D. (2006) Scaling laws in the spatial structure of urban road networks. https://arxiv.org/abs/physics/0603257
- Strano, E. et al. (2012) Elementary processes governing the evolution of road networks. https://arxiv.org/abs/1203.0300
- Barthelemy, M. and Flammini, A. (2008) Modeling urban street patterns. https://arxiv.org/abs/0708.4360
- Siksna, A. (1997) The evolution of block size and form in North American and Australian city centres. https://journal.urbanform.org/index.php/jum/article/view/4048 (PDF https://journal.urbanform.org/index.php/jum/article/download/4048/3359)
- Whitehand, J. W. R. (2001) British urban morphology: the Conzenian tradition. https://journal.urbanform.org/index.php/jum/article/download/3896/3218
- Conzen, M. R. G. (1960) Alnwick, Northumberland: a study in town-plan analysis. https://archive.org/details/alnwicknorthumbe00conz ; https://www.jstor.org/stable/621094
- Burgage plot metrology (Pershore). https://www.jstor.org/stable/20001722
- Burgage summary (Cricklade, Charmouth). https://en-academic.com/dic.nsf/enwiki/706769 ; https://en.wikipedia.org/wiki/Burgage
- Burgage cycle figure caption. https://www.researchgate.net/publication/329909014_From_system_ecology_to_urban_morphology_towards_a_theory_of_urban_form_resilience
- Space syntax. https://en.wikipedia.org/wiki/Space_syntax
- Space syntax RA/RRA/integration formulas. https://github.com/HdMiii/space-syntax-jgraph/blob/main/METRICS.md ; https://opencontext.org/predicates/c9df6830-63e6-4118-be4c-6befe31cb890
- Hillier, Yang and Turner (2012) Normalising least angle choice in Depthmap. https://discovery.ucl.ac.uk/id/eprint/1389938/ ; formulas via https://github.com/spatialnous/depthmapQ/blob/main/docs/howdoi.md
- Lynch, K. (1960) The Image of the City (summary). https://en.wikipedia.org/wiki/The_Image_of_the_City
- Giambattista Nolli. https://en.wikipedia.org/wiki/Giambattista_Nolli
- Commissioners' Plan of 1811. https://en.wikipedia.org/wiki/Commissioners%27_Plan_of_1811
- MCNY, The Greatest Grid: selling lots. https://thegreatestgrid.mcny.org/greatest-grid/selling-lots
- Gotham Center, Notes on 19th-century lot sizes. https://www.gothamcenter.org/blog/notes-on-19th-century-lot-sizes
- City block. https://en.wikipedia.org/wiki/City_block
- Cerdà Plan. https://en.wikipedia.org/wiki/Cerd%C3%A0_Plan ; Eixample. https://en.wikipedia.org/wiki/Eixample
- Heian-kyō. https://en.wikipedia.org/wiki/Heian-ky%C5%8D
- Japanese addressing system. https://en.wikipedia.org/wiki/Japanese_addressing_system
- Grachtengordel (nl). https://nl.wikipedia.org/wiki/Grachtengordel_(Amsterdam) ; Grachtenpand (nl). https://nl.wikipedia.org/wiki/Grachtenpand
- Haussmann's renovation of Paris. https://en.wikipedia.org/wiki/Haussmann%27s_renovation_of_Paris ; Boulevard Haussmann width (secondary). https://www.boulevard-haussmann-de-paris.com/history
- Chandigarh. https://en.wikipedia.org/wiki/Chandigarh ; https://chandigarh.gov.in/le-corbusiers-master-plan ; https://urbanplanning.chd.gov.in/index.php/home/page/3 ; https://www.fondationlecorbusier.fr/en/work-architecture/projects-capitol-chandigarh-india-1950-1965/
- Milton Keynes. https://en.wikipedia.org/wiki/Milton_Keynes
- Radburn, New Jersey. https://en.wikipedia.org/wiki/Radburn,_New_Jersey ; Cul-de-sac. https://en.wikipedia.org/wiki/Cul-de-sac ; Fused grid. https://en.wikipedia.org/wiki/Fused_grid
- Hierarchy of roads. https://en.wikipedia.org/wiki/Hierarchy_of_roads
- FHWA Highway Functional Classification Concepts, section 3. https://www.fhwa.dot.gov/planning/processes/statewide/related/highway_functional_classifications/section03.cfm
- Concentric zone model. https://en.wikipedia.org/wiki/Concentric_zone_model ; Multiple nuclei model. https://en.wikipedia.org/wiki/Multiple_nuclei_model ; Ribbon development. https://en.wikipedia.org/wiki/Ribbon_development
- Overpass API and usage policy. https://wiki.openstreetmap.org/wiki/Overpass_API
- npm: graphology-metrics https://github.com/graphology/graphology/tree/master/src/metrics ; @turf/turf, osmtogeojson, d3-delaunay, osm-pbf-parser via https://registry.npmjs.org/
- momepy (reference only). https://github.com/pysal/momepy
- Marshall, S. (2004) Streets and Patterns, doi:10.4324/9780203589397 (cited for completeness; its ABCD typology was not verified in this pass).
