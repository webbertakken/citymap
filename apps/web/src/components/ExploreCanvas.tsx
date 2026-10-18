"use client";
// The city at eye height: a perspective camera over the walker's shoulder, the city's meshes as the map draws them, the
// walker and the nearest of the vehicles parked about (from a pool of models), drawn every frame while the walk goes on.
// On a bicycle or a motorbike the rider sits in its frame, leaning and pitching with it, hands on the bars, feet on the
// pedals or the pegs, or a foot on the ground; a car is drawn by its whole turn, on its springs or on its side.
import type { Theme } from "@citymap/themes";
import { PerspectiveCamera } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { Suspense, use, useEffect, useMemo, useRef } from "react";
import {
  CanvasTexture,
  LinearFilter,
  Quaternion,
  Mesh as ThreeMesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Vector3,
  type Object3D,
} from "three";
import { Animator } from "../explore/models/animator";
import { GLTF_MODELS, loadModel, type Loaded, type ModelFile } from "../explore/models/gltf";
import { motionOf, paceOf } from "../explore/models/motion";
import {
  ELBOW_OUT,
  FOOT_OUT,
  KNEE_AHEAD,
  SADDLE,
  armsOf,
  legsOf,
  pedalsOf,
  reachFor,
  thrownPose,
} from "../explore/models/pedalling";
import { bicycle, car, figure, motorbike, paletteOf } from "../explore/models/procedural";
import { PROCEDURAL_RIGS, RIGS, poseVehicle, type Rig } from "../explore/models/rig";
import { poseStride, swingOf } from "../explore/models/stride";
import { assignPool } from "../explore/pool";
import { BASE, FLOOR } from "../explore/sight";
import { SIGN_POOL, middleOf, nearestLots, wallFacing, type Wall } from "../explore/signs";
import { METRE } from "../explore/street";
import { MODEL_KINDS, VEHICLE_POOL, modelOf, nearestOf, type ModelKind, type Vehicle } from "../explore/vehicles";
import { log, reasonOf } from "../log";
import { Buildings, Mesh } from "./CityMeshes";
import type { ExploreCanvasProps, Signage } from "./ExploreView";

/** The camera sees this far, in street widths (four kilometres), and no nearer than a few centimetres. */
const FAR = 400;
const NEAR = 0.002;
/** The city fades into the sky from a kilometre and a half to just short of the far plane. */
const FOG_NEAR = 150;
const FOG_FAR = 390;
/** The pool's vehicles, the nearest the walker, are chosen again this often in seconds. */
const POOL_EVERY = 0.25;

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

/** A model loaded behind the loading card; null (said in the log) when it cannot load, for its stand-in. */
const loading = (file: ModelFile): Promise<Loaded | null> =>
  loadModel(process.env.NEXT_PUBLIC_BASE_PATH ?? "", file).catch((failure: unknown) => {
    log.error("explore/model-failed", { url: file.url, reason: reasonOf(failure) });
    return null;
  });

/** Every model the walk draws, by what it is. */
const FILES = {
  person: GLTF_MODELS.figure,
  saloon: GLTF_MODELS.car,
  pickup: GLTF_MODELS.pickup,
  motorbike: GLTF_MODELS.motorbike,
  bicycle: GLTF_MODELS.bicycle,
} as const satisfies Record<ModelKind | "person", ModelFile>;
type Models = { readonly [K in keyof typeof FILES]: Promise<Loaded | null> };
let models: Models | null = null;
/** The walk's models, fetched once a page: the first ask starts them all. */
const modelsNow = (): Models => {
  models ??= {
    person: loading(FILES.person),
    saloon: loading(FILES.saloon),
    pickup: loading(FILES.pickup),
    motorbike: loading(FILES.motorbike),
    bicycle: loading(FILES.bicycle),
  };
  return models;
};

/** Loads every model the walk draws, counting them as each arrives (or fails, for its stand-in), for the loading card. */
export async function loadModels(onCount: (done: number, of: number) => void): Promise<void> {
  const all = Object.values(modelsNow());
  let done = 0;
  onCount(done, all.length);
  await Promise.all(all.map((model) => model.then(() => onCount(++done, all.length))));
}

