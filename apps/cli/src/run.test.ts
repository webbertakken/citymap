import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gitEnvironment, type Strides } from "@citymap/history";
import { parseCityFile } from "@citymap/measures";
import { afterEach, describe, expect, it } from "vitest";
import { parseCommandLine, type LayCommand } from "./args";
import { LOCKFILE, runLay, type Io } from "./run";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const git = (dir: string, ...args: string[]) =>
  execFileSync("git", ["-C", dir, ...args], { encoding: "utf8", env: gitEnvironment() }).trim();
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
const command = (dir: string, ...flags: string[]): LayCommand => {
  const parsed = parseCommandLine([dir, ...flags]);
  if (parsed.kind !== "lay") throw new Error("expected a lay command");
  return parsed;
};

describe("runLay", () => {
  it("writes the city as JSON and SVG and logs a summary", async () => {
    const dir = repo(3);
    const { io, files, lines } = memoryIo();
    const city = await runLay(
      command(dir, "--out=city.json", "--svg=map.svg", "--theme=night-atlas", "--verbose", "--voronoi"),
      io,
    );
    expect(parseCityFile(files["city.json"]!).city).toEqual(city);
    expect(files["map.svg"]).toContain("<svg ");
    expect(files["map.svg"]).toContain(`class="region"`);
    expect(lines.at(-1)).toMatch(/^fold\/done repository=citymap-cli-\S+ commits=3 laid=3 lots=36 overflow=0 ms=\d+$/);
    expect(lines.some((l) => l.startsWith("plat/grow"))).toBe(true);
    expect(lines[0]).toBe("history/schedule commits=3 coarse=0 tail=0 from=0 laid=3");
  });

  it("writes a lockfile and resumes from it, laying the same city", async () => {
    const dir = repo(3);
    const first = memoryIo();
    const city = await runLay(command(dir, "--lock"), first.io);
    const lock = first.files[join(dir, LOCKFILE)]!;
    expect(JSON.parse(lock).index).toBe(2);
    const second = memoryIo({ [join(dir, LOCKFILE)]: lock });
    const again = await runLay(command(dir), second.io);
    expect(second.lines).toContain(`lock/resume commit=${git(dir, "rev-parse", "HEAD")} index=2`);
    expect(second.lines.at(-1)).toContain(" commits=1 laid=1 ");
    expect(again).toEqual(city);
  });

  it("saves the lock along the way, so a fold cut short resumes where it was", async () => {
    const dir = repo(5);
    const saved = memoryIo();
    const locks: string[] = [];
    const io: Io = {
      ...saved.io,
      writeFile: (path, text) => {
        locks.push(text);
        saved.io.writeFile(path, text);
      },
    };
    const city = await runLay(command(dir, "--lock"), io, 2);
    const shas = git(dir, "rev-list", "--reverse", "HEAD").split("\n");
    expect(saved.lines.filter((l) => l.startsWith("lock/saved"))).toEqual([
      `lock/saved commit=${shas[1]} index=1`,
      `lock/saved commit=${shas[3]} index=3`,
      `lock/saved commit=${shas[4]} index=4`,
    ]);
    // A fold stopped after its second save resumes from that lock and lays the same city.
    const resumed = memoryIo({ [join(dir, LOCKFILE)]: locks[1]! });
    expect(await runLay(command(dir), resumed.io)).toEqual(city);
    expect(resumed.lines).toContain(`lock/resume commit=${shas[3]} index=3`);
  });

  it("folds in windows on the strides it is given, and resumes on the same schedule", async () => {
    const dir = repo(5);
    const strides: Strides = { tail: 1, window: 2, coarseAfter: 1, coarseWindow: 2, grain: 2 };
    const saved = memoryIo();
    const locks: string[] = [];
    const io: Io = {
      ...saved.io,
      writeFile: (path, text) => {
        locks.push(text);
        saved.io.writeFile(path, text);
      },
    };
    const city = await runLay(command(dir, "--lock"), io, 2, strides);
    const shas = git(dir, "rev-list", "--reverse", "HEAD").split("\n");
    expect(saved.lines[0]).toBe("history/schedule commits=5 coarse=4 tail=4 from=0 laid=3");
    expect(saved.lines.filter((l) => l.startsWith("lock/saved"))).toEqual([
      `lock/saved commit=${shas[3]} index=3`,
      `lock/saved commit=${shas[4]} index=4`,
    ]);
    expect(saved.lines.at(-1)).toMatch(/ commits=5 laid=3 lots=60 /);
    // Every file is laid at the end, though the fold laid three of the five commits.
    expect(city.towns.reduce((s, t) => s + t.stats.lots, 0)).toBe(60);
    // Resumed from the lock saved along the way, the fold lays that commit again, then the rest of the schedule.
    const resumed = memoryIo({ [join(dir, LOCKFILE)]: locks[0]! });
    expect(await runLay(command(dir), resumed.io, 2, strides)).toEqual(city);
    expect(resumed.lines).toContain("history/schedule commits=5 coarse=4 tail=4 from=3 laid=2");
    expect(resumed.lines.at(-1)).toMatch(/ commits=2 laid=2 /);
  });

  it("ignores a lockfile for another land setting or off the history", async () => {
    const dir = repo(2);
    const first = memoryIo();
    await runLay(command(dir, "--lock"), first.io);
    const lock = first.files[join(dir, LOCKFILE)]!;
    const tests = memoryIo({ [join(dir, LOCKFILE)]: lock });
    await runLay(command(dir, "--tests"), tests.io);
    expect(tests.lines.some((l) => l.startsWith("lock/ignored reason=setting"))).toBe(true);
    // A lock folded under other toggles is set aside too: the history folds afresh, never continued.
    const untoggled = memoryIo({ [join(dir, LOCKFILE)]: lock });
    await runLay(command(dir, "--toggles="), untoggled.io);
    expect(untoggled.lines).toContain(`lock/ignored reason=setting lock=${JSON.parse(lock).plat.setting}`);
    expect(JSON.parse(lock).plat.setting).toMatch(/\|toggles:corridor,tiers$/);
    git(dir, "checkout", "-q", "-b", "other", "HEAD~1");
    writeFileSync(join(dir, "x.ts"), "x");
    git(dir, "add", "-A");
    git(dir, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "other");
    const off = memoryIo({ [join(dir, LOCKFILE)]: lock });
    await runLay(command(dir), off.io);
    expect(off.lines.some((l) => l.startsWith("lock/ignored reason=not-an-ancestor"))).toBe(true);
  });

  it("lays one state without its history, every file at once", async () => {
    const dir = repo(3);
    const { io, files, lines } = memoryIo();
    const city = await runLay(command(dir, "--no-history", "--out=city.json"), io);
    expect(lines.at(-1)).toMatch(/^fold\/done repository=citymap-cli-\S+ commits=1 laid=1 lots=36 overflow=0 ms=\d+$/);
    expect(parseCityFile(files["city.json"]!).city).toEqual(city);
    // The state of an earlier commit, and a lockfile left alone.
    const earlier = await runLay(
      command(dir, "--no-history", `--to=${git(dir, "rev-list", "--reverse", "HEAD").split("\n")[0]}`),
      memoryIo().io,
    );
    expect(earlier.towns.reduce((s, t) => s + t.stats.lots, 0)).toBe(12);
    expect(files[join(dir, LOCKFILE)]).toBeUndefined();
  });

  it("rejects a broken lockfile by name", async () => {
    const dir = repo(1);
    await expect(runLay(command(dir), memoryIo({ [join(dir, LOCKFILE)]: "{" }).io)).rejects.toThrow("lock/");
    await expect(runLay(command(dir), memoryIo({ [join(dir, LOCKFILE)]: '{"commit":1}' }).io)).rejects.toThrow("lock/");
    await expect(
      runLay(command(dir), memoryIo({ [join(dir, LOCKFILE)]: '{"commit":"a","index":-1}' }).io),
    ).rejects.toThrow("lock/");
  });

  it("rejects a ref that names no commit", async () => {
    const dir = repo(1);
    await expect(runLay(command(dir, "--to=nope"), memoryIo().io)).rejects.toThrow("history/git-failed");
  });
});

