"use client";
import { FolderGit2 } from "lucide-react";
import { useId, useState, type KeyboardEvent } from "react";
import type { LocalRepository } from "./useLocalRepository";

/** What the button gives, word for word: its tooltip and its description. */
export const LOCAL_TIP =
  "Open a local repository: as it is now, not folded over its history. For a folded city, run citymap <folder> --out=city.json, then open the file.";

/** Right beside the search box: opens a repository's folder, where the browser can read one. */
export function LocalButton({ local }: { readonly local: LocalRepository }) {
  const id = useId();
  const [tip, setTip] = useState(false);
  if (local.support !== "handle" && local.support !== "input") return null;
  // The first Escape hides the tooltip and stops there; without one showing, it is the page's.
  const escape = (event: KeyboardEvent) => {
    if (event.key !== "Escape" || !tip) return;
    event.preventDefault();
    event.stopPropagation();
    setTip(false);
  };
  return (
    <div className="local-button" onPointerEnter={() => setTip(true)} onPointerLeave={() => setTip(false)}>
      <button
        type="button"
        className="glass icon-button"
        aria-label="Open a local repository"
        aria-describedby={id}
        disabled={local.busy}
        onClick={local.pick}
        onFocus={() => setTip(true)}
        onBlur={() => setTip(false)}
        onKeyDown={escape}
      >
        <FolderGit2 size={20} aria-hidden="true" />
      </button>
      <p id={id} role="tooltip" className="tooltip local-tip" hidden={!tip}>
        Open a local repository: as it is now, not folded over its history. For a folded city, run{" "}
        <code>citymap &lt;folder&gt; --out=city.json</code>, then open the file.
      </p>
    </div>
  );
}
