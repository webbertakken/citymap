"use client";
// The run lab's scene: the figure at a phase of its run, carried along the ground at the run's speed, before a wall
// lined every 10 cm (Muybridge's backdrop was lined every 5 cm), with marks on the ground every half metre so a planted
// foot is seen to stay put; the camera beside the runner, side on.
import type { Theme, ThemeName } from "@citymap/themes";
import { PerspectiveCamera } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useMemo } from "react";
import { gaitAt } from "../models/gait";
import { pose, type Loaded } from "../models/gltf";
import { poseRun } from "../models/run";
import { figureOf } from "../models/seat";
import { METRE } from "../street";
import { RUN_SPEED } from "../walker";

export interface RunAsked {
  readonly gait: "before" | "after";
  readonly phase: number;
  readonly theme: ThemeName;
}

const gait = gaitAt(RUN_SPEED);
/** The old run played the sprint at the ground's pace: 4.5 m/s over its own 2.56, one clip a stride. */
const OLD_PACE = RUN_SPEED / 2.56;
const SPRINT_STRIDE = 0.667;
const LINES = Array.from({ length: 21 }, (_, i) => i * 0.1);
const MARKS = Array.from({ length: 21 }, (_, i) => i * 0.5 - 2);

export interface RunLabProps {
  readonly person: Loaded;
  readonly asked: RunAsked;
  readonly theme: Theme;
}

export default function RunLab({ person, asked, theme }: RunLabProps) {
  const { walker, along } = useMemo(() => {
    const made = person.make();
    const figure = figureOf(made);
    made.scale.setScalar(METRE);
    // Before: a stride of the sprint as played, ahead at the run's speed over its sped-up time. After: the gait's stride.
    const stride = asked.gait === "before" ? SPRINT_STRIDE / OLD_PACE : 2 / gait.cadence;
    const at = asked.phase * stride * RUN_SPEED;
    made.position.set(at * METRE, 0, 0);
    pose(made, person.clips, "Sprint_Loop", asked.phase);
    if (asked.gait === "after" && figure) poseRun(made, figure, gait, asked.phase, 1);
    return { walker: made, along: at };
  }, [person, asked]);
  const ink = theme.dark ? "#d8d8d8" : "#333333";
  return (
    <Canvas className="canvas" dpr={[1, 2]} linear flat gl={{ preserveDrawingBuffer: true }}>
      <color attach="background" args={[theme.country]} />
      <PerspectiveCamera
        makeDefault
        fov={30}
        near={0.01}
        far={100}
        position={[along * METRE, 0.95 * METRE, -4.2 * METRE]}
        onUpdate={(c) => c.lookAt(along * METRE, 0.85 * METRE, 0)}
      />
      <hemisphereLight args={["#ffffff", "#8a8a8a", 1.1 * Math.PI]} />
      <directionalLight position={[3, 6, -2]} intensity={0.6 * Math.PI} />
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[40, 4]} />
        <meshBasicMaterial color={theme.ground} />
      </mesh>
      {LINES.map((y) => (
        <mesh key={y} position={[along * METRE, y * METRE, 0.6 * METRE]}>
          <boxGeometry args={[0.4, 0.001, 0.001]} />
          <meshBasicMaterial color={ink} transparent opacity={0.35} />
        </mesh>
      ))}
      {MARKS.map((x) => (
        <mesh key={x} position={[(x + Math.round(along * 2) / 2) * METRE, 0.0005, -0.2 * METRE]}>
          <boxGeometry args={[0.002, 0.0002, 0.04]} />
          <meshBasicMaterial color={ink} />
        </mesh>
      ))}
      <primitive object={walker} />
    </Canvas>
  );
}
