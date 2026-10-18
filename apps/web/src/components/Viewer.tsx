"use client";
import { DEFAULT_TOGGLES, toggleList, type City, type Snapshot, type Toggle } from "@citymap/ground-plan";
import type { Measures } from "@citymap/measures";
import {
  buildScene,
  focusOn,
  folderHit,
  onlyTown,
  pick,
  type ColourBy,
  type Hit,
  type PickIndex,
  type Scene,
} from "@citymap/scene";
import { THEMES, type ThemeName } from "@citymap/themes";
import type { Footprint, Walls } from "@citymap/world";
import {
  startTransition,
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentType,
} from "react";
import type { GitHubSource } from "../card/github";
import { measureRows } from "../card/measures";
import { describeFailure, loadCity, loadIndex, readCityFile, type CityEntry } from "../cities";
import type { ArcadeWhy, GoDown } from "../explore/descent";
import { footprintsOf } from "../explore/footprints";
import { inspector } from "../explore/inspect";
import { landingOf, type Landing } from "../explore/landing";
import { parkedIn } from "../explore/parking";
import type { Garage } from "../explore/physics/garage";
import { roadGrid, roadSegments, type RoadGrid } from "../explore/signs";
import { METRE } from "../explore/street";
import { parkedBy, type Vehicle } from "../explore/vehicles";
import { meter, type Allowance } from "../github/allowance";
import { createSuggester } from "../github/owners";
import { readRepository, type Fetcher } from "../github/read";
import { parseRepository } from "../github/repository";
import { Atlas } from "../lay/atlas";
import { layInWorker, readInWorker } from "../lay/browser";
import type { Laid, Lay, Read } from "../lay/lay";
import type { CityPort } from "../lay/port";
import { afterPaint } from "../load/paint";
import { loadingStatus, useLoading, type Job } from "../load/useLoading";
import type { LocalPorts } from "../local/ports";
import { log, reasonOf } from "../log";
import type { LiveFacts } from "../measures/live";
import type { SearchEntry, SearchIndex } from "../search/search";
import { searchIndexInSlices } from "../search/slices";
import { NO_SCALES, colourFor, lotBuilding, placeTable } from "../view/buildings";
import { FLY_MS, between, ease, flyTo } from "../view/fly";
import { heightsOf } from "../view/hover";
import { insetsFor } from "../view/insets";
import { roofsNear, type RoofsNear } from "../view/roofs";
import { ELEVATION, YAW, fit, onKey, type Mode, type View, type Viewport } from "../view/view";
import { Drawer } from "./Drawer";
import { ExploreView, type ExploreCanvasProps } from "./ExploreView";
import { Legend } from "./Legend";
import { LoadingCard } from "./LoadingCard";
import { LocalButton } from "./LocalButton";
import { MapView, type CanvasProps } from "./MapView";
import { MeasureRows, type RowsOf } from "./MeasureRows";
import { Notice } from "./Notice";
import { SearchBox } from "./SearchBox";
import { TitleCard } from "./TitleCard";
import { LOCAL_STATUS, LOCAL_TITLE, useLocalRepository } from "./useLocalRepository";
import { ViewControls } from "./ViewControls";
import { ZoomControls } from "./ZoomControls";

/**
 * Going down into the city: the ground-level canvas, the walls' physics engine by name, and how everything the walk
 * needs is loaded behind the loading card.
 */
export interface Explore {
  readonly Canvas: ComponentType<ExploreCanvasProps>;
  readonly engine: string;
  readonly goDown: GoDown;
}

export interface ViewerProps {
  readonly Canvas: ComponentType<CanvasProps>;
  /** Walking in the city; without it, the map has no Walk button. */
  readonly explore?: Explore;
  readonly fetcher?: Fetcher;
  /** How a snapshot becomes a city: in a Web Worker in the browser, on the calling thread in tests. */
  readonly lay?: Lay;
  /** How a city file's text becomes a city: in a Web Worker in the browser, on the calling thread in tests. */
  readonly read?: Read;
  /** The site's path under its host, before every bundled file: "/citymap" on GitHub Pages. */
  readonly basePath?: string;
  /** The browser's folder access: its own by default, stand-ins in tests. */
  readonly folders?: LocalPorts;
}

