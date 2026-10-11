// Run by `bun run typecheck` before `tsc --build`: wires the workspaces and the root tsconfig into the tested rules.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { referencePaths, referenceProblems, workspacePatterns, type Workspace } from "./references/references.ts";

const root = join(import.meta.dirname, "..");
const patterns = workspacePatterns(await Bun.file(join(root, "package.json")).json());
const references = referencePaths(await Bun.file(join(root, "tsconfig.json")).json());

const workspaces: Workspace[] = patterns
  .flatMap((pattern) => Array.from(new Bun.Glob(`${pattern}/package.json`).scanSync({ cwd: root })))
  .map((manifest) => manifest.replace(/\/package\.json$/, ""))
  .toSorted()
  .map((dir) => ({ dir, hasTsconfig: existsSync(join(root, dir, "tsconfig.json")) }));

const problems = referenceProblems(workspaces, references);
if (problems.length > 0) {
  for (const problem of problems) console.error(`[references] ${problem}`);
  process.exitCode = 1;
} else {
  console.log(`[references] the root tsconfig.json references every workspace (${workspaces.length})`);
}
