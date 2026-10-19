"use client";
// The city at eye height: a perspective camera over the walker's shoulder, the city's meshes as the map draws them, the
// walker and the nearest of the vehicles parked about (from a pool of models), drawn every frame while the walk goes on.
// On a bicycle or a motorbike the rider sits in its frame, leaning and pitching with it, hands round the grips, feet on
// the pedals or the pegs, or a foot on the ground; a parked one stands on its kickstand, folded as its rider gets on. A
// car is drawn by its whole turn, on its springs or on its side; the helicopter tilted as it flies, its rotors turning
// with its rotor's speed, and the roofs it can land on marked "H".
import type { Theme } from "@citymap/themes";
import { PerspectiveCamera } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { Suspense, use, useEffect, useMemo, useRef } from "react";
import {
  CanvasTexture,
  Group,
  LinearFilter,
  Mesh as ThreeMesh,
  MeshBasicMaterial,
  PlaneGeometry,
  type Object3D,
} from "three";
import { Animator } from "../explore/models/animator";
import { NOT_RUNNING, SLOWEST_GAIT, gaitAt, runAfter, type Running } from "../explore/models/gait";
import { GLTF_MODELS, loadModel, type Loaded, type ModelFile } from "../explore/models/gltf";
import { standAfter } from "../explore/models/kickstand";
import { motionOf, paceOf } from "../explore/models/motion";
import { figure, paletteOf } from "../explore/models/procedural";
import { poseRun } from "../explore/models/run";
import { figureOf, placeVehicle, release, seat, slotOf, type Rolled, type Slot } from "../explore/models/seat";
import { poseStride, swingOf } from "../explore/models/stride";
import { assignPool } from "../explore/pool";
import { ROOFTOP_MOST } from "../explore/rooftops";
import { BASE, FLOOR } from "../explore/sight";
import { SIGN_POOL, middleOf, nearestLots, wallFacing, type Wall } from "../explore/signs";
import { METRE } from "../explore/street";
import { MODEL_KINDS, VEHICLES, VEHICLE_POOL, modelOf, nearestOf, type ModelKind } from "../explore/vehicles";
import { log, reasonOf } from "../log";
import { Buildings, Mesh } from "./CityMeshes";
import type { ExploreCanvasProps, ExploreFrame, Signage } from "./ExploreView";

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

/** A marked roof's "H" is this many metres across, a little over a hand's breadth above the roof. */
const HELIPAD_SIZE = 7;
const HELIPAD_ABOVE = 0.08;
/** The marking's texture, in pixels a side. */
const HELIPAD_PIXELS = 256;

/** A roof marking: an "H" in a ring, amber on a dark disc, as a helipad's, lying flat. */
function helipadMark(): ThreeMesh<PlaneGeometry, MeshBasicMaterial> {
  const canvas = document.createElement("canvas");
  canvas.width = HELIPAD_PIXELS;
  canvas.height = HELIPAD_PIXELS;
  const context = canvas.getContext("2d");
  const half = HELIPAD_PIXELS / 2;
  if (context) {
    context.fillStyle = "rgba(18, 20, 26, 0.6)";
    context.beginPath();
    context.arc(half, half, half - 4, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = "#f2b630";
    context.lineWidth = 14;
    context.beginPath();
    context.arc(half, half, half - 14, 0, Math.PI * 2);
    context.stroke();
    context.fillStyle = "#f2b630";
    context.font = `700 ${Math.round(HELIPAD_PIXELS * 0.55)}px ${getComputedStyle(document.body).fontFamily}`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("H", half, half + HELIPAD_PIXELS * 0.03);
  }
  const texture = new CanvasTexture(canvas);
  texture.minFilter = LinearFilter;
  const material = new MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false });
  const mesh = new ThreeMesh(new PlaneGeometry(1, 1).rotateX(-Math.PI / 2), material);
  mesh.visible = false;
  return mesh;
}

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
  helicopter: GLTF_MODELS.helicopter,
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
    helicopter: loading(FILES.helicopter),
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

/** What a slot is doing now: the group that places it, and the vehicle it shows (null: hidden). */
interface Showing {
  group: Object3D | null;
  id: string | null;
}

