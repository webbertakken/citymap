# Local repositories

A person opens a repository on their own machine in the viewer: without a GitHub account, without signing in, without
installing anything, and without anything about the repository leaving the machine. How the city looks lives in the
[viewer](../004-interface-design/viewer.md); how it is laid lives in the
[ground plan](../006-ground-plan/ground-plan.md). What browsers allow is measured in
[local folders](../../research/local-folders.md).

## Opening one

- A button right beside the search box, "Open a local repository", opens one. The person picks the repository's folder
  in the browser's own folder dialog and sees its city. A web page cannot run programs on the machine, so the browser
  reads the folder itself.
- The button's tooltip says what it gives: the repository as it is now, not folded over its history; a folded city comes
  from the CLI (`citymap <repository> --out=city.json`, then open the file).
- Where the folder is remembered (Chromium), More also offers "Open {folder} again".
- On a phone, opening a local repository is not offered: the button is not there.
- In Safari it is not offered either, and the button is not there: Safari hides every name starting with a dot from
  pages, `.git` and `.gitignore` included, so it would lay ignored files as source. More says so in one line instead,
  and names the browsers that can (Chrome, Edge, Firefox) and the CLI.
- Closing the folder dialog without a folder changes nothing.

## What is read

- The files are what git tracks: the page reads the repository's index (`.git/index`), which lists every tracked path,
  so `node_modules`, build output and everything `.gitignore` excludes stay out, exactly as git decides. Submodules are
  left out, as the CLI leaves them out. Workspace members come from the root manifests in the working tree, as for a
  GitHub repository.
- The index is read in versions 2, 3 and 4, with either object format (SHA-1 or SHA-256); extensions git marks as
  optional are passed over.
- A folder without git is laid from its files, honouring its `.gitignore` files: each applies to the folder it sits in
  and below, a deeper one overrides, and an ignored folder is not entered.
- Where the browser can open a folder without reading every file (Chromium), only the index, a few small files of `.git`
  (`HEAD`, the branch it names, `config`) and the manifests are read.
- Elsewhere (Firefox) the browser lists every file in the folder before the page hears of it, which takes seconds for a
  large folder (linux: about 3.5 s); while it lists, the status says so.
- In Chromium the last folder is remembered, and reopening it asks the browser's permission again; nothing else is
  stored.

## The city

- The single state, laid in the layout worker with the CLI's default options: the same city as `citymap --no-history`
  when the working tree matches the last commit, the commit it names included. The status says "local, single state, not
  folded".
- The Loading card, and the status line, show its phases: "Listing the folder's files" (Firefox), "Reading the git
  index" (or "Reading the folder" without git), "Reading workspace manifests", "Laying out N files", "Drawing the map".
- The city's name is the folder's name.

## Failures

One sentence each, and the last city stays:

- the folder cannot be read (the browser's permission refused);
- the index is of a kind not read: a split index ("run `git update-index --no-split-index`, then try again") or a sparse
  index ("run `git sparse-checkout reapply --no-sparse-index`, then try again"), an index version other than 2 to 4, an
  extension git marks as required that is not known, or an index that is damaged;
- the repository has no index yet (nothing checked out or staged);
- the folder is a linked worktree or a submodule whose git data lies outside it: pick the main checkout; a `.git` file
  that does not say where its git data is;
- the folder is git's own data (a bare repository, or the `.git` folder itself), not a working tree;
- a file changed or vanished while it was read: try again;
- nothing to lay (no tracked file, or every file ignored);
- more files than the engine holds, or a path longer than the engine holds (4,096 bytes).

## Privacy

- A local repository is never sent anywhere: no GitHub request, no analytics, nothing in the page address (a repository
  named there before is removed). Its name shows only on the person's own screen: the tab's title says "Local
  repository", so browser history, which may sync, never holds it.

## Not now

- A local companion (`citymap open`, folding the history at the CLI's speed and serving the viewer on loopback, the map
  updating as you commit) is held for later. Should it come, it serves HTTPS with an mkcert certificate.
- A browser extension with a native host could start the CLI from the public page, but needs two installs per browser
  and a store review.
