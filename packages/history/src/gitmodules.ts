// `.gitmodules`: where a repository's submodules live and what they are called. Pure, so a browser reads it too.

/** A submodule as `.gitmodules` names it: its name (its git data's folder) and where it is fetched from. */
export interface ModuleEntry {
  readonly name: string;
  readonly url: string;
}

/** A value: quoted, or bare up to a comment; surrounding space trimmed. */
function valueOf(raw: string): string {
  const text = raw.trim();
  const quoted = /^"((?:[^"\\]|\\.)*)"/.exec(text);
  if (quoted) return quoted[1]!.replace(/\\(.)/g, "$1");
  return text.replace(/\s[#;].*$/, "").trim();
}

/** The submodules `.gitmodules` declares, by path (trailing slashes dropped), in file order; the first claim wins. */
export function parseGitmodules(text: string): Map<string, ModuleEntry> {
  const modules = new Map<string, ModuleEntry>();
  let current: { name: string; path?: string; url: string } | null = null;
  const close = () => {
    if (current?.path && !modules.has(current.path))
      modules.set(current.path, { name: current.name, url: current.url });
  };
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#") || trimmed.startsWith(";")) continue;
    const section = /^\[\s*([A-Za-z.-]+)(?:\s+"((?:[^"\\]|\\.)*)")?\s*\]/.exec(trimmed);
    if (section) {
      close();
      current = section[1]!.toLowerCase() === "submodule" && section[2] ? { name: section[2], url: "" } : null;
      continue;
    }
    const pair = /^([A-Za-z][A-Za-z0-9-]*)\s*=(.*)$/.exec(trimmed);
    if (!pair || !current) continue;
    const key = pair[1]!.toLowerCase();
    if (key === "path") current.path = valueOf(pair[2]!).replace(/\/+$/, "");
    else if (key === "url") current.url = valueOf(pair[2]!);
  }
  close();
  return modules;
}

/** True for a relative path of plain segments: no `..`, `.`, empty segment, backslash or NUL (as git demands). */
export const isSafeModulePath = (path: string) =>
  path !== "" &&
  !path.includes("\\") &&
  !path.includes("\u0000") &&
  path.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