/** Whether motion is unwelcome: a kickstand then swings at once. */
const stillness = () =>
  typeof window.matchMedia !== "function" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The helicopter's shadow's texture this many pixels across: a soft disc, darkest in its middle. */
const SHADOW_PIXELS = 64;

/** The shadow: the group laid and turned each frame, and the material whose opacity says how dark. */
interface Shadow {
  readonly turned: Group;
  readonly material: MeshBasicMaterial;
}

/**
 * The helicopter's shadow: a soft ellipse as long and wide as its outline, lying flat, drawn over what lies under it
 * (never hidden in it), turned as the helicopter faces. No light casts it: it is the one cue to how high it flies.
 */
function shadowMesh(): Shadow {
  const canvas = document.createElement("canvas");
  canvas.width = SHADOW_PIXELS;
  canvas.height = SHADOW_PIXELS;
  const draw = canvas.getContext("2d");
  const half = SHADOW_PIXELS / 2;
  const fade = draw?.createRadialGradient(half, half, 0, half, half, half);
  fade?.addColorStop(0, "rgba(0, 0, 0, 1)");
  fade?.addColorStop(0.6, "rgba(0, 0, 0, 0.8)");
  fade?.addColorStop(1, "rgba(0, 0, 0, 0)");
  if (draw && fade) {
    draw.fillStyle = fade;
    draw.fillRect(0, 0, SHADOW_PIXELS, SHADOW_PIXELS);
  }
  const texture = new CanvasTexture(canvas);
  texture.minFilter = LinearFilter;
  const material = new MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false });
  material.polygonOffset = true;
  material.polygonOffsetFactor = -4;
  const flat = new ThreeMesh(new PlaneGeometry(VEHICLES.helicopter.length, VEHICLES.helicopter.width), material);
  flat.rotation.x = -Math.PI / 2;
  flat.renderOrder = 1;
  const turned = new Group();
  turned.add(flat);
  turned.visible = false;
  return { turned, material };
}

/** Lays the helicopter's shadow where the frame says, as dark as it says; hidden with none, or too high to see. */
function layShadow({ turned, material }: Shadow, frame: ExploreFrame) {
  const now = frame.shadow;
  turned.visible = now !== null && now.opacity > 0;
  if (!now) return;
  turned.position.set(now.at.x * METRE, now.at.y * METRE, now.at.z * METRE);
  turned.rotation.set(0, now.heading, 0);
  material.opacity = now.opacity;
}

