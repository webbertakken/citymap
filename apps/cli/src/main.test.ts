import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { main } from "./main";
import type { Io } from "./run";

const io = () => {
  const out: string[] = [];
  const err: string[] = [];
  const value: Io = { readFile: () => null, writeFile: () => {}, log: (l) => out.push(l), now: () => 0 };
  return { value, out, err, error: (l: string) => err.push(l) };
};

describe("main", () => {
  it("prints the usage for help", async () => {
    const x = io();
    expect(await main(["--help"], x.value, x.error)).toBe(0);
    expect(x.out[0]).toContain("Usage: citymap");
  });

  it("exits 2 with the usage on a usage error", async () => {
    const x = io();
    expect(await main([], x.value, x.error)).toBe(2);
    expect(x.err[0]).toBe("error cli/usage: name one repository");
  });

  it("exits 1 on a named failure, and on anything else", async () => {
    const x = io();
    expect(await main(["/no/such/repository"], x.value, x.error)).toBe(1);
    expect(x.err[0]).toMatch(/^error history\/git-failed/);
    const y = io();
    const throwing: Io = {
      ...y.value,
      now: () => {
        throw new Error("clock");
      },
    };
    expect(await main(["."], throwing, y.error)).toBe(1);
    expect(y.err[0]).toBe("error engine/unexpected: Error: clock");
  });

  it("lays a repository", async () => {
    const x = io();
    // This repository itself, named from this file so the working directory does not matter.
    const root = fileURLToPath(new URL("../../..", import.meta.url));
    expect(await main([root], x.value, x.error)).toBe(0);
    // The repository is named after its folder, which differs between checkouts.
    expect(x.out.at(-1)).toMatch(/^fold\/done repository=\S+ commits=\d+ /);
  }, 60_000);
});