const browserFetch: Fetcher = (url, init) => fetch(url, init);
/** What the status adds once a GitHub repository is shown. */
const GITHUB_STATUS = "single state, not folded";
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

/** Where the city shown came from, so a change of toggles can lay it again: a bundled city, a live repository's
 * snapshot (from GitHub or the person's machine), or a city file, which keeps its layout. */
type Origin =
  | { readonly kind: "bundled"; readonly entry: CityEntry }
  | {
      readonly kind: "live";
      readonly via: "github" | "local";
      readonly name: string;
      readonly snapshot: Snapshot;
      /** What the source told of its files, so another layout keeps the same measures. */
      readonly facts: LiveFacts;
      /** What the status says of it: a single state. */
      readonly note: string;
      /** The tab's title, when it is not the name (a local repository's stays private). */
      readonly title: string;
    }
  | { readonly kind: "file" };

/** How a laid city is shown: under its name, as the bundled file picked (or none), its tab title, whether it is the
 * city shown in another layout, and where it came from. */
interface Shown {
  readonly name: string;
  readonly file: string;
  readonly origin: Origin;
  readonly title?: string;
  readonly relaid?: boolean;
}

/** What GitHub's tree tells of each file: its size in bytes, with no request more. */
const githubFacts = (sizes: ReadonlyMap<string, number>): LiveFacts => ({
  source: "github",
  size: "bytes",
  comments: false,
  files: new Map([...sizes].map(([path, bytes]) => [path, { bytes }])),
  coverage: new Map(),
});

/** A town's scene built on the main thread, before its worker has made it: timed, for the log. */
function sceneHere(town: City, theme: ThemeName) {
  const started = performance.now();
  const scene = buildScene(town, THEMES[theme]);
  return { scene, key: town.towns.map((t) => t.key).join(","), ms: Math.round(performance.now() - started) };
}

/** A GitHub repository, named "owner/name", at a commit. */
const sourceOf = (name: string, commit: string): GitHubSource => {
  const slash = name.indexOf("/");
  return { owner: name.slice(0, slash), name: name.slice(slash + 1), commit };
};

/**
 * A walk under way: the city (or town) it walks in, its walls and the cars' garage (null for arcade cars, and why),
 * where it began, and the vehicles parked about.
 */
interface Walking {
  readonly city: City;
  readonly walls: Walls;
  readonly garage: Garage | null;
  readonly arcade: ArcadeWhy | null;
  readonly footprints: readonly Footprint[];
  readonly roads: RoadGrid;
  readonly landing: Landing;
  readonly parked: readonly Vehicle[];
}

