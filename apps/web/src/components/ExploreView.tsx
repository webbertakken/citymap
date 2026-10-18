"use client";
// On foot in the city: the ground-level canvas, the devices that move the walker (keys, a drag to look, a touch stick
// and a jump button), getting on and off vehicles (E, or the prompt's button), and a card that says how, with the way
// back to the map.
import type { Scene } from "@citymap/scene";
import type { Theme } from "@citymap/themes";
import { GROUND, cityHits, type Footprint, type Vec3, type Walls } from "@citymap/world";
import { Bike, Car, Footprints, X } from "lucide-react";
import { useEffect, useEffectEvent, useMemo, useRef, useState, type ComponentType, type PointerEvent } from "react";
import { describeHit } from "../card/describe";
import { cameraOf, easeReach, reachOf } from "../explore/camera";
import { WALK_KEYS, stickAt } from "../explore/input";
import type { Inspect } from "../explore/inspect";
import type { Landing } from "../explore/landing";
import {
  advanceSession,
  followOf,
  newControls,
  promptOf,
  promptWords,
  ridden,
  shownOf,
  shownVehicles,
  startSession,
  type Prompt,
  type Session,
} from "../explore/session";
import { sightOf, windowRows, type Sight } from "../explore/sight";
import { signName, type RoadGrid } from "../explore/signs";
import { METRE } from "../explore/street";
import { VEHICLES, parkedBy, type Vehicle, type VehicleKind } from "../explore/vehicles";
import { log } from "../log";
import { CardBody } from "./CardBody";
import { useMeasureRows } from "./MeasureRows";

/**
 * One frame of the walk: the session after it, where to draw the walker and the vehicles, what the walker rides (if
 * anything), and where the camera is and looks.
 */
export interface ExploreFrame {
  readonly session: Session;
  readonly shown: { readonly feet: Vec3; readonly heading: number; readonly walked: number };
  readonly vehicles: readonly Vehicle[];
  readonly riding: VehicleKind | null;
  readonly camera: { readonly eye: Vec3; readonly target: Vec3 };
}

/** What the ground-level canvas draws: the city, and each frame's walk, which it asks for as time passes. */
export interface ExploreCanvasProps {
  readonly scene: Scene;
  readonly table: Float32Array;
  readonly theme: Theme;
  /** Advances the walk by a frame of `seconds` and says where everything now is. */
  readonly frame: (seconds: number) => ExploreFrame;
  /** The vehicles about, by name and kind, to have a model each before the first frame places them. */
  readonly vehicles: readonly { readonly id: string; readonly kind: VehicleKind }[];
  /** What signs are made from: every building, its look, the streets, and each building's name. */
  readonly signs: Signage;
  /** How many signs show now, as it changes. */
  readonly onSigns: (count: number) => void;
}

/** What the canvas signs buildings with. */
export interface Signage {
  readonly footprints: readonly Footprint[];
  readonly roads: RoadGrid;
  readonly name: (lot: number) => string;
}

/** The crosshair reads this far, in metres. */
export const SIGHT_REACH = 150;

export interface ExploreViewProps {
  /** Every building's footprint, for the crosshair's line of sight and the signs. */
  readonly footprints: readonly Footprint[];
  /** The city's streets, for which wall of a building faces one. */
  readonly roads: RoadGrid;
  readonly inspect: Inspect;
  readonly name: string;
  readonly scene: Scene;
  readonly table: Float32Array;
  readonly theme: Theme;
  readonly walls: Walls;
  readonly landing: Landing;
  /** The physics engine the walls come from, as the card names it. */
  readonly engine: string;
  readonly Canvas: ComponentType<ExploreCanvasProps>;
  /** Back to the map, at the walker's place on the ground (scene units). */
  readonly onLeave: (at: { readonly x: number; readonly z: number }) => void;
}

/** A pointer event on a panel stays there, out of the walk's hands. */
const keep = (event: PointerEvent<HTMLElement>) => event.stopPropagation();

/** What the crosshair is on: the building's card, with a window's file and light. */
function SightCard({ sight, inspect }: { readonly sight: Sight; readonly inspect: Inspect }) {
  const rowsOf = useMeasureRows();
  const { hit, files } = inspect(sight.lot);
  if (!hit) return null;
  const file = sight.kind === "window" ? files[sight.file] : undefined;
  const card = describeHit(hit, [...(sight.kind === "window" ? windowRows(sight, files.length) : []), ...rowsOf(hit)]);
  const title = file ? file.slice(file.lastIndexOf("/") + 1) : card.title;
  return (
    // The panel is its own: a finger scrolls it, and neither that nor a click on it turns the camera or captures the mouse.
    <section
      className="glass explore-sight"
      aria-label="In sight"
      data-kind={sight.kind}
      onPointerDown={keep}
      onPointerMove={keep}
      onPointerUp={keep}
    >
      <CardBody card={{ ...card, title }} />
    </section>
  );
}

