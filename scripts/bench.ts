// `bun run bench [--rebase]`: times the fold blueprint's budgets, then lays the corpus at HEAD and holds its ratchet on the repositories under ~/.cache/citymap/repos (or $CITYMAP_REPOS).
import { execFile } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { gitEnvironment, readHistory } from "@citymap/history";
import { BUDGETS, bench, type Ports } from "./bench/bench.ts";
import { CORPUS, corpus, parseTotals } from "./bench/corpus.ts";

const root = process.env.CITYMAP_REPOS ?? join(homedir(), ".cache/citymap/repos");
const run = promisify(execFile);

const ports: Ports = {
  listFiles: async (repo) => {
    const dir = join(root, repo);
    if (!existsSync(dir)) return null;
    const args = ["-C", dir, "-c", "core.quotepath=off", "ls-tree", "-r", "-z", "HEAD"];
    const { stdout } = await run("git", args, { env: gitEnvironment(), maxBuffer: 1 << 30 });
    // "<mode> <type> <hash>\t<path>": files only, as the history reader keeps them (submodules are skipped).
    return stdout
      .split("\0")
      .filter((entry) => entry.includes(" blob "))
      .map((entry) => entry.slice(entry.indexOf("\t") + 1));
  },
  history: (repo) => readHistory(join(root, repo)),
  now: () => performance.now(),
  log: (line) => console.log(line),
};

// The corpus ratchet's baseline is committed beside the bench; `--rebase` records the totals of this run as the new one.
const baselineFile = join(import.meta.dirname, "bench/baseline.json");
const timed = await bench(BUDGETS, ports);
const ratchet = await corpus(
  CORPUS,
  {
    listFiles: ports.listFiles,
    readBaseline: () => (existsSync(baselineFile) ? parseTotals(readFileSync(baselineFile, "utf8")) : null),
    writeBaseline: (totals) => writeFileSync(baselineFile, `${JSON.stringify(totals, null, 2)}\n`),
    log: ports.log,
  },
  process.argv.includes("--rebase"),
);
process.exitCode = Math.max(timed, ratchet);
