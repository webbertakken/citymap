"use client";
import { FolderClock } from "lucide-react";
import type { LocalRepository } from "./useLocalRepository";

/** More's local repository group: open the last folder again, or, in Safari, why not. Opening one is beside search. */
export function LocalMenu({ local, close }: { readonly local: LocalRepository; readonly close: () => void }) {
  const { again } = local;
  if (local.support === "none") return null;
  if (local.support === "safari")
    return (
      <>
        <p className="popover-heading">Local repository</p>
        <p className="menu-note">
          Safari hides a folder&apos;s .git and .gitignore from pages: open a local repository in Chrome, Edge or
          Firefox, or run the CLI.
        </p>
      </>
    );
  if (!again) return null;
  return (
    <>
      <p className="popover-heading">Local repository</p>
      <ul className="menu">
        <li>
          <button
            type="button"
            disabled={local.busy}
            onClick={() => {
              close();
              again.open();
            }}
          >
            <FolderClock size={20} aria-hidden="true" />
            <span>Open {again.name} again</span>
          </button>
        </li>
      </ul>
    </>
  );
}
