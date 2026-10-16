// Whether this browser can open a local repository, and how: Chromium through a directory handle, Firefox through the
// folder input; Safari's folder input hides every dot entry (`.git`, `.gitignore`), and a phone picks no folders.

export type LocalSupport = "handle" | "input" | "safari" | "none";

/** What support is decided from; the window satisfies it. */
export interface SupportScope {
  readonly matchMedia?: (query: string) => { readonly matches: boolean };
  readonly showDirectoryPicker?: unknown;
  readonly navigator: { readonly vendor: string };
  readonly HTMLInputElement: { readonly prototype: object };
}

/** WebKit's vendor string, Safari's engine and no other. */
const WEBKIT = "Apple Computer, Inc.";

export function localSupport(scope: SupportScope): LocalSupport {
  if (scope.matchMedia?.("(pointer: coarse)").matches) return "none";
  if (typeof scope.showDirectoryPicker === "function") return "handle";
  if (scope.navigator.vendor === WEBKIT) return "safari";
  return "webkitdirectory" in scope.HTMLInputElement.prototype ? "input" : "none";
}
