# Plan 0004: the floating atlas

Rework the viewer's interface into the floating atlas, following the system's light or dark scheme. Spec:
[viewer](../docs/specs/004-interface-design/viewer.md) (Layout, Search, Light and dark, Design rules, Map). Blueprint:
[viewer blueprint](../docs/specs/004-interface-design/blueprints/viewer.md) (Floating atlas, Labels).

## Phase 1: plan view first

- [x] Plan view is the default (spec, ground-plan spec, unit and end-to-end tests)

## Phase 2: spec and blueprint

- [x] Spec: layout, search, light and dark, design rules, labels
- [x] Blueprint: floating atlas, labels, observability, constants; defaults and completeness

## Phase 3: labels

- [x] `Label.extent` in `packages/scene`, tested
- [x] `declutter`: fit to land and no repeated names nearby, tested

## Phase 4: search

- [x] `src/search/search.ts`: `searchIndex` and `search`, tested
- [x] `src/view/fly.ts`: the view to fly to, and the eased step, tested

## Phase 5: the interface

- [x] Dependencies: Inter and lucide-react at their latest versions
- [x] Stylesheet: scheme variables, glass, sizes, layers, reduced motion, phone layout
- [x] `TitleCard`, `SearchBox`, `ViewControls`, `Drawer`, `ZoomControls`, `Legend`, `Notice`, tested
- [x] `Viewer` composes them; `TopBar` and `CityPanel` removed
- [x] Logs: `viewer/search`, `viewer/search-pick`, `viewer/drawer`

## Phase 6: proof

- [x] Unit tests at 100 % coverage; `bun run check`
- [ ] End-to-end: journeys, axe in light and dark, vitals, phone layout
- [ ] Screenshots: desktop and phone, light and dark, search open
- [ ] README pictures and text updated

## Phase 7: ship

- [ ] Fold-back: spec and blueprint match what shipped; every symbol and reference verified
- [ ] PR with pictures, CI green, squash-merge, Pages verified, `~/PR_RESULTS.md`