/** The viewer: one city at a time, its theme, its view and its layout toggles. */
export function Viewer({
  Canvas,
  explore,
  fetcher = browserFetch,
  lay = layInWorker,
  read = readInWorker,
  basePath = "",
  folders,
}: ViewerProps) {
  const loading = useLoading();
  // GitHub's hourly allowance, heard from every API answer, shared by laying and the suggestions.
  const [allowance, setAllowance] = useState<Allowance | null>(null);
  const github = useMemo(() => meter(fetcher, setAllowance), [fetcher]);
  const suggester = useMemo(() => createSuggester(github, wallClock), [github]);
  const [cities, setCities] = useState<readonly CityEntry[]>([]);
  // The layout toggles, at the engine's defaults on every visit; and where the city shown came from.
  const [toggles, setToggles] = useState<readonly Toggle[]>(DEFAULT_TOGGLES);
  const [origin, setOrigin] = useState<Origin | null>(null);
  const [selected, setSelected] = useState("");
  const [city, setCity] = useState<City | null>(null);
  const [measures, setMeasures] = useState<Measures | null>(null);
  // How the map is seen, and what the colours mean: plan and folder on every visit.
  const [mode, setMode] = useState<Mode>("plan");
  const [colourAsked, setColourBy] = useState<ColourBy>("folder");
  const [status, setStatus] = useState("Loading the cities…");
  const [error, setError] = useState("");
  // The person's choice of theme, else Night atlas when the system prefers dark, else Paper atlas.
  const [chosen, setTheme] = useState<ThemeName | null>(null);
  const dark = useSyncExternalStore(subscribeDark, darkNow, darkOnServer);
  const theme: ThemeName = chosen ?? (dark ? "night-atlas" : "paper-atlas");
  const [viewport, setViewport] = useState<Viewport>({ width: 800, height: 600 });
  // The view the person moved to; while `fitted`, the view is derived instead, fitting what is shown to the map.
  const [moved, setMoved] = useState<View>({ centre: { x: 0, z: 0 }, zoom: 1, yaw: YAW, tilt: ELEVATION });
  // A newly opened city or town stays fitted to the map, whatever size the map turns out to be, until the person moves it.
  const [fitted, setFitted] = useState(true);
  // Drill down: the key of the one town shown, or null for the whole city.
  const [focus, setFocus] = useState<string | null>(null);
  // What the city's worker has made for the city shown: its scenes by theme, each town's made ahead, and its tables.
  // The map draws the look asked for once it is at hand, and until then the last one, so the menus answer at once.
  const [atlas, setAtlas] = useState<Atlas | null>(null);
  const held = atlas?.city === city ? atlas : null;
  const colourBy = colourFor(colourAsked, measures);
  const look = held ? Atlas.look(held, { theme, colourBy }) : null;
  const drawnTheme: ThemeName = look?.theme ?? theme;
  const wholeScene = look?.whole ?? null;
  // The city's worker, kept while its city is shown; ended when another replaces it, and when the viewer goes.
  const cityPort = useRef<CityPort | null>(null);
  useEffect(
    () => () => {
      if (!cityPort.current) return;
      cityPort.current.end();
      log.info("viewer/city-worker-ended", { why: "left" });
    },
    [],
  );
  // What the look asked for lacks, asked of the city's worker: another theme's scenes, or another colour's table.
  const port = held?.port ?? null;
  const askFor = useEffectEvent((asked: { theme: ThemeName; colourBy: ColourBy }) => {
    // Asked only while a port is held, so the atlas is there.
    const wanted = Atlas.wants(held!, { ...asked, town: focus });
    if (!wanted) return;
    log.info("viewer/city-ask", {
      ask: wanted.ask,
      theme: wanted.theme,
      by: wanted.colourBy,
      first: wanted.ask === "look" ? (wanted.first ?? "") : "",
    });
    held!.port.ask(wanted);
  });
  useEffect(() => {
    if (port) askFor({ theme, colourBy });
  }, [port, theme, colourBy]);
  // The pick index the opening built with the city, off the main thread.
  const [wholePick, setWholePick] = useState<PickIndex | null>(null);
  const wholeIndex = wholePick?.city === city ? wholePick : null;
  const town = useMemo(() => (city && focus !== null ? focusOn(city, focus) : null), [city, focus]);
  // A town shown alone draws the scene its worker made ahead; before it is made, it is built here, so it shows at once.
  const madeTown = held && focus !== null ? Atlas.town(held, drawnTheme, focus) : null;
  const builtHere = useMemo(
    () => (town && !madeTown ? sceneHere(town, drawnTheme) : null),
    [town, madeTown, drawnTheme],
  );
  useEffect(() => {
    if (builtHere) log.info("viewer/town-scene-here", { key: builtHere.key, ms: builtHere.ms });
  }, [builtHere]);
  const townScene = madeTown ?? builtHere?.scene ?? null;
  // A town shown alone picks from the whole city's index, restricted to that town: nothing is built on a drill.
  const townIndex = useMemo(
    () => (wholeIndex && focus !== null ? onlyTown(wholeIndex, focus) : null),
    [wholeIndex, focus],
  );
  const shown = town ?? city;
  const scene = townScene ?? wholeScene;
  const index = townIndex ?? wholeIndex;
  const [drawer, setDrawer] = useState<boolean | null>(null);
  const insets = useMemo(() => insetsFor(viewport, drawer), [viewport, drawer]);
  const view = useMemo(
    // The Buildings view's turn is the person's, held by the view they moved to and kept when fitting.
    () => (fitted && scene ? fit(scene.bounds, viewport, insets, mode, moved) : moved),
    [fitted, scene, viewport, insets, moved, mode],
  );
  // The lot table the buildings are drawn from (a town's rows of the whole city's), how tall each stands, the legend's
  // scales, and the cards' measure rows, each card aggregating its own lot.
  const floors = held?.floors ?? null;
  const span = held ? Atlas.span(held, focus) : null;
  const wholeTable = look?.table ?? null;
  const table = useMemo(
    () => (wholeTable && span && focus !== null ? placeTable(wholeTable, span) : wholeTable),
    [wholeTable, span, focus],
  );
  const heights = useMemo(() => (floors && span ? heightsOf(floors, span) : null), [floors, span]);
  const scales = held?.scales ?? NO_SCALES;
  const legendCity = useMemo(() => ({ measures, scales }), [measures, scales]);
  const rowsOf: RowsOf = useCallback(
    (hit: Hit) =>
      hit.kind === "lot" && !hit.vacant
        ? measureRows(lotBuilding(measures, hit.townKey, hit.key), measures, Date.now())
        : [],
    [measures],
  );
  // Every building's name over its roof, made by the city's worker: the map reads those near its centre.
  const roofs = useMemo<RoofsNear | null>(
    () => held && ((centre, reach) => roofsNear(held.roofs, held.floors, Atlas.span(held, focus), centre, reach)),
    [held, focus],
  );
  const uses = useMemo(() => [...new Set(scene?.buildings.order.map((ref) => ref.use))], [scene]);
  const [picked, setPickedHit] = useState<Hit | null>(null);
  // A walk in the city or town shown: showing another ends it (a new theme draws the same city, and keeps it).
  const [walk, setWalk] = useState<Walking | null>(null);
  if (walk && walk.city !== shown) setWalk(null);
  const walking = walk?.city === shown ? walk : null;
  // A walk's walls are freed once it is over: ended, replaced, or the viewer gone.
  useEffect(
    () => () => {
      walk?.walls.dispose();
      walk?.garage?.dispose();
    },
    [walk],
  );
  // Where a search took the person: a marker over the map, until the selection changes.
  const [marker, setMarker] = useState<{ x: number; z: number } | null>(null);
  const setPicked = (hit: Hit | null) => {
    setPickedHit(hit);
    setMarker(null);
  };
  // What a search needs: the whole city's folders and files (listed in slices as it opens), where they lie, and how to
  // pick them.
  const [listed, setListed] = useState<{ readonly city: City; readonly index: SearchIndex } | null>(null);
  const search = listed?.city === city ? listed.index : null;
  const finder = useMemo(
    () => (search && wholeScene && wholeIndex ? { search, bounds: wholeScene.bounds, picking: wholeIndex } : null),
    [search, wholeScene, wholeIndex],
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
    const whole = fit(bounds, viewport, insets, mode, moved);
    const from = leaving ? whole : view;
    flyView(from, flyTo(viewport, entry, whole, insets, mode));
    const hit: Hit | null =
      entry.kind === "file" ? pick(picking, entry.x, entry.z) : folderHit(picking, entry.townKey, entry.path);
    setPickedHit(hit);
    setMarker({ x: entry.x, z: entry.z });
  };

  // A city shown afresh fits the map; the same city in another layout keeps the view, and the town shown if it is there.
  const show = useCallback((next: City, name: string, title: string = name, relaid = false) => {
    cancelAnimationFrame(flight.current);
    setCity(next);
    setFocus((was) => (relaid && next.towns.some((t) => t.key === was) ? was : null));
    setPickedHit(null);
    setMarker(null);
    setError("");
    const lots = next.towns.reduce((s, t) => s + t.stats.lots, 0);
    log.info("viewer/open", { name, towns: next.towns.length, lots });
    setStatus(`${next.towns.length} towns · ${lots.toLocaleString("en-GB")} lots`);
    if (!relaid) setFitted(true);
    document.title = `${title} · citymap`;
  }, []);
  // The last phase of every load: the city is in hand; it is shown with where it came from, and the load is done once
  // the map has drawn.
  const draw = useCallback(
    async (job: Job, laid: Laid, how: Shown) => {
      const { name, file, origin: from, title = name, relaid = false } = how;
      const { city: next, measures: opened, port: made } = laid;
      // The city's folders and files are listed for search in slices that yield to input, so the city shows with them;
      // an opening that ends meanwhile ends its worker too.
      const listing = performance.now();
      const searchable = await (async () => {
        job.step({ phase: "draw" });
        await afterPaint();
        return searchIndexInSlices(next, { signal: job.signal });
      })().catch((failure: unknown) => {
        made.end();
        log.info("viewer/city-worker-ended", { why: "cancelled" });
        throw failure;
      });
      const { index: listedIndex, slices } = searchable;
      log.info("viewer/search-index", {
        entries: listedIndex.entries.length,
        slices,
        ms: Math.round(performance.now() - listing),
      });
      // The city shown before ends its worker; this city's worker is heard from now on.
      if (cityPort.current) {
        cityPort.current.end();
        log.info("viewer/city-worker-ended", { why: "replaced" });
      }
      cityPort.current = made;
      setAtlas(Atlas.open(laid));
      // An ended port tells nothing more, so every answer heard is this city's.
      made.listen((answer) => setAtlas((was) => Atlas.received(was!, answer)));
      setWholePick(laid.pick);
      setListed({ city: next, index: listedIndex });
      setMeasures(opened);
      if (opened)
        log.info("viewer/measures", {
          source: opened.source,
          size: opened.size,
          tested: opened.tested,
          lots: Object.values(opened.lots).reduce((n, byKey) => n + Object.keys(byKey).length, 0),
        });
      else log.info("viewer/measures-none", { name });
      show(next, name, title, relaid);
      setOrigin(from);
      setSelected(file);
      await afterPaint();
      job.done();
    },
    [show],
  );
  const { begin } = loading;
  // A bundled city in the variant the toggles name; `relaid` when it is the city shown, in another layout.
  const open = useCallback(
    async (entry: CityEntry, layout: readonly Toggle[], relaid = false) => {
      const job = begin("bundled", entry.name);
      try {
        const text = await loadCity(fetcher, entry, layout, basePath, { signal: job.signal, onStep: job.step });
        const laid = await read(text, {
          signal: job.signal,
          onProgress: job.step,
          theme,
          colourBy: colourAsked,
          town: relaid ? focus : null,
        });
        await draw(job, laid, { name: entry.name, file: entry.name, relaid, origin: { kind: "bundled", entry } });
      } catch (failure) {
        if (isAbort(failure)) return;
        job.failed();
        log.error(relaid ? "viewer/variant-failed" : "viewer/open-failed", {
          name: entry.name,
          reason: reasonOf(failure),
        });
        setError(describeFailure(failure));
      }
    },
    [basePath, begin, draw, fetcher, read, theme, colourAsked, focus],
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
        const { snapshot, sizes } = await readRepository(github, repo, {
          signal: load.signal,
          onStep: (step) => {
            requests = step.requests;
            load.step(step);
          },
        });
        load.step({ phase: "lay", files: snapshot.files.length });
        const facts = githubFacts(sizes);
        const laid = await lay(snapshot, {
          signal: load.signal,
          onProgress: load.step,
          theme,
          colourBy: colourAsked,
          toggles,
          facts,
        });
        const from: Origin = { kind: "live", via: "github", name, snapshot, facts, note: GITHUB_STATUS, title: name };
        await draw(load, laid, { name, file: "", origin: from });
        setStatus((done) => `${done} · ${GITHUB_STATUS}`);
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
    [begin, draw, github, lay, theme, colourAsked, toggles],
  );
  // A repository on the person's machine, read and laid in the browser; nothing about it leaves the page.
  const local = useLocalRepository({
    ...(folders ? { ports: folders } : {}),
    lay,
    theme,
    colourBy: colourAsked,
    toggles,
    begin,
    status,
    setStatus,
    setError,
    present: async (job, laid, name, snapshot, facts) => {
      const from: Origin = {
        kind: "live",
        via: "local",
        name,
        snapshot,
        facts,
        note: LOCAL_STATUS,
        title: LOCAL_TITLE,
      };
      await draw(job, laid, { name, file: "", title: LOCAL_TITLE, origin: from });
      setStatus((done) => `${done} · ${LOCAL_STATUS}`);
    },
  });
  // A live repository's snapshot laid again with other toggles, off the main thread.
  const relay = async (live: Extract<Origin, { kind: "live" }>, layout: readonly Toggle[]) => {
    const { via, name, snapshot, facts, note, title } = live;
    const job = begin(via, name);
    try {
      job.step({ phase: "lay", files: snapshot.files.length });
      const laid = await lay(snapshot, {
        signal: job.signal,
        onProgress: job.step,
        theme,
        colourBy: colourAsked,
        town: focus,
        toggles: layout,
        facts,
      });
      await draw(job, laid, { name, file: "", title, relaid: true, origin: live });
      setStatus((done) => `${done} · ${note}`);
    } catch (failure) {
      if (isAbort(failure)) return;
      job.failed();
      log.error("viewer/variant-failed", { name, reason: reasonOf(failure) });
      setError(describeFailure(failure));
    }
  };
  const toggle = (changed: Toggle, on: boolean) => {
    const next = toggleList(on ? [...toggles, changed] : toggles.filter((t) => t !== changed));
    setToggles(next);
    log.info("viewer/toggles", { on: next.join(",") || "none" });
    if (origin?.kind === "bundled") void open(origin.entry, next, true);
    else if (origin?.kind === "live") void relay(origin, next);
  };
  // The index loads once, on mount; a repository in the address is laid, else the first bundled city opens.
  const first = useEffectEvent((entry: CityEntry) => void open(entry, toggles));
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
      const text = await readCityFile(file, { signal: job.signal, onStep: job.step });
      const laid = await read(text, { signal: job.signal, onProgress: job.step, theme, colourBy: colourAsked });
      await draw(job, laid, { name: file.name, file: "", origin: { kind: "file" } });
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
  // The repository and commit a city laid from GitHub came from, so its files and folders can be opened there.
  const source = origin?.kind === "live" && origin.via === "github" && city ? sourceOf(origin.name, city.commit) : null;
  // The map, its background, its names and the legend are in the look's theme: the one asked for once it has arrived.
  const colours = THEMES[drawnTheme];
  // While something opens, the status names it and its phase; the last city's status comes back if it is cancelled.
  const statusLine = loading.progress ? loadingStatus(loading.progress) : status;
  const { cancellable, cancel } = loading;
  // Escape cancels a running load the card shows, unless the search or an open menu takes it first; once the load is
  // done the card only holds, and Escape is the map's again.
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (event.target instanceof Element && event.target.closest(".search, .popover-root")) return;
      event.stopPropagation();
      cancel();
    };
    if (cancellable) window.addEventListener("keydown", escape, { capture: true });
    return () => window.removeEventListener("keydown", escape, { capture: true });
  }, [cancellable, cancel]);
  const changeMode = (next: Mode) => {
    log.info("viewer/mode", { mode: next });
    cancelAnimationFrame(flight.current);
    if (walking) leaveWalk(null);
    setMode(next);
  };
  // Going down into the city: before the selected building, else on the road nearest the map's middle; the walls rise
  // under the loading card.
  const startWalk = async (
    goDown: GoDown,
    into: { readonly city: City; readonly scene: Scene; table: Float32Array },
  ) => {
    const landing = landingOf(into.city, picked, view.centre);
    if (!landing) {
      log.info("explore/no-roads", { name: into.city.repository });
      setError("This city has no roads to walk on.");
      return;
    }
    const job = begin("explore", into.city.repository);
    try {
      const footprints = footprintsOf(into.scene.buildings, into.table);
      const landed = { x: landing.at.x / METRE, z: landing.at.z / METRE };
      const { walls, garage, arcade } = await goDown(footprints, landed, { onStep: job.step, signal: job.signal });
      log.info("explore/enter", {
        landing: landing.kind,
        buildings: footprints.length,
        x: landing.at.x.toFixed(3),
        z: landing.at.z.toFixed(3),
      });
      // The landing's pair at the kerb ahead, then the city's own, worked out from its plan.
      const parked = [...parkedBy(landing, walls), ...parkedIn(into.city, landing, walls)];
      log.info("explore/parked", {
        bicycles: parked.filter((v) => v.kind === "bicycle").length,
        cars: parked.filter((v) => v.kind === "car").length,
      });
      setWalk({
        city: into.city,
        walls,
        garage,
        arcade,
        footprints,
        roads: roadGrid(roadSegments(into.city)),
        landing,
        parked,
      });
      job.done();
    } catch (failure) {
      if (isAbort(failure)) return;
      job.failed();
      log.error("explore/failed", { reason: reasonOf(failure) });
      setError("Walking could not start: the city’s walls did not rise.");
    }
  };
  // Back to the map: centred where the walk ended, when it ended on foot.
  const leaveWalk = (at: { readonly x: number; readonly z: number } | null) => {
    // To the centimetre (a thousandth of a street width): where the walk ended, to check it never ended in a wall.
    log.info("explore/leave", at ? { x: at.x.toFixed(3), z: at.z.toFixed(3) } : {});
    setWalk(null);
    if (at) settle({ ...view, centre: at });
  };
  const changeColour = (next: ColourBy) => {
    log.info("viewer/colour-by", { by: next });
    startTransition(() => setColourBy(next));
  };
  return (
    <main
      className="viewer"
      style={{ background: colours.country }}
      data-theme={drawnTheme}
      data-loading={loading.shown}
      data-mode={mode}
      data-walking={walking !== null}
    >
      <MeasureRows value={rowsOf}>
        {walking && explore && city && scene && index && table ? (
          <ExploreView
            name={city.repository}
            scene={scene}
            table={table}
            theme={colours}
            walls={walking.walls}
            footprints={walking.footprints}
            roads={walking.roads}
            inspect={inspector(scene, walking.footprints, index, measures)}
            landing={walking.landing}
            parked={walking.parked}
            garage={walking.garage}
            arcade={walking.arcade}
            engine={explore.engine}
            Canvas={explore.Canvas}
            onLeave={leaveWalk}
          />
        ) : scene && city && index && table && roofs ? (
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
            mode={mode}
            table={table}
            heights={heights}
            roofs={roofs}
            focused={focus !== null}
            github={source !== null}
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
        {!walking && (
          <div className="finder">
            <SearchBox
              index={finder?.search ?? null}
              // Matches come only from `finder`'s index, so `finder` is there whenever one is picked.
              onPick={(entry) => goTo(entry, finder!)}
              onRepository={(name) => void openRepository(name)}
              suggester={suggester}
              allowance={allowance}
            />
            <LocalButton local={local} />
          </div>
        )}
        {loading.shown && loading.progress && (
          <LoadingCard progress={loading.progress} cancellable={loading.cancellable} onCancel={loading.cancel} />
        )}
        <ViewControls
          mode={mode}
          onMode={changeMode}
          theme={theme}
          cities={cities}
          selected={selected}
          // The menu closes in the next frame; the map redraws in its new colours after it.
          onTheme={(next) => startTransition(() => setTheme(next))}
          onCity={(entry) => void open(entry, toggles)}
          onFile={(file) => void openFile(file)}
          local={local}
          toggles={toggles}
          fixed={origin?.kind === "file"}
          onToggle={toggle}
          {...(explore
            ? {
                walk: {
                  walking: walking !== null,
                  onWalk:
                    shown && scene && table
                      ? () =>
                          walking ? leaveWalk(null) : void startWalk(explore.goDown, { city: shown, scene, table })
                      : null,
                },
              }
            : {})}
        />
        {local.input}
        {!walking && (
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
            github={source}
            onFailure={setError}
          />
        )}
        {scene && !walking && (
          <ZoomControls
            onKey={(key) => {
              if (key === "0") {
                cancelAnimationFrame(flight.current);
                setFitted(true);
                return;
              }
              settle(onKey(key, view, viewport, scene.bounds, insets, mode)!);
            }}
          />
        )}
        {!walking && (
          <Legend
            theme={colours}
            mode={mode}
            colourBy={look?.colourBy ?? colourBy}
            onColourBy={changeColour}
            city={legendCity}
            uses={uses}
          />
        )}
        {error && <Notice message={error} onDismiss={() => setError("")} />}
      </MeasureRows>
    </main>
  );
}
