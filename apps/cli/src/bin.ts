#!/usr/bin/env bun
// The citymap command: real files, the real clock, standard output and error.
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { main } from "./main";

const utf8 = new TextDecoder("utf-8", { fatal: true });

/** A file's text; null when there is no file there, or it is not UTF-8 text, as the Rust CLI reads it. */
function readFile(path: string): string | null {
  try {
    return statSync(path).isFile() ? utf8.decode(readFileSync(path)) : null;
  } catch {
    return null;
  }
}

const io = {
  readFile,
  writeFile: (path: string, text: string) => writeFileSync(path, text),
  log: (line: string) => console.log(line),
  now: () => performance.now(),
};
process.exit(await main(process.argv.slice(2), io, (line) => console.error(line)));
