"use client";
// The city at eye height: a perspective camera over the walker's shoulder, the city's meshes as the map draws them, the
// walker and the vehicles parked about, drawn every frame while the walk goes on.
import type { Theme } from "@citymap/themes";
import { PerspectiveCamera } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { Suspense, use, useEffect, useMemo, useRef } from "react";
import { CanvasTexture, LinearFilter, Mesh as ThreeMesh, MeshBasicMaterial, PlaneGeometry, type Object3D } from "three";
import { Animator } from "../explore/models/animator";
import { GLTF_MODELS, loadModel, type Loaded, type ModelFile } from "../explore/models/gltf";
import { motionOf, paceOf } from "../explore/models/motion";
import { bicycle, car, figure, paletteOf } from "../explore/models/procedural";
import { PROCEDURAL_RIGS, RIGS, leanOf, poseVehicle } from "../explore/models/rig";
import { poseStride, swingOf } from "../explore/models/stride";
import { BASE, FLOOR } from "../explore/sight";
import { SIGN_POOL, middleOf, nearestLots, wallFacing, type Wall } from "../explore/signs";
import { METRE } from "../explore/street";
import { log, reasonOf } from "../log";
import { Buildings, Mesh } from "./CityMeshes";
import type { ExploreCanvasProps, Signage } from "./ExploreView";

/** The camera sees this far, in street widths (four kilometres), and no nearer than a few centimetres. */
const FAR = 400;
const NEAR = 0.002;
/** The city fades into the sky from a kilometre and a half to just short of the far plane. */
const FOG_NEAR = 150;
const FOG_FAR = 390;
/** A rider sits this high above the bicycle's ground, in metres: its saddle, less the seated figure's hips. */
const SADDLE = 0.38;

/** Signs are chosen again this often, in seconds: the walker moves a few metres between. */
const SIGN_EVERY = 0.25;
/** A sign's lettering is this tall in metres, on a plaque this much taller; it is at most this share of its wall. */
const SIGN_HEIGHT = 0.42;
const SIGN_TEXT_SHARE = 0.62;
const SIGN_WALL_SHARE = 0.9;
/** A sign stands this far out from its wall, so it never flickers into it. */
const SIGN_OUT = 0.04;
/** The sign's texture: its canvas is this many pixels tall, and as wide as its words need, up to this. */
const SIGN_PIXELS = 96;
const SIGN_MAX_PIXELS = 1024;

/** One sign of the pool: its plane, the canvas its words are drawn on, and the building it names (−1 for none). */
interface Sign {
  readonly mesh: ThreeMesh<PlaneGeometry, MeshBasicMaterial>;
  readonly canvas: HTMLCanvasElement;
  readonly texture: CanvasTexture;
  lot: number;
}

function newSign(): Sign {
  const canvas = document.createElement("canvas");
  canvas.width = SIGN_MAX_PIXELS;
  canvas.height = SIGN_PIXELS;
  const texture = new CanvasTexture(canvas);
  texture.minFilter = LinearFilter;
  const mesh = new ThreeMesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ map: texture, transparent: true }));
  mesh.visible = false;
  return { mesh, canvas, texture, lot: -1 };
}

/** A sign's words drawn on its plaque, in the page's own face: light letters on a dark plaque, as a shop sign. */
function letter(sign: Sign, words: string): number {
  const context = sign.canvas.getContext("2d");
  if (!context) return 0;
  const face = getComputedStyle(document.body).fontFamily;
  const size = Math.round(SIGN_PIXELS * SIGN_TEXT_SHARE);
  context.font = `600 ${size}px ${face}`;
  const width = Math.min(SIGN_MAX_PIXELS, Math.ceil(context.measureText(words).width + SIGN_PIXELS * 0.6));
  context.clearRect(0, 0, sign.canvas.width, sign.canvas.height);
  context.fillStyle = "rgba(18, 20, 26, 0.88)";
  context.beginPath();
  context.roundRect(0, 0, width, SIGN_PIXELS, SIGN_PIXELS * 0.18);
  context.fill();
  context.fillStyle = "#f5f3ee";
  context.textBaseline = "middle";
  context.font = `600 ${size}px ${face}`;
  context.fillText(words, SIGN_PIXELS * 0.3, SIGN_PIXELS / 2, width - SIGN_PIXELS * 0.6);
  // Only the part of the canvas the plaque fills is shown.
  sign.texture.repeat.set(width / SIGN_MAX_PIXELS, 1);
  sign.texture.needsUpdate = true;
  return width / SIGN_PIXELS;
}

/** A sign on a building's wall facing its street, in the band between its ground floor's windows and the next. */
function place(sign: Sign, wall: Wall, aspect: number, floors: number) {
  const height = SIGN_HEIGHT / SIGN_TEXT_SHARE;
  const width = Math.min(aspect * height, wall.length * SIGN_WALL_SHARE);
  const y = BASE + FLOOR * (floors >= 2 ? 1.05 : 0.9);
  sign.mesh.position.set((wall.x + wall.nx * SIGN_OUT) * METRE, y * METRE, (wall.z + wall.nz * SIGN_OUT) * METRE);
  sign.mesh.rotation.set(0, Math.atan2(wall.nx, wall.nz), 0);
  sign.mesh.scale.set(width * METRE, height * METRE, 1);
  sign.mesh.visible = true;
}

