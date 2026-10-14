// `bun run bench`: times the fold blueprint's budgets on the repositories under ~/.cache/citymap/repos (or $CITYMAP_REPOS).
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { gitEnvironment, readHistory } from "@citymap/history";
import { BUDGETS, bench, type Ports } from "./bench/bench.ts";

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

process.exitCode = await bench(BUDGETS, ports);
