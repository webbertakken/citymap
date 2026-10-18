"use client";
import type { Hit, PickIndex, Scene } from "@citymap/scene";
import type { Theme } from "@citymap/themes";
import { useEffectEvent, useLayoutEffect, useRef, useState, type ComponentType } from "react";
import { gesture } from "../view/gesture";
import { hitAt, type Heights } from "../view/hover";
import {
  NO_INSETS,
  declutter,
  onKey,
  DRAG_TURN,
  pan,
  project,
  turned,
  zoomAt,
  type Insets,
  type Mode,
  type View,
  type Viewport,
} from "../view/view";
import { HoverCard } from "./HoverCard";

/** What the WebGL canvas draws: the scene's layers and buildings from the view, filling its parent. */
export interface CanvasProps {
  readonly scene: Scene;
  readonly view: View;
  readonly viewport: Viewport;
  readonly theme: Theme;
  readonly mode: Mode;
  /** The lot table: each building's floors, lit share, colour and flags. */
  readonly table: Float32Array;
}

export interface MapViewProps {
  readonly name: string;
  readonly scene: Scene;
  readonly index: PickIndex;
  readonly view: View;
  /** Where the cards cover the map; `0` fits the city in the rest. */
  readonly insets?: Insets;
  /** A place to mark on the map (scene units), or null. */
  readonly marker?: { readonly x: number; readonly z: number } | null;
  readonly theme: Theme;
  /** Plan or Buildings: how the map is seen. */
  readonly mode?: Mode;
  /** The lot table the buildings are drawn from, and how tall each stands, for picking at their tops. */
  readonly table: Float32Array;
  readonly heights?: Heights | null;
  /** One town is shown alone; the hover card's hint then offers no town. */
  readonly focused?: boolean;
  /** The city came from GitHub; the hover card's hint offers opening a file or folder there. */
  readonly github?: boolean;
  readonly Canvas: ComponentType<CanvasProps>;
  readonly onSelect: (hit: Hit | null) => void;
  readonly onEscape: () => void;
  readonly onView: (view: View) => void;
  readonly onViewport: (viewport: Viewport) => void;
}

const sizeOf = (element: HTMLElement): Viewport => ({
  width: element.clientWidth || 800,
  height: element.clientHeight || 600,
});

/** A press that moves less than this many pixels is a click or a tap. */
const CLICK_SLOP = 4;
/** One wheel step zooms by this factor. */
const WHEEL_ZOOM = 1.1;

