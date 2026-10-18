"use client";
// On foot in the city: the ground-level canvas, the devices that move the walker (keys, a drag to look, a touch stick
// and a jump button), getting on and off vehicles (E, or the prompt's button), and a card that says how, with the way
// back to the map.
import type { Scene } from "@citymap/scene";
import type { Theme } from "@citymap/themes";
import { GROUND, type Vec3, type Walls } from "@citymap/world";
import { Bike, Car, Footprints, X } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState, type ComponentType, type PointerEvent } from "react";
import { cameraOf } from "../explore/camera";
import { WALK_KEYS, stickAt } from "../explore/input";
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
import { METRE } from "../explore/street";
import { VEHICLES, parkedBy, type Vehicle, type VehicleKind } from "../explore/vehicles";

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
}

export interface ExploreViewProps {
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

/** A touch stick reaches this many pixels from where the finger lands. */
export const STICK_REACH = 48;

/** Walking: the canvas fills the map; keys, drags, the stick and the jump button move the walker. */
export function ExploreView({ name, scene, table, theme, walls, landing, engine, Canvas, onLeave }: ExploreViewProps) {
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
    return {
      session: next,
      shown,
      vehicles: shownVehicles(next),
      riding: kind,
      camera: cameraOf(shown.feet, next.orbit, walls, followOf(next)),
    };
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
    box.current?.focus();
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", away);
    };
  }, []);

  const press = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragging.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
  };
  const drag = (event: PointerEvent<HTMLDivElement>) => {
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
      role="application"
      aria-label={`Walking in ${name}. W A S D or the arrow keys walk, Shift runs, Space jumps, drag to look around, Escape goes back to the map.`}
      tabIndex={0}
      onPointerDown={press}
      onPointerMove={drag}
      onPointerUp={release}
      onPointerCancel={release}
    >
      <Canvas scene={scene} table={table} theme={theme} frame={frame} vehicles={start.vehicles} />
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
            : "W A S D walk · Shift runs · Space jumps · E gets in · drag to look · Esc leaves"}
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
