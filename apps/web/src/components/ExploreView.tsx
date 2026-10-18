"use client";
// On foot in the city: the ground-level canvas, the devices that move the walker (keys, a drag to look, a touch stick
// and buttons, a gamepad), getting on and off vehicles (E, or the prompt's button), each ride's HUD, the bicycle's
// bell, the cars' garage of nearby streets kept round the player (and the arcade cars when it cannot keep up), the
// helicopter's landings and hits in the log, and a card that says how, with the way back to the map.
import type { Scene } from "@citymap/scene";
import type { Theme } from "@citymap/themes";
import { GROUND, cityHits, type Footprint, type Vec3, type Walls } from "@citymap/world";
import { Bike, Car, Footprints, Helicopter, Motorbike, Video, X } from "lucide-react";
import {
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type PointerEvent,
} from "react";
import { describeHit } from "../card/describe";
import { audioSpeaker, bellRinger } from "../explore/bell";
import { cameraOf, easeReach, reachOf } from "../explore/camera";
import { ARCADE_WORDS, type ArcadeWhy } from "../explore/descent";
import { flyingCamera } from "../explore/flyer";
import { OPEN, hudOfRide, type RideHud as Ride } from "../explore/hud";
import { WALK_KEYS, padOf, stickAt, type PadState } from "../explore/input";
import type { Inspect } from "../explore/inspect";
import type { Landing } from "../explore/landing";
import type { Garage } from "../explore/physics/garage";
import { ROOFTOP_REACH, rooftops, type Rooftop } from "../explore/rooftops";
import {
  STEP,
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
import { VEHICLES, arcadeOf, roomToLand, type Vehicle, type VehicleKind } from "../explore/vehicles";
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
  /** The roofs with room for the helicopter near it, to mark, while in it; else none. */
  readonly rooftops: readonly Rooftop[];
}

