// The phases of opening a local repository, and how the status line says them.

export type LocalPhase =
  | { readonly phase: "listing" }
  | { readonly phase: "index" }
  | { readonly phase: "folder"; readonly files: number }
  | { readonly phase: "manifests" }
  | { readonly phase: "laying"; readonly files: number }
  | { readonly phase: "drawing" };

const count = (n: number) => n.toLocaleString("en-GB");

/** The status line for a phase; the folder's name once it is known. */
export function statusOf(name: string, phase: LocalPhase): string {
  switch (phase.phase) {
    case "listing":
      return "Listing the folder's files…";
    case "index":
      return `${name}: reading the git index…`;
    case "folder":
      return `${name}: reading the folder… (${count(phase.files)} files)`;
    case "manifests":
      return `${name}: reading workspace manifests…`;
    case "laying":
      return `${name}: laying out ${count(phase.files)} files…`;
    default:
      return `${name}: drawing the map…`;
  }
}
