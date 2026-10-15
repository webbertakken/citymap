# 0002 Live GitHub page

A static page on GitHub Pages where anyone names a public GitHub repository and sees its single state laid in their
browser. Spec: [viewer](../docs/specs/004-interface-design/viewer.md) § A GitHub repository, live. Blueprint:
[viewer blueprint](../docs/specs/004-interface-design/blueprints/viewer.md) § A GitHub repository, live.

Webber's choices: GitHub Pages; no sign-in (OAuth may follow, through a small worker); a tree too large for one answer
is read folder by folder.

## Phase 1: shared pieces

- [x] `stateSnapshot` in `@citymap/ground-plan`, used by `readTree`, the bench and the browser
- [x] The manifest parsers importable in the browser (`@citymap/history/manifests`)

## Phase 2: reading GitHub

- [ ] `parseRepository` with every rejection
- [ ] `readRepository`: commit, recursive tree, folder-by-folder fallback, manifests, rejections, request count
- [ ] Unit tests on a stubbed fetcher, every path

## Phase 3: the viewer

- [ ] The repository field, status lines, errors, `?repo=` in and out
- [ ] Laying in a Web Worker, injectable for tests
- [ ] Component tests; Playwright end to end with GitHub's API routed to fixtures; axe and vitals still pass

## Phase 4: hosting

- [ ] `basePath` from `CITYMAP_BASE_PATH`; bundled files fetched under it
- [ ] `.github/workflows/pages.yml`; Pages enabled for workflow builds
- [ ] Deployed and checked live on several public repositories, a large one included

## Phase 5: fold-back

- [ ] Specs, blueprint, defaults and indexes match what shipped; README points at the live page; PR with images