/** The walker and the nearest vehicles, moved by each frame of the walk; the camera follows. */
function Walk({ theme, frame }: { readonly theme: Theme; readonly frame: ExploreCanvasProps["frame"] }) {
  const files = modelsNow();
  const loaded = use(files.person);
  const saloon = use(files.saloon);
  const pickup = use(files.pickup);
  const motorbikeFile = use(files.motorbike);
  const bicycleFile = use(files.bicycle);
  const helicopterFile = use(files.helicopter);
  const model = useMemo(() => loaded?.make() ?? figure(paletteOf(theme)), [loaded, theme]);
  const animator = useMemo(() => (loaded ? new Animator(model, loaded.clips) : null), [loaded, model]);
  const rider = useMemo(() => figureOf(model), [model]);
  const shadow = useMemo(() => shadowMesh(), []);
  // The pool: so many models of each kind, the PSX ones with their rigs, or the procedural stand-ins (with their own)
  // when a file could not load. Each is drawn inside a group that places and turns it, so its own pose stays its own.
  const slots = useMemo<Slot[]>(() => {
    const byKind: Readonly<Record<ModelKind, Loaded | null>> = {
      saloon,
      pickup,
      motorbike: motorbikeFile,
      bicycle: bicycleFile,
      helicopter: helicopterFile,
    };
    return MODEL_KINDS.flatMap((kind) =>
      Array.from({ length: VEHICLE_POOL[kind] }, () => slotOf(kind, byKind[kind], theme)),
    );
  }, [saloon, pickup, motorbikeFile, bicycleFile, helicopterFile, theme]);
  const showing = useRef<Showing[]>([]);
  const placed = useRef<Object3D>(null);
  const rolled = useRef<Rolled>(new Map());
  // How far down each two-wheeler's kickstand is (1 down): down while it stands parked, folded while ridden.
  const stands = useRef(new Map<string, number>());
  // Where the walker is in its run: its stride's phase and how far into the run it is drawn.
  const running = useRef<Running>(NOT_RUNNING);
  const since = useRef(POOL_EVERY);
  // The roof markings, one for each roof the walk may mark at once; freed with the walk.
  const marks = useMemo(() => Array.from({ length: ROOFTOP_MOST }, helipadMark), []);
  useEffect(
    () => () => {
      for (const mark of marks) {
        mark.geometry.dispose();
        mark.material.map?.dispose();
        mark.material.dispose();
      }
    },
    [marks],
  );
  useFrame((state, seconds) => {
    const walker = placed.current;
    if (!walker) return;
    const now = frame(seconds);
    const { body, speed, riding } = now.session;
    const byId = new Map(now.vehicles.map((v) => [v.id, v]));
    layShadow(shadow, now);
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
    const still = stillness();
    slots.forEach((slot, i) => {
      const { group, id } = shows[i]!;
      const vehicle = id === null ? undefined : byId.get(id);
      if (!group) return;
      if (!vehicle) {
        group.visible = false;
        return;
      }
      const parked = vehicle.id !== riding;
      const was = stands.current.get(vehicle.id) ?? (parked ? 1 : 0);
      const stand = standAfter(was, parked, seconds, still);
      // A stand set swinging the other way: down as its rider leaves it, folded as one gets on.
      if (slot.rig.kickstand && (parked ? was === 0 : was === 1) && stand !== was)
        log.info("explore/kickstand", { id: vehicle.id, to: parked ? "down" : "up", still: String(still) });
      stands.current.set(vehicle.id, stand);
      placeVehicle(slot, group, vehicle, rolled.current, stand);
    });
    const ridden = riding === null ? undefined : byId.get(riding);
    // In a car or the helicopter, the walker is inside, out of sight.
    walker.visible = ridden?.kind !== "car" && ridden?.kind !== "helicopter";
    walker.scale.setScalar(METRE);
    const at = shows.findIndex((s) => s.id === riding);
    const ridingGroup = shows[at]?.group;
    if ((ridden?.kind === "bicycle" || ridden?.kind === "motorbike") && ridingGroup) {
      const fallen = ridden.kind === "bicycle" ? ridden.cycle.fall : ridden.moto.fall;
      animator?.play(fallen ? "idle" : "drive", 1, seconds);
      seat(walker, rider, slots[at]!, ridingGroup, ridden);
    } else if (!ridden) {
      if (rider) release(rider);
      // Drawn between its last two steps, so it moves as smoothly as the frames come.
      const { feet, heading, walked } = now.shown;
      walker.position.set(feet.x * METRE, feet.y * METRE, feet.z * METRE);
      walker.rotation.order = "XYZ";
      walker.rotation.set(0, heading, 0);
      if (animator) {
        const motion = motionOf(speed, body.grounded, body.rise);
        animator.play(motion, paceOf(motion, speed), seconds);
        // At a run the gait sets the legs, arms and trunk over the clip, its feet planted as the walker covers ground.
        const how = motion === "sprint" ? "run" : motion === "jump" || motion === "fall" ? "air" : "ground";
        running.current = runAfter(running.current, how, speed, walked, seconds);
        if (rider) {
          walker.updateMatrixWorld(true);
          const { phase, weight } = running.current;
          poseRun(walker, rider, gaitAt(Math.max(SLOWEST_GAIT, speed)), phase, weight);
        }
      } else poseStride(walker, swingOf(walked, speed));
    }
    marks.forEach((mark, i) => {
      const roof = now.rooftops[i];
      mark.visible = roof !== undefined;
      if (!roof) return;
      mark.position.set(roof.at.x * METRE, (roof.at.y + HELIPAD_ABOVE) * METRE, roof.at.z * METRE);
      mark.scale.setScalar(HELIPAD_SIZE * METRE);
    });
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
      {marks.map((mark) => (
        <primitive key={mark.uuid} object={mark} />
      ))}
      <primitive object={shadow.turned} scale={METRE} />
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
