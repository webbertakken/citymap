"use client";
// The model lab: one street of a real city at eye height, with a figure, a bicycle, a motorbike, a car and a helicopter
// in one of three styles, so the styles can be compared in the city they would live in.
import type { Scene } from "@citymap/scene";
import type { Theme } from "@citymap/themes";
import { PerspectiveCamera } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useMemo } from "react";
import type { Object3D } from "three";
import { Buildings, Mesh } from "../../components/CityMeshes";
import { pose, type GltfName, type Loaded } from "../models/gltf";
import { bicycle, car, figure, helicopter, motorbike, paletteOf } from "../models/procedural";
import { poseStride } from "../models/stride";
import { METRE, headingOf, onStreet, type Street } from "../street";

export type Style = "procedural" | "gltf" | "mixed";
/** Down the street over a walker's shoulder, or across it at the parked vehicles, side on. */
export type Shot = "street" | "lineup";

/** Where each shot puts the cast (metres along, to the left, up; and a turn), and its camera. */
const SHOTS: Readonly<
  Record<
    Shot,
    {
      readonly cast: readonly (readonly [along: number, left: number, up: number, turn: number])[];
      readonly eye: readonly [along: number, left: number, up: number];
      readonly target: readonly [along: number, left: number, up: number];
    }
  >
> = {
  street: {
    cast: [
      [7, 1.2, 0, 0],
      [19, 2.6, 0, Math.PI],
      [11, -3.6, 0, 0.9],
      [15, -3.5, 0, 0.7],
      [24, 2.8, 0, Math.PI],
      [44, 0, 16, Math.PI * 0.8],
    ],
    eye: [2.4, 0.6, 2.3],
    target: [18, -0.6, 1.8],
  },
  lineup: {
    cast: [
      [8.2, -2.9, 0, -Math.PI / 2 + 0.4],
      [22.2, -2.6, 0, Math.PI / 2 + 0.5],
      [10.6, -3.4, 0, 0],
      [13.4, -3.3, 0, 0],
      [18.4, -3.1, 0, 0],
      [30, -1, 0, 2.4],
    ],
    eye: [14.6, 7.2, 1.8],
    target: [14.6, -3.2, 1.2],
  },
};

interface Placed {
  readonly model: Object3D;
  /** Metres along the street, metres to its left, metres up, and a turn from facing along it. */
  readonly at: readonly [along: number, left: number, up: number];
  readonly turn: number;
}

/** A procedural figure caught mid-stride. */
const walking = (model: Object3D) => {
  poseStride(model, 0.45);
  return model;
};

/** The cast in one style: procedural models are built here, glTF ones copied from what was loaded. */
function cast(style: Style, shot: Shot, theme: Theme, gltf: Record<GltfName, Loaded> | null): Placed[] {
  const p = paletteOf(theme);
  const fromFile = (name: GltfName, clip?: string, at = 0) => {
    const loaded = gltf![name];
    const model = loaded.make();
    if (clip) pose(model, loaded.clips, clip, at);
    return model;
  };
  const people = style === "procedural" ? null : gltf;
  const vehicles = style === "gltf" ? gltf : null;
  const models = [
    people ? fromFile("figure", "walk", 0.25) : walking(figure(p)),
    people ? fromFile("walker", "idle", 0.3) : figure(p, p.paint(330)),
    vehicles ? fromFile("bicycle") : bicycle(p),
    vehicles ? fromFile("motorbike") : motorbike(p),
    vehicles ? fromFile("car") : car(p),
    vehicles ? fromFile("helicopter") : helicopter(p),
  ];
  return models.map((model, i) => {
    const [along, left, up, turn] = SHOTS[shot].cast[i]!;
    return { model, at: [along, left, up], turn };
  });
}

/** Ground level: the city's meshes, lit models on the street, and a camera over the walker's shoulder. */
export default function ModelsLab({
  scene,
  table,
  theme,
  street,
  style,
  shot,
  gltf,
}: {
  readonly scene: Scene;
  readonly table: Float32Array;
  readonly theme: Theme;
  readonly street: Street;
  readonly style: Style;
  readonly shot: Shot;
  readonly gltf: Record<GltfName, Loaded> | null;
}) {
  const placed = useMemo(() => cast(style, shot, theme, gltf), [style, shot, theme, gltf]);
  const heading = headingOf(street);
  const camera = SHOTS[shot];
  const eye = onStreet(street, camera.eye[0], camera.eye[1]);
  const target = onStreet(street, camera.target[0], camera.target[1]);
  return (
    <Canvas className="canvas" dpr={[1, 2]} linear flat gl={{ preserveDrawingBuffer: true }}>
      <color attach="background" args={[theme.country]} />
      <fog attach="fog" args={[theme.country, 20, 90]} />
      <PerspectiveCamera
        makeDefault
        fov={60}
        near={0.01}
        far={120}
        position={[eye.x, camera.eye[2] * METRE, eye.z]}
        onUpdate={(c) => c.lookAt(target.x, camera.target[2] * METRE, target.z)}
      />
      {/* Physical lights reach a surface at 1/π of their intensity: these light it at about 1.1 and 0.6 of its colour. */}
      <hemisphereLight args={["#ffffff", "#8a8a8a", 1.1 * Math.PI]} />
      <directionalLight position={[3, 6, 2]} intensity={0.6 * Math.PI} />
      {scene.layers.map((layer) => (
        <Mesh key={layer.name} layer={layer} />
      ))}
      <Buildings buildings={scene.buildings} table={table} mode="buildings" theme={theme} />
      {placed.map(({ model, at, turn }) => {
        const ground = onStreet(street, at[0], at[1]);
        return (
          <primitive
            key={model.uuid}
            object={model}
            position={[ground.x, 0.026 + at[2] * METRE, ground.z]}
            rotation={[0, heading + turn, 0]}
            scale={METRE}
          />
        );
      })}
    </Canvas>
  );
}
