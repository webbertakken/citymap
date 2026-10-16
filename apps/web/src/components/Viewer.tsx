"use client";
import { DEFAULT_TOGGLES, toggleList, type City, type Snapshot, type Toggle } from "@citymap/ground-plan";
import { buildScene, pick, pickIndex, type Hit } from "@citymap/scene";
import { THEMES, type ThemeName } from "@citymap/themes";
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentType,
} from "react";
import { describeFailure, loadCity, loadIndex, readCityFile, type CityEntry } from "../cities";
import { readRepository, type Fetcher } from "../github/read";
import { parseRepository } from "../github/repository";
import { layInWorker } from "../lay/browser";
import type { Lay } from "../lay/lay";
import type { LocalPorts } from "../local/ports";
import { log, reasonOf } from "../log";
import { searchIndex, type SearchEntry } from "../search/search";
import { FLY_MS, between, ease, flyTo } from "../view/fly";
import { insetsFor } from "../view/insets";
import { fit, onKey, type Mode, type View, type Viewport } from "../view/view";
import { Drawer } from "./Drawer";
import { Legend } from "./Legend";
import { MapView, type CanvasProps } from "./MapView";
import { Notice } from "./Notice";
import { SearchBox } from "./SearchBox";
import { TitleCard } from "./TitleCard";
import { LOCAL_STATUS, LOCAL_TITLE, useLocalRepository } from "./useLocalRepository";
import { ViewControls } from "./ViewControls";
import { ZoomControls } from "./ZoomControls";

export interface ViewerProps {
  readonly Canvas: ComponentType<CanvasProps>;
  readonly fetcher?: Fetcher;
  /** How a snapshot becomes a city: in a Web Worker in the browser, on the calling thread in tests. */
  readonly lay?: Lay;
  /** The site's path under its host, before every bundled file: "/citymap" on GitHub Pages. */
  readonly basePath?: string;
  /** The browser's folder access: its own by default, stand-ins in tests. */
  readonly folders?: LocalPorts;
}

const browserFetch: Fetcher = (url, init) => fetch(url, init);

// The system's colour preference, as an external store: read on the client, light while prerendering.
const DARK = "(prefers-color-scheme: dark)";
const media = () => (typeof window.matchMedia === "function" ? window.matchMedia(DARK) : null);
const subscribeDark = (changed: () => void) => {
  const query = media();
  query?.addEventListener("change", changed);
  return () => query?.removeEventListener("change", changed);
};
const darkNow = () => media()?.matches ?? false;
const darkOnServer = () => false;
// Flights are instant where motion is unwelcome, and where it cannot be asked (tests).
const stillness = () =>
  typeof window.matchMedia !== "function" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Where the city shown came from, so a change of toggles can lay it again: a bundled city, a live repository's
 * snapshot, or a city file (which keeps its layout). */
type Source =
  | { readonly kind: "bundled"; readonly entry: CityEntry }
  | {
      readonly kind: "live";
      readonly name: string;
      readonly snapshot: Snapshot;
      /** What the status says of it: a single state, from GitHub or from the person's machine. */
      readonly note: string;
      /** The tab's title, when it is not the name (a local repository's stays private). */
      readonly title?: string;
    }
  | { readonly kind: "file" };

/** The city with only the town of that key, and no highways. */
export const focusOn = (city: City, key: string): City => ({
  ...city,
  towns: city.towns.filter((t) => t.key === key),
  highways: [],
});

