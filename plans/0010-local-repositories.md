# Plan 0010: open a repository on your own machine

Pick a folder in the page for its single state, or run the companion for its folded history. Spec:
[local repositories](../docs/specs/007-local-repositories/local-repositories.md).

## Phase 1: decide and spec

- [ ] Webber's choice of the ways in (pick a folder, the companion, both, or an extension), then the spec follows it
- [ ] Webber's choice of how the companion serves HTTPS on loopback (a certificate the machine trusts)
- [x] Spec: the two ways, privacy, failures, what was not chosen
- [ ] Blueprint: the git index reader (versions 2 to 4, extensions skipped or refused by name), the folder access per
      browser, the companion's server (routes, token, host check, events stream, watching), its packaging in both CLIs;
      error codes; defaults and completeness
- [ ] Research: Chromium, Firefox and Safari folder access as shipped today; reading `.git/index` versions in the wild
      (the reference corpus); how other tools bundle a web page in a Rust and a Bun binary

## Phase 2: pick a folder

- [ ] `readIndex`: the git index to tracked paths, test-first against indexes written by git (v2, v3, v4, with and
      without extensions), refusing split and sparse indexes by name
- [ ] The folder reader: Chromium's directory handle (reads only the index and manifests), the folder input elsewhere;
      `.gitignore` for a folder without git; a remembered folder in Chromium
- [ ] Equal to the CLI: the snapshot from a picked folder equals `citymap --no-history`'s on a clean checkout, on the
      reference corpus
- [ ] More: "Open a local repository…" with both ways explained; not offered on a phone
- [ ] Failures named and logged (`viewer/local-…`)

## Phase 3: the companion

- [ ] `citymap open [path]` in the TypeScript CLI: fold with the lock, serve the bundled viewer on `127.0.0.1`, token
      and host checks, open the browser, stop on Ctrl-C or a minute after the page closes (tests first)
- [ ] The page loads its city from the companion and streams the fold's progress into the Loading card
- [ ] Watching: a new commit is folded and the map updates in place
- [ ] The same in the Rust CLI, byte for byte in what it serves; parity extended
- [ ] Security review of the companion: other websites, other local users, DNS rebinding, path traversal

## Phase 4: proof

- [ ] Unit tests at 100 %; `bun run check`; parity
- [ ] End-to-end: pick a fixture folder (Chromium handle and folder input), the companion on a fixture repository with a
      commit made during the test, axe light and dark, vitals
- [ ] Measured: linux by folder pick, react by companion (first open and reopen), a commit's update time

## Phase 5: ship

- [ ] README: both ways, with pictures
- [ ] Fold-back: spec and blueprint match what shipped; every symbol and reference verified
- [ ] PR with pictures, CI green, squash-merge, Pages verified, `~/PR_RESULTS.md`
