# Local repositories

A person opens a repository on their own machine in the viewer: without a GitHub account, without signing in, and
without anything about the repository leaving the machine. How the city looks lives in the
[viewer](../004-interface-design/viewer.md); how it is laid lives in the
[ground plan](../006-ground-plan/ground-plan.md).

## Two ways in

A web page cannot run programs on the machine, so there are two ways in, one for each need.

| Way           | Needs                          | Gives                                              | Speed                               |
| ------------- | ------------------------------ | -------------------------------------------------- | ----------------------------------- |
| Pick a folder | the browser only               | the single state: what git tracks now, not folded  | seconds; linux in about 15 s        |
| The companion | the CLI (`bunx citymap`, Rust) | the folded history, stable, updating as you commit | the CLI's fold, then instant reopen |

Both are offered under More, "Open a local repository…", which explains the difference in two lines.

## Pick a folder

- The person picks the repository's folder in the browser's own folder dialog. The page reads it there; nothing is
  uploaded, and no request leaves the machine.
- The files are what git tracks: the page reads the repository's index (`.git/index`), which lists every tracked path
  (so `node_modules`, build output and everything `.gitignore` excludes stay out, exactly as git decides). Workspace
  members come from the root manifests in the working tree, as for a GitHub repository.
- The city is the single state, laid in the layout worker with the CLI's default options: the same city as
  `citymap --no-history` when the working tree matches the last commit. The status says "local, single state, not
  folded".
- A folder without git is laid from its files, honouring its `.gitignore` files.
- Where the browser can open a folder without reading every file (Chromium), only the index and the manifests are read.
  Elsewhere the folder dialog lists every file first; for a folder of more than 200,000 entries the page says it may
  take a while before it starts.
- In Chromium the last folder is remembered, and reopening it asks the browser's permission again; nothing else is
  stored.
- On a phone, picking a folder is not offered.
- Failures, one sentence each, the last city staying: the folder cannot be read (permission refused); the index is of a
  kind not read (a split or sparse index: "run `git update-index --no-split-index`" or use the companion); the folder is
  a linked worktree or submodule whose git data lies outside it (pick the main checkout, or use the companion); more
  files than the engine holds.

## The companion

- `citymap open [path]`, in either CLI, folds the repository's history at the CLI's speed (windowed, with its lock, so
  reopening is instant), then serves the viewer itself on loopback and opens the browser at it. The viewer is the same
  build as the public page, bundled in the CLI.
- The page loads its city from the companion, and the Loading card shows the fold's own progress (commits folded of
  commits to fold) as it streams.
- While it runs, the companion watches the repository: a new commit is folded and the map updates in place; the city is
  stable, so only what the commit touched moves.
- The companion listens on `127.0.0.1` only, on a free port (or `--port`), answers only requests whose host is that
  address and port, and only with a session token it puts in the address it opens; any other request is refused. It
  stops with Ctrl-C, or when its page has been closed for a minute.
- It serves over HTTPS with a certificate the machine trusts; how that certificate is made is an open question (see the
  plan).

## Privacy

- A local repository is never sent anywhere: no GitHub request, no analytics, nothing in the page address but the
  companion's session token. Its name shows only on the person's own screen.
- The public page never contacts the machine; only the companion's own page talks to the companion.

## Not chosen

- A browser extension with a native host could start the CLI from the public page, but needs two installs per browser
  and a store review; the companion gives the same with one command.
- Uploading a city file stays possible (`citymap <repository> --out=city.json`, then open it), but is no longer the only
  way.
