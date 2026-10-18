"use client";
// The city at eye height: a perspective camera over the walker's shoulder, the city's meshes as the map draws them, the
// walker and the vehicles parked about, drawn every frame while the walk goes on.
import type { Theme } from "@citymap/themes";
import { PerspectiveCamera } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { Suspense, use, useMemo, useRef } from "react";
import type { Object3D } from "three";
import { Animator } from "../explore/models/animator";
import { boundOf, runShare, settle } from "../explore/models/bound";
import { GLTF_MODELS, loadModel, type Loaded, type ModelFile } from "../explore/models/gltf";
import { motionOf, paceOf } from "../explore/models/motion";
import { bicycle, car, figure, paletteOf } from "../explore/models/procedural";
import { PROCEDURAL_RIGS, RIGS, leanOf, poseVehicle } from "../explore/models/rig";
import { poseStride, swingOf } from "../explore/models/stride";
import { METRE } from "../explore/street";
import { log, reasonOf } from "../log";
import { Buildings, Mesh } from "./CityMeshes";
import type { ExploreCanvasProps } from "./ExploreView";

/** The camera sees this far, in street widths (four kilometres), and no nearer than a few centimetres. */
const FAR = 400;
const NEAR = 0.002;
/** A rider sits this high above the bicycle's ground, in metres: its saddle, less the seated figure's hips. */
const SADDLE = 0.38;

/** A model loaded with this canvas, while the walls rise; null (said in the log) when it cannot load. */
const loading = (file: ModelFile): Promise<Loaded | null> =>
  loadModel(process.env.NEXT_PUBLIC_BASE_PATH ?? "", file).catch((failure: unknown) => {
    log.error("explore/model-failed", { url: file.url, reason: reasonOf(failure) });
    return null;
  });
const person = loading(GLTF_MODELS.figure);
const sedan = loading(GLTF_MODELS.car);
const bike = loading(GLTF_MODELS.bicycle);

/** The walker and the vehicles, moved by each frame of the walk; the camera follows. */
function Walk({
  theme,
  frame,
  vehicles,
}: {
  readonly theme: Theme;
  readonly frame: ExploreCanvasProps["frame"];
  readonly vehicles: ExploreCanvasProps["vehicles"];
}) {
  const loaded = use(person);
  const carModel = use(sedan);
  const bikeModel = use(bike);
  const model = useMemo(() => loaded?.make() ?? figure(paletteOf(theme)), [loaded, theme]);
  const animator = useMemo(() => (loaded ? new Animator(model, loaded.clips) : null), [loaded, model]);
  // Each vehicle's model; drawn inside a group that places and turns it, so its own pose (lean, wheels) stays its own.
  const models = useMemo(
    () =>
      vehicles.map(({ id, kind }) => ({
        id,
        kind,
        // The PSX vehicle with its rig, or the procedural stand-in (with its own) when it could not load.
        ...(kind === "car"
          ? carModel
            ? { model: carModel.make(), rig: RIGS.car }
            : { model: car(paletteOf(theme)), rig: PROCEDURAL_RIGS.car }
          : bikeModel
            ? { model: bikeModel.make(), rig: RIGS.bicycle }
            : { model: bicycle(paletteOf(theme)), rig: PROCEDURAL_RIGS.bicycle }),
      })),
    [vehicles, carModel, bikeModel, theme],
  );
  const placed = useRef<Object3D>(null);
  const groups = useRef(new Map<string, Object3D>());
  // How far each vehicle has rolled, for its wheels; and how much the walker bounds, eased.
  const rolled = useRef(new Map<string, { x: number; z: number; rolled: number }>());
  const bounding = useRef(0);
  useFrame((state, seconds) => {
    const walker = placed.current;
    if (!walker) return;
    const now = frame(seconds);
    const { body, speed } = now.session;
    for (const vehicle of now.vehicles) {
      const group = groups.current.get(vehicle.id);
      if (!group) continue;
      const was = rolled.current.get(vehicle.id) ?? { x: vehicle.feet.x, z: vehicle.feet.z, rolled: 0 };
      const step = Math.hypot(vehicle.feet.x - was.x, vehicle.feet.z - was.z) * Math.sign(vehicle.speed);
      const turned = { x: vehicle.feet.x, z: vehicle.feet.z, rolled: was.rolled + step };
      rolled.current.set(vehicle.id, turned);
      group.position.set(vehicle.feet.x * METRE, vehicle.feet.y * METRE, vehicle.feet.z * METRE);
      group.rotation.set(0, vehicle.heading, 0);
      const lean = vehicle.kind === "bicycle" ? leanOf(vehicle.speed, vehicle.turn) : 0;
      const { rig } = models.find((m) => m.id === vehicle.id)!;
      poseVehicle(group.children[0]!, rig, { rolled: turned.rolled, steer: vehicle.steer, lean });
    }
    const riding = now.riding ? now.vehicles.find((v) => v.id === now.session.riding) : undefined;
    walker.visible = now.riding !== "car";
    if (riding) {
      // Sat on the bicycle, leaning with it.
      const lean = leanOf(riding.speed, riding.turn);
      walker.position.set(riding.feet.x * METRE, (riding.feet.y + SADDLE) * METRE, riding.feet.z * METRE);
      walker.rotation.order = "YXZ";
      walker.rotation.set(-lean, riding.heading, 0);
      walker.scale.setScalar(METRE);
      animator?.play("drive", 1, seconds);
    } else {
      // Drawn between its last two steps, so it moves as smoothly as the frames come.
      const { feet, heading, walked } = now.shown;
      bounding.current = settle(bounding.current, body.grounded ? runShare(speed) : 0, seconds);
      const bound = boundOf(walked, bounding.current);
      walker.position.set(feet.x * METRE, (feet.y + bound.lift) * METRE, feet.z * METRE);
      walker.rotation.order = "XYZ";
      walker.rotation.set(0, heading, -bound.lean);
      // Squashed or stretched, its volume kept.
      const across = METRE / Math.sqrt(bound.stretch);
      walker.scale.set(across, METRE * bound.stretch, across);
      if (animator) {
        const motion = motionOf(speed, body.grounded, body.rise);
        animator.play(motion, paceOf(motion, speed), seconds);
      } else poseStride(walker, swingOf(walked, speed));
    }
    const { eye, target } = now.camera;
    state.camera.position.set(eye.x * METRE, eye.y * METRE, eye.z * METRE);
    state.camera.lookAt(target.x * METRE, target.y * METRE, target.z * METRE);
  });
  const keep = (id: string) => (group: Object3D | null) => {
    if (group) groups.current.set(id, group);
    else groups.current.delete(id);
  };
  return (
    <>
      <primitive ref={placed} object={model} scale={METRE} />
      {models.map(({ id, model: vehicle }) => (
        <group key={id} ref={keep(id)} scale={METRE}>
          <primitive object={vehicle} />
        </group>
      ))}
    </>
  );
}

export default function ExploreCanvas({ scene, table, theme, frame, vehicles }: ExploreCanvasProps) {
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
        <Walk theme={theme} frame={frame} vehicles={vehicles} />
      </Suspense>
    </Canvas>
  );
}
