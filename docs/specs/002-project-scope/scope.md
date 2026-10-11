# Scope

## Features

The first deliverable is the **ground plan**: the city without buildings, as defined in
[ground plan](../006-ground-plan/ground-plan.md).

- **Input**: a git repository, read as its first-parent history plus its current tree.
- **Ground plan**: districts, streets, blocks, lots, islands, water, parks and plazas, derived deterministically.
- **Stability**: the plan is folded over history, so each commit changes the city only where the commit changed the
  tree.
- **Archetypes**: each folder picks an urban form and a tier from its shape, with hysteresis.
- **Rendering**: one 3D scene in Three.js with an orthographic camera (2:1 dimetric by default, plan view on demand) in
  the Paper atlas style, plus SVG export from the same model. Themes: Paper atlas, Night atlas, Beck schematic, Nolli
  noir and Dracula. Desktop and phones.
- **Land dimension**: tests off the map (default) or tests as land.
- **Morphometrics**: the generator measures its own output (orientation entropy, node degree, dead-end share, block
  shape factor, built share) and asserts them per archetype.

## Later

These shape today's design but are not part of the first deliverable.

- Buildings on lots, with dimensions as visual channels: building size, height, windows, lit windows, rooftop objects
  (antennas and the like for specific cases) and colour.
- Filters that map metrics onto those channels (test coverage, cyclomatic complexity, cognitive complexity, code
  smells), several at once, per city or per neighbourhood.
- Tests as a dimension of the source they cover, shown on that source's building.
- History playback: animating the city through its history and exporting it as a video.
- Private repositories, connected by their owner.
- A local, offline build for any folder on disk, as a Rust port that matches the TypeScript output.
- Statistics overlays, a 3D walk camera, a Monopoly-like game played in a chosen town (apps, packages, tools), and strangler-pattern detection (old versus new
  areas).
- Dependency overlays: bridges between workspace islands, tram lines within packages.

## Non-goals

- Dependencies never shape streets; they are overlays only.
- No layout depends on file size order, wall-clock time, randomness or runtime hashing.
- No physics or iterative force layouts.

## Reference corpus

Every change to the ground plan is judged on these repositories, in order of importance:

1. [webbertakken/takken.io](https://github.com/webbertakken/takken.io)
2. [facebook/react](https://github.com/facebook/react)
3. [reduxjs/redux](https://github.com/reduxjs/redux)
4. [vercel/next.js](https://github.com/vercel/next.js)
5. [game-ci/cli](https://github.com/game-ci/cli)
6. [livediagram-app/livediagram.app](https://github.com/livediagram-app/livediagram.app)
7. One private repository, rendered locally only; nothing about it appears in this repository or any public output.
8. [webbertakken/studio-worker](https://github.com/webbertakken/studio-worker)
9. [home-assistant/core](https://github.com/home-assistant/core)
10. [microsoft/TypeScript](https://github.com/microsoft/TypeScript)
11. [rust-lang/rust](https://github.com/rust-lang/rust)
12. [torvalds/linux](https://github.com/torvalds/linux), the performance benchmark.

## Technical constraints

- TypeScript first, run with Bun; a later Rust port must reproduce the same plan.
- Integer arithmetic in the layout core; sorted iteration; per-node seeds from a path hash.
- Repositories are read from blob-less clones; the history fold uses commits and trees only.
- Accessibility: WCAG 2.2 AA for all UI and map text.
