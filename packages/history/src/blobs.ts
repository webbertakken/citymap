import { execFile, spawn, type ChildProcessByStdio } from "node:child_process";
import { finished, type Readable, type Writable } from "node:stream";
import { promisify } from "node:util";
import { gitEnvironment } from "./env";

interface Batch {
  readonly child: ChildProcessByStdio<Writable, Readable, null>;
  readonly chunks: AsyncIterator<Buffer>;
  buffer: Buffer;
}

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

  constructor(private readonly dir: string) {}

  /** Each blob's text, or null when the repository does not hold it. */
  async readAll(blobs: readonly string[]): Promise<Map<string, string | null>> {
    const texts = new Map<string, string | null>();
    if (blobs.length === 0) return texts;
    const held = await (this.held ??= heldBlobs(this.dir));
    for (const blob of blobs) if (held && !held.has(blob)) texts.set(blob, null);
    await this.ask(held ? blobs.filter((blob) => held.has(blob)) : blobs, texts);
    return texts;
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

  private async ask(blobs: readonly string[], texts: Map<string, string | null>): Promise<void> {
    if (blobs.length === 0) return;
    const batch = (this.batch ??= start(this.dir));
    batch.child.stdin.write(blobs.map((blob) => `${blob}\n`).join(""));
    const answered = await answer(batch, blobs, 0, texts);
    if (answered === blobs.length) return;
    // The process ended at this blob: it is unavailable, and the rest go to a fresh process.
    texts.set(blobs[answered]!, null);
    this.batch = null;
    await this.ask(blobs.slice(answered + 1), texts);
  }
}

/** The blobs a partial clone holds, or null when the repository is not one (or git cannot say). */
async function heldBlobs(dir: string): Promise<ReadonlySet<string> | null> {
  const git = (...args: string[]) => run("git", ["-C", dir, ...args], { env: ENV, maxBuffer: 1 << 30 });
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

function start(dir: string): Batch {
  const child = spawn("git", ["-C", dir, "cat-file", "--batch"], { stdio: ["pipe", "pipe", "ignore"], env: ENV });
  // A process that ended early fails the writes still queued for it; the end of its output reports those blobs.
  finished(child.stdin, () => {});
  return { child, chunks: (child.stdout as AsyncIterable<Buffer>)[Symbol.asyncIterator](), buffer: Buffer.alloc(0) };
}

/** Reads the answers for `blobs` from `at` on; the number answered before the output ended. */
async function answer(
  batch: Batch,
  blobs: readonly string[],
  at: number,
  texts: Map<string, string | null>,
): Promise<number> {
  if (at === blobs.length) return at;
  const piece = await take(batch);
  if (!piece) return at;
  const newline = piece.indexOf(0x0a);
  texts.set(blobs[at]!, newline === piece.length - 1 ? null : piece.subarray(newline + 1, -1).toString("utf8"));
  return answer(batch, blobs, at + 1, texts);
}

/** The next whole answer, reading more output as needed; null when the output ends first. */
async function take(batch: Batch): Promise<Buffer | null> {
  const n = answerLength(batch.buffer);
  if (n > 0 && n <= batch.buffer.length) {
    const piece = batch.buffer.subarray(0, n);
    batch.buffer = batch.buffer.subarray(n);
    return piece;
  }
  const next = await batch.chunks.next();
  if (next.done) return null;
  batch.buffer = Buffer.concat([batch.buffer, next.value]);
  return take(batch);
}

/** The length of one whole answer: "<hash> missing", or "<hash> blob <size>", the content and a newline; 0 if unknown. */
function answerLength(buffer: Buffer): number {
  const newline = buffer.indexOf(0x0a);
  if (newline < 0) return 0;
  const size = /^\S+ blob (\d+)$/.exec(buffer.subarray(0, newline).toString("utf8"))?.[1];
  return size === undefined ? newline + 1 : newline + 1 + Number(size) + 1;
}