/** A repository of sources, a test that names one, a manifest and an image, by two people. */
function measured(): string {
  const dir = mkdtempSync(join(tmpdir(), "citymap-cli-measures-"));
  dirs.push(dir);
  git(dir, "init", "-q", "-b", "main");
  const as = (email: string) => {
    git(dir, "add", "-A");
    git(dir, "-c", `user.email=${email}`, "-c", "user.name=x", "commit", "-q", "-m", email);
  };
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "src/a.ts"), "// TODO: a\nexport const a = 1;\n");
  writeFileSync(join(dir, "src/b.ts"), "export const b = 2;\n");
  writeFileSync(join(dir, "src/copy.ts"), "export const b = 2;\n");
  writeFileSync(join(dir, "src/a.test.ts"), "test();\n");
  writeFileSync(join(dir, "package.json"), "{}\n");
  as("ann@x.org");
  writeFileSync(join(dir, "src/a.ts"), "// TODO: a\nexport const a = 1;\nexport const c = 3;\n");
  writeFileSync(join(dir, "logo.png"), Buffer.from([0x89, 0, 1, 2]));
  as("bob@x.org");
  return dir;
}
const fileOf = (text: string, path: string) =>
  Object.values(parseCityFile(text).measures!.lots)
    .flatMap((town) => Object.values(town))
    .flatMap((lot) => lot.files)
    .find((f) => f.path === path);

