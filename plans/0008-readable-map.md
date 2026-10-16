# Plan 0008: a map that explains itself

Plan view only, hover cards that say what things are and never cut their text, and cleaner names. Spec:
[viewer](../docs/specs/004-interface-design/viewer.md) (Layout, Map, Hover and select). Blueprint:
[viewer blueprint](../docs/specs/004-interface-design/blueprints/viewer.md).

## Phase 1: spec and blueprint

- [x] Spec: plan view only, the hover card's shape, contents and long text, the selection's actions, the legend's words,
      repeated names without regard to case, the status that wraps
- [x] Blueprint: the card's components and their rows per hit kind, the words for every land use, block kind, road class
      and town form; placement by measured size; the hit's new fields; the address in words; defaults and completeness
- [x] Research the address format (street, side, index) and the counts a card needs (files per folder, documents per
      park, the towns a highway joins); decide which the pick index carries and which the card derives

## Phase 2: plan view only

- [x] Remove the view switch from the viewer (tests first: no "3D" control; the map stays plan); keep `basis` and `fit`
      for plan; drop the dimetric camera from the web app where nothing else uses it
- [x] End-to-end and vitals journeys without the switch; README and spec pictures without "3D"

## Phase 3: what a hit knows

- [x] `Hit` gains what the cards need: the lot's folder path and its file count, a park's folder and its documents, a
      highway's towns, a town's form, lots and districts (tests first, in `packages/scene`)
- [x] Pick index budget held: next.js about 8,000 lots indexes in under 50 ms, linux about 75,000 in under 500 ms

## Phase 4: the card

- [x] `describeHit` returns a title, an icon, a place line and labelled rows, no repeats (tests first, one per kind,
      including the park of a folder named "Documentation")
- [x] `HoverCard`: 280 to 360 px, wraps every text, paths break after slashes; placed by its measured size, flipped and
      nudged inside the map; never under the pointer (tests for long paths at every edge)
- [x] Drawer's "Selected" uses the same rows, plus "Copy path" and "Open on GitHub" for a city from GitHub
- [x] Legend in the same words
- [x] Title card status wraps to two lines, never truncated

## Phase 5: names

- [x] `declutter`'s repeat rule compares names without regard to case (test: `NET` then `net` within reach)

## Phase 6: proof

- [x] Unit tests at 100 %; `bun run check`
- [x] End-to-end: cards at all four map edges with a long path (none clipped, all inside the map), axe light and dark
      with a card shown, vitals, card overlap at every width
- [x] Screenshots of each card kind, light and dark, on linux and takken.io

## Phase 7: ship

- [x] Fold-back: spec and blueprint match what shipped; every symbol and reference verified
- [ ] PR with before and after pictures, CI green, squash-merge, Pages verified, `~/PR_RESULTS.md`