/** The viewer: one city at a time, its theme, its view and its layout toggles. */
export function Viewer({ Canvas, fetcher = browserFetch, lay = layInWorker, basePath = "", folders }: ViewerProps) {
  const [cities, setCities] = useState<readonly CityEntry[]>([]);
  // The layout toggles, at the engine's defaults on every visit; and where the city shown came from.
  const [toggles, setToggles] = useState<readonly Toggle[]>(DEFAULT_TOGGLES);
  const [source, setSource] = useState<Source | null>(null);
  const [selected, setSelected] = useState("");
  const [city, setCity] = useState<City | null>(null);
  const [status, setStatus] = useState("Loading the cities…");
  const [error, setError] = useState("");
  // The person's choice of theme, else Night atlas when the system prefers dark, else Paper atlas.
  const [chosen, setTheme] = useState<ThemeName | null>(null);
  const dark = useSyncExternalStore(subscribeDark, darkNow, darkOnServer);
  const theme: ThemeName = chosen ?? (dark ? "night-atlas" : "paper-atlas");
  const [mode, setMode] = useState<Mode>("plan");
  const [viewport, setViewport] = useState<Viewport>({ width: 800, height: 600 });
  // The view the person moved to; while `fitted`, the view is derived instead, fitting what is shown to the map.
  const [moved, setMoved] = useState<View>({ mode: "plan", centre: { x: 0, z: 0 }, zoom: 1 });
  // A newly opened city or town stays fitted to the map, whatever size the map turns out to be, until the person moves it.
  const [fitted, setFitted] = useState(true);
  // Drill down: the key of the one town shown, or null for the whole city.
  const [focus, setFocus] = useState<string | null>(null);
  // The whole city's scene and index stay built while a town is shown, so going back costs nothing.
  const wholeScene = useMemo(() => (city ? buildScene(city, THEMES[theme]) : null), [city, theme]);
  const wholeIndex = useMemo(() => (city ? pickIndex(city) : null), [city]);
  const town = useMemo(() => (city && focus !== null ? focusOn(city, focus) : null), [city, focus]);
  const townScene = useMemo(() => (town ? buildScene(town, THEMES[theme]) : null), [town, theme]);
  const townIndex = useMemo(() => (town ? pickIndex(town) : null), [town]);
  const shown = town ?? city;
  const scene = townScene ?? wholeScene;
  const index = townIndex ?? wholeIndex;
  const [drawer, setDrawer] = useState<boolean | null>(null);
  const insets = useMemo(() => insetsFor(viewport, drawer), [viewport, drawer]);
  const view = useMemo(
    () => (fitted && scene ? fit(scene.bounds, mode, viewport, insets) : moved),
    [fitted, scene, mode, viewport, insets, moved],
  );
  const [picked, setPickedHit] = useState<Hit | null>(null);
  // Where a search took the person: a marker over the map, until the selection changes.
  const [marker, setMarker] = useState<{ x: number; z: number } | null>(null);
  const setPicked = (hit: Hit | null) => {
    setPickedHit(hit);
    setMarker(null);
  };
  // What a search needs: the whole city's folders and files, where they lie, and how to pick them.
  const finder = useMemo(
    () =>
      city && wholeScene && wholeIndex
        ? { search: searchIndex(city), bounds: wholeScene.bounds, picking: wholeIndex }
        : null,
    [city, wholeScene, wholeIndex],
  );
  // A flight in progress: its animation frame, cancelled by any other move.
  const flight = useRef(0);
  const settle = (next: View) => {
    cancelAnimationFrame(flight.current);
    setFitted(false);
    setMoved(next);
  };
  const flyView = (from: View, to: View) => {
    cancelAnimationFrame(flight.current);
    setFitted(false);
    if (stillness()) {
      setMoved(to);
      return;
    }
    // Until the first frame, the map holds where the flight starts.
    setMoved(from);
    const start = performance.now();
    const step = (now: number) => {
      const share = Math.min(1, (now - start) / FLY_MS);
      setMoved(between(from, to, ease(share)));
      if (share < 1) flight.current = requestAnimationFrame(step);
    };
    flight.current = requestAnimationFrame(step);
  };
  const drill = (key: string | null) => {
    if (key === null) log.info("viewer/city");
    else log.info("viewer/town", { key });
    cancelAnimationFrame(flight.current);
    setFocus(key);
    setPicked(null);
    setFitted(true);
  };
  // A search hit: leave a town it is not in, fly to it, select it and mark it.
  const goTo = (entry: SearchEntry, { bounds, picking }: NonNullable<typeof finder>) => {
    const leaving = focus !== null && focus !== entry.townKey;
    if (leaving) setFocus(null);
    const whole = fit(bounds, mode, viewport, insets);
    const from = leaving ? whole : view;
    flyView(from, flyTo(from, viewport, entry, whole, insets));
    const hit: Hit | null =
      entry.kind === "file"
        ? pick(picking, entry.x, entry.z)
        : { kind: "district", town: entry.town, townKey: entry.townKey, district: entry.name };
    setPickedHit(hit);
    setMarker({ x: entry.x, z: entry.z });
  };

  // A city shown afresh fits the map; the same city in another layout keeps the view, and the town shown if it is there.
  const show = useCallback((next: City, name: string, how: { title?: string; relaid?: boolean } = {}) => {
    cancelAnimationFrame(flight.current);
    setCity(next);
    setFocus((was) => (how.relaid && next.towns.some((t) => t.key === was) ? was : null));
    setPickedHit(null);
    setMarker(null);
    setError("");
    const lots = next.towns.reduce((s, t) => s + t.stats.lots, 0);
    log.info("viewer/open", { name, towns: next.towns.length, lots });
    setStatus(`${next.towns.length} towns · ${lots.toLocaleString("en-GB")} lots`);
    if (!how.relaid) setFitted(true);
    document.title = `${how.title ?? name} · citymap`;
  }, []);
  const open = useCallback(
    async (entry: CityEntry, layout: readonly Toggle[], relaid = false) => {
      setSelected(entry.name);
      setStatus(relaid ? `${entry.name}: loading…` : `${entry.name}: laying out…`);
      try {
        show(await loadCity(fetcher, entry, layout, basePath), entry.name, { relaid });
        setSource({ kind: "bundled", entry });
      } catch (failure) {
        log.error(relaid ? "viewer/variant-failed" : "viewer/open-failed", {
          name: entry.name,
          reason: reasonOf(failure),
        });
        setError(describeFailure(failure));
        setStatus("");
      }
    },
    [basePath, fetcher, show],
  );
  // A live repository's snapshot laid again with other toggles, off the main thread.
  const relay = async (live: Extract<Source, { kind: "live" }>, layout: readonly Toggle[]) => {
    const { name, snapshot, note, title } = live;
    setStatus(`${name}: laying out…`);
    try {
      show(await lay(snapshot, layout), name, { relaid: true, ...(title ? { title } : {}) });
      setStatus((done) => `${done} · ${note}`);
    } catch (failure) {
      log.error("viewer/variant-failed", { name, reason: reasonOf(failure) });
      setError(describeFailure(failure));
      setStatus("");
    }
  };
  const toggle = (changed: Toggle, on: boolean) => {
    const next = toggleList(on ? [...toggles, changed] : toggles.filter((t) => t !== changed));
    setToggles(next);
    log.info("viewer/toggles", { on: next.join(",") || "none" });
    if (source?.kind === "bundled") void open(source.entry, next, true);
    else if (source?.kind === "live") void relay(source, next);
  };
  // A public GitHub repository's single state, read and laid in the browser.
  const openRepository = useCallback(
    async (input: string) => {
      const started = performance.now();
      try {
        const repo = parseRepository(input);
        const name = `${repo.owner}/${repo.name}`;
        let requests = 0;
        setStatus(`${name}: reading the tree…`);
        const snapshot = await readRepository(fetcher, repo, (n) => {
          requests = n;
          setStatus(`${name}: reading the tree… (${n} requests)`);
        });
        setStatus(`${name}: laying out…`);
        const next = await lay(snapshot, toggles);
        show(next, name);
        setSource({ kind: "live", name, snapshot, note: "single state, not folded" });
        setStatus((done) => `${done} · single state, not folded`);
        setSelected("");
        log.info("viewer/github-read", {
          repo: name,
          requests,
          files: snapshot.files.length,
          ms: Math.round(performance.now() - started),
        });
        window.history.replaceState(null, "", `?repo=${name}`);
      } catch (failure) {
        log.error("viewer/github-failed", { repo: input.trim(), reason: reasonOf(failure) });
        setError(describeFailure(failure));
        setStatus("");
      }
    },
    [fetcher, lay, show, toggles],
  );
  // A repository on the person's machine, read and laid in the browser; nothing about it leaves the page.
  const local = useLocalRepository({
    ...(folders ? { ports: folders } : {}),
    lay,
    toggles,
    status,
    setStatus,
    setError,
    present: (next, name, snapshot) => {
      show(next, name, { title: LOCAL_TITLE });
      setSource({ kind: "live", name, snapshot, note: LOCAL_STATUS, title: LOCAL_TITLE });
      setStatus((done) => `${done} · ${LOCAL_STATUS}`);
      setSelected("");
    },
  });
  // The index loads once, on mount; a repository in the address is laid, else the first bundled city opens.
  const first = useEffectEvent((entry: CityEntry) => void open(entry, toggles));
  const wanted = useEffectEvent((repo: string) => void openRepository(repo));
  useEffect(() => {
    loadIndex(fetcher, basePath).then(
      (bundled) => {
        log.info("viewer/index", { cities: bundled.length });
        setCities(bundled);
        const repo = new URLSearchParams(window.location.search).get("repo");
        if (repo) wanted(repo);
        else if (bundled[0]) first(bundled[0]);
        else setStatus("");
      },
      (failure: unknown) => {
        log.error("viewer/index-failed", { reason: reasonOf(failure) });
        setError(describeFailure(failure));
        setStatus("");
      },
    );
  }, [basePath, fetcher]);
  const openFile = async (file: File) => {
    try {
      show(await readCityFile(file), file.name);
      setSource({ kind: "file" });
      setSelected("");
    } catch (failure) {
      log.error("viewer/file-rejected", { file: file.name, reason: reasonOf(failure) });
      setError(describeFailure(failure));
    }
  };
  // The whole page is a drop zone for a city file.
  const dropped = useEffectEvent((file: File) => void openFile(file));
  useEffect(() => {
    const over = (event: DragEvent) => event.preventDefault();
    const drop = (event: DragEvent) => {
      event.preventDefault();
      const file = event.dataTransfer?.files[0];
      if (file) dropped(file);
    };
    document.addEventListener("dragover", over);
    document.addEventListener("drop", drop);
    return () => {
      document.removeEventListener("dragover", over);
      document.removeEventListener("drop", drop);
    };
  }, []);
  const colours = THEMES[theme];
  return (
    <main className="viewer" style={{ background: colours.country }} data-theme={theme}>
      {scene && city && index ? (
        <MapView
          name={city.repository}
          scene={scene}
          index={index}
          onSelect={setPicked}
          onEscape={() => {
            // Escape clears the selection, else leaves the town for the whole city.
            if (picked) setPicked(null);
            else if (focus !== null) drill(null);
          }}
          view={view}
          insets={insets}
          marker={marker}
          theme={colours}
          Canvas={Canvas}
          onView={settle}
          onViewport={setViewport}
        />
      ) : (
        <div className="map empty" />
      )}
      <TitleCard
        title={city?.repository ?? "citymap"}
        status={status}
        town={town?.towns[0]!.name ?? null}
        onWhole={() => drill(null)}
      />
      <SearchBox
        index={finder?.search ?? null}
        // Matches come only from `finder`'s index, so `finder` is there whenever one is picked.
        onPick={(entry) => goTo(entry, finder!)}
        onRepository={(name) => void openRepository(name)}
      />
      <ViewControls
        mode={mode}
        theme={theme}
        cities={cities}
        selected={selected}
        onMode={(next) => {
          setMode(next);
          setMoved({ ...moved, mode: next });
        }}
        onTheme={setTheme}
        onCity={(entry) => void open(entry, toggles)}
        onFile={(file) => void openFile(file)}
        local={local}
        toggles={toggles}
        fixed={source?.kind === "file"}
        onToggle={toggle}
      />
      {local.input}
      <Drawer
        city={shown}
        settled={status === ""}
        selected={picked}
        focused={focus !== null}
        open={drawer}
        onOpen={(next) => {
          log.info("viewer/drawer", { open: next ? "open" : "closed" });
          setDrawer(next);
        }}
        onDrill={drill}
      />
      {scene && (
        <ZoomControls
          onKey={(key) => {
            if (key === "0") {
              cancelAnimationFrame(flight.current);
              setFitted(true);
              return;
            }
            settle(onKey(key, view, viewport, scene.bounds, insets)!);
          }}
        />
      )}
      <Legend theme={colours} />
      {error && <Notice message={error} onDismiss={() => setError("")} />}
    </main>
  );
}
