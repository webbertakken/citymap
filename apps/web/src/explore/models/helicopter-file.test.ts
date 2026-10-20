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