/** One model of the pool: what it draws, and the model with its rig. */
interface Slot {
  readonly kind: ModelKind;
  readonly model: Object3D;
  readonly rig: Rig;
}

/** A pool's model of a kind: its loaded file with its rig, or the procedural stand-in with its own. */
function slotOf(kind: ModelKind, loaded: Loaded | null, theme: Theme): Slot {
  const palette = paletteOf(theme);
  if (loaded) return { kind, model: loaded.make(), rig: kind === "saloon" ? RIGS.car : RIGS[kind] };
  if (kind === "bicycle") return { kind, model: bicycle(palette), rig: PROCEDURAL_RIGS.bicycle };
  if (kind === "motorbike") return { kind, model: motorbike(palette), rig: PROCEDURAL_RIGS.motorbike };
  return { kind, model: car(palette), rig: PROCEDURAL_RIGS.car };
}

/** What a slot is doing now: the group that places it, and the vehicle it shows (null: hidden). */
interface Showing {
  group: Object3D | null;
  id: string | null;
}

/** Where a vehicle has rolled to, for its wheels: from where it was drawn last. */
type Rolled = Map<string, { x: number; z: number; rolled: number }>;

/** Poses a vehicle's model, placed by its group: rolled by how far it moved since it was last drawn. */
function placeVehicle(slot: Slot, group: Object3D, vehicle: Vehicle, rolled: Rolled) {
  const was = rolled.get(vehicle.id) ?? { x: vehicle.feet.x, z: vehicle.feet.z, rolled: 0 };
  const step = Math.hypot(vehicle.feet.x - was.x, vehicle.feet.z - was.z) * Math.sign(vehicle.speed);
  const now = { x: vehicle.feet.x, z: vehicle.feet.z, rolled: was.rolled + step };
  rolled.set(vehicle.id, now);
  group.visible = true;
  group.position.set(vehicle.feet.x * METRE, vehicle.feet.y * METRE, vehicle.feet.z * METRE);
  if (vehicle.kind === "car")
    group.quaternion.set(vehicle.attitude.x, vehicle.attitude.y, vehicle.attitude.z, vehicle.attitude.w);
  else group.rotation.set(0, vehicle.heading, 0);
  const single = vehicle.kind === "bicycle" ? vehicle.cycle : vehicle.kind === "motorbike" ? vehicle.moto : null;
  poseVehicle(slot.model, slot.rig, {
    rolled: now.rolled,
    steer: vehicle.steer,
    lean: single?.lean ?? 0,
    pitch: single?.pitch ?? 0,
    crank: vehicle.kind === "bicycle" ? vehicle.cycle.crank : 0,
  });
}

const scratch = { at: new Vector3(), turn: new Quaternion() };

/** A rider's limbs to bend onto the bicycle, when the figure has them. */
interface Limbs {
  readonly legs: ReturnType<typeof legsOf>;
  readonly arms: ReturnType<typeof armsOf>;
}

/**
 * The rider on a bicycle or a motorbike: thrown, beside it on the ground, rolled onto the side it fell; else in its
 * saddle, in its frame, the hands on the grips and the legs bent onto the pedals or the pegs (the left foot on the
 * ground at a stop), when the figure has limbs to bend.
 */
