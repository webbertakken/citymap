"use client";
import type { Scene } from "@citymap/scene";
import type { Theme } from "@citymap/themes";
import { useEffect, useEffectEvent, useRef, useState, type ComponentType } from "react";
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
  readonly view: View;
  readonly theme: Theme;
  readonly Canvas: ComponentType<CanvasProps>;
  readonly onView: (view: View) => void;
  readonly onViewport: (viewport: Viewport) => void;
}

const sizeOf = (element: HTMLElement): Viewport => ({
  width: element.clientWidth || 800,
  height: element.clientHeight || 600,
});

/** The map: keyboard, drag, wheel and pinch drive the view; labels are HTML over the canvas. */
export function MapView({ name, scene, view, theme, Canvas, onView, onViewport }: MapViewProps) {
  const box = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState<Viewport>({ width: 800, height: 600 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());

  const measure = useEffectEvent(() => {
    const size = sizeOf(box.current!);
    setViewport(size);
    onViewport(size);
  });
  const key = useEffectEvent((event: KeyboardEvent) => {
    const next = onKey(event.key, view, viewport, scene.bounds);
    if (!next) return;
    event.preventDefault();
    onView(next);
  });
  const down = useEffectEvent((event: PointerEvent) => {
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    box.current!.setPointerCapture?.(event.pointerId);
  });
  const move = useEffectEvent((event: PointerEvent) => {
    const before = pointers.current.get(event.pointerId);
    if (!before) return;
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
  });
  const wheel = useEffectEvent((event: WheelEvent) => {
    event.preventDefault();
    onView({ ...view, zoom: view.zoom * (event.deltaY < 0 ? 1.1 : 1 / 1.1) });
  });

  // Listeners attach once; each reads the props of the moment through its effect event.
  useEffect(() => {
    const element = box.current!;
    const onKeyDown = (event: KeyboardEvent) => key(event);
    const onDown = (event: PointerEvent) => down(event);
    const onMove = (event: PointerEvent) => move(event);
    const onUp = (event: PointerEvent) => up(event);
    const onWheel = (event: WheelEvent) => wheel(event);
    const onResize = () => measure();
    element.addEventListener("keydown", onKeyDown);
    element.addEventListener("pointerdown", onDown);
    element.addEventListener("pointermove", onMove);
    element.addEventListener("pointerup", onUp);
    element.addEventListener("pointercancel", onUp);
    element.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("resize", onResize);
    measure();
    return () => {
      element.removeEventListener("keydown", onKeyDown);
      element.removeEventListener("pointerdown", onDown);
      element.removeEventListener("pointermove", onMove);
      element.removeEventListener("pointerup", onUp);
      element.removeEventListener("pointercancel", onUp);
      element.removeEventListener("wheel", onWheel);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  const labels = declutter(scene.labels, view, viewport);
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
    </div>
  );
}
