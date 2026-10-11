// The pre-push hook (.husky/pre-push): wires the real git, processes and console into the tested `prePush`.
import { execFileSync, spawnSync } from "node:child_process";
import { prePush, type Ports } from "./pre-push/pre-push.ts";

const HOOK_VARIABLES = new Set([
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_INDEX_FILE",
  "GIT_OBJECT_DIRECTORY",
  "GIT_COMMON_DIR",
  "GIT_PREFIX",
]);
const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();

const ports: Ports = {
  git: (args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim(),
  run: ({ command, args }) => {
    // The checks run as if from a shell: without the variables git sets for its hooks, which would point every git
    // command the tests run (in their own temporary repositories) at this one.
    const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !HOOK_VARIABLES.has(name)));
    const result = spawnSync(command, args, { cwd: root, stdio: "inherit", env });
    if (result.error) return `${result.error.message}; run \`mise install\` and \`bun install\``;
    return result.status ?? `killed by ${result.signal}`;
  },
  log: (line) => console.log(line),
  error: (line) => console.error(line),
  now: () => performance.now(),
};

process.exitCode = prePush(await Bun.stdin.text(), ports);
