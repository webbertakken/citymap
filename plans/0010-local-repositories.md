# Plan 0010: open a repository on your own machine

Pick a repository's folder in the page and see its single state; nothing is installed and nothing leaves the machine.
Spec: [local repositories](../docs/specs/007-local-repositories/local-repositories.md).

## Phase 1: spec and blueprint

- [x] Webber's choice: picking a folder only; the companion is held (mkcert, should it come)
- [x] Spec: opening one, what is read, the city, failures, privacy, what is not now
- [ ] Research: folder access in Chromium, Firefox and Safari as shipped today; git index versions and extensions in the
      wild (the reference corpus clones); `.gitignore` matching libraries (licence, size, correctness)
- [ ] Blueprint: the git index reader (versions 2 to 4, extensions skipped or refused by name), the folder reader per
      browser, the remembered folder, the `.gitignore` path, the snapshot builder (`stateSnapshot`), error codes, logs;
      defaults and completeness

## Phase 2: reading a folder

- [ ] `readIndex`: the git index to tracked paths, test-first against indexes written by git (v2, v3, v4, with and
      without extensions), refusing split and sparse indexes by name
- [ ] The folder reader: Chromium's directory handle (reads only the index and manifests), the folder input elsewhere;
      `.gitignore` for a folder without git; the remembered folder in Chromium
- [ ] Equal to the CLI: the snapshot from a picked folder equals `citymap --no-history`'s on a clean checkout, on the
      reference corpus

## Phase 3: in the viewer

- [ ] More: "Open a local repository…" with its line of explanation; not offered on a phone
- [ ] Phases into the Loading card (plan 0009), or the status line until that card exists
- [ ] Failures named, shown in the notice and logged (`viewer/local-…`)

## Phase 4: proof

- [ ] Unit tests at 100 %; `bun run check`
- [ ] End-to-end: pick a fixture folder (Chromium handle and folder input), a folder without git, each failure; axe
      light and dark; vitals
- [ ] Measured: linux, next.js and takken.io by folder pick, in Chromium and Firefox

## Phase 5: ship

- [ ] README: opening a local repository, with pictures
- [ ] Fold-back: spec and blueprint match what shipped; every symbol and reference verified
- [ ] PR with pictures, CI green, squash-merge, Pages verified, `~/PR_RESULTS.md`
