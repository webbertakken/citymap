"use client";
import { File, Folder, GitBranch, Search } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { parseRepository } from "../github/repository";
import { log } from "../log";
import { MAX_HITS, search, type SearchEntry, type SearchIndex } from "../search/search";

/** How long a query must rest before it is logged, in milliseconds. */
const SETTLE_MS = 600;

export interface SearchBoxProps {
  readonly index: SearchIndex | null;
  readonly onPick: (entry: SearchEntry) => void;
  readonly onRepository: (name: string) => void;
}

type Option =
  | { readonly kind: "repository"; readonly name: string }
  | { readonly kind: "entry"; readonly entry: SearchEntry };

/** The repository a text names, or null when it names none. */
const repositoryIn = (text: string) => {
  try {
    const repo = parseRepository(text);
    return `${repo.owner}/${repo.name}`;
  } catch {
    return null;
  }
};

/** The text with the query marked where it first appears. */
function Marked({ text, query }: { readonly text: string; readonly query: string }) {
  const q = query.trim().toLowerCase();
  const at = text.toLowerCase().indexOf(q);
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <mark>{text.slice(at, at + q.length)}</mark>
      {text.slice(at + q.length)}
    </>
  );
}

/** What a list of matches says to a screen reader, and under the field. */
const summaryOf = (total: number) =>
  total === 0 ? "No folders or files match" : total === 1 ? "1 match" : `${total.toLocaleString("en-GB")} matches`;

/**
 * Top centre: finds folders and files of the city shown, or lays a GitHub repository. `/` focuses it; ArrowDown moves
 * into the matches, arrows move between them, Enter picks, Escape steps back to the field and then clears it.
 */
export function SearchBox({ index, onPick, onRepository }: SearchBoxProps) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const summary = useId();
  const found = useMemo(() => (index ? search(index, text) : { hits: [], total: 0 }), [index, text]);
  const repository = repositoryIn(text);
  // A repository is offered first when nothing in the city matches, else after the matches; seven choices at most.
  const hits = repository ? found.hits.slice(0, MAX_HITS - 1) : found.hits;
  const options: Option[] = hits.map((entry): Option => ({ kind: "entry", entry }));
  if (repository) {
    const offer: Option = { kind: "repository", name: repository };
    if (hits.length === 0) options.unshift(offer);
    else options.push(offer);
  }
  const querying = text.trim().length >= 2;
  const expanded = open && (options.length > 0 || querying);

  useEffect(() => {
    const slash = (event: globalThis.KeyboardEvent) => {
      const target = event.target;
      const typing =
        target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
      if (event.key === "/" && !typing) {
        event.preventDefault();
        field.current?.focus();
      }
    };
    // Focus or a press outside the search closes its matches.
    const away = (event: Event) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("keydown", slash);
    document.addEventListener("focusin", away);
    document.addEventListener("pointerdown", away);
    return () => {
      document.removeEventListener("keydown", slash);
      document.removeEventListener("focusin", away);
      document.removeEventListener("pointerdown", away);
    };
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => {
      if (querying) log.info("viewer/search", { length: text.trim().length, hits: found.total });
    }, SETTLE_MS);
    return () => clearTimeout(timer);
  }, [text, querying, found.total]);

  const choose = (option: Option) => {
    setOpen(false);
    setText("");
    if (option.kind === "repository") onRepository(option.name);
    else {
      log.info("viewer/search-pick", { kind: option.entry.kind, path: option.entry.path });
      onPick(option.entry);
    }
  };
  const buttons = () => [...(list.current?.querySelectorAll("button") ?? [])];
  const onFieldKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" && options.length > 0) {
      event.preventDefault();
      setOpen(true);
      // The list renders on this press when it was closed; focus its first match once it is there.
      requestAnimationFrame(() => buttons()[0]?.focus());
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (options[0]) choose(options[0]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (expanded) setOpen(false);
      else setText("");
    }
  };
  const onOptionKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    const all = buttons();
    const at = all.findIndex((b) => b === document.activeElement);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const next = at + (event.key === "ArrowDown" ? 1 : -1);
      if (next < 0) field.current?.focus();
      else all[Math.min(next, all.length - 1)]?.focus();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      field.current?.focus();
      setOpen(false);
    }
  };
  return (
    <search ref={root} className="glass search">
      <Search size={20} aria-hidden="true" />
      <input
        ref={field}
        type="search"
        aria-label="Search files and folders, or lay owner/name"
        aria-describedby={expanded ? summary : undefined}
        placeholder="Search files and folders, or type owner/name"
        autoComplete="off"
        spellCheck={false}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onFieldKey}
      />
      <kbd aria-hidden="true">/</kbd>
      {expanded && (
        <div className="glass results">
          <p id={summary} className="summary" aria-live="polite">
            {summaryOf(found.total)}
            {found.total > hits.length && `; the first ${hits.length} are shown, type more to narrow them`}
          </p>
          <ul ref={list} aria-label="Matches">
            {options.map((option) => (
              <li key={option.kind === "entry" ? `${option.entry.kind}:${option.entry.path}` : "repository"}>
                <button type="button" onClick={() => choose(option)} onKeyDown={onOptionKey}>
                  {option.kind === "repository" ? (
                    <>
                      <GitBranch size={20} aria-hidden="true" />
                      <span className="option-text">
                        <span>Lay {option.name} from GitHub</span> <small>Reads its tree and lays it here</small>
                      </span>
                    </>
                  ) : (
                    <>
                      {option.entry.kind === "folder" ? (
                        <Folder size={20} aria-hidden="true" />
                      ) : (
                        <File size={20} aria-hidden="true" />
                      )}
                      <span className="option-text">
                        <span>
                          <span className="visually-hidden">
                            {option.entry.kind === "folder" ? "Folder " : "File "}
                          </span>
                          <Marked text={option.entry.name} query={text} />
                        </span>{" "}
                        <small>{option.entry.path}</small>
                      </span>
                    </>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </search>
  );
}