/** A touch stick reaches this many pixels from where the finger lands. */
export const STICK_REACH = 48;

/** Walking: the canvas fills the map; keys, drags, the stick and the jump button move the walker. */
export function ExploreView({
  name,
  scene,
  table,
  theme,
  walls,
  footprints,
  roads,
  inspect,
  landing,
  engine,
  Canvas,
  onLeave,
}: ExploreViewProps) {
  const hits = useMemo(() => cityHits(footprints), [footprints]);
  // The signs the canvas shows, and how many: a count tests and the log can read.
  const [signCount, setSignCount] = useState(0);
  const signage = useMemo(
    () => ({ footprints, roads, name: (lot: number) => signName(inspect(lot).files) }),
    [footprints, roads, inspect],
  );
  // What the crosshair is on, changed only when it changes.
  const [sight, setSight] = useState<Sight | null>(null);
  const seen = useRef("");
  const [start] = useState(() =>
    startSession(
      { x: landing.at.x / METRE, y: GROUND, z: landing.at.z / METRE },
      landing.heading,
      parkedBy(landing, walls),
    ),
  );
  // What E would do now: shown as a button, changed only when it changes.
  const [prompt, setPrompt] = useState<Prompt | null>(() => promptOf(start));
  const [riding, setRiding] = useState<VehicleKind | null>(null);
  const said = useRef(JSON.stringify(promptOf(start)));
  // How far back the camera sits: in at once to a wall, back out gently.
  const reach = useRef<number | null>(null);
  const session = useRef(start);
  const controls = useRef(newControls());
  // The finger on the stick and where it landed, and the pointer that drags the view.
  const stick = useRef<{ id: number; x: number; y: number } | null>(null);
  const dragging = useRef<{ id: number; x: number; y: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);

  const frame = (seconds: number): ExploreFrame => {
    const next = advanceSession(session.current, controls.current, seconds, walls);
    controls.current.look = { dx: 0, dy: 0 };
    controls.current.use = false;
    session.current = next;
    const now = promptOf(next);
    const words = JSON.stringify(now);
    if (words !== said.current) {
      said.current = words;
      setPrompt(now);
    }
    const kind = ridden(next)?.kind ?? null;
    if (kind !== riding) setRiding(kind);
    const shown = shownOf(next);
    const follow = followOf(next);
    const wanted = reachOf(shown.feet, next.orbit, walls, follow);
    reach.current = reach.current === null ? wanted : easeReach(reach.current, wanted, seconds);
    const camera = cameraOf(shown.feet, next.orbit, walls, follow, reach.current);
    readSight(camera);
    return { session: next, shown, vehicles: shownVehicles(next), riding: kind, camera };
  };
  // The crosshair, in the middle of the view, looks along the camera's line through its target.
  const readSight = (camera: { readonly eye: Vec3; readonly target: Vec3 }) => {
    const dx = camera.target.x - camera.eye.x;
    const dy = camera.target.y - camera.eye.y;
    const dz = camera.target.z - camera.eye.z;
    // The camera sits at least NEAREST from its target, so the line has a length.
    const length = Math.hypot(dx, dy, dz);
    const far = {
      x: camera.eye.x + (dx / length) * SIGHT_REACH,
      y: camera.eye.y + (dy / length) * SIGHT_REACH,
      z: camera.eye.z + (dz / length) * SIGHT_REACH,
    };
    const hit = hits.hit(camera.eye, far);
    const now = hit
      ? sightOf(hit, { floors: table[hit.lot * 4]!, lit: table[hit.lot * 4 + 1]! }, inspect(hit.lot).files.length)
      : null;
    const key = JSON.stringify(now);
    if (key === seen.current) return;
    seen.current = key;
    setSight(now);
  };
  const use = () => {
    controls.current.use = true;
  };
  const back = () => {
    const { feet } = session.current.body;
    onLeave({ x: feet.x * METRE, z: feet.z * METRE });
  };
  const key = useEffectEvent((event: KeyboardEvent, down: boolean) => {
    if (down && event.key === "Escape") {
      event.preventDefault();
      back();
      return;
    }
    if (event.code === "KeyE") {
      event.preventDefault();
      if (down && !event.repeat) use();
      return;
    }
    if (!WALK_KEYS.has(event.code)) return;
    // The walker's keys move the walker, not the page.
    event.preventDefault();
    if (down) controls.current.keys.add(event.code);
    else controls.current.keys.delete(event.code);
  });

  useEffect(() => {
    const down = (event: KeyboardEvent) => key(event, true);
    const up = (event: KeyboardEvent) => key(event, false);
    // A key released while the page is in the background never arrives: let go of everything.
    const away = () => controls.current.keys.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", away);
    // Whether the mouse was captured, refused or let go, the log says.
    const lockChanged = () =>
      log.info(document.pointerLockElement ? "explore/pointer-locked" : "explore/pointer-released");
    const lockRefused = () => log.info("explore/pointer-refused");
    document.addEventListener("pointerlockchange", lockChanged);
    document.addEventListener("pointerlockerror", lockRefused);
    box.current?.focus();
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", away);
      document.removeEventListener("pointerlockchange", lockChanged);
      document.removeEventListener("pointerlockerror", lockRefused);
      if (document.pointerLockElement) document.exitPointerLock?.();
    };
  }, []);

  // A mouse captured (pointer lock) turns the camera by how far it moves, with no drag; Escape lets it go.
  const locked = () => document.pointerLockElement === box.current;
  const press = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && !locked()) {
      // A refusal is logged by `pointerlockerror`; the promise only says the same again.
      box.current?.requestPointerLock?.()?.catch(() => undefined);
      return;
    }
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragging.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
  };
  const drag = (event: PointerEvent<HTMLDivElement>) => {
    if (locked()) {
      const { look } = controls.current;
      controls.current.look = { dx: look.dx + event.movementX, dy: look.dy + event.movementY };
      return;
    }
    const from = dragging.current;
    if (from?.id !== event.pointerId) return;
    const { look } = controls.current;
    controls.current.look = { dx: look.dx + event.clientX - from.x, dy: look.dy + event.clientY - from.y };
    dragging.current = { ...from, x: event.clientX, y: event.clientY };
  };
  const release = (event: PointerEvent<HTMLDivElement>) => {
    if (dragging.current?.id === event.pointerId) dragging.current = null;
  };
  const touchStick = (event: PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    stick.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
    controls.current.stick = { x: 0, y: 0 };
  };
  const moveStick = (event: PointerEvent<HTMLDivElement>) => {
    const origin = stick.current;
    if (origin?.id !== event.pointerId) return;
    event.stopPropagation();
    controls.current.stick = stickAt(origin, { x: event.clientX, y: event.clientY }, STICK_REACH);
  };
  const letStickGo = (event: PointerEvent<HTMLDivElement>) => {
    if (stick.current?.id !== event.pointerId) return;
    event.stopPropagation();
    stick.current = null;
    controls.current.stick = null;
  };
  const title = riding ? VEHICLES[riding].riding : "On foot";
  const jump = (held: boolean) => (event: PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    controls.current.jump = held;
  };

  return (
    <div
      ref={box}
      className="map explore"
      data-signs={signCount}
      role="application"
      aria-label={`Walking in ${name}. W A S D or the arrow keys walk, Shift runs, Space jumps, E gets on or off, click or drag to look around, Escape goes back to the map.`}
      tabIndex={0}
      onPointerDown={press}
      onPointerMove={drag}
      onPointerUp={release}
      onPointerCancel={release}
    >
      <span className="explore-crosshair" aria-hidden="true" />
      {sight && <SightCard sight={sight} inspect={inspect} />}
      <Canvas
        scene={scene}
        table={table}
        theme={theme}
        frame={frame}
        vehicles={start.vehicles}
        signs={signage}
        onSigns={setSignCount}
      />
      <section className="glass explore-card" aria-label={title}>
        <h2>
          {riding === "car" ? (
            <Car size={18} aria-hidden="true" />
          ) : riding === "bicycle" ? (
            <Bike size={18} aria-hidden="true" />
          ) : (
            <Footprints size={18} aria-hidden="true" />
          )}
          <span>{title}</span>
        </h2>
        <p className="explore-engine">Physics prototype: {engine}</p>
        <p className="explore-keys">
          {riding
            ? VEHICLES[riding].keys
            : "W A S D walk · Shift runs · Space jumps · E gets in · click to look · Esc leaves"}
        </p>
        <button type="button" className="text-button" onPointerDown={(event) => event.stopPropagation()} onClick={back}>
          <X size={16} aria-hidden="true" />
          <span>Back to the map</span>
        </button>
      </section>
      {prompt && (
        <button
          type="button"
          className="glass explore-use"
          disabled={!prompt.ready}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={use}
        >
          <kbd className="explore-keys" aria-hidden="true">
            E
          </kbd>
          <span>{promptWords(prompt)}</span>
        </button>
      )}
      <div
        className="explore-stick"
        aria-hidden="true"
        onPointerDown={touchStick}
        onPointerMove={moveStick}
        onPointerUp={letStickGo}
        onPointerCancel={letStickGo}
      />
      <button
        type="button"
        className="glass explore-jump"
        onPointerDown={jump(true)}
        onPointerUp={jump(false)}
        onPointerCancel={jump(false)}
      >
        Jump
      </button>
    </div>
  );
}
