// Who an author is, as the laid commit's `.mailmap` says: read from the commit, never from the working tree or git's
// mailmap settings, so the same history always counts the same people. Lines are read as git's `mailmap.c` reads them.
import { execFile } from "node:child_process";
import { CitymapError } from "@citymap/ground-plan";
import type { BlobReader } from "./blobs";
import { gitEnvironment } from "./env";

/** A commit's author as written (`%an`, `%ae`), never mapped by git. */
export interface Author {
  readonly name: string;
  readonly email: string;
}

/** What a mailmap says of one commit email: the email it gives (or none), and the emails it gives by author name. */
interface Entry {
  email: string | null;
  readonly byName: Map<string, string>;
}

/** The emails a `.mailmap` maps, keyed by the commit email folded in ASCII. */
export type Mailmap = ReadonlyMap<string, Entry>;

export type MailmapStatus = "read" | "absent" | "not-a-file" | "unavailable";

export interface MailmapRead {
  readonly code: "history/mailmap";
  readonly detail: { readonly status: MailmapStatus; readonly entries: number };
}

/** Git compares mailmap keys with `strcasecmp`: ASCII letters only fold. */
const folded = (text: string) => text.replace(/[A-Z]/g, (c) => c.toLowerCase());

/** Git's `isspace`: space, tab, line feed and carriage return. */
const trimmed = (text: string) => text.replace(/^[ \t\n\r]+|[ \t\n\r]+$/g, "");

interface Pair {
  readonly name: string | null;
  readonly email: string;
  /** What follows the pair's `>`; null when nothing does. */
  readonly rest: string | null;
}

/** One `Name <email>` pair from the start of `text`, as git's `parse_name_and_email`; null when there is none. */
function pairOf(text: string, allowEmptyEmail: boolean): Pair | null {
  const left = text.indexOf("<");
  if (left < 0) return null;
  const right = text.indexOf(">", left + 1);
  if (right < 0 || (!allowEmptyEmail && right === left + 1)) return null;
  const name = trimmed(text.slice(0, left));
  const rest = text.slice(right + 1);
  return { name: name === "" ? null : name, email: text.slice(left + 1, right), rest: rest === "" ? null : rest };
}

/** Adds one line's mapping, as git's `add_mapping`: a later line for the same key wins. */
function add(entries: Map<string, Entry>, proper: Pair, commit: Pair | null): void {
  const key = folded(commit?.email ?? proper.email);
  let entry = entries.get(key);
  if (!entry) {
    entry = { email: null, byName: new Map() };
    entries.set(key, entry);
  }
  if (commit?.name) entry.byName.set(folded(commit.name), proper.email);
  else if (commit) entry.email = proper.email;
}

/** A `.mailmap`'s text, read as git reads a mailmap blob. */
export function parseMailmap(text: string): Mailmap {
  const entries = new Map<string, Entry>();
  const nul = text.indexOf("\0");
  for (const line of (nul < 0 ? text : text.slice(0, nul)).split("\n")) {
    if (line.startsWith("#")) continue;
    const proper = pairOf(line, false);
    if (!proper) continue;
    add(entries, proper, proper.rest === null ? null : pairOf(proper.rest, true));
  }
  return entries;
}

/** The email an author's commits count under: the entry for their name, else for their email, else their own. */
export function emailOf(mailmap: Mailmap, author: Author): string {
  const entry = mailmap.get(folded(author.email));
  if (!entry) return author.email;
  return entry.byName.get(folded(author.name)) ?? entry.email ?? author.email;
}

const REGULAR = new Set(["100644", "100755"]);

const outcome = (status: MailmapStatus, mailmap: Mailmap = new Map()) => ({
  mailmap,
  event: { code: "history/mailmap", detail: { status, entries: mailmap.size } } satisfies MailmapRead,
});

/** The `.mailmap` at the root of `commit`, read through `blobs` (never fetched), and what was found. */
export async function readMailmap(
  dir: string,
  commit: string,
  blobs: BlobReader,
): Promise<{ mailmap: Mailmap; event: MailmapRead }> {
  // The root's entry, whichever folder of the repository `dir` names.
  const args = ["-C", dir, "ls-tree", "-z", "--full-tree", commit, "--", ".mailmap"];
  const listing = await new Promise<string>((done, fail) => {
    execFile("git", args, { env: gitEnvironment() }, (error, stdout, stderr) => {
      if (error === null) done(stdout);
      else {
        const first = stderr.split("\n", 1)[0];
        fail(
          new CitymapError("history/git-failed", `git ls-tree exited with ${String(error.code)}: ${first}`, { commit }),
        );
      }
    });
  });
  if (listing === "") return outcome("absent");
  // "<mode> <type> <hash>\t.mailmap"
  const [mode = "", , blob = ""] = listing.slice(0, listing.indexOf("\t")).split(" ");
  if (!REGULAR.has(mode)) return outcome("not-a-file");
  const text = (await blobs.readAll([blob])).get(blob);
  return typeof text === "string" ? outcome("read", parseMailmap(text)) : outcome("unavailable");
}