describe("runLay's measures", () => {
  it("writes sizes, comments, tests by name and history beside the layout, which stays as it was", async () => {
    const dir = measured();
    const { io, files, lines } = memoryIo();
    const city = await runLay(command(dir, "--out=city.json"), io);
    const text = files["city.json"]!;
    const { measures } = parseCityFile(text);
    expect(measures).toMatchObject({ source: "cli", size: "lines", tested: "name" });
    expect(measures!.available).toEqual(["size", "tested", "kind", "recency", "churn", "authors", "comments"]);
    expect(fileOf(text, "src/a.ts")).toMatchObject({
      bytes: 51,
      lines: 3,
      comments: 1,
      todos: 1,
      named: true,
      commits: 2,
      authors: 2,
    });
    expect(fileOf(text, "src/b.ts")).toMatchObject({ named: false, commits: 1, authors: 1 });
    expect(fileOf(text, "src/copy.ts")).toMatchObject({ bytes: 20, lines: 1 });
    expect(fileOf(text, "logo.png")).toMatchObject({ bytes: 4 });
    expect(fileOf(text, "logo.png")?.lines).toBeUndefined();
    expect(lines.at(-2)).toBe("measures/done source=cli size=lines tested=name lots=5 files=5 read=6 unread=0");
    const bare = memoryIo();
    await runLay(command(dir, "--out=city.json", "--no-measures"), bare.io);
    expect(bare.files["city.json"]).toBe(text.replace(/"measures":\{.*\},"repository"/, `"repository"`));
    expect(parseCityFile(bare.files["city.json"]!)).toEqual({ city, measures: null });
  });

  it("reads coverage named on the command line, or at the usual paths, and says which it skipped", async () => {
    const dir = measured();
    const lcov = "SF:src/a.ts\nDA:1,1\nDA:2,0\nend_of_record\nSF:gone.ts\nDA:1,1\nend_of_record\n";
    const report = join(dir, "report.info");
    const named = memoryIo({ [report]: lcov });
    await runLay(command(dir, "--out=city.json", `--coverage=${report}`), named.io);
    expect(parseCityFile(named.files["city.json"]!).measures?.tested).toBe("coverage");
    expect(fileOf(named.files["city.json"]!, "src/a.ts")).toMatchObject({ covered: 1, executable: 2 });
    expect(fileOf(named.files["city.json"]!, "src/b.ts")?.named).toBeUndefined();
    expect(named.lines).toContain(`measures/report path=${report} format=lcov files=2 matched=1`);
    const outside = memoryIo({ "/elsewhere/lcov.info": lcov });
    await runLay(command(dir, "--out=city.json", "--coverage=/elsewhere/lcov.info"), outside.io);
    expect(fileOf(outside.files["city.json"]!, "src/a.ts")).toMatchObject({ covered: 1, executable: 2 });
    const usual = memoryIo({
      [`${dir}/coverage/lcov.info`]: lcov,
      [`${dir}/coverage.xml`]: "<html/>",
      [`${dir}/lcov.info`]: "x".repeat(300 * 1024 * 1024),
    });
    await runLay(command(dir, "--out=city.json", "--no-history"), usual.io);
    expect(usual.lines).toContain("measures/report-skipped path=lcov.info reason=too-large");
    expect(usual.lines).toContain("measures/report-skipped path=coverage.xml reason=unreadable");
    expect(usual.lines).toContain("measures/report path=coverage/lcov.info format=lcov files=2 matched=1");
    expect(parseCityFile(usual.files["city.json"]!).measures!.available).toEqual([
      "size",
      "tested",
      "kind",
      "comments",
    ]);
    expect(fileOf(usual.files["city.json"]!, "src/a.ts")?.commits).toBeUndefined();
  });

  it("rejects a named report that is missing, unreadable or too large, before the fold", async () => {
    const dir = measured();
    await expect(runLay(command(dir, "--out=c.json", "--coverage=/nowhere"), memoryIo().io)).rejects.toThrow(
      "coverage/missing",
    );
    await expect(
      runLay(command(dir, "--out=c.json", "--coverage=r.xml"), memoryIo({ "r.xml": "<x/>" }).io),
    ).rejects.toThrow("coverage/unreadable");
    await expect(
      runLay(command(dir, "--out=c.json", "--coverage=r"), memoryIo({ r: "x".repeat(300 * 1024 * 1024) }).io),
    ).rejects.toThrow("coverage/unreadable: r is larger than");
  });

  it("measures a partial clone without fetching: what it does not hold is unknown", async () => {
    const source = measured();
    git(source, "config", "uploadpack.allowFilter", "true");
    const clone = mkdtempSync(join(tmpdir(), "citymap-cli-partial-"));
    dirs.push(clone);
    execFileSync("git", ["clone", "-q", "--no-checkout", "--filter=blob:none", `file://${source}`, clone], {
      env: gitEnvironment(),
    });
    const { io, files, lines } = memoryIo();
    await runLay(command(clone, "--out=city.json"), io);
    expect(lines.at(-2)).toBe("measures/done source=cli size=lines tested=name lots=5 files=5 read=0 unread=6");
    expect(fileOf(files["city.json"]!, "src/a.ts")).toEqual({
      path: "src/a.ts",
      named: true,
      changed: expect.any(Number),
      commits: 2,
      authors: 2,
    });
  });

  it("propagates a failure that is not a report's", async () => {
    const dir = measured();
    const io: Io = {
      ...memoryIo().io,
      readFile: (path) => {
        if (path.endsWith("coverage/lcov.info")) throw new Error("disk on fire");
        return null;
      },
    };
    await expect(runLay(command(dir, "--out=c.json", "--no-history"), io)).rejects.toThrow("disk on fire");
  });
});