function seat(
  walker: Object3D,
  slot: Slot,
  group: Object3D,
  vehicle: Vehicle & { kind: "bicycle" | "motorbike" },
  { legs, arms }: Limbs,
) {
  const single = vehicle.kind === "bicycle" ? vehicle.cycle : vehicle.moto;
  const saddle = slot.rig.saddle ?? [0, SADDLE, 0];
  if (single.fall) {
    const { ahead, aside, roll, down } = thrownPose(single.fall);
    walker.position.copy(group.localToWorld(scratch.at.set(ahead, saddle[1] * (1 - down), -aside)));
    walker.rotation.order = "YXZ";
    walker.rotation.set(-roll, vehicle.heading, 0);
    return;
  }
  const machine = slot.model;
  machine.updateWorldMatrix(true, false);
  walker.position.copy(machine.localToWorld(scratch.at.set(...saddle)));
  walker.quaternion.copy(machine.getWorldQuaternion(scratch.turn));
  walker.updateMatrixWorld(true);
  const fork = slot.rig.fork ? machine.getObjectByName(slot.rig.fork) : undefined;
  if (arms && fork && slot.rig.grips) {
    const grip = (at: readonly [number, number, number]) => fork.localToWorld(new Vector3(...at));
    const out = (side: Vector3) => side.clone().applyQuaternion(scratch.turn);
    reachFor(arms.left.upper, arms.left.fore, arms.left.hand, grip(slot.rig.grips.left), out(ELBOW_OUT.left));
    reachFor(arms.right.upper, arms.right.fore, arms.right.hand, grip(slot.rig.grips.right), out(ELBOW_OUT.right));
  }
  if (!legs) return;
  const bend = KNEE_AHEAD.clone().applyQuaternion(scratch.turn);
  const { pegs } = slot.rig;
  if (pegs) {
    const peg = (at: readonly [number, number, number]) => machine.localToWorld(new Vector3(...at));
    const ground = machine.localToWorld(new Vector3(pegs.left[0], 0, pegs.left[2] - FOOT_OUT));
    reachFor(legs.left.thigh, legs.left.shin, legs.left.foot, single.footDown ? ground : peg(pegs.left), bend);
    reachFor(legs.right.thigh, legs.right.shin, legs.right.foot, peg(pegs.right), bend);
    return;
  }
  const crank = slot.rig.crank ? machine.getObjectByName(slot.rig.crank) : undefined;
  if (!crank || !slot.rig.pedals || vehicle.kind !== "bicycle") return;
  const { cycle } = vehicle;
  const pivot = machine.worldToLocal(crank.getWorldPosition(new Vector3()));
  const pedals = pedalsOf(cycle.crank, slot.rig.pedals);
  const toWorld = (p: { x: number; y: number; z: number }) =>
    machine.localToWorld(pivot.clone().add(new Vector3(p.x, p.y, p.z)));
  const ground = machine.localToWorld(new Vector3(pivot.x, 0, -FOOT_OUT));
  reachFor(legs.left.thigh, legs.left.shin, legs.left.foot, cycle.footDown ? ground : toWorld(pedals.left), bend);
  reachFor(legs.right.thigh, legs.right.shin, legs.right.foot, toWorld(pedals.right), bend);
}

