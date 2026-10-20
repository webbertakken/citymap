import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NodeIO, type Node } from "@gltf-transform/core";
import { EXTMeshoptCompression, EXTTextureWebP, KHRONOS_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";
import { Box3, Euler, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { readPublicModel } from "../../testing/models";
import { GLTF_MODELS, loadModel } from "./gltf";
import { RIGS } from "./rig";

// The committed helicopter as the walk poses it: each rotor turns about its own node, so that node must stand at the
// rotor's hub; and the file's nose, turned by its framing, must face the walk's ahead (+x).

const FILE = join(import.meta.dirname, "../../../public", GLTF_MODELS.helicopter.url);

async function helicopterFile() {
  await MeshoptDecoder.ready;
  const io = new NodeIO()
    .registerExtensions([...KHRONOS_EXTENSIONS, EXTTextureWebP, EXTMeshoptCompression])
    .registerDependencies({ "meshopt.decoder": MeshoptDecoder });
  return io.readBinary(new Uint8Array(readFileSync(FILE)));
}

/** A node's mesh's box in the file's frame, its node's (and its parent's) translation and scale applied. */
function boxOf(node: Node) {
  const min = new Vector3(Infinity, Infinity, Infinity);
  const max = new Vector3(-Infinity, -Infinity, -Infinity);
  const point = new Vector3();
  const [ox, oy, oz] = node.getTranslation();
  const [sx, sy, sz] = node.getScale();
  const [px, py, pz] = node.getParentNode()?.getTranslation() ?? [0, 0, 0];
  for (const primitive of node.getMesh()!.listPrimitives()) {
    const position = primitive.getAttribute("POSITION")!;
    const p = [0, 0, 0];
    for (let i = 0; i < position.getCount(); i++) {
      position.getElement(i, p);
      point.set(p[0]! * sx + ox + px, p[1]! * sy + oy + py, p[2]! * sz + oz + pz);
      min.min(point);
      max.max(point);
    }
  }
  return { min, max, middle: min.clone().add(max).multiplyScalar(0.5) };
}

/** A point in the file turned as its framing turns it, to face the walk's ahead. */
const framed = (v: Vector3) => v.clone().applyEuler(new Euler(0, GLTF_MODELS.helicopter.yaw, 0));

describe("the committed helicopter", () => {
  it("turns its main rotor about its hub, and its tail rotor about its own middle", async () => {
    const doc = await helicopterFile();
    const nodes = doc.getRoot().listNodes();
    const named = (name: string) => nodes.find((n) => n.getName() === name)!;
    const hub = boxOf(nodes.find((n) => n.getName().startsWith("moyeu_arbre"))!);
    const rotor = named(RIGS.helicopter.rotors.main);
    // The pivot carries no mesh of its own, so compression never moves it off the hub.
    expect(rotor.getMesh()).toBeNull();
    const [x, , z] = rotor.getTranslation();
    expect(x).toBeCloseTo(hub.middle.x, 2);
    expect(z).toBeCloseTo(hub.middle.z, 2);
    // Three blades about the hub: each reaches the rotor's radius from it, so the farthest tip is about one off.
    const blades = boxOf(rotor.listChildren()[0]!);
    const reach = Math.max(
      ...[blades.min, blades.max].flatMap((corner) => [Math.abs(corner.x - x), Math.abs(corner.z - z)]),
    );
    expect(reach).toBeGreaterThan(4.5);
    expect(reach).toBeLessThan(5.5);
    const tail = named(RIGS.helicopter.rotors.tail);
    expect(tail.getMesh()).toBeNull();
    const fin = boxOf(tail.listChildren()[0]!);
    const [tx, ty, tz] = tail.getTranslation();
    expect(tx).toBeCloseTo(fin.middle.x, 2);
    expect(ty).toBeCloseTo(fin.middle.y, 2);
    expect(tz).toBeCloseTo(fin.middle.z, 2);
  });

  it("faces the walk's ahead once framed: its nose at +x, its tail rotor behind, its hub ahead of its middle", async () => {
    const doc = await helicopterFile();
    const nodes = doc.getRoot().listNodes();
    const body = boxOf(nodes.find((n) => n.getName() === "helicopter_body")!);
    const hub = boxOf(nodes.find((n) => n.getName().startsWith("moyeu_arbre"))!);
    const tail = nodes.find((n) => n.getName() === RIGS.helicopter.rotors.tail)!.getTranslation();
    const middle = framed(body.middle);
    // The nose is the end of the body away from the tail rotor.
    const tailAt = framed(new Vector3(...tail));
    expect(tailAt.x).toBeLessThan(middle.x - 4);
    expect(Math.abs(tailAt.z - middle.z)).toBeLessThan(0.5);
    expect(framed(hub.middle).x - middle.x).toBeCloseTo(RIGS.helicopter.rotors.hub, 1);
  });
});

describe("the committed helicopter through the test reader", () => {
  it("loads as the walk loads it, its compressed geometry decoded", async () => {
    const loaded = await loadModel("", GLTF_MODELS.helicopter, readPublicModel);
    const body = loaded.make().getObjectByName("helicopter_body");
    expect(body).toBeDefined();
    const box = new Box3().setFromObject(loaded.make());
    expect(box.getSize(new Vector3()).x).toBeCloseTo(GLTF_MODELS.helicopter.metres, 1);
  });
});

/** Every vertex of a node's mesh's primitives in the file's frame (its node's translation and scale applied). */
function pointsOf(node: Node, which = 0) {
  const [ox, oy, oz] = node.getTranslation();
  const [sx, sy, sz] = node.getScale();
  const position = node.getMesh()!.listPrimitives()[which]!.getAttribute("POSITION")!;
  const p = [0, 0, 0];
  return Array.from({ length: position.getCount() }, () => new Vector3()).map((v, i) => {
    position.getElement(i, p);
    return v.set(p[0]! * sx + ox, p[1]! * sy + oy, p[2]! * sz + oz);
  });
}

describe("the committed helicopter's glass, lining and cockpit", () => {
  it("has its panes cut from the hull as glass of their own: blended, both sides, untextured", async () => {
    const doc = await helicopterFile();
    const glass = doc
      .getRoot()
      .listNodes()
      .find((n) => n.getName() === "helicopter_glass")!;
    expect(glass.getParentNode()).toBeNull();
    const [pane, ...more] = glass.getMesh()!.listPrimitives();
    expect(more).toHaveLength(0);
    const triangles = pane!.getIndices()!.getCount() / 3;
    expect(triangles).toBeGreaterThan(250);
    expect(triangles).toBeLessThan(350);
    expect(pane!.getAttribute("TEXCOORD_0")).toBeNull();
    const material = pane!.getMaterial()!;
    expect(material.getName()).toBe("helicopter_glass");
    expect(material.getAlphaMode()).toBe("BLEND");
    expect(material.getDoubleSided()).toBe(true);
    expect(material.getBaseColorTexture()).toBeNull();
    expect(material.getAlpha()).toBeGreaterThan(0.2);
    expect(material.getAlpha()).toBeLessThan(0.5);
  });

  it("paints its hull on one side and lines it inside, dark, on the same triangles turned in", async () => {
    const doc = await helicopterFile();
    const body = doc
      .getRoot()
      .listNodes()
      .find((n) => n.getName() === "helicopter_body")!;
    const [paint, lining, ...more] = body.getMesh()!.listPrimitives();
    expect(more).toHaveLength(0);
    expect(paint!.getMaterial()!.getName()).toBe("helicopter_paint");
    expect(paint!.getMaterial()!.getDoubleSided()).toBe(false);
    expect(paint!.getMaterial()!.getBaseColorTexture()).not.toBeNull();
    expect(lining!.getMaterial()!.getName()).toBe("helicopter_lining");
    expect(lining!.getMaterial()!.getDoubleSided()).toBe(false);
    expect(lining!.getMaterial()!.getAlphaMode()).toBe("OPAQUE");
    expect(Math.max(...lining!.getMaterial()!.getBaseColorFactor().slice(0, 3))).toBeLessThan(0.1);
    expect(lining!.getIndices()!.getCount()).toBe(paint!.getIndices()!.getCount());
    // Facing out, the paint's normals lean away from the hull's middle; the lining's towards it.
    const outward = (which: number) => {
      const points = pointsOf(body, which);
      const middle = points.reduce((sum, p) => sum.add(p), new Vector3()).divideScalar(points.length);
      const normals = body.getMesh()!.listPrimitives()[which]!.getAttribute("NORMAL")!;
      const n = [0, 0, 0];
      return points.reduce((sum, p, i) => {
        normals.getElement(i, n);
        return sum + Math.sign(new Vector3(n[0], n[1], n[2]).dot(p.clone().sub(middle)));
      }, 0);
    };
    expect(outward(0)).toBeGreaterThan(0);
    expect(outward(1)).toBeLessThan(0);
  });

  it("marks the pilot's seat, cyclic, collective and pedals inside the cabin, on its right", async () => {
    const doc = await helicopterFile();
    const nodes = doc.getRoot().listNodes();
    const at = (name: string) => {
      const node = nodes.find((n) => n.getName() === name)!;
      expect(node.getMesh()).toBeNull();
      return new Vector3(...node.getTranslation());
    };
    const pilot = RIGS.helicopter.pilot;
    const [seat, cyclic, collective, left, right] = [
      pilot.seat,
      pilot.cyclic,
      pilot.collective,
      pilot.pedals.left,
      pilot.pedals.right,
    ].map(at);
    const glass = boxOf(nodes.find((n) => n.getName() === "helicopter_glass")!);
    const body = boxOf(nodes.find((n) => n.getName() === "helicopter_body")!);
    for (const contact of [seat, cyclic, collective, left, right]) {
      // Within the glazed cabin's length and width, above the belly, below the roof.
      expect(contact!.z).toBeGreaterThan(glass.min.z);
      expect(contact!.z).toBeLessThan(glass.max.z);
      expect(Math.abs(contact!.x - body.middle.x)).toBeLessThan(glass.max.x - body.middle.x);
      expect(contact!.y).toBeGreaterThan(body.min.y);
      expect(contact!.y).toBeLessThan(glass.max.y);
    }
    // Ahead is −z in the file, the pilot's right +x.
    expect(seat!.x).toBeGreaterThan(body.middle.x + 0.2);
    expect(cyclic!.z).toBeLessThan(seat!.z);
    expect(collective!.x).toBeLessThan(seat!.x);
    expect(left!.z).toBeLessThan(cyclic!.z);
    expect(left!.x).toBeLessThan(right!.x);
  });
});
