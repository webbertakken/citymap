"use client";
import { FolderClock, FolderGit2 } from "lucide-react";
import { useId } from "react";
import type { LocalRepository } from "./useLocalRepository";

/** More's local repository group: open one, open the last one again, or, in Safari, why not. */
export function LocalMenu({ local, close }: { readonly local: LocalRepository; readonly close: () => void }) {
  const note = useId();
  const { again } = local;
  if (local.support === "none") return null;
  return (
    <>
      <p className="popover-heading">Local repository</p>
      {local.support === "safari" ? (
        <p className="menu-note">
          Safari hides a folder&apos;s .git and .gitignore from pages: open a local repository in Chrome, Edge or
          Firefox, or run the CLI.
        </p>
      ) : (
        <ul className="menu">
          <li>
            <button
              type="button"
              disabled={local.busy}
              aria-describedby={note}
              onClick={() => {
                close();
                local.pick();
              }}
            >
              <FolderGit2 size={20} aria-hidden="true" />
              <span>Open a local repository…</span>
            </button>
            <p id={note} className="menu-note">
              As it is now, not folded over its history. For a folded city, run{" "}
              <code>citymap &lt;folder&gt; --out=city.json</code>, then open the file.
            </p>
          </li>
          {again && (
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
          )}
        </ul>
      )}
    </>
  );
}
