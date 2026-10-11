"use client";
import type { City } from "@citymap/ground-plan";
import { buildScene } from "@citymap/scene";
import { THEMES, type ThemeName } from "@citymap/themes";
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
  useSyncExternalStore,
  type ComponentType,
} from "react";
import { describeFailure, loadCity, loadIndex, readCityFile, type CityEntry } from "../cities";
import { fit, type Mode, type View, type Viewport } from "../view/view";
import { CityPanel } from "./CityPanel";
import { MapView, type CanvasProps } from "./MapView";
import { TopBar } from "./TopBar";

export interface ViewerProps {
  readonly Canvas: ComponentType<CanvasProps>;
  readonly fetcher?: (url: string) => ReturnType<typeof fetch>;
}

const browserFetch = (url: string) => fetch(url);

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
export function Viewer({ Canvas, fetcher = browserFetch }: ViewerProps) {
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
  const [view, setView] = useState<View>({ mode: "dimetric", centre: { x: 0, z: 0 }, zoom: 1 });
  const scene = useMemo(() => (city ? buildScene(city, THEMES[theme]) : null), [city, theme]);

  const show = useCallback(
    (next: City, name: string) => {
      setCity(next);
      setError("");
      setStatus(
        `${next.towns.length} towns · ${next.towns.reduce((s, t) => s + t.stats.lots, 0).toLocaleString("en-GB")} lots`,
      );
      setView(fit(buildScene(next, THEMES[theme]).bounds, mode, viewport));
      document.title = `${name} · citymap`;
    },
    [mode, theme, viewport],
  );
  const open = useCallback(
    async (entry: CityEntry) => {
      setSelected(entry.file);
      setStatus(`${entry.name}: laying out…`);
      try {
        show(await loadCity(fetcher, entry), entry.name);
      } catch (failure) {
        setError(describeFailure(failure));
        setStatus("");
      }
    },
    [fetcher, show],
  );
  // The index loads once, on mount; opening its first city uses the settings of the moment.
  const first = useEffectEvent((entry: CityEntry) => void open(entry));
  useEffect(() => {
    loadIndex(fetcher).then(
      (index) => {
        setCities(index);
        if (index[0]) first(index[0]);
        else setStatus("");
      },
      (failure: unknown) => {
        setError(describeFailure(failure));
        setStatus("");
      },
    );
  }, [fetcher]);
  const openFile = async (file: File) => {
    try {
      show(await readCityFile(file), file.name);
      setSelected("");
    } catch (failure) {
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
    <main className="viewer" style={{ background: colours.country, color: colours.headerText }} data-theme={theme}>
      <TopBar
        title={city?.repository ?? "citymap"}
        status={status}
        cities={cities}
        selected={selected}
        mode={mode}
        theme={theme}
        onCity={(file) => {
          const entry = cities.find((c) => c.file === file);
          if (entry) void open(entry);
        }}
        onFile={(file) => void openFile(file)}
        onMode={(next) => {
          setMode(next);
          setView({ ...view, mode: next });
        }}
        onTheme={setTheme}
      />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="body">
        {scene && city ? (
          <MapView
            name={city.repository}
            scene={scene}
            view={view}
            theme={colours}
            Canvas={Canvas}
            onView={setView}
            onViewport={setViewport}
          />
        ) : (
          <div className="map empty" />
        )}
        <CityPanel city={city} />
      </div>
    </main>
  );
}
