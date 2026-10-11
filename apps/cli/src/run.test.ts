import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseCity } from "@citymap/ground-plan";
import { afterEach, describe, expect, it } from "vitest";
import { parseCommandLine, type LayCommand } from "./args";
import { LOCKFILE, runLay, type Io } from "./run";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const git = (dir: string, ...args: string[]) => execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" }).trim();
function repo(commits: number): string {
  const dir = mkdtempSync(join(tmpdir(), "citymap-cli-"));
  dirs.push(dir);
  git(dir, "init", "-q", "-b", "main");
  for (let c = 0; c < commits; c++) {
    for (let i = 0; i < 12; i++) {
      mkdirSync(join(dir, `src/m${c}`), { recursive: true });
      writeFileSync(join(dir, `src/m${c}/f${i}.ts`), `${c}-${i}`);
    }
    git(dir, "add", "-A");
    git(dir, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", `c${c}`);
  }
  return dir;
}
function memoryIo(files: Record<string, string> = {}) {
  const lines: string[] = [];
  let clock = 0;
  const io: Io = {
    readFile: (path) => files[path] ?? null,
    writeFile: (path, text) => {
      files[path] = text;
    },
    log: (line) => lines.push(line),
    now: () => (clock += 5),
  };
  return { io, files, lines };
}
const command = (dir: string, ...flags: string[]) => parseCommandLine([dir, ...flags]) as LayCommand;

describe("runLay", () => {
  it("writes the city as JSON and SVG and logs a summary", async () => {
    const dir = repo(3);
    const { io, files, lines } = memoryIo();
    const city = await runLay(command(dir, "--out=city.json", "--svg=map.svg", "--theme=night-atlas", "--verbose"), io);
    expect(parseCity(files["city.json"] as string)).toEqual(city);
    expect(files["map.svg"]).toContain("<svg ");
    expect(lines.at(-1)).toMatch(/^fold\/done repository=citymap-cli-\S+ commits=3 lots=36 overflow=0 ms=\d+$/);
    expect(lines.some((l) => l.startsWith("plat/grow"))).toBe(true);
  });

  it("writes a lockfile and resumes from it, laying the same city", async () => {
    const dir = repo(3);
    const first = memoryIo();
    const city = await runLay(command(dir, "--lock"), first.io);
    const lock = first.files[join(dir, LOCKFILE)] as string;
    expect(JSON.parse(lock).index).toBe(2);
    const second = memoryIo({ [join(dir, LOCKFILE)]: lock });
    const again = await runLay(command(dir), second.io);
    expect(second.lines).toContain(`lock/resume commit=${git(dir, "rev-parse", "HEAD")} index=2`);
    expect(second.lines.at(-1)).toContain("commits=1");
    expect(again).toEqual(city);
  });

  it("ignores a lockfile for another land setting or off the history", async () => {
    const dir = repo(2);
    const first = memoryIo();
    await runLay(command(dir, "--lock"), first.io);
    const lock = first.files[join(dir, LOCKFILE)] as string;
    const tests = memoryIo({ [join(dir, LOCKFILE)]: lock });
    await runLay(command(dir, "--tests"), tests.io);
    expect(tests.lines.some((l) => l.startsWith("lock/ignored reason=land"))).toBe(true);
    git(dir, "checkout", "-q", "-b", "other", "HEAD~1");
    writeFileSync(join(dir, "x.ts"), "x");
    git(dir, "add", "-A");
    git(dir, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "other");
    const off = memoryIo({ [join(dir, LOCKFILE)]: lock });
    await runLay(command(dir), off.io);
    expect(off.lines.some((l) => l.startsWith("lock/ignored reason=not-an-ancestor"))).toBe(true);
  });

  it("rejects a broken lockfile by name", async () => {
    const dir = repo(1);
    await expect(runLay(command(dir), memoryIo({ [join(dir, LOCKFILE)]: "{" }).io)).rejects.toThrow("cli/lockfile");
    await expect(runLay(command(dir), memoryIo({ [join(dir, LOCKFILE)]: '{"commit":1}' }).io)).rejects.toThrow(
      "cli/lockfile",
    );
    await expect(
      runLay(command(dir), memoryIo({ [join(dir, LOCKFILE)]: '{"commit":"a","index":-1}' }).io),
    ).rejects.toThrow("cli/lockfile");
  });

  it("rejects a ref that names no commit", async () => {
    const dir = repo(1);
    await expect(runLay(command(dir, "--to=nope"), memoryIo().io)).rejects.toThrow("history/git-failed");
  });
});
