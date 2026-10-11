#!/usr/bin/env bun
// The citymap command: real files, the real clock, standard output and error.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { main } from "./main";

const io = {
  readFile: (path: string) => (existsSync(path) ? readFileSync(path, "utf8") : null),
  writeFile: (path: string, text: string) => writeFileSync(path, text),
  log: (line: string) => console.log(line),
  now: () => performance.now(),
};
process.exit(await main(process.argv.slice(2), io, (line) => console.error(line)));
