"use client";
import type { Hit, PickIndex, Scene } from "@citymap/scene";
import type { Theme } from "@citymap/themes";
import { useEffectEvent, useLayoutEffect, useRef, useState, type ComponentType } from "react";
import { describeHit, hitAt } from "../view/hover";
import { declutter, onKey, pan, type View, type Viewport } from "../view/view";

/** What the WebGL canvas draws: the scene's layers from the view, filling its parent. */
export interface CanvasProps {
  readonly scene: Scene;
  readonly view: View;
  readonly viewport: Viewport;
  readonly theme: Theme;
}

export interface MapViewProps {
  readonly name: string;
  readonly scene: Scene;
  readonly index: PickIndex;
  readonly view: View;
  readonly theme: Theme;
  readonly Canvas: ComponentType<CanvasProps>;
  readonly onSelect: (hit: Hit | null) => void;
  readonly onView: (view: View) => void;
  readonly onViewport: (viewport: Viewport) => void;
}

const sizeOf = (element: HTMLElement): Viewport => ({
  width: element.clientWidth || 800,
  height: element.clientHeight || 600,
});

/** The map: keyboard, drag, wheel and pinch drive the view; labels are HTML over the canvas. */
/** The card's size and its gap from the pointer, in pixels, to keep it beside the pointer and on the map. */
const CARD = { width: 260, height: 96, gap: 16 };

export function MapView({ name, scene, index, view, theme, Canvas, onView, onViewport, onSelect }: MapViewProps) {
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
  const local = (event: PointerEvent) => {
    const rect = box.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const key = useEffectEvent((event: KeyboardEvent) => {
    if (event.key === "Escape") {
      setHover(null);
      onSelect(null);
      return;
    }
    const next = onKey(event.key, view, viewport, scene.bounds);
    if (!next) return;
    event.preventDefault();
    onView(next);
  });
  const down = useEffectEvent((event: PointerEvent) => {
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    pressed.current = pointers.current.size === 1 ? { x: event.clientX, y: event.clientY } : null;
    box.current!.setPointerCapture?.(event.pointerId);
  });
  const move = useEffectEvent((event: PointerEvent) => {
    const before = pointers.current.get(event.pointerId);
    if (!before) {
      // Hovering: name what is under the pointer.
      const at = local(event);
      const hit = hitAt(index, view, viewport, at);
      setHover(hit ? { hit, ...at } : null);
      return;
    }
    setHover(null);
    const now = { x: event.clientX, y: event.clientY };
    const other = [...pointers.current].find(([id]) => id !== event.pointerId)?.[1];
    if (other) {
      // A pinch: the change in distance between the two pointers sets the zoom.
      const ratio =
        Math.hypot(now.x - other.x, now.y - other.y) / Math.max(1, Math.hypot(before.x - other.x, before.y - other.y));
      onView({ ...view, zoom: view.zoom * ratio });
    } else onView(pan(view, before.x - now.x, now.y - before.y));
    pointers.current.set(event.pointerId, now);
  });
  const up = useEffectEvent((event: PointerEvent) => {
    pointers.current.delete(event.pointerId);
    // A press that barely moved is a click or a tap: it selects what is there.
    const start = pressed.current;
    pressed.current = null;
    if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) < 4)
      onSelect(hitAt(index, view, viewport, local(event)));
  });
  const leave = useEffectEvent(() => setHover(null));
  const wheel = useEffectEvent((event: WheelEvent) => {
    event.preventDefault();
    onView({ ...view, zoom: view.zoom * (event.deltaY < 0 ? 1.1 : 1 / 1.1) });
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
      window.removeEventListener("resize", onResize);
    };
  }, []);

  const labels = declutter(scene.labels, view, viewport);
  const card = hover ? describeHit(hover.hit) : null;
  // Beside the pointer, flipped to the other side near the map's edges, so it never covers the pointer.
  const cardLeft =
    hover && hover.x + CARD.gap + CARD.width > viewport.width
      ? hover.x - CARD.gap - CARD.width
      : (hover?.x ?? 0) + CARD.gap;
  const cardTop =
    hover && hover.y + CARD.gap + CARD.height > viewport.height
      ? hover.y - CARD.gap - CARD.height
      : (hover?.y ?? 0) + CARD.gap;
  return (
    <div
      ref={box}
      className="map"
      role="application"
      aria-label={`Map of ${name}. Arrow keys pan, plus and minus zoom, zero fits the city.`}
      tabIndex={0}
    >
      <Canvas scene={scene} view={view} viewport={viewport} theme={theme} />
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
      {card && (
        <div className="card" role="tooltip" style={{ left: cardLeft, top: cardTop }}>
          <strong>{card.title}</strong>
          {card.lines.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </div>
      )}
    </div>
  );
}
