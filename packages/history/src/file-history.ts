// What the history says of each file: when it last changed, how many commits changed it, and who changed it. Filled
// while the history is read, by identity, so a renamed file keeps its record.

/** One file's history: its last change (epoch seconds), its commits, and its authors (interned). */
interface Record {
  changed: number;
  commits: number;
  readonly authors: Set<number>;
}

export interface FileFacts {
  readonly changed: number;
  readonly commits: number;
  readonly authors: number;
}

/** An email lower-cased in ASCII only, so every implementation folds it alike. */
const folded = (email: string) => email.replace(/[A-Z]/g, (c) => c.toLowerCase());

export class FileHistory {
  private readonly people = new Map<string, number>();
  private readonly files = new Map<string, Record>();

  /** One commit changed the file of this identity: at `time`, by the author the mailmap gives `email` to. */
  record(identity: string, time: number, email: string): void {
    const key = folded(email);
    let person = this.people.get(key);
    if (person === undefined) {
      person = this.people.size;
      this.people.set(key, person);
    }
    const file = this.files.get(identity);
    if (file) {
      file.changed = Math.max(file.changed, time);
      file.commits++;
      file.authors.add(person);
    } else this.files.set(identity, { changed: time, commits: 1, authors: new Set([person]) });
  }

  /** A file's history, or undefined when no commit read changed it. */
  of(identity: string): FileFacts | undefined {
    const file = this.files.get(identity);
    return file && { changed: file.changed, commits: file.commits, authors: file.authors.size };
  }

  /** The people who changed any of these files; undefined when no commit read changed any (a submodule's files). */
  authorsAcross(identities: readonly string[]): number | undefined {
    const people = new Set<number>();
    let known = false;
    for (const identity of identities) {
      const file = this.files.get(identity);
      known ||= file !== undefined;
      for (const person of file?.authors ?? []) people.add(person);
    }
    return known ? people.size : undefined;
  }
}
