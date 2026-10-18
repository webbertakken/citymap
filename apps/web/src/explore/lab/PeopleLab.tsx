"use client";
// The people lab: /lab/people?motion=walk|run|jump. Wobble Blocks' man moving on the Universal Animation Library's clips,
// retargeted, beside Quaternius' man on his own clips, on a real street, so the two can be compared in motion.
import type { Scene } from "@citymap/scene";
import type { Theme } from "@citymap/themes";
import { PerspectiveCamera } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo } from "react";
import { AnimationMixer, type AnimationClip, type Object3D } from "three";
import { Buildings, Mesh } from "../../components/CityMeshes";
import type { Loaded } from "../models/gltf";
import { WOBBLE_FROM_UAL, retargetClip } from "../models/retarget";
import { METRE, headingOf, onStreet, type Street } from "../street";

export type Motion = "walk" | "run" | "jump";

/** Each motion's clip: the library's for Wobble Blocks, Quaternius' own for his man. */
const CLIPS: Readonly<Record<Motion, { readonly library: string; readonly own: string }>> = {
  walk: { library: "Walk_Loop", own: "HumanArmature|Man_Walk" },
  run: { library: "Sprint_Loop", own: "HumanArmature|Man_Run" },
  jump: { library: "Jump_Start", own: "HumanArmature|Man_Jump" },
};

export interface PeopleLabProps {
  readonly scene: Scene;
  readonly table: Float32Array;
  readonly theme: Theme;
  readonly street: Street;
  readonly motion: Motion;
  readonly wobble: Loaded;
  readonly quaternius: Loaded;
  /** The library's clips, and the skeleton they were made on. */
  readonly library: { readonly scene: Object3D; readonly clips: readonly AnimationClip[] };
}

/** A person playing one clip, in a loop. */
function Moving({ model, clip }: { readonly model: Object3D; readonly clip: AnimationClip }) {
  const mixer = useMemo(() => {
    const m = new AnimationMixer(model);
    m.clipAction(clip).play();
    return m;
  }, [model, clip]);
  useFrame((_state, seconds) => mixer.update(seconds));
  return null;
}

export default function PeopleLab({
  scene,
  table,
  theme,
  street,
  motion,
  wobble,
  quaternius,
  library,
}: PeopleLabProps) {
  const cast = useMemo(() => {
    const clipOf = (clips: readonly AnimationClip[], name: string) => {
      const clip = clips.find((c) => c.name === name);
      if (!clip) throw new Error(`lab/no-clip ${name}`);
      return clip;
    };
    const man = wobble.make();
    const rest = clipOf(library.clips, "A_TPose");
    // Mapped onto the file's own scene, in the frame its skeleton was made in; played on the copy by bone name.
    const retargeted = retargetClip(
      wobble.original,
      library.scene,
      clipOf(library.clips, CLIPS[motion].library),
      rest,
      WOBBLE_FROM_UAL,
      {
        hip: "Hips",
      },
    );
    const other = quaternius.make();
    return [
      { model: man, clip: retargeted, along: 9.4 },
      { model: other, clip: clipOf(quaternius.clips, CLIPS[motion].own), along: 10.8 },
    ];
  }, [wobble, quaternius, library, motion]);
  const heading = headingOf(street);
  const eye = onStreet(street, 10.1, 1.6);
  const target = onStreet(street, 10.1, -2.6);
  return (
    <Canvas className="canvas" dpr={[1, 2]} linear flat gl={{ preserveDrawingBuffer: true }}>
      <color attach="background" args={[theme.country]} />
      <PerspectiveCamera
        makeDefault
        fov={50}
        near={0.01}
        far={120}
        position={[eye.x, 1.4 * METRE, eye.z]}
        onUpdate={(c) => c.lookAt(target.x, 0.95 * METRE, target.z)}
      />
      <hemisphereLight args={["#ffffff", "#8a8a8a", 1.1 * Math.PI]} />
      <directionalLight position={[3, 6, 2]} intensity={0.6 * Math.PI} />
      {scene.layers.map((layer) => (
        <Mesh key={layer.name} layer={layer} bounds={scene.bounds} />
      ))}
      <Buildings buildings={scene.buildings} table={table} mode="buildings" theme={theme} />
      {cast.map(({ model, clip, along }) => {
        const ground = onStreet(street, along, -2.6);
        // Side on to the camera, walking along the street, so stride and swing show.
        return (
          <group key={model.uuid} position={[ground.x, 0.026, ground.z]} rotation={[0, heading, 0]} scale={METRE}>
            <primitive object={model} />
            <Moving model={model} clip={clip} />
          </group>
        );
      })}
    </Canvas>
  );
}
