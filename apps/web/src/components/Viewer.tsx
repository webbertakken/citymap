"use client";
import type { City } from "@citymap/ground-plan";
import { buildScene, pickIndex, type Hit } from "@citymap/scene";
import { THEMES, type ThemeName } from "@citymap/themes";
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
  useSyncExternalStore,
  type ComponentType,
  type CSSProperties,
} from "react";
import { describeFailure, loadCity, loadIndex, readCityFile, type CityEntry } from "../cities";
import { readRepository, type Fetcher } from "../github/read";
import { parseRepository } from "../github/repository";
import { layInWorker } from "../lay/browser";
import type { Lay } from "../lay/lay";
import { log, reasonOf } from "../log";
import { fit, type Mode, type View, type Viewport } from "../view/view";
import { CityPanel } from "./CityPanel";
import { MapView, type CanvasProps } from "./MapView";
import { TopBar } from "./TopBar";

export interface ViewerProps {
  readonly Canvas: ComponentType<CanvasProps>;
  readonly fetcher?: Fetcher;
  /** How a snapshot becomes a city: in a Web Worker in the browser, on the calling thread in tests. */
  readonly lay?: Lay;
  /** The site's path under its host, before every bundled file: "/citymap" on GitHub Pages. */
  readonly basePath?: string;
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

/** The viewer: one city at a time, its theme and its view. */
/** The city with only the town of that key, and no highways. */
export const focusOn = (city: City, key: string): City => ({
  ...city,
  towns: city.towns.filter((t) => t.key === key),
  highways: [],
});

export function Viewer({ Canvas, fetcher = browserFetch, lay = layInWorker, basePath = "" }: ViewerProps) {
  const [cities, setCities] = useState<readonly CityEntry[]>([]);
  const [selected, setSelected] = useState("");
  const [city, setCity] = useState<City | null>(null);
  const [status, setStatus] = useState("Loading the cities…");
  const [error, setError] = useState("");
  // The person's choice of theme, else Night atlas when the system prefers dark, else Paper atlas.
  const [chosen, setTheme] = useState<ThemeName | null>(null);
  const dark = useSyncExternalStore(subscribeDark, darkNow, darkOnServer);
  const theme: ThemeName = chosen ?? (dark ? "night-atlas" : "paper-atlas");
  const [mode, setMode] = useState<Mode>("dimetric");
  const [viewport, setViewport] = useState<Viewport>({ width: 800, height: 600 });
  // The view the person moved to; while `fitted`, the view is derived instead, fitting what is shown to the map.
  const [moved, setMoved] = useState<View>({ mode: "dimetric", centre: { x: 0, z: 0 }, zoom: 1 });
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
  const view = useMemo(
    () => (fitted && scene ? fit(scene.bounds, mode, viewport) : moved),
    [fitted, scene, mode, viewport, moved],
  );
  const [picked, setPicked] = useState<Hit | null>(null);
  const drill = (key: string | null) => {
    if (key === null) log.info("viewer/city");
    else log.info("viewer/town", { key });
    setFocus(key);
    setPicked(null);
    setFitted(true);
  };

  const show = useCallback((next: City, name: string) => {
    setCity(next);
    setFocus(null);
    setPicked(null);
    setError("");
    const lots = next.towns.reduce((s, t) => s + t.stats.lots, 0);
    log.info("viewer/open", { name, towns: next.towns.length, lots });
    setStatus(`${next.towns.length} towns · ${lots.toLocaleString("en-GB")} lots`);
    setFitted(true);
    document.title = `${name} · citymap`;
  }, []);
  const open = useCallback(
    async (entry: CityEntry) => {
      setSelected(entry.file);
      setStatus(`${entry.name}: laying out…`);
      try {
        show(await loadCity(fetcher, entry, basePath), entry.name);
      } catch (failure) {
        log.error("viewer/open-failed", { name: entry.name, reason: reasonOf(failure) });
        setError(describeFailure(failure));
        setStatus("");
      }
    },
    [basePath, fetcher, show],
  );
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
        const next = await lay(snapshot);
        show(next, name);
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
    [fetcher, lay, show],
  );
  // The index loads once, on mount; a repository in the address is laid, else the first bundled city opens.
  const first = useEffectEvent((entry: CityEntry) => void open(entry));
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
  // The page and the panel take the theme's colours; custom properties carry them into the stylesheet.
  const style: CSSProperties & Record<`--${string}`, string> = {
    background: colours.country,
    color: colours.headerText,
    "--panel": colours.header,
    "--panel-text": colours.headerText,
    "--panel-line": colours.outline,
  };
  return (
    <main className="viewer" style={style} data-theme={theme}>
      <TopBar
        title={city?.repository ?? "citymap"}
        status={status}
        cities={cities}
        selected={selected}
        mode={mode}
        theme={theme}
        town={town?.towns[0]!.name ?? null}
        onWhole={() => drill(null)}
        onCity={(file) => {
          const entry = cities.find((c) => c.file === file);
          if (entry) void open(entry);
        }}
        onFile={(file) => void openFile(file)}
        onRepository={(input) => void openRepository(input)}
        onMode={(next) => {
          setMode(next);
          setMoved({ ...moved, mode: next });
        }}
        onTheme={setTheme}
      />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="body">
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
            theme={colours}
            Canvas={Canvas}
            onView={(next) => {
              setFitted(false);
              setMoved(next);
            }}
            onViewport={setViewport}
          />
        ) : (
          <div className="map empty" />
        )}
        <CityPanel city={shown} selected={picked} focused={focus !== null} onDrill={drill} />
      </div>
    </main>
  );
}
