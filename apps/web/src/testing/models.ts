// The walk's own model files for tests, read from public/models as the browser reads them, less their textures (which
// jsdom cannot decode): their nodes, meshes, skeletons and clips are what the tests measure.
import { join } from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { EXTTextureWebP, KHRONOS_EXTENSIONS } from "@gltf-transform/extensions";
import { prune } from "@gltf-transform/functions";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { GltfFile, ReadGltf } from "../explore/models/gltf";

const PUBLIC = join(import.meta.dirname, "../../public");
const io = new NodeIO().registerExtensions([...KHRONOS_EXTENSIONS, EXTTextureWebP]);
const read = new Map<string, Promise<GltfFile>>();

async function bare(url: string): Promise<GltfFile> {
  const doc = await io.read(join(PUBLIC, url.replace(/^\//, "")));
  for (const texture of doc.getRoot().listTextures()) texture.dispose();
  await doc.transform(prune({ keepLeaves: true }));
  const glb = await io.writeBinary(doc);
  const buffer = glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength);
  return new Promise((done, fail) => new GLTFLoader().parse(buffer, "", done, fail));
}

/** Reads a model file under public, by its URL as `loadModel` asks for it (the base empty), once a test run. */
export const readPublicModel: ReadGltf = (url) => {
  const once = read.get(url) ?? bare(url);
  read.set(url, once);
  return once;
};