/** The walker and the nearest vehicles, moved by each frame of the walk; the camera follows. */
function Walk({ theme, frame }: { readonly theme: Theme; readonly frame: ExploreCanvasProps["frame"] }) {
  const files = modelsNow();
  const loaded = use(files.person);
  const saloon = use(files.saloon);
  const pickup = use(files.pickup);
  const motorbikeFile = use(files.motorbike);
  const bicycleFile = use(files.bicycle);
  const model = useMemo(() => loaded?.make() ?? figure(paletteOf(theme)), [loaded, theme]);
  const animator = useMemo(() => (loaded ? new Animator(model, loaded.clips) : null), [loaded, model]);
  const limbs = useMemo(() => ({ legs: legsOf(model), arms: armsOf(model) }), [model]);
  // The pool: so many models of each kind, the PSX ones with their rigs, or the procedural stand-ins (with their own)
  // when a file could not load. Each is drawn inside a group that places and turns it, so its own pose stays its own.
  const slots = useMemo<Slot[]>(() => {
    const byKind: Readonly<Record<ModelKind, Loaded | null>> = {
      saloon,
      pickup,
      motorbike: motorbikeFile,
      bicycle: bicycleFile,
    };
    return MODEL_KINDS.flatMap((kind) =>
      Array.from({ length: VEHICLE_POOL[kind] }, () => slotOf(kind, byKind[kind], theme)),
    );
  }, [saloon, pickup, motorbikeFile, bicycleFile, theme]);
  const showing = useRef<Showing[]>([]);
  const placed = useRef<Object3D>(null);
  const rolled = useRef<Rolled>(new Map());
  const since = useRef(POOL_EVERY);
  useFrame((state, seconds) => {
    const walker = placed.current;
    if (!walker) return;
    const now = frame(seconds);
    const { body, speed, riding } = now.session;
    const byId = new Map(now.vehicles.map((v) => [v.id, v]));
    const shows = slots.map((_, i) => (showing.current[i] ??= { group: null, id: null }));
    // The pool goes to the nearest vehicles now and then; the one ridden keeps its model throughout.
    since.current += seconds;
    if (since.current >= POOL_EVERY || (riding !== null && !shows.some((s) => s.id === riding))) {
      since.current = 0;
      const wanted = nearestOf(now.vehicles, body.feet, VEHICLE_POOL, riding);
      for (const kind of MODEL_KINDS) {
        const mine = shows.filter((_, i) => slots[i]!.kind === kind);
        const ids = assignPool(
          mine.map((s) => s.id),
          wanted.filter((id) => {
            const vehicle = byId.get(id);
            return vehicle !== undefined && modelOf(vehicle) === kind;
          }),
        );
        mine.forEach((show, i) => (show.id = ids[i]!));
      }
    }
    slots.forEach((slot, i) => {
      const { group, id } = shows[i]!;
      const vehicle = id === null ? undefined : byId.get(id);
      if (!group) return;
      if (vehicle) placeVehicle(slot, group, vehicle, rolled.current);
      else group.visible = false;
    });
    const ridden = riding === null ? undefined : byId.get(riding);
    walker.visible = ridden?.kind !== "car";
    walker.scale.setScalar(METRE);
    const at = shows.findIndex((s) => s.id === riding);
    const ridingGroup = shows[at]?.group;
    if ((ridden?.kind === "bicycle" || ridden?.kind === "motorbike") && ridingGroup) {
      const fallen = ridden.kind === "bicycle" ? ridden.cycle.fall : ridden.moto.fall;
      animator?.play(fallen ? "idle" : "drive", 1, seconds);
      seat(walker, slots[at]!, ridingGroup, ridden, limbs);
    } else if (!ridden) {
      // Drawn between its last two steps, so it moves as smoothly as the frames come.
      const { feet, heading, walked } = now.shown;
      walker.position.set(feet.x * METRE, feet.y * METRE, feet.z * METRE);
      walker.rotation.order = "XYZ";
      walker.rotation.set(0, heading, 0);
      if (animator) {
        const motion = motionOf(speed, body.grounded, body.rise);
        animator.play(motion, paceOf(motion, speed), seconds);
      } else poseStride(walker, swingOf(walked, speed));
    }
    const { eye, target } = now.camera;
    state.camera.position.set(eye.x * METRE, eye.y * METRE, eye.z * METRE);
    state.camera.lookAt(target.x * METRE, target.y * METRE, target.z * METRE);
  });
  const keep = (i: number) => (group: Object3D | null) => {
    (showing.current[i] ??= { group: null, id: null }).group = group;
  };
  return (
    <>
      <primitive ref={placed} object={model} scale={METRE} />
      {slots.map((slot, i) => (
        <group key={slot.model.uuid} ref={keep(i)} scale={METRE} visible={false}>
          <primitive object={slot.model} />
        </group>
      ))}
    </>
  );
}

export default function ExploreCanvas({ scene, table, theme, frame, signs, onSigns }: ExploreCanvasProps) {
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
        <Mesh key={layer.name} layer={layer} bounds={scene.bounds} />
      ))}
      <Buildings buildings={scene.buildings} table={table} mode="buildings" theme={theme} fog={fog} />
      <Signs signs={signs} table={table} onSigns={onSigns} />
      <Suspense fallback={null}>
        <Walk theme={theme} frame={frame} />
      </Suspense>
    </Canvas>
  );
}
