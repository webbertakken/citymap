import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { BlobReader } from "./blobs";
import { gitEnvironment } from "./env";
import { emailOf, parseMailmap, readMailmap, type Author } from "./mailmap";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const git = (dir: string, ...args: string[]) =>
  execFileSync("git", ["-C", dir, ...args], { encoding: "utf8", env: gitEnvironment() });
function repo(): string {
  const dir = mkdtempSync(join(tmpdir(), "citymap-mailmap-"));
  dirs.push(dir);
  git(dir, "init", "-q", "-b", "main");
  return dir;
}
const commitAs = (dir: string, author: Author, message: string) => {
  git(dir, "add", "-A");
  execFileSync("git", ["-C", dir, "commit", "-q", "--allow-empty", "-m", message], {
    env: {
      ...gitEnvironment(),
      GIT_AUTHOR_NAME: author.name,
      GIT_AUTHOR_EMAIL: author.email,
      GIT_COMMITTER_NAME: "c",
      GIT_COMMITTER_EMAIL: "c@c",
    },
  });
};
const map = (text: string, name: string, email: string) => emailOf(parseMailmap(text), { name, email });

describe("parseMailmap and emailOf", () => {
  it("reads git's four forms", () => {
    expect(map("Proper Name <commit@x>", "Any", "commit@x")).toBe("commit@x");
    expect(map("<proper@x> <commit@x>", "Any", "commit@x")).toBe("proper@x");
    expect(map("Proper Name <proper@x> <commit@x>", "Any", "commit@x")).toBe("proper@x");
    const named = "Proper Name <proper@x> Commit Name <commit@x>";
    expect(map(named, "Commit Name", "commit@x")).toBe("proper@x");
    expect(map(named, "Someone Else", "commit@x")).toBe("commit@x");
  });

  it("leaves an author no line names as they are", () => {
    expect(map("<proper@x> <commit@x>", "Any", "other@x")).toBe("other@x");
    expect(emailOf(parseMailmap(""), { name: "", email: "" })).toBe("");
  });

  it("compares emails and names in ASCII without case, and nothing else", () => {
    expect(map("<proper@x> <Commit@X>", "Any", "cOMMIT@x")).toBe("proper@x");
    expect(map("<proper@x> commit NAME <commit@x>", "Commit Name", "commit@x")).toBe("proper@x");
    expect(map("<proper@x> <ÖLA@x>", "Any", "öla@x")).toBe("öla@x");
    expect(map("<proper@x> ünal <unal@x>", "Ünal", "unal@x")).toBe("unal@x");
  });

  it("falls back from a name it does not know to the simple entry of the email", () => {
    const text = "<named@x> Old Name <commit@x>\n<simple@x> <commit@x>";
    expect(map(text, "Old Name", "commit@x")).toBe("named@x");
    expect(map(text, "New Name", "commit@x")).toBe("simple@x");
  });

  it("lets a later line win, but a line without an email keeps the email an earlier one gave", () => {
    expect(map("<first@x> <commit@x>\n<second@x> <commit@x>", "Any", "commit@x")).toBe("second@x");
    expect(map("<first@x> <commit@x>\nProper <commit@x>", "Any", "commit@x")).toBe("first@x");
    expect(map("<one@x> Name <commit@x>\n<two@x> NAME <commit@x>", "name", "commit@x")).toBe("two@x");
  });

  it("skips comments, malformed lines and anything after a NUL", () => {
    expect(map("# <proper@x> <commit@x>", "Any", "commit@x")).toBe("commit@x");
    expect(map("  # <proper@x> <commit@x>", "Any", "commit@x")).toBe("proper@x");
    expect(map("<> <commit@x>", "Any", "commit@x")).toBe("commit@x");
    expect(map("<proper@x <commit@x", "Any", "commit@x")).toBe("commit@x");
    expect(map("proper@x commit@x", "Any", "commit@x")).toBe("commit@x");
    expect(map("<a@x> <b@x>\0\n<proper@x> <commit@x>", "Any", "commit@x")).toBe("commit@x");
    expect(map("<a@x> <b@x>\0", "Any", "b@x")).toBe("a@x");
  });

  it("keeps emails as written, trims names, reads CRLF lines and ignores text after the second pair", () => {
    expect(map("<proper@x> < commit@x >", "Any", "commit@x")).toBe("commit@x");
    expect(map("<proper@x> < commit@x >", "Any", " commit@x ")).toBe("proper@x");
    expect(map("<proper@x> \t Commit Name \t <commit@x>\r", "Commit Name", "commit@x")).toBe("proper@x");
    expect(map("<proper@x><commit@x> trailing <x@y>", "Any", "commit@x")).toBe("proper@x");
    expect(map("<proper@x> <commit@x>\r\n", "Any", "commit@x")).toBe("proper@x");
    expect(map("<proper@x> <>", "Any", "")).toBe("proper@x");
    expect(map("<proper@x>  only a name", "Any", "proper@x")).toBe("proper@x");
  });

  it("counts the emails it maps", () => {
    expect(parseMailmap("<a@x> <b@x>\n<c@x> Name <B@x>\nName <d@x>\n# <e@x> <f@x>").size).toBe(2);
  });

  it("maps every author as git's own %aE does with the same .mailmap", () => {
    const dir = repo();
    const authors: Author[] = [
      { name: "Ann", email: "ann@old.org" },
      { name: "Bob", email: "bob@old.org" },
      { name: "Cy", email: "cy@x.org" },
      { name: "Dee Old", email: "dee@old.org" },
      { name: "Someone Else", email: "dee@old.org" },
      { name: "EVE", email: "eve@old.org" },
      { name: "Fay", email: "fay@old.org" },
      { name: "Gil", email: "gil@old.org" },
      { name: "Gus", email: "gus@old.org" },
      { name: "Hal", email: "hal@old.org" },
      { name: "Ivy", email: "ivy@old.org" },
      { name: "Jo", email: "jo@old.org" },
      { name: "Lee", email: "lee@old.org" },
      { name: "Max", email: "max@old.org" },
      { name: "Ned", email: "ned@old.org" },
      { name: "Oz", email: "oz@old.org" },
      { name: "Pat Name", email: "pat@old.org" },
      { name: "ROS", email: "ros@old.org" },
      { name: "Ünal", email: "unal@old.org" },
      { name: "Öla", email: "öla@old.org" },
      { name: "Zed", email: "zed@other.org" },
    ];
    authors.forEach((author, i) => commitAs(dir, author, `c${i}`));
    const text = [
      "# a comment",
      "Ann Proper <ann@new.org> <ANN@old.org>",
      "<bob@new.org> <bob@old.org>",
      "Cy Proper <cy@x.org>",
      "Dee Proper <dee@new.org> Dee Old <dee@old.org>",
      "<dee@simple.org> <dee@old.org>",
      "Eve <eve@new.org> eve <EVE@old.org>",
      "<first@x.org> <fay@old.org>",
      "<second@x.org> <fay@old.org>",
      "<gil@new.org> <gil@old.org>",
      "Gil Proper <gil@old.org>",
      "Gus Only <gus@old.org>",
      "<> <hal@old.org>",
      " <ivy@new.org>   <ivy@old.org>  trailing junk",
      "<jo@new.org> <jo@old.org> Extra <x@y>",
      "<lee@new.org> < lee@old.org >",
      "#<max@new.org> <max@old.org>",
      "  # <ned@new.org> <ned@old.org>",
      "<oz@new.org><oz@old.org>",
      "Pat <pat@new.org> Pat Name  <pat@old.org>\r",
      "Ros <ros@one.org> Ros <ros@old.org>",
      "Ros <ros@two.org> ros <ros@old.org>",
      "<unal@new.org> ünal <unal@old.org>",
      "<ola@new.org> <ÖLA@old.org>",
      "",
    ].join("\n");
    // In a checkout, git maps %aE through the working tree's .mailmap: the reference to match.
    writeFileSync(join(dir, ".mailmap"), text);
    const log = git(dir, "log", "--reverse", "--format=%an%x02%ae%x02%aE").trimEnd().split("\n");
    const mailmap = parseMailmap(text);
    const ours = log.map((line) => {
      const [name = "", email = ""] = line.split("\u0002");
      return emailOf(mailmap, { name, email });
    });
    expect(ours).toEqual(log.map((line) => line.split("\u0002")[2]));
    expect(ours).toContain("dee@simple.org");
    expect(ours).toContain("second@x.org");
  });
});

