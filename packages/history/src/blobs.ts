import { execFile, spawn, type ChildProcessByStdio } from "node:child_process";
import { finished, type Readable, type Writable } from "node:stream";
import { promisify } from "node:util";
import { gitEnvironment, onGitData } from "./env";

interface Batch {
  readonly child: ChildProcessByStdio<Writable, Readable, null>;
  readonly chunks: AsyncIterator<Buffer>;
  /** Output read but not yet answered, in order; joined only once an answer is whole. */
  pending: Buffer[];
}

/** A blob read: its hash and its bytes, or null when the repository does not hold it. */
export type OnBlob = (blob: string, bytes: Buffer | null) => void;

const run = promisify(execFile);
// No protocol is allowed, so a blob-less clone never fetches, whichever git (GIT_NO_LAZY_FETCH needs 2.44).
const ENV = { ...gitEnvironment(), GIT_ALLOW_PROTOCOL: "none" };
const PARTIAL_CLONE = "^(extensions\\.partialclone|remote\\..*\\.promisor)$";

/**
 * Reads blobs by hash through a long-lived `git cat-file --batch`, pipelined. A blob the repository does not hold
 * reads as null: git reports it missing, or (before 2.44) exits on the fetch it may not make, and the blobs after it
 * are asked again of a fresh process. In a partial clone, where asking for a missing blob costs git seconds, only the
 * blobs the clone holds are asked for.
 */
export class BlobReader {
  private batch: Batch | null = null;
  /** The blobs a partial clone holds; null for a full clone, which holds them all. */
  private held: Promise<ReadonlySet<string> | null> | null = null;

  /** Git's arguments that name what it reads: a repository's folder, or git data itself. */
  private readonly at: readonly string[];

  /** A reader of the repository in `dir`, or, with `gitData`, of the git data at `dir` (a submodule's). */
  constructor(dir: string, { gitData = false }: { readonly gitData?: boolean } = {}) {
    this.at = gitData ? onGitData(dir) : ["-C", dir];
  }

  /** Each blob's text, or null when the repository does not hold it. */
  async readAll(blobs: readonly string[]): Promise<Map<string, string | null>> {
    const texts = new Map<string, string | null>();
    await this.readBytes(blobs, (blob, bytes) => texts.set(blob, bytes === null ? null : bytes.toString("utf8")));
    return texts;
  }

  /** Hands each blob's bytes to `onBlob` as it arrives (null when the repository does not hold it), keeping none. */
  async readBytes(blobs: readonly string[], onBlob: OnBlob): Promise<void> {
    if (blobs.length === 0) return;
    const held = await (this.held ??= heldBlobs(this.at));
    for (const blob of blobs) if (held && !held.has(blob)) onBlob(blob, null);
    await this.ask(held ? blobs.filter((blob) => held.has(blob)) : blobs, onBlob);
  }

  /** Ends the batch process. */
  async close(): Promise<void> {
    const batch = this.batch;
    this.batch = null;
    if (!batch) return;
    const closed = new Promise((done) => batch.child.once("close", done));
    batch.child.stdin.end();
    await closed;
  }

  private async ask(blobs: readonly string[], onBlob: OnBlob): Promise<void> {
    if (blobs.length === 0) return;
    const batch = (this.batch ??= start(this.at));
    batch.child.stdin.write(blobs.map((blob) => `${blob}\n`).join(""));
    const answered = await answer(batch, blobs, onBlob);
    if (answered === blobs.length) return;
    // The process ended at this blob: it is unavailable, and the rest go to a fresh process.
    onBlob(blobs[answered]!, null);
    this.batch = null;
    await this.ask(blobs.slice(answered + 1), onBlob);
  }
}

/** The blobs a partial clone holds, or null when the repository is not one (or git cannot say). */
async function heldBlobs(at: readonly string[]): Promise<ReadonlySet<string> | null> {
  const git = (...args: string[]) => run("git", [...at, ...args], { env: ENV, maxBuffer: 1 << 30 });
  try {
    await git("config", "--get-regexp", PARTIAL_CLONE);
  } catch {
    // No such setting, or no repository: not a partial clone; the batch reports whatever is missing.
    return null;
  }
  const listing = "--batch-check=%(objecttype) %(objectname)";
  const { stdout } = await git("cat-file", listing, "--batch-all-objects", "--unordered");
  return new Set(
    stdout
      .split("\n")
      .filter((line) => line.startsWith("blob "))
      .map((line) => line.slice(5)),
  );
}

function start(at: readonly string[]): Batch {
  const child = spawn("git", [...at, "cat-file", "--batch"], { stdio: ["pipe", "pipe", "ignore"], env: ENV });
  // A process that ended early fails the writes still queued for it; the end of its output reports those blobs.
  finished(child.stdin, () => {});
  return { child, chunks: (child.stdout as AsyncIterable<Buffer>)[Symbol.asyncIterator](), pending: [] };
}

/** Reads the answers for `blobs` from `at` on; the number answered before the output ended. */
async function answer(batch: Batch, blobs: readonly string[], onBlob: OnBlob, at = 0): Promise<number> {
  if (at === blobs.length) return at;
  const piece = await take(batch);
  if (!piece) return at;
  const newline = piece.indexOf(0x0a);
  onBlob(blobs[at]!, newline === piece.length - 1 ? null : piece.subarray(newline + 1, -1));
  return answer(batch, blobs, onBlob, at + 1);
}

/** The pending output as one buffer, copied only when it is in pieces. */
function joined(batch: Batch): Buffer {
  const head = batch.pending.length === 1 ? batch.pending[0]! : Buffer.concat(batch.pending);
  batch.pending = head.length > 0 ? [head] : [];
  return head;
}

/** Reads output until at least `more` bytes more are pending; false when it ends first. */
async function fill(batch: Batch, more: number): Promise<boolean> {
  if (more <= 0) return true;
  const next = await batch.chunks.next();
  if (next.done) return false;
  batch.pending.push(next.value);
  return fill(batch, more - next.value.length);
}

/** The next whole answer, reading more output as needed (a large blob joined once, when whole); null at its end. */
async function take(batch: Batch): Promise<Buffer | null> {
  const head = joined(batch);
  const n = answerLength(head);
  if (n > 0 && n <= head.length) {
    batch.pending = n < head.length ? [head.subarray(n)] : [];
    return head.subarray(0, n);
  }
  // Until the header is whole, one more chunk; after it, every chunk the answer needs.
  return (await fill(batch, n > 0 ? n - head.length : 1)) ? take(batch) : null;
}

/** The length of one whole answer: "<hash> missing", or "<hash> blob <size>", the content and a newline; 0 if unknown. */
function answerLength(buffer: Buffer): number {
  const newline = buffer.indexOf(0x0a);
  if (newline < 0) return 0;
  const size = /^\S+ blob (\d+)$/.exec(buffer.subarray(0, newline).toString("utf8"))?.[1];
  return size === undefined ? newline + 1 : newline + 1 + Number(size) + 1;
}
