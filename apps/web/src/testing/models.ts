// The walk's own model files for tests, read from public/models as the browser reads them, less their textures (which
// jsdom cannot decode): their nodes, meshes, skeletons and clips are what the tests measure. A file compressed by
// meshopt (the helicopter) is decoded and handed on uncompressed, its quantised geometry kept as three.js reads it.
import { join } from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { EXTMeshoptCompression, EXTTextureWebP, KHRONOS_EXTENSIONS } from "@gltf-transform/extensions";
import { prune } from "@gltf-transform/functions";
import { MeshoptDecoder } from "meshoptimizer";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { GltfFile, ReadGltf } from "../explore/models/gltf";

const PUBLIC = join(import.meta.dirname, "../../public");
const read = new Map<string, Promise<GltfFile>>();

async function bare(url: string): Promise<GltfFile> {
  await MeshoptDecoder.ready;
  const io = new NodeIO()
    .registerExtensions([...KHRONOS_EXTENSIONS, EXTTextureWebP, EXTMeshoptCompression])
    .registerDependencies({ "meshopt.decoder": MeshoptDecoder });
  const doc = await io.read(join(PUBLIC, url.replace(/^\//, "")));
  for (const texture of doc.getRoot().listTextures()) texture.dispose();
  // Decoded on reading; written back plainly, as there is no encoder here.
  for (const extension of doc.getRoot().listExtensionsUsed())
    if (extension.extensionName === EXTMeshoptCompression.EXTENSION_NAME) extension.dispose();
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
