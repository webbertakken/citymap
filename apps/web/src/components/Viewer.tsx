"use client";
import type { City } from "@citymap/ground-plan";
import { buildScene, pick, pickIndex, type Hit, type Scene } from "@citymap/scene";
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
import { meter, type Allowance } from "../github/allowance";
import { createSuggester } from "../github/owners";
import { readRepository, type Fetcher } from "../github/read";
import { parseRepository } from "../github/repository";
import { layInWorker } from "../lay/browser";
import type { Drawn, Lay } from "../lay/lay";
import { afterPaint } from "../load/paint";
import { loadingStatus, useLoading, type Job } from "../load/useLoading";
import { log, reasonOf } from "../log";
import { searchIndex, type SearchEntry } from "../search/search";
import { FLY_MS, between, ease, flyTo } from "../view/fly";
import { insetsFor } from "../view/insets";
import { fit, onKey, type Mode, type View, type Viewport } from "../view/view";
import { Drawer } from "./Drawer";
import { Legend } from "./Legend";
import { LoadingCard } from "./LoadingCard";
import { MapView, type CanvasProps } from "./MapView";
import { Notice } from "./Notice";
import { SearchBox } from "./SearchBox";
import { TitleCard } from "./TitleCard";
import { ViewControls } from "./ViewControls";
import { ZoomControls } from "./ZoomControls";

export interface ViewerProps {
  readonly Canvas: ComponentType<CanvasProps>;
  readonly fetcher?: Fetcher;
  /** How a snapshot becomes a city: in a Web Worker in the browser, on the calling thread in tests. */
  readonly lay?: Lay;
  /** The site's path under its host, before every bundled file: "/citymap" on GitHub Pages. */
  readonly basePath?: string;
}

const browserFetch: Fetcher = (url, init) => fetch(url, init);
/** The time of day, in epoch milliseconds: what kept suggestions age by. */
const wallClock = () => Date.now();

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

/** True for the rejection of a load that was cancelled or replaced: never a failure to show. */
const isAbort = (failure: unknown) =>
  typeof failure === "object" && failure !== null && "name" in failure && failure.name === "AbortError";

/** The city with only the town of that key, and no highways. */
export const focusOn = (city: City, key: string): City => ({
  ...city,
  towns: city.towns.filter((t) => t.key === key),
  highways: [],
});

