"use client";
// The city at eye height: a perspective camera over the walker's shoulder, the city's meshes as the map draws them, and
// the walker, drawn every frame while the walk goes on.
import type { Theme } from "@citymap/themes";
import { PerspectiveCamera } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { Suspense, use, useMemo, useRef } from "react";
import type { Object3D } from "three";
import { Animator } from "../explore/models/animator";
import { GLTF_MODELS, loadModel, type Loaded } from "../explore/models/gltf";
import { motionOf, paceOf } from "../explore/models/motion";
import { figure, paletteOf } from "../explore/models/procedural";
import { poseStride, swingOf } from "../explore/models/stride";
import { METRE } from "../explore/street";
import { log, reasonOf } from "../log";
import { Buildings, Mesh } from "./CityMeshes";
import type { ExploreCanvasProps } from "./ExploreView";

/** The camera sees this far, in street widths (four kilometres), and no nearer than a few centimetres. */
const FAR = 400;
const NEAR = 0.002;

// The walker's figure loads with this canvas, while the walls rise; without it, the procedural figure walks instead.
const person: Promise<Loaded | null> = loadModel(process.env.NEXT_PUBLIC_BASE_PATH ?? "", GLTF_MODELS.figure).catch(
  (failure: unknown) => {
    log.error("explore/model-failed", { url: GLTF_MODELS.figure.url, reason: reasonOf(failure) });
    return null;
  },
);

/** The walker, moved by each frame of the walk; the camera follows. */
function Walker({ theme, frame }: { readonly theme: Theme; readonly frame: ExploreCanvasProps["frame"] }) {
  const loaded = use(person);
  const model = useMemo(() => loaded?.make() ?? figure(paletteOf(theme)), [loaded, theme]);
  const animator = useMemo(() => (loaded ? new Animator(model, loaded.clips) : null), [loaded, model]);
  const placed = useRef<Object3D>(null);
  useFrame((state, seconds) => {
    const walker = placed.current;
    if (!walker) return;
    const now = frame(seconds);
    const { body, walked, speed } = now.session;
    // Drawn between its last two steps, so it moves as smoothly as the frames come.
    const { feet, heading } = now.shown;
    walker.position.set(feet.x * METRE, feet.y * METRE, feet.z * METRE);
    walker.rotation.y = heading;
    if (animator) {
      const motion = motionOf(speed, body.grounded, body.rise);
      animator.play(motion, paceOf(motion, speed), seconds);
    } else poseStride(walker, swingOf(walked, speed));
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
      <Suspense fallback={null}>
        <Walker theme={theme} frame={frame} />
      </Suspense>
    </Canvas>
  );
}
