"use client";
// Opening a repository on the person's machine: the folder dialog (Chromium) or the folder input (Firefox), the read,
// the lay, and the remembered folder. The city, its status and the notice stay the viewer's.
import type { ThemeName } from "@citymap/themes";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ChangeEvent,
  type Dispatch,
  type ReactElement,
  type SetStateAction,
} from "react";
import type { Lay, Laid } from "../lay/lay";
import type { Source } from "../load/progress";
import type { Job } from "../load/useLoading";
import { describeLocal } from "../local/describe";
import { LocalError } from "../local/errors";
import { handleFolder, listedFolder, localised, type Folder } from "../local/folder";
import { LISTING, localStep } from "../local/phases";
import { browserPorts, type LocalPorts } from "../local/ports";
import { readLocal } from "../local/read";
import { mayRead, type PermissionHandle } from "../local/remember";
import type { LocalSupport } from "../local/support";
import { log, reasonOf } from "../log";

/** The tab's title for a local repository: browser history keeps titles, and may sync them. */
export const LOCAL_TITLE = "Local repository";
/** What the status adds once a local repository is shown. */
export const LOCAL_STATUS = "local, single state, not folded";

export interface LocalOptions {
  readonly ports?: LocalPorts;
  readonly lay: Lay;
  /** The map theme the worker builds the scene in. */
  readonly theme: ThemeName;
  /** Begins a load on the loading card, ending any other. */
  readonly begin: (source: Source, name: string) => Job;
  readonly status: string;
  readonly setStatus: Dispatch<SetStateAction<string>>;
  readonly setError: (message: string) => void;
  /** Draws the laid city under the folder's name, and ends the load. */
  readonly present: (job: Job, laid: Laid, name: string) => Promise<void>;
}

export interface LocalRepository {
  readonly support: LocalSupport;
  /** While a folder is read and laid; the menu's buttons wait. */
  readonly busy: boolean;
  readonly pick: () => void;
  /** Opens the remembered folder again, by its name; null when none is remembered. */
  readonly again: { readonly name: string; readonly open: () => void } | null;
  /** The hidden folder input, outside any menu, where the browser has one. */
  readonly input: ReactElement | null;
}

const never = () => () => {};
const aborted = (failure: unknown) => failure instanceof DOMException && failure.name === "AbortError";
/** True for a load the person cancelled or replaced: never a failure to show. */
const ended = (failure: unknown) =>
  typeof failure === "object" && failure !== null && "name" in failure && failure.name === "AbortError";

export function useLocalRepository({
  ports = browserPorts,
  lay,
  theme,
  begin,
  status,
  setStatus,
  setError,
  present,
}: LocalOptions): LocalRepository {
  const support = useSyncExternalStore(never, ports.support, () => "none" as const);
  const [remembered, setRemembered] = useState<PermissionHandle | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement | null>(null);
  // The status before an opening began, put back when it fails or the folder input closes without a folder.
  const before = useRef("");

  useEffect(() => {
    if (support !== "handle") return;
    ports.recall().then(
      (handle) => {
        log.info("viewer/local-recalled", { found: handle ? "yes" : "no" });
        setRemembered(handle);
      },
      (failure: unknown) => log.error("viewer/local-recall-failed", { reason: reasonOf(failure) }),
    );
  }, [ports, support]);

  const failed = (failure: unknown, name: string) => {
    log.error("viewer/local-failed", { reason: failure instanceof LocalError ? failure.code : reasonOf(failure) });
    setError(describeLocal(failure, name));
    setStatus(before.current);
  };

  const open = async (folder: Folder, handle: PermissionHandle | null) => {
    const started = performance.now();
    const { name } = folder;
    setBusy(true);
    // The card names each phase from here; the status underneath is the last city's again.
    const job = begin("local", name);
    setStatus(before.current);
    try {
      const read = await readLocal(folder, (phase) => job.step(localStep(phase)));
      // A read cannot be stopped part way; one the person cancelled is dropped here.
      job.signal.throwIfAborted();
      const files = read.snapshot.files.length;
      if (read.index) log.info("viewer/local-index", read.index);
      if (read.head) log.info("viewer/local-commit", { how: read.head });
      if (read.source === "walk") log.info("viewer/local-walk", { files });
      for (const path of read.unread) log.info("viewer/local-manifest-unread", { path });
      job.step({ phase: "lay", files });
      const laid = await lay(read.snapshot, { signal: job.signal, onProgress: job.step, theme });
      await present(job, laid, name);
      // Nothing about a local repository goes in the address; a GitHub repository named there before goes.
      window.history.replaceState(null, "", window.location.pathname);
      log.info("viewer/local-read", { source: read.source, files, ms: Math.round(performance.now() - started) });
      if (handle)
        ports.remember(handle).then(
          () => setRemembered(handle),
          (failure: unknown) => log.error("viewer/local-remember-failed", { reason: reasonOf(failure) }),
        );
    } catch (failure) {
      if (ended(failure)) return;
      job.failed();
      failed(failure, name);
    } finally {
      setBusy(false);
    }
  };

  const pick = () => {
    before.current = status;
    if (support === "handle") {
      log.info("viewer/local-pick", { how: "handle" });
      // Called within the person's click, as the folder dialog requires.
      ports.pickFolder().then(
        (handle) => open(handleFolder(handle), handle),
        (failure: unknown) => {
          if (aborted(failure)) log.info("viewer/local-cancelled", { how: "handle" });
          else failed(localised(failure, ""), "the folder");
        },
      );
      return;
    }
    log.info("viewer/local-pick", { how: "input" });
    setStatus(LISTING);
    input.current?.click();
  };

  const again = (handle: PermissionHandle) => {
    before.current = status;
    log.info("viewer/local-pick", { how: "again" });
    mayRead(handle).then(
      (allowed) =>
        allowed
          ? open(handleFolder(handle), handle)
          : failed(new LocalError("local/denied", "the browser did not allow reading the folder"), handle.name),
      (failure: unknown) => failed(localised(failure, ""), handle.name),
    );
  };

  const cancelled = () => {
    log.info("viewer/local-cancelled", { how: "input" });
    setStatus(before.current);
  };
  useEffect(() => {
    const element = input.current;
    element?.addEventListener("cancel", cancelled);
    return () => element?.removeEventListener("cancel", cancelled);
  });

  const changed = (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])];
    event.target.value = "";
    if (files.length === 0) return cancelled();
    log.info("viewer/local-listed", { entries: files.length });
    void open(listedFolder(files), null);
  };

  return {
    support,
    busy,
    pick,
    again: remembered ? { name: remembered.name, open: () => again(remembered) } : null,
    input:
      support === "input" ? (
        <input
          ref={(element) => {
            input.current = element;
            if (element) element.webkitdirectory = true;
          }}
          type="file"
          hidden
          aria-label="Repository folder"
          onChange={changed}
        />
      ) : null,
  };
}