/** The viewer: one city at a time, its theme and its view. */
export function Viewer({ Canvas, fetcher = browserFetch, lay = layInWorker, basePath = "" }: ViewerProps) {
  const loading = useLoading();
  // GitHub's hourly allowance, heard from every API answer, shared by laying and the suggestions.
  const [allowance, setAllowance] = useState<Allowance | null>(null);
  const github = useMemo(() => meter(fetcher, setAllowance), [fetcher]);
  const suggester = useMemo(() => createSuggester(github, wallClock), [github]);
  const [cities, setCities] = useState<readonly CityEntry[]>([]);
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
  // A scene the layout worker built with the city, used while the map's theme is the one it was built in.
  const [drawn, setDrawn] = useState<{ city: City; theme: ThemeName; scene: Scene } | null>(null);
  const wholeScene = useMemo(
    () =>
      city ? (drawn?.city === city && drawn.theme === theme ? drawn.scene : buildScene(city, THEMES[theme])) : null,
    [city, theme, drawn],
  );
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

  const show = useCallback((next: City, name: string) => {
    cancelAnimationFrame(flight.current);
    setCity(next);
    setFocus(null);
    setPickedHit(null);
    setMarker(null);
    setError("");
    const lots = next.towns.reduce((s, t) => s + t.stats.lots, 0);
    log.info("viewer/open", { name, towns: next.towns.length, lots });
    setStatus(`${next.towns.length} towns · ${lots.toLocaleString("en-GB")} lots`);
    setFitted(true);
    document.title = `${name} · citymap`;
  }, []);
  // The last phase of every load: the city is in hand; it is shown, and the load is done once the map has drawn.
  const draw = useCallback(
    async (job: Job, next: City, name: string, file: string, prebuilt: Drawn | null = null) => {
      job.step({ phase: "draw" });
      await afterPaint();
      job.signal.throwIfAborted();
      setDrawn(prebuilt && { city: next, ...prebuilt });
      show(next, name);
      setSelected(file);
      await afterPaint();
      job.done();
    },
    [show],
  );
  const { begin } = loading;
  const open = useCallback(
    async (entry: CityEntry) => {
      const job = begin("bundled", entry.name);
      try {
        const next = await loadCity(fetcher, entry, basePath, { signal: job.signal, onStep: job.step });
        await draw(job, next, entry.name, entry.file);
      } catch (failure) {
        if (isAbort(failure)) return;
        job.failed();
        log.error("viewer/open-failed", { name: entry.name, reason: reasonOf(failure) });
        setError(describeFailure(failure));
      }
    },
    [basePath, begin, draw, fetcher],
  );
  // A public GitHub repository's single state, read and laid in the browser.
  const openRepository = useCallback(
    async (input: string) => {
      const started = performance.now();
      let job: Job | null = null;
      try {
        const repo = parseRepository(input);
        const name = `${repo.owner}/${repo.name}`;
        const load = begin("github", name);
        job = load;
        let requests = 0;
        const snapshot = await readRepository(github, repo, {
          signal: load.signal,
          onStep: (step) => {
            requests = step.requests;
            load.step(step);
          },
        });
        load.step({ phase: "lay", files: snapshot.files.length });
        const laid = await lay(snapshot, { signal: load.signal, onProgress: load.step, theme });
        await draw(load, laid.city, name, "", laid.scene);
        setStatus((done) => `${done} · single state, not folded`);
        log.info("viewer/github-read", {
          repo: name,
          requests,
          files: snapshot.files.length,
          ms: Math.round(performance.now() - started),
        });
        window.history.replaceState(null, "", `?repo=${name}`);
      } catch (failure) {
        if (isAbort(failure)) return;
        job?.failed();
        log.error("viewer/github-failed", { repo: input.trim(), reason: reasonOf(failure) });
        setError(describeFailure(failure));
      }
    },
    [begin, draw, github, lay, theme],
  );
  // The index loads once, on mount; a repository in the address is laid, else the first bundled city opens.
  const first = useEffectEvent((entry: CityEntry) => void open(entry));
  const wanted = useEffectEvent((repo: string) => void openRepository(repo));
  useEffect(() => {
    loadIndex(fetcher, basePath).then(
      (bundled) => {
        log.info("viewer/index", { cities: bundled.length });
        setCities(bundled);
        // From here a load names its own phase in the status, and an empty status means nothing is on its way.
        setStatus("");
        const repo = new URLSearchParams(window.location.search).get("repo");
        if (repo) wanted(repo);
        else if (bundled[0]) first(bundled[0]);
      },
      (failure: unknown) => {
        log.error("viewer/index-failed", { reason: reasonOf(failure) });
        setError(describeFailure(failure));
        setStatus("");
      },
    );
  }, [basePath, fetcher]);
  const openFile = async (file: File) => {
    const job = begin("file", file.name);
    try {
      const next = await readCityFile(file, { signal: job.signal, onStep: job.step });
      await draw(job, next, file.name, "");
    } catch (failure) {
      if (isAbort(failure)) return;
      job.failed();
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
  // While something opens, the status names it and its phase; the last city's status comes back if it is cancelled.
  const statusLine = loading.progress ? loadingStatus(loading.progress) : status;
  const { shown: carded, cancel } = loading;
  // Escape cancels a load the card shows, unless the search or an open menu takes it first.
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (event.target instanceof Element && event.target.closest(".search, .popover-root")) return;
      event.stopPropagation();
      cancel();
    };
    if (carded) window.addEventListener("keydown", escape, { capture: true });
    return () => window.removeEventListener("keydown", escape, { capture: true });
  }, [carded, cancel]);
  return (
    <main className="viewer" style={{ background: colours.country }} data-theme={theme} data-loading={loading.shown}>
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
        status={statusLine}
        town={town?.towns[0]!.name ?? null}
        onWhole={() => drill(null)}
      />
      <SearchBox
        index={finder?.search ?? null}
        // Matches come only from `finder`'s index, so `finder` is there whenever one is picked.
        onPick={(entry) => goTo(entry, finder!)}
        onRepository={(name) => void openRepository(name)}
        suggester={suggester}
        allowance={allowance}
      />
      {loading.shown && loading.progress && (
        <LoadingCard progress={loading.progress} now={loading.now} onCancel={loading.cancel} />
      )}
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
        onCity={(entry) => void open(entry)}
        onFile={(file) => void openFile(file)}
      />
      <Drawer
        city={shown}
        settled={statusLine === ""}
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
