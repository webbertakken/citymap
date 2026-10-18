"use client";
// The ride lab's scene: a bicycle or a motorbike on a plain ground, posed as the walk poses it (`placeVehicle`), its
// rider seated as the walk seats them (`seat`), and a camera at a fixed side of it.
import type { Theme, ThemeName } from "@citymap/themes";
import { PerspectiveCamera } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useMemo } from "react";
import { Group, Mesh, MeshBasicMaterial, SphereGeometry } from "three";
import { FOOT_LEAN } from "../bicycle";
import { pose, type Loaded } from "../models/gltf";
import { figureOf, placeVehicle, seat, slotOf, type Rolled } from "../models/seat";
import { METRE } from "../street";
import { standing, type Vehicle } from "../vehicles";

export const POSES = ["parked", "stopped", "riding", "steering"] as const;
export const VIEWS = ["side", "front", "above", "behind", "grip", "pedal"] as const;

export interface RideAsked {
  readonly ride: "bicycle" | "motorbike";
  /** Parked (no rider), stopped (a foot down), riding (upright, feet up), steering (bars turned, leaning left). */
  readonly pose: (typeof POSES)[number];
  /** From its left side, ahead of it, above it, behind it, or close on its left grip or its left foot. */
  readonly view: (typeof VIEWS)[number];
  readonly theme: ThemeName;
  /** How far its wheels have rolled, in metres. */
  readonly rolled: number;
  /** The bicycle's crank angle, in radians. */
  readonly crank: number;
  /** Whether to mark the rider's contacts (the saddle, grips, pedals or pegs) with dots. */
  readonly marks: boolean;
}

/** A dot marking a contact: 2 cm across, drawn through everything. */
function dot() {
  const mesh = new Mesh(new SphereGeometry(0.02, 8, 6), new MeshBasicMaterial({ color: "#ff2fd6", depthTest: false }));
  mesh.renderOrder = 10;
  return mesh;
}

/** Each view's eye and what it looks at, in metres from the ride's feet (+x ahead, +y up, +z right). */
const EYES: Readonly<
  Record<
    RideAsked["view"],
    { readonly eye: readonly [number, number, number]; readonly at: readonly [number, number, number] }
  >
> = {
  side: { eye: [0, 0.9, -3.2], at: [0, 0.75, 0] },
  front: { eye: [3.2, 1.1, 0], at: [0, 0.75, 0] },
  above: { eye: [0.001, 3.6, 0], at: [0, 0.75, 0] },
  behind: { eye: [-3.2, 1.6, 0.6], at: [0, 0.75, 0] },
  grip: { eye: [0.9, 1.5, -0.9], at: [0.45, 1.0, -0.25] },
  pedal: { eye: [0.4, 0.6, -1.2], at: [0, 0.3, -0.15] },
};
/** Steering: the bars this far to the left, the ride leaning this far into the turn. */
const STEER = 0.35;
const LEAN = 0.25;

/** The ride as asked: a vehicle standing at the origin facing +x, then stopped, ridden or steered. */
function vehicleOf(asked: RideAsked): Vehicle {
  const feet = { x: 0, y: 0, z: 0 };
  const ridden = (lean: number, steer: number, footDown: boolean) => {
    if (asked.ride === "motorbike") {
      const bike = standing("lab", "motorbike", feet, 0);
      return { ...bike, steer, speed: footDown ? 0 : 6, moto: { ...bike.moto, lean, steer, footDown } };
    }
    const bike = standing("lab", "bicycle", feet, 0, asked.crank);
    return { ...bike, steer, speed: footDown ? 0 : 5, cycle: { ...bike.cycle, lean, steer, footDown } };
  };
  if (asked.pose === "parked" || asked.pose === "stopped")
    return ridden(asked.pose === "stopped" ? FOOT_LEAN : 0, 0, true);
  return asked.pose === "riding" ? ridden(0, 0, false) : ridden(LEAN, STEER, false);
}

export interface RideLabProps {
  readonly person: Loaded;
  readonly ride: Loaded;
  readonly asked: RideAsked;
  readonly theme: Theme;
}

export default function RideLab({ person, ride, asked, theme }: RideLabProps) {
  const cast = useMemo(() => {
    const walker = person.make();
    const figure = figureOf(walker);
    pose(walker, person.clips, "Driving_Loop", 0);
    const slot = slotOf(asked.ride, ride, theme);
    const group = new Group();
    group.scale.setScalar(METRE);
    group.add(slot.model);
    const vehicle = vehicleOf(asked);
    const rolled: Rolled = new Map([[vehicle.id, { x: 0, z: 0, rolled: asked.rolled }]]);
    placeVehicle(slot, group, vehicle, rolled, asked.pose === "parked" ? 1 : 0);
    walker.scale.setScalar(METRE);
    walker.visible = asked.pose !== "parked";
    if (walker.visible && (vehicle.kind === "bicycle" || vehicle.kind === "motorbike"))
      seat(walker, figure, slot, group, vehicle);
    const { rider } = slot.rig;
    if (asked.marks && rider)
      for (const name of [rider.saddle, rider.grips.left, rider.grips.right, rider.feet.left, rider.feet.right])
        slot.model.getObjectByName(name)?.add(dot());
    return { walker, group };
  }, [person, ride, asked, theme]);
  const { eye, at } = EYES[asked.view];
  return (
    <Canvas className="canvas" dpr={[1, 2]} linear flat gl={{ preserveDrawingBuffer: true }}>
      <color attach="background" args={[theme.country]} />
      <PerspectiveCamera
        makeDefault
        fov={35}
        near={0.01}
        far={100}
        position={[eye[0] * METRE, eye[1] * METRE, eye[2] * METRE]}
        onUpdate={(c) => c.lookAt(at[0] * METRE, at[1] * METRE, at[2] * METRE)}
      />
      <hemisphereLight args={["#ffffff", "#8a8a8a", 1.1 * Math.PI]} />
      <directionalLight position={[3, 6, 2]} intensity={0.6 * Math.PI} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.0005, 0]}>
        <planeGeometry args={[4, 4]} />
        <meshBasicMaterial color={theme.ground} />
      </mesh>
      <primitive object={cast.group} />
      <primitive object={cast.walker} />
    </Canvas>
  );
}
