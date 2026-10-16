# Local repositories

A person opens a repository on their own machine in the viewer: without a GitHub account, without signing in, without
installing anything, and without anything about the repository leaving the machine. How the city looks lives in the
[viewer](../004-interface-design/viewer.md); how it is laid lives in the
[ground plan](../006-ground-plan/ground-plan.md).

## Opening one

- More offers "Open a local repository…". The person picks the repository's folder in the browser's own folder dialog
  and sees its city. A web page cannot run programs on the machine, so the browser reads the folder itself.
- The line under the button says what it gives: the repository as it is now, not folded over its history; a folded city
  comes from the CLI (`citymap <repository> --out=city.json`, then open the file).
- On a phone, opening a local repository is not offered.

## What is read

- The files are what git tracks: the page reads the repository's index (`.git/index`), which lists every tracked path,
  so `node_modules`, build output and everything `.gitignore` excludes stay out, exactly as git decides. Workspace
  members come from the root manifests in the working tree, as for a GitHub repository.
- A folder without git is laid from its files, honouring its `.gitignore` files.
- Where the browser can open a folder without reading every file (Chromium), only the index and the manifests are read.
  Elsewhere the folder dialog lists every file first; for a folder of more than 200,000 entries the page says it may
  take a while before it starts.
- In Chromium the last folder is remembered, and reopening it asks the browser's permission again; nothing else is
  stored.

## The city

- The single state, laid in the layout worker with the CLI's default options: the same city as `citymap --no-history`
  when the working tree matches the last commit. The status says "local, single state, not folded".
- The Loading card shows its phases: "Reading the git index", "Reading workspace manifests", "Laying out N files",
  "Drawing the map".
- The city's name is the folder's name.

## Failures

One sentence each, and the last city stays:

- the folder cannot be read (the browser's permission refused);
- the index is of a kind not read (a split or sparse index): "run `git update-index --no-split-index`, then try again";
- the folder is a linked worktree or a submodule whose git data lies outside it: pick the main checkout;
- more files than the engine holds.

## Privacy

- A local repository is never sent anywhere: no GitHub request, no analytics, nothing in the page address. Its name
  shows only on the person's own screen.

## Not now

- A local companion (`citymap open`, folding the history at the CLI's speed and serving the viewer on loopback, the map
  updating as you commit) is held for later. Should it come, it serves HTTPS with an mkcert certificate.
- A browser extension with a native host could start the CLI from the public page, but needs two installs per browser
  and a store review.