/** A fresh folder named `fixture`, so every copy lays under the same repository name. */
const fixtureFolder = () => {
  const parent = mkdtempSync(join(tmpdir(), "citymap-cli-mailmap-"));
  dirs.push(parent);
  return join(parent, "fixture");
};
/** Ann under two addresses and Bob; the last commit's .mailmap makes Ann one person, an earlier one knew nobody. */
function mailmapped(): string {
  const dir = fixtureFolder();
  mkdirSync(join(dir, "src"), { recursive: true });
  git(dir, "init", "-q", "-b", "main");
  const as = (name: string, email: string) => {
    git(dir, "add", "-A");
    git(dir, "-c", `user.email=${email}`, "-c", `user.name=${name}`, "commit", "-q", "-m", email);
  };
  writeFileSync(join(dir, "src/a.ts"), "1\n");
  as("Ann", "ann@old.org");
  writeFileSync(join(dir, "src/a.ts"), "2\n");
  writeFileSync(join(dir, ".mailmap"), "# nobody yet\n");
  as("Ann", "ann@new.org");
  writeFileSync(join(dir, "src/a.ts"), "3\n");
  as("Bob", "bob@x.org");
  writeFileSync(join(dir, ".mailmap"), "Ann <ann@new.org> <ann@old.org>\n");
  as("Bob", "bob@x.org");
  return dir;
}
const lay = async (dir: string, ...flags: string[]) => {
  const { io, files, lines } = memoryIo();
  await runLay(command(dir, "--out=city.json", ...flags), io);
  return { text: files["city.json"]!, lines: lines.map((l) => l.replace(/ ms=\d+$/, "")) };
};