/** What the ground-level canvas draws: the city, and each frame's walk, which it asks for as time passes. */
export interface ExploreCanvasProps {
  readonly scene: Scene;
  readonly table: Float32Array;
  readonly theme: Theme;
  /** Advances the walk by a frame of `seconds` and says where everything now is. */
  readonly frame: (seconds: number) => ExploreFrame;
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
  /** The vehicles parked about: the landing's pair and the city's own, nearest the landing first. */
  readonly parked: readonly Vehicle[];
  /** The physics engine the walls come from, as the card names it. */
  readonly engine: string;
  /** The cars' garage of nearby streets on Rapier; null where cars drive as arcade cars, and why. */
  readonly garage: Garage | null;
  readonly arcade: ArcadeWhy | null;
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
/** The HUD shows its numbers afresh at most this often, in seconds. */
export const HUD_EVERY = 0.1;
/** Each frame the garage may spend this many milliseconds raising the nearby streets. */
export const RAISE_BUDGET = 2;
/** Keys that shift the bicycle's gears (and set the free camera's speed): down and up, either side of E. */
const GEAR_KEYS: Readonly<Record<string, number>> = { KeyQ: -1, KeyR: 1 };

/** The first gamepad the page sees, or null: none, or a browser without gamepads. */
const firstPad = (): (PadState & { readonly id: string }) | null =>
  (navigator.getGamepads?.() ?? []).find((pad) => pad !== null) ?? null;

/** A ride's numbers as the HUD shows them. */
function RideHud({ ride }: { readonly ride: Ride }) {
  return (
    <section
      className="explore-hud"
      aria-label={ride.label}
      data-foot={ride.foot ?? undefined}
      data-fallen={ride.fallen || undefined}
      data-over={ride.flight?.over}
      data-landed={ride.flight ? ride.flight.landed : undefined}
      data-heading={ride.flight?.heading}
      data-room={ride.flight ? ride.flight.room : undefined}
      data-landing={ride.flight?.landing ? `${ride.flight.landing.distance} ${ride.flight.landing.bearing}` : undefined}
    >
      <dl>
        {ride.rows.map(([term, value]) => (
          <div key={term}>
            <dt>{term}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** What the touch buttons are for now: the ride's, or flying's. */
type Pad = "foot" | "bicycle" | "motorbike" | "car" | "helicopter" | "flying";
/** The main button under the right thumb, by what it is for. */
const PRIMARY: Readonly<Record<Pad, string>> = {
  foot: "Jump",
  bicycle: "Brake",
  motorbike: "Brake",
  car: "Handbrake",
  helicopter: "Up",
  flying: "Up",
};

/** Each ride's icon on the walk's card. */
const RIDE_ICONS: Readonly<Record<VehicleKind, typeof Car>> = {
  bicycle: Bike,
  motorbike: Motorbike,
  car: Car,
  helicopter: Helicopter,
};

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
  parked,
  engine,
  garage,
  arcade,
  Canvas,
  onLeave,
}: ExploreViewProps) {
  // The cars' physics: the garage while it keeps up; once it cannot (or never loaded), arcade cars, said once.
  const cars = useRef<Garage | null>(garage);
  const [simply, setSimply] = useState<ArcadeWhy | null>(arcade);
  const hits = useMemo(() => cityHits(footprints), [footprints]);
  // The roofs the helicopter can land on, each worked out once as it comes near; the nearest marked while flying.
  const roofs = useMemo(() => rooftops(footprints, walls), [footprints, walls]);
  const marked = useRef<readonly Rooftop[]>([]);
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
    startSession({ x: landing.at.x / METRE, y: GROUND, z: landing.at.z / METRE }, landing.heading, parked),
  );
  // The ride's HUD, shown afresh at most every HUD_EVERY; whether its rider was down, for the log.
  const [ride, setRide] = useState<Ride | null>(null);
  const hudSince = useRef(HUD_EVERY);
  const wasDown = useRef(false);
  // The helicopter's last landing state and hard hits seen, for the log.
  const flown = useRef<{ readonly id: string; readonly landed: boolean; readonly hits: number } | null>(null);
  // The gamepad's buttons last frame, to press each once; whether one was ever seen, to say so once.
  const padPressed = useRef<readonly boolean[]>([]);
  const padSeen = useRef(false);
  const [ring] = useState(() => bellRinger(audioSpeaker));
  // What E would do now: shown as a button, changed only when it changes.
  const [prompt, setPrompt] = useState<Prompt | null>(() => promptOf(start));
  const [riding, setRiding] = useState<VehicleKind | null>(null);
  // Whether the camera flies freely, for the card and the touch controls.
  const [flying, setFlying] = useState(false);
  const said = useRef(JSON.stringify(promptOf(start)));
  // How far back the camera sits: in at once to a wall, back out gently.
  const reach = useRef<number | null>(null);
  const session = useRef(start);
  const controls = useRef(newControls());
  // The finger on the stick and where it landed, and the pointer that drags the view.
  const stick = useRef<{ id: number; x: number; y: number } | null>(null);
  const dragging = useRef<{ id: number; x: number; y: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);

  /** Reads the gamepad into the controls: its stick and A held, its look as a drag, its presses as asked for. */
  const readPad = (seconds: number) => {
    const state = firstPad();
    const read = state ? padOf(state, padPressed.current, seconds) : null;
    controls.current.pad = read?.pad ?? null;
    if (!state || !read) return;
    if (!padSeen.current) log.info("explore/gamepad", { id: state.id });
    padSeen.current = true;
    padPressed.current = read.pressed;
    const { look } = controls.current;
    controls.current.look = { dx: look.dx + read.look.dx, dy: look.dy + read.look.dy };
    controls.current.use ||= read.presses.use;
    controls.current.fly ||= read.presses.fly;
    controls.current.gears += read.presses.gears;
    if (read.presses.ring) ringIfRiding();
  };
  /** The helicopter's take-offs, landings (on a roof or the street) and hard hits, each said once in the log. */
  const logFlight = (vehicle: Vehicle) => {
    if (vehicle.kind !== "helicopter") {
      flown.current = null;
      return;
    }
    const { grounded: landed, hits: struck, hit } = vehicle.heli;
    const was = flown.current?.id === vehicle.id ? flown.current : { id: vehicle.id, landed, hits: struck };
    if (landed && !was.landed)
      log.info("explore/heli-landed", {
        on: vehicle.feet.y > GROUND + 0.01 ? "roof" : "street",
        y: vehicle.feet.y.toFixed(1),
      });
    if (!landed && was.landed) log.info("explore/heli-lifted");
    if (struck > was.hits) log.info("explore/heli-hit", { lost: hit.toFixed(1) });
    flown.current = { id: vehicle.id, landed, hits: struck };
  };
  /** The height of what lies under a point: the first roof below it, or the street. */
  const underOf = (feet: Vec3) => feet.y - walls.clearance(feet, { x: feet.x, y: GROUND - 1, z: feet.z });
  /** What lies below a helicopter, its room to land, and the marked roofs round it; for anything else, open street. */
  const belowOf = (vehicle: Vehicle) => {
    if (vehicle.kind !== "helicopter") {
      marked.current = [];
      return OPEN;
    }
    const under = underOf(vehicle.feet);
    marked.current = roofs.near(vehicle.feet, ROOFTOP_REACH);
    return { under, room: roomToLand(vehicle.feet, under, walls), landing: marked.current[0] ?? null };
  };
  /** The ride's HUD and its rider's falls, from the frame's ridden vehicle. */
  const showRide = (vehicle: Vehicle | null, seconds: number) => {
    if (!vehicle) {
      hudSince.current = HUD_EVERY;
      wasDown.current = false;
      flown.current = null;
      marked.current = [];
      if (ride) setRide(null);
      return;
    }
    logFlight(vehicle);
    const fall =
      vehicle.kind === "bicycle" ? vehicle.cycle.fall : vehicle.kind === "motorbike" ? vehicle.moto.fall : null;
    if (fall && !wasDown.current) log.info("explore/thrown", { cause: fall.cause, speed: fall.speed.toFixed(1) });
    if (!fall && wasDown.current) log.info("explore/up");
    wasDown.current = fall !== null;
    hudSince.current += seconds;
    if (hudSince.current < HUD_EVERY) return;
    hudSince.current = 0;
    const now = hudOfRide(vehicle, cars.current !== null, belowOf(vehicle));
    if (JSON.stringify(now) !== JSON.stringify(ride)) setRide(now);
  };
  /**
   * The garage kept round the player after a frame: where the walker (or what it rides) is and how fast it moves; and,
   * driving a car it cannot keep up with, the cars handed to the arcade handling for the rest of the walk.
   */
  const keepStreets = (next: Session): Session => {
    const kept = cars.current;
    if (!kept) return next;
    const vehicle = ridden(next);
    if (vehicle?.kind === "car" && !kept.keepingUp()) {
      log.error("explore/arcade", { reason: "slow", load: kept.load().toFixed(2) });
      cars.current = null;
      setSimply("slow");
      return { ...next, vehicles: next.vehicles.map((v) => (v.kind === "car" ? arcadeOf(v) : v)) };
    }
    const { body, previous } = next;
    const velocity = { x: (body.feet.x - previous.feet.x) / STEP, z: (body.feet.z - previous.feet.z) / STEP };
    kept.follow(body.feet, velocity, next.vehicles, RAISE_BUDGET);
    return next;
  };
  const frame = (seconds: number): ExploreFrame => {
    readPad(seconds);
    // The nearest marked roof, for the helicopter to set itself down on.
    const pad = marked.current[0]?.at ?? null;
    const next = keepStreets(advanceSession(session.current, controls.current, seconds, walls, cars.current, pad));
    controls.current.look = { dx: 0, dy: 0 };
    controls.current.use = false;
    controls.current.fly = false;
    controls.current.gears = 0;
    session.current = next;
    if ((next.flyer !== null) !== flying) setFlying(next.flyer !== null);
    const now = promptOf(next);
    const words = JSON.stringify(now);
    if (words !== said.current) {
      said.current = words;
      setPrompt(now);
    }
    const vehicle = ridden(next);
    const kind = vehicle?.kind ?? null;
    if (kind !== riding) setRiding(kind);
    showRide(vehicle, seconds);
    const shown = shownOf(next);
    const follow = followOf(next);
    const wanted = reachOf(shown.feet, next.orbit, walls, follow);
    reach.current = reach.current === null ? wanted : easeReach(reach.current, wanted, seconds);
    const camera = next.flyer
      ? flyingCamera(next.flyer, next.orbit)
      : cameraOf(shown.feet, next.orbit, walls, follow, reach.current);
    readSight(camera);
    return { session: next, shown, vehicles: shownVehicles(next), riding: kind, camera, rooftops: marked.current };
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
  const fly = () => {
    controls.current.fly = true;
  };
  const gear = (steps: number) => {
    controls.current.gears += steps;
  };
  /** The bell rings on the bicycle only. */
  const ringIfRiding = () => {
    if (ridden(session.current)?.kind === "bicycle") ring();
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
    if (event.code === "KeyF") {
      event.preventDefault();
      if (down && !event.repeat) fly();
      return;
    }
    const steps = GEAR_KEYS[event.code];
    if (steps !== undefined) {
      event.preventDefault();
      if (down && !event.repeat) gear(steps);
      return;
    }
    if (event.code === "KeyB") {
      event.preventDefault();
      if (down && !event.repeat) ringIfRiding();
      return;
    }
    if (!WALK_KEYS.has(event.code)) return;
    // The walker's keys move the walker, not the page.
    event.preventDefault();
    if (down) controls.current.keys.add(event.code);
    else controls.current.keys.delete(event.code);
  });

  // Before the walk is painted, so a key pressed the moment it shows (Escape above all) is never lost to a listener
  // still waiting for the passive effects to run.
  useLayoutEffect(() => {
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
      // What the cars' physics cost over its last seconds of driving: its share of the time it covered.
      const driven = cars.current;
      if (driven) log.info("explore/garage", { load: driven.load().toFixed(3) });
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
  const title = flying ? "Flying" : riding ? VEHICLES[riding].riding : "On foot";
  // The physics of what the person is on: a car drives on the garage's Rapier, or as an arcade car once without it; on
  // foot the walker walks on the garage's Rapier while it keeps up; all else on the walls' engine.
  const onRapier = garage !== null && simply === null;
  const physics = riding === "car" ? (onRapier ? "Rapier car" : "arcade car") : !riding && onRapier ? "Rapier" : engine;
  const pad: Pad = flying ? "flying" : (riding ?? "foot");
  const Icon = flying ? Video : riding ? RIDE_ICONS[riding] : Footprints;
  const sink = (held: boolean) => (event: PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    controls.current.sink = held;
  };
  const jump = (held: boolean) => (event: PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    controls.current.jump = held;
  };

  return (
    <div
      ref={box}
      className="map explore"
      data-signs={signCount}
      data-riding={riding ?? undefined}
      role="application"
      aria-label={`Walking in ${name}. W A S D or the arrow keys walk, Shift runs, Space jumps, E gets on or off, F flies the camera freely and lands it, the wheel sets its speed, click or drag to look around, Escape goes back to the map. On the bicycle, W pedals, S brakes the back wheel and Space the front, Q and R change gear, B rings the bell. On the motorbike, W opens the throttle, S brakes the back wheel and Space the front. In the car, W accelerates, S brakes then reverses, Space is the handbrake. In the helicopter, W and S tilt it ahead and back, A and D turn it, Space climbs and Shift or C sinks; let go, it holds its height and slows to a hover. A gamepad walks and rides too.`}
      tabIndex={0}
      onPointerDown={press}
      onPointerMove={drag}
      onPointerUp={release}
      onPointerCancel={release}
      onWheel={(event) => {
        // The wheel sets the free camera's speed: away from you faster.
        if (event.deltaY !== 0) controls.current.gears -= Math.sign(event.deltaY);
      }}
    >
      <span className="explore-crosshair" aria-hidden="true" />
      <Canvas scene={scene} table={table} theme={theme} frame={frame} signs={signage} onSigns={setSignCount} />
      <section className="glass explore-card" aria-label={title}>
        <h2>
          <Icon size={18} aria-hidden="true" />
          <span>{title}</span>
        </h2>
        <p className="explore-engine">Physics prototype: {physics}</p>
        {simply && <output className="explore-note">{ARCADE_WORDS[simply]}</output>}
        <p className="explore-keys">
          {flying
            ? "W A S D fly · Space up · C down · wheel speed · F lands · click to look · Esc leaves"
            : riding
              ? VEHICLES[riding].keys
              : "W A S D walk · Shift runs · Space jumps · E gets in · F flies · click to look · Esc leaves"}
        </p>
        {ride && <RideHud ride={ride} />}
        <button type="button" className="text-button" onPointerDown={(event) => event.stopPropagation()} onClick={back}>
          <X size={16} aria-hidden="true" />
          <span>Back to the map</span>
        </button>
      </section>
      {/* On a touch screen everything here sits along the bottom in one flow, so nothing overlaps; elsewhere each part
          keeps its own place. */}
      <div className="explore-dock" data-pad={pad}>
        {sight && <SightCard sight={sight} inspect={inspect} />}
        <div className="explore-controls">
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
          <div className="explore-pad">
            {pad === "bicycle" && (
              <>
                <button type="button" className="glass explore-ring" onPointerDown={keep} onClick={ringIfRiding}>
                  Ring
                </button>
                <button type="button" className="glass explore-gear-up" onPointerDown={keep} onClick={() => gear(1)}>
                  Gear up
                </button>
                <button type="button" className="glass explore-gear-down" onPointerDown={keep} onClick={() => gear(-1)}>
                  Gear down
                </button>
              </>
            )}
            <button
              type="button"
              className="glass explore-jump"
              onPointerDown={jump(true)}
              onPointerUp={jump(false)}
              onPointerCancel={jump(false)}
            >
              {PRIMARY[pad]}
            </button>
            {(flying || pad === "helicopter") && (
              <button
                type="button"
                className="glass explore-sink"
                onPointerDown={sink(true)}
                onPointerUp={sink(false)}
                onPointerCancel={sink(false)}
              >
                Down
              </button>
            )}
            <button
              type="button"
              className="glass explore-fly"
              aria-pressed={flying}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={fly}
            >
              Fly
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
