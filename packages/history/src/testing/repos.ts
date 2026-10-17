// Real git repositories in a temporary folder, for the readers' tests.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gitEnvironment } from "../env";

const made: string[] = [];

/** Removes every repository made since the last call. */
export const removeRepos = () => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
};

export const git = (dir: string, ...args: string[]) =>
  execFileSync("git", ["-C", dir, "-c", "protocol.file.allow=always", ...args], {
    encoding: "utf8",
    env: gitEnvironment(),
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

export const write = (dir: string, path: string, text: string) => {
  mkdirSync(join(dir, path, ".."), { recursive: true });
  writeFileSync(join(dir, path), text);
};

/** Stages everything and commits; the new commit's id. */
export const commit = (dir: string, message: string) => {
  git(dir, "add", "-A");
  git(dir, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", message);
  return git(dir, "rev-parse", "HEAD");
};

/** An empty repository on branch main, removed by `removeRepos`. */
export function repo(prefix = "citymap-repo-"): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  made.push(dir);
  git(dir, "init", "-q", "-b", "main");
  return dir;
}

/** A repository holding the given files, committed once. */
export function repoWith(files: Record<string, string>): string {
  const dir = repo();
  for (const [path, text] of Object.entries(files)) write(dir, path, text);
  commit(dir, "start");
  return dir;
}

/** Commits the index as staged, without staging the working tree (for gitlinks staged by hand); the commit's id. */
export const commitIndex = (dir: string, message: string) => {
  git(dir, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", message);
  return git(dir, "rev-parse", "HEAD");
};
