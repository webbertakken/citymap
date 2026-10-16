# Scope

## Features

The first deliverable is the **ground plan**: the city without buildings, as defined in
[ground plan](../006-ground-plan/ground-plan.md).

- **Input**: a git repository, read as its first-parent history plus its current tree.
- **Ground plan**: districts, streets, blocks, lots, islands, water, parks and plazas, derived deterministically.
- **Stability**: the plan is folded over history, recent commits one by one and older ones in windows, so each step
  changes the city only where its commits changed the tree.
- **Archetypes**: each folder picks an urban form and a tier from its shape, with hysteresis; four of them (corridor,
  archipelago, quarters and tiers) are toggles, a setting each, switched in the viewer between precomputed variants.
- **Rendering**: one 3D scene in Three.js with an orthographic camera looking straight down (plan view) in the Paper
  atlas style, plus SVG export from the same model, in plan view or 2:1 dimetric. Themes: Paper atlas, Night atlas, Beck
  schematic, Nolli noir and Dracula. Desktop and phones.
- **Land dimension**: tests off the map (default) or tests as land.
- **Local repositories**: a repository's folder on the person's machine, laid in the viewer as its single state, with
  nothing installed and nothing sent ([local repositories](../007-local-repositories/local-repositories.md)).
- **Rust CLI**: a second implementation of the command line, byte for byte the same output, many times faster.
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
- A local, offline build for any folder on disk, and a fold service, on the Rust CLI.
- Statistics overlays, a 3D walk camera, a Monopoly-like game played in a chosen town (apps, packages, tools), and
  strangler-pattern detection (old versus new areas).
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

A breadth corpus guards against tuning to the reference repositories: every change is also checked on these, chosen for
their spread of languages, shapes and ages.

- [golang/go](https://github.com/golang/go): a deep standard library, no workspace, history from 2008.
- [django/django](https://github.com/django/django): a classic single application with a large test tree.
- [rails/rails](https://github.com/rails/rails): gems at the root, history from 2004.
- [vuejs/core](https://github.com/vuejs/core): a pnpm monorepo of packages.
- [denoland/deno](https://github.com/denoland/deno): a Cargo workspace.
- [spring-projects/spring-boot](https://github.com/spring-projects/spring-boot): a Gradle multi-module of deep Java
  packages.
- [flutter/flutter](https://github.com/flutter/flutter): packages, tools and examples in one repository.
- [ohmyzsh/ohmyzsh](https://github.com/ohmyzsh/ohmyzsh): hundreds of sibling plugins.
- [bitcoin/bitcoin](https://github.com/bitcoin/bitcoin): a long C++ history.
- [kubernetes/kubernetes](https://github.com/kubernetes/kubernetes): very large, with vendored and staged code.

A scale corpus confirms performance and large runs, and shows a single state of a very large repository (its HEAD laid
once) rather than its whole history: [torvalds/linux](https://github.com/torvalds/linux),
[microsoft/vscode](https://github.com/microsoft/vscode) and [godotengine/godot](https://github.com/godotengine/godot).
It is also the yardstick for the Rust CLI.

## Technical constraints

- TypeScript first, run with Bun; the Rust CLI reproduces the same plan, byte for byte.
- Integer arithmetic in the layout core; sorted iteration; per-node seeds from a path hash.
- Repositories are read from blob-less clones; the history fold uses commits and trees only.
- Accessibility: WCAG 2.2 AA for all UI and map text.
