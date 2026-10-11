// Root workspace manifests: which file names are, what member patterns each declares, and the folders they match.
import { compareKeys } from "@citymap/ground-plan";

/** The patterns of one manifest: globs that include members, and globs that exclude them. */
export interface Patterns {
  readonly include: readonly string[];
  readonly exclude: readonly string[];
}

const ROOT_MANIFESTS = new Set([
  "package.json",
  "pnpm-workspace.yaml",
  "lerna.json",
  "Cargo.toml",
  "go.work",
  "pyproject.toml",
  "deno.json",
  "deno.jsonc",
]);

/** True for a workspace manifest at the repository root. */
export const isManifest = (path: string) => ROOT_MANIFESTS.has(path);

/** A pattern as a folder path: no leading `./`, no trailing `/`. */
const clean = (pattern: string) => pattern.trim().replace(/^\.\//, "").replace(/\/+$/, "");

/** Patterns from a list in which `!` marks an exclusion. */
function split(list: readonly string[], exclude: readonly string[] = []): Patterns | null {
  const include = list.filter((p) => !p.startsWith("!")).map(clean);
  const excluded = [...list.filter((p) => p.startsWith("!")).map((p) => clean(p.slice(1))), ...exclude.map(clean)];
  return include.length > 0 ? { include, exclude: excluded } : null;
}

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];

const json = (text: string): unknown => {
  try {
    // JSON with comments (deno.jsonc): line comments go first.
    return JSON.parse(text.replace(/^\s*\/\/.*$/gm, ""));
  } catch {
    return null;
  }
};

/** A property of a parsed JSON value, if it is an object holding one. */
function field(value: unknown, name: string): unknown {
  if (typeof value !== "object" || value === null) return undefined;
  const found: unknown = Reflect.get(value, name);
  return found;
}

/** The quoted strings of a TOML array assigned to a key within a section (multi-line arrays and comments allowed). */
function tomlArray(text: string, section: string, key: string): string[] {
  const start = text.indexOf(`[${section}]`);
  if (start < 0) return [];
  const body = text.slice(start + section.length + 2);
  const end = body.search(/^\s*\[/m);
  const block = end < 0 ? body : body.slice(0, end);
  const match = new RegExp(`^\\s*${key.replace(".", "\\.")}\\s*=\\s*\\[([\\s\\S]*?)\\]`, "m").exec(block);
  if (!match) return [];
  return [...match[1]!.replace(/#.*$/gm, "").matchAll(/"([^"]*)"|'([^']*)'/g)].map((m) => (m[1] ?? m[2])!);
}

/** The member patterns a root manifest declares, or null when it declares none (or cannot be read). */
export function patternsOf(file: string, text: string): Patterns | null {
  switch (file) {
    case "package.json": {
      const workspaces = field(json(text), "workspaces");
      return split(Array.isArray(workspaces) ? strings(workspaces) : strings(field(workspaces, "packages")));
    }
    case "lerna.json":
      return split(strings(field(json(text), "packages")));
    case "deno.json":
    case "deno.jsonc":
      return split(strings(field(json(text), "workspace")));
    case "pnpm-workspace.yaml": {
      // The list under the top-level `packages:` key, one `- item` per line.
      const lines = text.split("\n");
      const at = lines.findIndex((l) => /^packages:\s*$/.test(l));
      if (at < 0) return null;
      const items: string[] = [];
      for (const line of lines.slice(at + 1)) {
        const item = /^\s+-\s+(.+?)\s*$/.exec(line);
        if (!item) break;
        items.push(item[1]!.replace(/^['"]|['"]$/g, ""));
      }
      return split(items);
    }
    case "Cargo.toml":
      return split(tomlArray(text, "workspace", "members"), tomlArray(text, "workspace", "exclude"));
    case "pyproject.toml":
      return split(tomlArray(text, "tool.uv.workspace", "members"), tomlArray(text, "tool.uv.workspace", "exclude"));
    default: {
      // go.work: `use ./x`, or a `use ( … )` block, with // comments.
      const uses = [...text.replace(/\/\/.*$/gm, "").matchAll(/^use\s*(?:\(([\s\S]*?)\)|(\S+))/gm)].flatMap((m) =>
        (m[1] ?? m[2])!.split(/\s+/).filter(Boolean),
      );
      return split(uses);
    }
  }
}

/** A glob as a regular expression over folder paths: `**` spans folders, `*` and `?` stay within one. */
function globToRegExp(glob: string): RegExp {
  let source = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]!;
    if (c === "*" && glob[i + 1] === "*") {
      source += ".*";
      i++;
      if (glob[i + 1] === "/") i++;
    } else if (c === "*") source += "[^/]*";
    else if (c === "?") source += "[^/]";
    else source += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${source}$`);
}

/** The folders the manifests declare as members: matched by any include and by no exclude, sorted. */
export function resolveWorkspaces(manifests: readonly Patterns[], folders: Iterable<string>): string[] {
  const include = manifests.flatMap((m) => m.include).map(globToRegExp);
  const exclude = manifests.flatMap((m) => m.exclude).map(globToRegExp);
  return [...folders]
    .filter((f) => include.some((r) => r.test(f)) && !exclude.some((r) => r.test(f)))
    .toSorted(compareKeys);
}