/** The .mailmap of `commit`, read as the history reader reads it. */
async function read(dir: string, commit = "HEAD") {
  const blobs = new BlobReader(dir);
  try {
    return await readMailmap(dir, git(dir, "rev-parse", commit).trim(), blobs);
  } finally {
    await blobs.close();
  }
}

describe("readMailmap", () => {
  it("reads the commit's .mailmap, whatever the working tree holds", async () => {
    const dir = repo();
    writeFileSync(join(dir, ".mailmap"), "<one@x> <a@x>\n");
    commitAs(dir, { name: "A", email: "a@x" }, "one");
    writeFileSync(join(dir, ".mailmap"), "<two@x> <a@x>\n<b2@x> <b@x>\n");
    commitAs(dir, { name: "A", email: "a@x" }, "two");
    writeFileSync(join(dir, ".mailmap"), "<tree@x> <a@x>\n");
    const head = await read(dir);
    expect(head.event).toEqual({ code: "history/mailmap", detail: { status: "read", entries: 2 } });
    expect(emailOf(head.mailmap, { name: "A", email: "a@x" })).toBe("two@x");
    const first = await read(dir, "HEAD~1");
    expect(first.event.detail).toEqual({ status: "read", entries: 1 });
    expect(emailOf(first.mailmap, { name: "A", email: "a@x" })).toBe("one@x");
  });

  it("maps nobody when the commit has no .mailmap file", async () => {
    const dir = repo();
    writeFileSync(join(dir, "a.ts"), "a");
    commitAs(dir, { name: "A", email: "a@x" }, "one");
    writeFileSync(join(dir, ".mailmap"), "<tree@x> <a@x>\n");
    const absent = await read(dir);
    expect(absent.event.detail).toEqual({ status: "absent", entries: 0 });
    expect(emailOf(absent.mailmap, { name: "A", email: "a@x" })).toBe("a@x");
    git(dir, "rm", "-q", "--cached", "--ignore-unmatch", ".mailmap");
    rmSync(join(dir, ".mailmap"));
    writeFileSync(join(dir, "real"), "<link@x> <a@x>\n");
    symlinkSync("real", join(dir, ".mailmap"));
    commitAs(dir, { name: "A", email: "a@x" }, "link");
    expect((await read(dir)).event.detail).toEqual({ status: "not-a-file", entries: 0 });
    rmSync(join(dir, ".mailmap"));
    git(dir, "rm", "-q", "--cached", ".mailmap");
    mkdirSync(join(dir, ".mailmap"));
    writeFileSync(join(dir, ".mailmap", "inside"), "<dir@x> <a@x>\n");
    commitAs(dir, { name: "A", email: "a@x" }, "folder");
    expect((await read(dir)).event.detail).toEqual({ status: "not-a-file", entries: 0 });
  });

  it("maps nobody, without fetching, when a partial clone does not hold the .mailmap", async () => {
    const source = repo();
    writeFileSync(join(source, ".mailmap"), "<one@x> <a@x>\n");
    commitAs(source, { name: "A", email: "a@x" }, "one");
    git(source, "config", "uploadpack.allowFilter", "true");
    const clone = mkdtempSync(join(tmpdir(), "citymap-mailmap-partial-"));
    dirs.push(clone);
    execFileSync("git", ["clone", "-q", "--no-checkout", "--filter=blob:none", `file://${source}`, clone], {
      env: gitEnvironment(),
    });
    const unheld = await read(clone);
    expect(unheld.event.detail).toEqual({ status: "unavailable", entries: 0 });
    expect(emailOf(unheld.mailmap, { name: "A", email: "a@x" })).toBe("a@x");
  });

  it("names git failing on a commit it cannot list", async () => {
    const dir = repo();
    commitAs(dir, { name: "A", email: "a@x" }, "one");
    const blobs = new BlobReader(dir);
    await expect(readMailmap(dir, "0".repeat(40), blobs)).rejects.toThrow("history/git-failed");
    await blobs.close();
  });
});
