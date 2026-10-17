// A file's language, from its extension or its name, and the comment syntax its lines are read with.

/** How a language marks comments: line markers and block pairs; `none` knows there are none. */
export type Syntax = "c" | "css" | "hash" | "php" | "dash" | "markup" | "semicolon" | "percent" | "none";

export interface Language {
  readonly name: string;
  readonly syntax: Syntax;
}

export const SYNTAX: Readonly<Record<Syntax, { readonly line: readonly string[]; readonly block: readonly string[] }>> =
  {
    c: { line: ["//"], block: ["/*", "*/"] },
    css: { line: [], block: ["/*", "*/"] },
    hash: { line: ["#"], block: [] },
    php: { line: ["//", "#"], block: ["/*", "*/"] },
    dash: { line: ["--"], block: [] },
    markup: { line: [], block: ["<!--", "-->"] },
    semicolon: { line: [";"], block: [] },
    percent: { line: ["%"], block: [] },
    none: { line: [], block: [] },
  };

const table: [string, Syntax, string[]][] = [
  ["TypeScript", "c", ["ts", "tsx", "mts", "cts"]],
  ["JavaScript", "c", ["js", "jsx", "mjs", "cjs"]],
  ["Java", "c", ["java"]],
  ["Kotlin", "c", ["kt", "kts"]],
  ["Scala", "c", ["scala"]],
  ["Groovy", "c", ["groovy", "gradle"]],
  ["C", "c", ["c", "h"]],
  ["C++", "c", ["cc", "cpp", "cxx", "hh", "hpp", "hxx"]],
  ["C#", "c", ["cs"]],
  ["Go", "c", ["go"]],
  ["Rust", "c", ["rs"]],
  ["Swift", "c", ["swift"]],
  ["Dart", "c", ["dart"]],
  ["Objective-C", "c", ["m", "mm"]],
  ["Protocol Buffers", "c", ["proto"]],
  ["Zig", "c", ["zig"]],
  ["Sass", "c", ["scss"]],
  ["Less", "c", ["less"]],
  ["CSS", "css", ["css"]],
  ["Python", "hash", ["py"]],
  ["Ruby", "hash", ["rb"]],
  ["Shell", "hash", ["sh", "bash", "zsh", "fish"]],
  ["Perl", "hash", ["pl", "pm"]],
  ["R", "hash", ["r"]],
  ["Elixir", "hash", ["ex", "exs"]],
  ["YAML", "hash", ["yaml", "yml"]],
  ["TOML", "hash", ["toml"]],
  ["CMake", "hash", ["cmake"]],
  ["Makefile", "hash", ["mk"]],
  ["Nix", "hash", ["nix"]],
  ["Terraform", "hash", ["tf"]],
  ["PowerShell", "hash", ["ps1"]],
  ["PHP", "php", ["php"]],
  ["SQL", "dash", ["sql"]],
  ["Lua", "dash", ["lua"]],
  ["Haskell", "dash", ["hs"]],
  ["Elm", "dash", ["elm"]],
  ["HTML", "markup", ["html", "htm"]],
  ["XML", "markup", ["xml", "xsd", "xsl"]],
  ["SVG", "markup", ["svg"]],
  ["Vue", "markup", ["vue"]],
  ["Svelte", "markup", ["svelte"]],
  ["Markdown", "markup", ["md", "mdx"]],
  ["INI", "semicolon", ["ini"]],
  ["Clojure", "semicolon", ["clj", "cljs"]],
  ["Lisp", "semicolon", ["lisp", "el"]],
  ["Erlang", "percent", ["erl"]],
  ["TeX", "percent", ["tex"]],
  ["JSON", "none", ["json"]],
];

const BY_EXTENSION: ReadonlyMap<string, Language> = new Map(
  table.flatMap(([name, syntax, extensions]) => extensions.map((ext) => [ext, { name, syntax }] as const)),
);

const BY_NAME: ReadonlyMap<string, Language> = new Map([
  ["Dockerfile", { name: "Dockerfile", syntax: "hash" }],
  ["Makefile", { name: "Makefile", syntax: "hash" }],
  ["CMakeLists.txt", { name: "CMake", syntax: "hash" }],
  ["Jenkinsfile", { name: "Groovy", syntax: "c" }],
  ["Gemfile", { name: "Ruby", syntax: "hash" }],
  ["Rakefile", { name: "Ruby", syntax: "hash" }],
]);

/** The file's name and its extension (lower case), or no extension for a name without a dot or with only a first one. */
export function nameParts(path: string): { readonly file: string; readonly stem: string; readonly ext: string } {
  const file = path.slice(path.lastIndexOf("/") + 1);
  const dot = file.lastIndexOf(".");
  return dot <= 0 ? { file, stem: file, ext: "" } : { file, stem: file.slice(0, dot), ext: file.slice(dot + 1) };
}

/** The language of a path, by its file name, else its extension; null when neither is known. */
export function languageOf(path: string): Language | null {
  const { file, ext } = nameParts(path);
  return BY_NAME.get(file) ?? BY_EXTENSION.get(ext.toLowerCase()) ?? null;
}
