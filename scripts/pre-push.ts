// The pre-push hook (.husky/pre-push): wires the real git, processes and console into the tested `prePush`.
import { execFileSync, spawnSync } from "node:child_process";
import { prePush, type Ports } from "./pre-push/pre-push.ts";

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();

const ports: Ports = {
  git: (args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim(),
  run: ({ command, args }) => {
    const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
    if (result.error) return `${result.error.message}; run \`mise install\` and \`bun install\``;
    return result.status ?? `killed by ${result.signal}`;
  },
  log: (line) => console.log(line),
  error: (line) => console.error(line),
  now: () => performance.now(),
};

process.exitCode = prePush(await Bun.stdin.text(), ports);