/**
 * The nearest buildings' names, on a pool of signs that never grows: each choice keeps a sign on its building while
 * that stays near, and letters a freed one afresh for a newcomer. It owns its signs; the canvas only asks it to choose.
 */
class SignBoard {
  readonly signs = Array.from({ length: SIGN_POOL }, newSign);
  private readonly walls = new Map<number, Wall>();

  /** Signs the nearest buildings to a point (metres); says how many show. */
  choose(signage: Signage, table: Float32Array, at: { readonly x: number; readonly z: number }): number {
    const lots = nearestLots(signage.footprints, at);
    const wanted = new Set(lots);
    const kept = new Set<number>();
    for (const sign of this.signs)
      if (wanted.has(sign.lot)) kept.add(sign.lot);
      else {
        sign.lot = -1;
        sign.mesh.visible = false;
      }
    const free = this.signs.filter((sign) => sign.lot === -1);
    for (const lot of lots) {
      if (kept.has(lot)) continue;
      const sign = free.pop();
      const footprint = signage.footprints[lot];
      const words = signage.name(lot);
      if (!sign || !footprint || words === "") continue;
      sign.lot = lot;
      place(sign, this.wallOf(signage, lot, footprint), letter(sign, words), table[lot * 4]!);
    }
    return this.signs.filter((sign) => sign.lot !== -1).length;
  }

  /** The wall a building's sign goes on, worked out once: the one facing its nearest street. */
  private wallOf(signage: Signage, lot: number, footprint: Signage["footprints"][number]): Wall {
    const known = this.walls.get(lot);
    if (known) return known;
    const middle = middleOf(footprint);
    const wall = wallFacing(footprint, signage.roads.nearest(middle.x, middle.z) ?? middle);
    this.walls.set(lot, wall);
    return wall;
  }

  dispose() {
    for (const sign of this.signs) {
      sign.mesh.geometry.dispose();
      sign.mesh.material.dispose();
      sign.texture.dispose();
    }
  }
}

/** The signs, chosen again every `SIGN_EVERY` from where the camera stands. */
function Signs({
  signs,
  table,
  onSigns,
}: {
  readonly signs: Signage;
  readonly table: Float32Array;
  readonly onSigns: (count: number) => void;
}) {
  const board = useMemo(() => new SignBoard(), []);
  useEffect(() => () => board.dispose(), [board]);
  const since = useRef(SIGN_EVERY);
  const shown = useRef(-1);
  useFrame((state, seconds) => {
    since.current += seconds;
    if (since.current < SIGN_EVERY) return;
    since.current = 0;
    const at = state.camera.position;
    const count = board.choose(signs, table, { x: at.x / METRE, z: at.z / METRE });
    if (count !== shown.current) {
      shown.current = count;
      onSigns(count);
    }
  });
  return (
    <>
      {board.signs.map((sign) => (
        <primitive key={sign.mesh.uuid} object={sign.mesh} />
      ))}
    </>
  );
}

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
  // How far each vehicle has rolled, for its wheels.
  const rolled = useRef(new Map<string, { x: number; z: number; rolled: number }>());
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
      walker.position.set(feet.x * METRE, feet.y * METRE, feet.z * METRE);
      walker.rotation.order = "XYZ";
      walker.rotation.set(0, heading, 0);
      walker.scale.setScalar(METRE);
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

export default function ExploreCanvas({ scene, table, theme, frame, vehicles, signs, onSigns }: ExploreCanvasProps) {
  const fog = useMemo(() => ({ colour: theme.country, near: FOG_NEAR, far: FOG_FAR }), [theme]);
  return (
    <Canvas className="canvas" dpr={[1, 2]} linear flat aria-hidden="true">
      <color attach="background" args={[theme.country]} />
      <fog attach="fog" args={[theme.country, FOG_NEAR, FOG_FAR]} />
      <PerspectiveCamera makeDefault fov={60} near={NEAR} far={FAR} />
      {/* Physical lights reach a surface at 1/π of their intensity: these light it at about 1.1 and 0.6 of its colour. */}
      <hemisphereLight args={["#ffffff", "#8a8a8a", 1.1 * Math.PI]} />
      <directionalLight position={[3, 6, 2]} intensity={0.6 * Math.PI} />
      {scene.layers.map((layer) => (
        <Mesh key={layer.name} layer={layer} />
      ))}
      <Buildings buildings={scene.buildings} table={table} mode="buildings" theme={theme} fog={fog} />
      <Signs signs={signs} table={table} onSigns={onSigns} />
      <Suspense fallback={null}>
        <Walk theme={theme} frame={frame} vehicles={vehicles} />
      </Suspense>
    </Canvas>
  );
}
