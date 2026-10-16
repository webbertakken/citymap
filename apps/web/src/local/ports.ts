// The browser's side of opening a local repository, as ports the viewer can be given: what is supported, the folder
// dialog, and the remembered folder. Tests hand the viewer their own.
import { LocalError } from "./errors";
import { recallFolder, rememberFolder, type PermissionHandle } from "./remember";
import { localSupport, type LocalSupport } from "./support";

/** Chromium reopens its folder dialog where the last pick under this id was. */
export const PICKER_ID = "citymap-local";

export interface LocalPorts {
  readonly support: () => LocalSupport;
  /** The folder dialog; it rejects with an `AbortError` when closed without a folder. */
  readonly pickFolder: () => Promise<PermissionHandle>;
  readonly recall: () => Promise<PermissionHandle | null>;
  readonly remember: (handle: PermissionHandle) => Promise<void>;
}

export const browserPorts: LocalPorts = {
  support: () => localSupport(window),
  pickFolder: () => {
    const pick = window.showDirectoryPicker;
    if (!pick) return Promise.reject(new LocalError("local/denied", "this browser has no folder dialog"));
    return pick({ id: PICKER_ID, mode: "read" });
  },
  recall: () => recallFolder(),
  remember: (handle) => rememberFolder(handle),
};
