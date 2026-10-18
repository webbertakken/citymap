"use client";
// The city as three.js meshes: each flat layer merged into one mesh, and every lot's building in one more, its look
// read from the lot table. Shared by the map's orthographic canvas and the ground-level views.
import {
  DATA_COLUMNS,
  FLOOR_HEIGHT,
  LOTS_BASE,
  LOT_FLOATS,
  LOT_HEIGHT,
  WINDOW_LIT,
  WINDOW_PITCH,
  windowUnknown,
  type Buildings as BuildingsData,
  type Layer,
} from "@citymap/scene";
import type { Theme } from "@citymap/themes";
import { useEffect, useMemo } from "react";
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DataTexture,
  DoubleSide,
  FloatType,
  FrontSide,
  GLSL3,
  NearestFilter,
  RGBAFormat,
  ShaderMaterial,
} from "three";
import type { Mode } from "../view/view";

/** One layer as one mesh: merged geometry with vertex colours, no lighting (the colours carry the light). */
export function Mesh({ layer }: { readonly layer: Layer }) {
  const geometry = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(layer.positions, 3));
    g.setAttribute("color", new BufferAttribute(layer.colours, 3));
    g.setIndex(new BufferAttribute(layer.indices, 1));
    return g;
  }, [layer]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry}>
      <meshBasicMaterial vertexColors side={DoubleSide} />
    </mesh>
  );
}

/** A wall's ends are darkened this far in, in street widths, so buildings of one height in a row read apart. */
const SEAM = 0.03;
/** A roof of unknown size is hatched in stripes this wide, in street widths. */
const HATCH = 0.2;

// Each vertex reads its lot's texel: its height is a plinth's in plan view, its floors' in the Buildings view.
const VERTEX = /* glsl */ `
uniform sampler2D uTable;
uniform float uBuildings;
in float lot;
in vec2 facade;
out vec3 vColour;
out vec3 vWorld;
out vec2 vFacade;
out float vLength;
out float vLit;
out float vFlags;
out float vFloors;
void main() {
  int i = int(lot + 0.5);
  vec4 d = texelFetch(uTable, ivec2(i % ${DATA_COLUMNS}, i / ${DATA_COLUMNS}), 0);
  float height = mix(${LOT_HEIGHT.toFixed(4)}, d.r * ${FLOOR_HEIGHT.toFixed(4)}, uBuildings);
  float c = d.b;
  vColour = vec3(floor(c / 65536.0), mod(floor(c / 256.0), 256.0), mod(c, 256.0)) / 255.0;
  vec3 p = vec3(position.x, ${LOTS_BASE.toFixed(4)} + position.y * height, position.z);
  vWorld = p;
  vFacade = vec2(facade.x, position.y * height / ${FLOOR_HEIGHT.toFixed(4)});
  vLength = facade.y;
  vLit = d.g;
  vFlags = d.a;
  vFloors = d.r;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;

// Roofs are the lot's colour (hatched when its size is not known); walls are shaded by their facing, and in the
// Buildings view carry floors of windows, lit by the Bresenham rule so a share s lights s of them, evenly spread.
const FRAGMENT = /* glsl */ `
uniform float uBuildings;
uniform vec3 uLit;
uniform vec3 uUnknown;
in vec3 vColour;
in vec3 vWorld;
in vec2 vFacade;
in float vLength;
in float vLit;
in float vFlags;
in float vFloors;
out vec4 fragColour;
void main() {
  vec3 colour = vColour;
  if (vLength < 0.0) {
    if (uBuildings > 0.5 && mod(vFlags, 2.0) >= 1.0 && fract((vWorld.x + vWorld.z) / ${(2 * HATCH).toFixed(4)}) < 0.5)
      colour *= 0.7;
    fragColour = vec4(colour, 1.0);
    return;
  }
  vec3 normal = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  if (dot(normal, cameraPosition - vWorld) < 0.0) normal = -normal;
  vec2 facing = normalize(normal.xz + vec2(1e-6));
  colour *= 0.72 + 0.23 * (0.5 + 0.5 * dot(facing, normalize(vec2(-1.0, -1.0))));
  if (vFacade.x < ${SEAM.toFixed(4)} || vFacade.x > vLength - ${SEAM.toFixed(4)}) colour *= 0.6;
  if (uBuildings > 0.5) {
    float row = floor(vFacade.y);
    float columns = max(1.0, floor(vLength / ${WINDOW_PITCH.toFixed(4)}));
    float across = vFacade.x / (vLength / columns);
    float column = min(columns - 1.0, floor(across));
    float up = fract(vFacade.y);
    float side = fract(across);
    if (row < vFloors && up > 0.3 && up < 0.8 && side > 0.25 && side < 0.75) {
      if (vLit < 0.0) colour = uUnknown;
      else {
        float k = row * columns + column;
        bool lit = floor((k + 1.0) * vLit + 1e-4) > floor(k * vLit + 1e-4);
        colour = lit ? uLit : vColour * 0.4;
      }
    }
  }
  fragColour = vec4(colour, 1.0);
}`;

/** Every lot's building in one mesh, its look from the lot table: plinths in plan view, standing in the Buildings view. */
export function Buildings({
  buildings,
  table,
  mode,
  theme,
}: {
  readonly buildings: BuildingsData;
  readonly table: Float32Array;
  readonly mode: Mode;
  readonly theme: Theme;
}) {
  // Two geometries over the same vertices: every face for the Buildings view, the roofs alone for plan view, where no
  // wall shows; the vertices are uploaded once and shared.
  const geometries = useMemo(() => {
    const attributes = {
      position: new BufferAttribute(buildings.positions, 3),
      lot: new BufferAttribute(buildings.lots, 1),
      facade: new BufferAttribute(buildings.facades, 2),
    };
    const over = (indices: Uint32Array) => {
      const g = new BufferGeometry();
      for (const [name, attribute] of Object.entries(attributes)) g.setAttribute(name, attribute);
      g.setIndex(new BufferAttribute(indices, 1));
      return g;
    };
    return { buildings: over(buildings.indices), plan: over(buildings.indices.subarray(0, buildings.roofIndices)) };
  }, [buildings]);
  useEffect(
    () => () => {
      geometries.buildings.dispose();
      geometries.plan.dispose();
    },
    [geometries],
  );
  const texture = useMemo(() => {
    const rows = table.length / (DATA_COLUMNS * LOT_FLOATS);
    const t = new DataTexture(table, DATA_COLUMNS, rows, RGBAFormat, FloatType);
    t.minFilter = NearestFilter;
    t.magFilter = NearestFilter;
    t.needsUpdate = true;
    return t;
  }, [table]);
  useEffect(() => () => texture.dispose(), [texture]);
  // A material per look: the shader's program is compiled once and shared, as its code never changes.
  const material = useMemo(
    () =>
      new ShaderMaterial({
        glslVersion: GLSL3,
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        // Every face is wound outwards, so a wall facing away is never drawn.
        side: FrontSide,
        uniforms: {
          uTable: { value: texture },
          uBuildings: { value: mode === "buildings" ? 1 : 0 },
          uLit: { value: new Color(WINDOW_LIT) },
          uUnknown: { value: new Color(windowUnknown(theme)) },
        },
      }),
    [texture, mode, theme],
  );
  useEffect(() => () => material.dispose(), [material]);
  // Heights come from the texture, so the geometry's own bounds say nothing of them: never culled.
  return <mesh geometry={geometries[mode]} material={material} frustumCulled={false} />;
}
