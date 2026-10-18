"use client";
import type { Theme } from "@citymap/themes";
// The city at eye height: a perspective camera over the walker's shoulder, the city's meshes as the map draws them, and
// the walker, drawn every frame while the walk goes on.
import { PerspectiveCamera } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import type { Object3D } from "three";
import { paletteOf, figure } from "../explore/models/procedural";
import { poseStride, swingOf } from "../explore/models/stride";
import { METRE } from "../explore/street";
import { Buildings, Mesh } from "./CityMeshes";
import type { ExploreCanvasProps, ExploreFrame } from "./ExploreView";

/** The camera sees this far, in street widths (four kilometres), and no nearer than a few centimetres. */
const FAR = 400;
const NEAR = 0.002;

/** The walker, moved by each frame of the walk; the camera follows. */
function Walker({ theme, frame }: { readonly theme: Theme; readonly frame: ExploreCanvasProps["frame"] }) {
  const model = useMemo(() => figure(paletteOf(theme)), [theme]);
  const placed = useRef<Object3D>(null);
  const last = useRef<ExploreFrame | null>(null);
  useFrame((state, seconds) => {
    const walker = placed.current;
    if (!walker) return;
    const now = frame(seconds);
    const { body, walked } = now.session;
    const speed = last.current && seconds > 0 ? (walked - last.current.session.walked) / seconds : 0;
    last.current = now;
    walker.position.set(body.feet.x * METRE, body.feet.y * METRE, body.feet.z * METRE);
    walker.rotation.y = body.heading;
    poseStride(walker, swingOf(walked, speed));
    const { eye, target } = now.camera;
    state.camera.position.set(eye.x * METRE, eye.y * METRE, eye.z * METRE);
    state.camera.lookAt(target.x * METRE, target.y * METRE, target.z * METRE);
  });
  return <primitive ref={placed} object={model} scale={METRE} />;
}

export default function ExploreCanvas({ scene, table, theme, frame }: ExploreCanvasProps) {
  return (
    <Canvas className="canvas" dpr={[1, 2]} linear flat aria-hidden="true">
      <color attach="background" args={[theme.country]} />
      <PerspectiveCamera makeDefault fov={60} near={NEAR} far={FAR} />
      {/* Physical lights reach a surface at 1/π of their intensity: these light it at about 1.1 and 0.6 of its colour. */}
      <hemisphereLight args={["#ffffff", "#8a8a8a", 1.1 * Math.PI]} />
      <directionalLight position={[3, 6, 2]} intensity={0.6 * Math.PI} />
      {scene.layers.map((layer) => (
        <Mesh key={layer.name} layer={layer} />
      ))}
      <Buildings buildings={scene.buildings} table={table} mode="buildings" theme={theme} />
      <Walker theme={theme} frame={frame} />
    </Canvas>
  );
}