describe("runLay's authors", () => {
  it("lays the same city with and without a checkout, whatever the working tree's .mailmap and git's settings", async () => {
    const source = mailmapped();
    const bare = fixtureFolder();
    git(source, "clone", "-q", "--no-checkout", source, bare);
    const checkedOut = fixtureFolder();
    git(source, "clone", "-q", source, checkedOut);
    const without = await lay(bare);
    expect(fileOf(without.text, "src/a.ts")).toMatchObject({ commits: 3, authors: 2 });
    expect(without.lines).toContain("history/mailmap status=read entries=1");
    expect(await lay(checkedOut)).toEqual(without);
    // A working tree .mailmap and settings that would make everyone one person change nothing.
    const everyone = "One <one@x> <ann@old.org>\nOne <one@x> <ann@new.org>\nOne <one@x> <bob@x.org>\n";
    writeFileSync(join(checkedOut, ".mailmap"), everyone);
    writeFileSync(join(checkedOut, "..", "everyone"), everyone);
    git(checkedOut, "config", "mailmap.file", join(checkedOut, "..", "everyone"));
    git(checkedOut, "config", "mailmap.blob", "HEAD:.mailmap");
    expect(await lay(checkedOut)).toEqual(without);
  });

  it("maps authors by the .mailmap of the commit it lays, and resumes to the same city", async () => {
    const dir = mailmapped();
    const earlier = await lay(dir, "--to=HEAD~1");
    expect(fileOf(earlier.text, "src/a.ts")).toMatchObject({ commits: 3, authors: 3 });
    expect(earlier.lines).toContain("history/mailmap status=read entries=0");
    const lockAt = memoryIo();
    await runLay(command(dir, "--to=HEAD~1", "--lock"), lockAt.io);
    const lock = lockAt.files[join(dir, LOCKFILE)]!;
    const resumed = memoryIo({ [join(dir, LOCKFILE)]: lock });
    await runLay(command(dir, "--out=city.json", "--lock"), resumed.io);
    expect(resumed.lines).toContain("lock/resume commit=" + git(dir, "rev-parse", "HEAD~1") + " index=2");
    expect(resumed.files["city.json"]).toBe((await lay(dir)).text);
  });
});

/** A city file's people: which measures it has, and every file's and lot's authors, by town and lot. */
function authorsOf(text: string) {
  const { measures } = parseCityFile(text);
  const lots = Object.entries(measures!.lots).flatMap(([town, townLots]) =>
    Object.entries(townLots).map(([key, lot]) => ({
      lot: `${town}/${key}`,
      authors: lot.authors,
      files: lot.files.map((f) => f.authors),
    })),
  );
  return { available: measures!.available, lots };
}

/** A blob-less clone, without a checkout, named `fixture`. */
function partialOf(source: string): string {
  git(source, "config", "uploadpack.allowFilter", "true");
  const clone = fixtureFolder();
  execFileSync("git", ["clone", "-q", "--no-checkout", "--filter=blob:none", `file://${source}`, clone], {
    env: gitEnvironment(),
  });
  return clone;
}

describe("runLay's authors in a partial clone", () => {
  it("fetches the laid commit's .mailmap alone and counts the people as a full clone does", async () => {
    const source = mailmapped();
    const clone = partialOf(source);
    const partial = await lay(clone);
    expect(partial.lines).toContain("history/mailmap status=fetched entries=1");
    expect(authorsOf(partial.text)).toEqual(authorsOf((await lay(source)).text));
    expect(fileOf(partial.text, "src/a.ts")).toMatchObject({ commits: 3, authors: 2 });
    const blobs = git(clone, "cat-file", "--batch-check=%(objecttype) %(objectname)", "--batch-all-objects")
      .split("\n")
      .filter((line) => line.startsWith("blob "));
    expect(blobs).toEqual([`blob ${git(clone, "rev-parse", "HEAD:.mailmap")}`]);
  });

  it("lays authors unknown, saying why, when the .mailmap cannot be fetched", async () => {
    const clone = partialOf(mailmapped());
    git(clone, "remote", "set-url", "origin", join(clone, "gone"));
    const offline = await lay(clone);
    expect(offline.lines).toContainEqual(
      expect.stringMatching(
        /^history\/mailmap status=unfetchable entries=0 reason=exit-128 error=fatal: '.*gone' does not appear to be a git repository$/,
      ),
    );
    const { available, lots } = authorsOf(offline.text);
    expect(available).toEqual(["size", "tested", "kind", "recency", "churn", "comments"]);
    expect(lots.every((lot) => lot.authors === undefined && lot.files.every((a) => a === undefined))).toBe(true);
    expect(fileOf(offline.text, "src/a.ts")).toMatchObject({ commits: 3 });
  });
});
