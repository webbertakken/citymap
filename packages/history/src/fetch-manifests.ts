// A partial clone's root workspace manifests: exactly the blobs the commits it lays name, fetched in one call before the
// fold reads them, so it lays the towns a full clone lays. A full clone holds them all, and is asked nothing.
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { compareKeys } from "@citymap/ground-plan";
import { listHeld } from "./blobs";
import { gitEnvironment } from "./env";
import { runWithin } from "./mailmap";
import { isManifest } from "./manifests";

const run = promisify(execFile);

/** How long the one fetch of the manifests may take before it is given up: a prompt or a stalled network. */
export const MANIFESTS_FETCH_TIMEOUT = 30_000;

export type ManifestsStatus = "held" | "fetched" | "unfetchable";

export interface ManifestsRead {
  readonly code: "history/manifests";
  readonly detail: {
    readonly status: ManifestsStatus;
    /** The laid commits' manifest blobs. */
    readonly blobs: number;
    /** How many of them this call fetched. */
    readonly fetched: number;
    /** Why an unfetchable one could not be fetched: `timeout`, or `exit-<code>` of git. */
    readonly reason?: string;
    readonly error?: string;
  };
}

/** Every first-parent commit's root tree, by index, oldest first, up to `head`. */
export async function rootTrees(dir: string, head: string): Promise<string[]> {
  const args = ["-C", dir, "log", "--first-parent", "--reverse", "--format=%T", head, "--"];
  const { stdout } = await run("git", args, { env: gitEnvironment(), maxBuffer: 1 << 30 });
  return stdout.split("\n").filter((line) => line !== "");
}

/** Each tree's raw bytes, through one `git cat-file --batch` (trees are held, in a partial clone too). */
function readTrees(dir: string, trees: readonly string[]): Promise<Buffer> {
  return new Promise((done, fail) => {
    const child = spawn("git", ["-C", dir, "cat-file", "--batch"], {
      env: gitEnvironment(),
      stdio: ["pipe", "pipe", "ignore"],
    });
    const out: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => out.push(chunk));
    child.on("error", fail);
    child.on("close", () => done(Buffer.concat(out)));
    child.stdin.end(trees.map((tree) => `${tree}\n`).join(""));
  });
}

/** The manifest blobs a root tree's entries name: files `isManifest` names, not folders or gitlinks. */
function manifestsIn(tree: Buffer, idBytes: number, into: Set<string>) {
  let at = 0;
  while (at < tree.length) {
    const space = tree.indexOf(0x20, at);
    const nul = tree.indexOf(0, space);
    const mode = tree.toString("latin1", at, space);
    const name = tree.toString("utf8", space + 1, nul);
    const id = tree.toString("hex", nul + 1, nul + 1 + idBytes);
    if (mode !== "40000" && mode !== "160000" && isManifest(name)) into.add(id);
    at = nul + 1 + idBytes;
  }
}

/**
 * The root manifest blobs of these trees (ids or expressions such as `HEAD^{tree}`), each tree read once, each blob named
 * once, sorted: exactly the blobs a fold laying their commits reads.
 */
export async function laidManifests(dir: string, trees: readonly string[]): Promise<string[]> {
  const bytes = await readTrees(dir, [...new Set(trees)]);
  const blobs = new Set<string>();
  let at = 0;
  while (at < bytes.length) {
    // "<id> tree <size>\n<content>\n"
    const newline = bytes.indexOf(0x0a, at);
    const [id = "", , size = "0"] = bytes.toString("latin1", at, newline).split(" ");
    const end = newline + 1 + Number(size);
    manifestsIn(bytes.subarray(newline + 1, end), id.length / 2, blobs);
    at = end + 1;
  }
  return [...blobs].toSorted(compareKeys);
}

/** The clone's promisor remotes, in the order git asks them: `extensions.partialclone`'s first. */
export async function promisorRemotes(dir: string): Promise<string[]> {
  const pattern = "^(extensions\\.partialclone|remote\\..*\\.promisor)$";
  let stdout = "";
  try {
    ({ stdout } = await run("git", ["-C", dir, "config", "--get-regexp", pattern], { env: gitEnvironment() }));
  } catch {
    // No such setting: not a partial clone.
    return [];
  }
  let first: string[] = [];
  const promisors: string[] = [];
  for (const line of stdout.split("\n")) {
    const [key = "", value = ""] = line.split(" ");
    if (key === "extensions.partialclone") first = [value];
    else if (value === "true") promisors.push(key.slice("remote.".length, -".promisor".length));
  }
  return [...new Set([...first, ...promisors])];
}

/**
 * Fetches the root manifest blobs of the trees `trees` names (asked only of a partial clone) that it does not hold, and nothing else, in one call per
 * promisor remote, as git's own lazy fetch asks for objects (`fetch.negotiationAlgorithm=noop`, `--filter=blob:none`,
 * the ids on its input). Never prompts; given up after `timeoutMs`. Null for a full clone, which is asked nothing.
 */
export async function fetchManifests(
  dir: string,
  trees: () => Promise<readonly string[]>,
  timeoutMs = MANIFESTS_FETCH_TIMEOUT,
): Promise<ManifestsRead | null> {
  const remotes = await promisorRemotes(dir);
  if (remotes.length === 0) return null;
  const wanted = await laidManifests(dir, await trees());
  const at = ["-C", dir];
  const missing = (held: ReadonlySet<string>) => wanted.filter((blob) => !held.has(blob));
  const before = missing(await listHeld(at));
  const read = (status: ManifestsStatus, fetched: number, why: { reason?: string; error?: string } = {}) =>
    ({ code: "history/manifests", detail: { status, blobs: wanted.length, fetched, ...why } }) as const;
  if (before.length === 0) return read("held", 0);
  const { GIT_NO_LAZY_FETCH: _lazy, ...env } = gitEnvironment();
  let left = before;
  let why: { reason: string; error?: string } = { reason: "timeout" };
  for (const remote of remotes) {
    // One remote at a time, each asked for what is still missing, as git asks them.
    // oxlint-disable-next-line no-await-in-loop
    const ran = await runWithin(
      "git",
      [
        ...at,
        "-c",
        "fetch.negotiationAlgorithm=noop",
        "fetch",
        remote,
        "--no-tags",
        "--no-write-fetch-head",
        "--recurse-submodules=no",
        "--filter=blob:none",
        "--stdin",
      ],
      { ...env, GIT_TERMINAL_PROMPT: "0" },
      timeoutMs,
      left.map((blob) => `${blob}\n`).join(""),
    );
    if (ran === "timeout") why = { reason: "timeout" };
    else if (ran.code !== 0) why = { reason: `exit-${String(ran.code)}`, error: ran.stderr.split("\n", 1)[0]! };
    // oxlint-disable-next-line no-await-in-loop
    left = missing(await listHeld(at));
    if (left.length === 0) break;
  }
  const fetched = before.length - left.length;
  return left.length === 0 ? read("fetched", fetched) : read("unfetchable", fetched, why);
}
