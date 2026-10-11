import { execFile } from "node:child_process";
import { CitymapError } from "@citymap/ground-plan";

/** Runs git with an argument list (never a shell); resolves its exit code and output. */
function git(dir: string, args: readonly string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((done) => {
    execFile(
      "git",
      ["-c", "core.hooksPath=/dev/null", "-C", dir, ...args],
      { env: { ...process.env, GIT_NO_LAZY_FETCH: "1" } },
      (error, stdout, stderr) => {
        // An exit status is a number; git that could not start at all (ENOENT) is reported as -1 with its reason.
        const code = error === null ? 0 : typeof error.code === "number" ? error.code : -1;
        done({ code, stdout, stderr: code === -1 ? String(error?.message) : stderr });
      },
    );
  });
}

const failed = (args: readonly string[], result: { code: number; stderr: string }): never => {
  throw new CitymapError(
    "history/git-failed",
    `git ${args[0]} exited with ${result.code}: ${result.stderr.split("\n", 1)[0]}`,
    {
      code: result.code,
    },
  );
};

/** True when `ancestor` is in the first-or-any-parent history of `commit` (or is it). */
export async function isAncestor(dir: string, ancestor: string, commit: string): Promise<boolean> {
  const args = ["merge-base", "--is-ancestor", ancestor, commit];
  const result = await git(dir, args);
  if (result.code === 0) return true;
  if (result.code === 1) return false;
  return failed(args, result);
}

/** The commit id a ref names. */
export async function resolveCommit(dir: string, ref: string): Promise<string> {
  const args = ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`];
  const result = await git(dir, args);
  return result.code === 0 ? result.stdout.trim() : failed(args, result);
}
