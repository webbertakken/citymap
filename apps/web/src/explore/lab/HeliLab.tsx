"use client";
// The heli lab's scene: the helicopter on a plain ground or flying (nose down, banked right, its rotor turning), posed
// as the walk poses it (`placeVehicle`), and a camera at a fixed side of it.
import type { Theme, ThemeName } from "@citymap/themes";
import { PerspectiveCamera } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useMemo } from "react";
import { Group, Mesh, MeshBasicMaterial, SphereGeometry } from "three";
import { pose, type Loaded } from "../models/gltf";
import { placeVehicle, slotOf, type Rolled } from "../models/seat";
import { METRE } from "../street";
import { standing, type Helicopter } from "../vehicles";

export const HELI_POSES = ["ground", "flight"] as const;
export const HELI_VIEWS = ["front", "side", "above", "behind", "cabin"] as const;

export interface HeliAsked {
  /** On its skids, its rotor still; or flying, nose down, banked to its right, its rotor at speed. */
  readonly pose: (typeof HELI_POSES)[number];
  /** Ahead of it, from its right (the pilot's side), above it, behind it as the walk's camera follows, or close on its cabin. */
  readonly view: (typeof HELI_VIEWS)[number];
  readonly theme: ThemeName;
  /** Whether to mark the pilot's contacts (the seat, cyclic, collective and pedals) with dots. */
  readonly marks: boolean;
}

/** A dot marking a contact: 4 cm across, drawn through everything. */
function dot() {
  const mesh = new Mesh(new SphereGeometry(0.04, 8, 6), new MeshBasicMaterial({ color: "#ff2fd6", depthTest: false }));
  mesh.renderOrder = 10;
  return mesh;
}

type Place = readonly [number, number, number];

/** Each view's eye and what it looks at, in metres from the helicopter's feet (under its mast; +x ahead, +z right). */
const EYES: Readonly<Record<HeliAsked["view"], { readonly eye: Place; readonly at: Place }>> = {
  front: { eye: [12, 2.8, 2.5], at: [1.5, 1.5, 0] },
  side: { eye: [0.5, 2.4, 11.5], at: [0, 1.6, 0] },
  above: { eye: [0, 15, 0.01], at: [0, 1.2, 0] },
  behind: { eye: [-11, 5, 3], at: [1.5, 1.6, 0] },
  cabin: { eye: [4.6, 2.3, 3.8], at: [2, 1.45, 0.3] },
};
/** In flight: this high, nose down and banked right this far (radians), its blades at an angle. */
const FLYING = { height: 4, pitch: 0.2, roll: 0.3, blades: 0.7, tail: 0.4 } as const;

/** The helicopter as asked: on its skids at the origin facing +x, or in the air, tilted, its rotor at speed. */
function helicopterOf(asked: HeliAsked): Helicopter {
  const parked = standing("lab", "helicopter", { x: 0, y: 0, z: 0 }, 0);
  if (asked.pose === "ground") return parked;
  const { height, pitch, roll, blades, tail } = FLYING;
  return {
    ...parked,
    feet: { x: 0, y: height, z: 0 },
    heli: { ...parked.heli, pitch, roll, blades, tail, rotor: 1, engine: true, grounded: false },
  };
}

export interface HeliLabProps {
  readonly person: Loaded;
  readonly helicopter: Loaded;
  readonly asked: HeliAsked;
  readonly theme: Theme;
}

export default function HeliLab({ person, helicopter, asked, theme }: HeliLabProps) {
  const cast = useMemo(() => {
    const walker = person.make();
    pose(walker, person.clips, "Driving_Loop", 0);
    const slot = slotOf("helicopter", helicopter, theme);
    const group = new Group();
    group.scale.setScalar(METRE);
    group.add(slot.model);
    const vehicle = helicopterOf(asked);
    const rolled: Rolled = new Map();
    placeVehicle(slot, group, vehicle, rolled, 0);
    walker.scale.setScalar(METRE);
    walker.visible = false;
    const { rider } = slot.rig;
    if (asked.marks && rider)
      for (const name of [rider.saddle, rider.grips.left, rider.grips.right, rider.feet.left, rider.feet.right])
        slot.model.getObjectByName(name)?.add(dot());
    return { walker, group };
  }, [person, helicopter, asked, theme]);
  const { eye, at } = EYES[asked.view];
  const lift = asked.pose === "flight" ? FLYING.height : 0;
  return (
    <Canvas className="canvas" dpr={[1, 2]} linear flat gl={{ preserveDrawingBuffer: true }}>
      <color attach="background" args={[theme.country]} />
      <PerspectiveCamera
        makeDefault
        fov={40}
        near={0.01}
        far={200}
        position={[eye[0] * METRE, (eye[1] + lift) * METRE, eye[2] * METRE]}
        onUpdate={(c) => c.lookAt(at[0] * METRE, (at[1] + lift) * METRE, at[2] * METRE)}
      />
      <hemisphereLight args={["#ffffff", "#8a8a8a", 1.1 * Math.PI]} />
      <directionalLight position={[3, 6, 2]} intensity={0.6 * Math.PI} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.0005, 0]}>
        <planeGeometry args={[40 * METRE, 40 * METRE]} />
        <meshBasicMaterial color={theme.ground} />
      </mesh>
      <primitive object={cast.group} />
      <primitive object={cast.walker} />
    </Canvas>
  );
}