/** The map: keyboard, drag, wheel and pinch drive the view; labels are HTML over the canvas. */
export function MapView({
  name,
  scene,
  index,
  view,
  insets = NO_INSETS,
  marker = null,
  theme,
  mode = "plan",
  table,
  heights = null,
  focused = false,
  github = false,
  Canvas,
  onView,
  onViewport,
  onSelect,
  onEscape,
}: MapViewProps) {
  const [hover, setHover] = useState<{ hit: Hit; x: number; y: number } | null>(null);
  const pressed = useRef<{ x: number; y: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState<Viewport>({ width: 800, height: 600 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());

  const measure = useEffectEvent(() => {
    const size = sizeOf(box.current!);
    setViewport(size);
    onViewport(size);
  });
  // Pointer positions within the map.
  const local = (event: { readonly clientX: number; readonly clientY: number }) => {
    const rect = box.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const key = useEffectEvent((event: KeyboardEvent) => {
    if (event.key === "Escape") {
      setHover(null);
      onEscape();
      return;
    }
    const next = onKey(event.key, view, viewport, scene.bounds, insets, mode);
    if (!next) return;
    event.preventDefault();
    onView(next);
  });
  // A right-drag, or a drag with Shift held, turns and tilts the Buildings view instead of panning it.
  const turning = useRef(false);
  const down = useEffectEvent((event: PointerEvent) => {
    turning.current = mode === "buildings" && (event.button === 2 || event.shiftKey);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    pressed.current = pointers.current.size === 1 ? { x: event.clientX, y: event.clientY } : null;
    box.current!.setPointerCapture?.(event.pointerId);
  });
  const move = useEffectEvent((event: PointerEvent) => {
    const before = pointers.current.get(event.pointerId);
    if (!before) {
      // Hovering: name what is under the pointer.
      const at = local(event);
      const hit = hitAt(index, view, viewport, at, mode, heights);
      setHover(hit ? { hit, ...at } : null);
      return;
    }
    setHover(null);
    const now = { x: event.clientX, y: event.clientY };
    const other = [...pointers.current].find(([id]) => id !== event.pointerId)?.[1];
    if (other) {
      // Two fingers: a pinch zooms about their middle; in the Buildings view a twist turns it and moving them together
      // up or down tilts it.
      const rect = box.current!.getBoundingClientRect();
      const g = gesture(before, now, other);
      const zoomed = zoomAt(view, viewport, { x: g.middle.x - rect.left, y: g.middle.y - rect.top }, g.ratio, mode);
      onView(mode === "buildings" ? turned(zoomed, g.twist, -g.lift * DRAG_TURN) : zoomed);
    } else if (turning.current) onView(turned(view, (now.x - before.x) * DRAG_TURN, (before.y - now.y) * DRAG_TURN));
    else onView(pan(view, before.x - now.x, now.y - before.y, mode));
    pointers.current.set(event.pointerId, now);
  });
  const up = useEffectEvent((event: PointerEvent) => {
    pointers.current.delete(event.pointerId);
    // A press that barely moved is a click or a tap: it selects what is there.
    const start = pressed.current;
    pressed.current = null;
    if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) < CLICK_SLOP)
      onSelect(hitAt(index, view, viewport, local(event), mode, heights));
  });
  const leave = useEffectEvent(() => setHover(null));
  const wheel = useEffectEvent((event: WheelEvent) => {
    event.preventDefault();
    // About the point under the pointer, which stays where it is.
    onView(zoomAt(view, viewport, local(event), event.deltaY < 0 ? WHEEL_ZOOM : 1 / WHEEL_ZOOM, mode));
  });

  // Listeners attach once, in the commit that shows the map, so its first pointer event is never missed and its first
  // frame is drawn at its measured size; each reads the props of the moment through its effect event.
  useLayoutEffect(() => {
    const element = box.current!;
    const onKeyDown = (event: KeyboardEvent) => key(event);
    const onDown = (event: PointerEvent) => down(event);
    const onMove = (event: PointerEvent) => move(event);
    const onUp = (event: PointerEvent) => up(event);
    const onLeave = () => leave();
    const onWheel = (event: WheelEvent) => wheel(event);
    const onResize = () => measure();
    element.addEventListener("keydown", onKeyDown);
    element.addEventListener("pointerdown", onDown);
    element.addEventListener("pointermove", onMove);
    element.addEventListener("pointerup", onUp);
    element.addEventListener("pointercancel", onUp);
    element.addEventListener("pointerleave", onLeave);
    element.addEventListener("wheel", onWheel, { passive: false });
    // The right button turns the Buildings view: no menu over the map.
    const noMenu = (event: Event) => event.preventDefault();
    element.addEventListener("contextmenu", noMenu);
    window.addEventListener("resize", onResize);
    measure();
    return () => {
      element.removeEventListener("keydown", onKeyDown);
      element.removeEventListener("pointerdown", onDown);
      element.removeEventListener("pointermove", onMove);
      element.removeEventListener("pointerup", onUp);
      element.removeEventListener("pointercancel", onUp);
      element.removeEventListener("pointerleave", onLeave);
      element.removeEventListener("wheel", onWheel);
      element.removeEventListener("contextmenu", noMenu);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  const labels = declutter(scene.labels, view, viewport, mode);
  const mark = marker ? project(view, viewport, { x: marker.x, y: 0, z: marker.z }, mode) : null;
  return (
    <div
      ref={box}
      className="map"
      role="application"
      aria-label={
        mode === "buildings"
          ? `Map of ${name}. Arrow keys pan, plus and minus zoom, zero fits the city; Q and E turn it, Page Up and Page Down tilt it, or drag with the right button or Shift.`
          : `Map of ${name}. Arrow keys pan, plus and minus zoom, zero fits the city.`
      }
      tabIndex={0}
    >
      <Canvas scene={scene} view={view} viewport={viewport} theme={theme} mode={mode} table={table} />
      <div className="labels" aria-hidden="true">
        {labels.map((l) => (
          <span
            key={`${l.text}@${l.x},${l.z}`}
            className={`label ${l.size}`}
            style={{
              left: l.left,
              top: l.top,
              color: theme.text,
              textShadow: `0 0 3px ${theme.halo}, 0 0 3px ${theme.halo}`,
            }}
          >
            {l.text}
          </span>
        ))}
      </div>
      {mark && <span className="marker" aria-hidden="true" style={{ left: mark.x, top: mark.y }} />}
      {hover && <HoverCard hit={hover.hit} pointer={hover} map={viewport} focused={focused} github={github} />}
    </div>
  );
}
