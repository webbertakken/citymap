import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
// Fetches the glTF models: the people and vehicles the walk uses into public/models (committed, with their credits), and the
// vehicles the model lab compares into public/lab/models (gitignored), until each vehicle's phase brings it into the app.
// Usage: bun scripts/fetch-models.ts
// Kenney's packs are CC0; the poly.pizza bicycle and motorbike are CC-BY 3.0 (Poly by Google), credited beside them.
import { $ } from "bun";

const publicDir = resolve(import.meta.dirname, "../public");

/** A Kenney pack: its zip, the models taken from it, and the folder under public they go to. */
interface Pack {
  readonly to: string;
  readonly zip: string;
  readonly files: readonly string[];
  readonly credit: string;
}

const PACKS: readonly Pack[] = [
  {
    to: "models/people",
    zip: "https://kenney.nl/media/pages/assets/mini-characters/bfc7e272b4-1774770718/kenney_mini-characters.zip",
    files: ["character-male-a.glb", "character-female-b.glb"],
    credit: "Mini Characters by Kenney (www.kenney.nl), CC0 1.0, https://kenney.nl/assets/mini-characters",
  },
  {
    to: "models/cars",
    zip: "https://kenney.nl/media/pages/assets/car-kit/1a312ec241-1775131960/kenney_car-kit.zip",
    files: ["sedan.glb"],
    credit: "Car Kit by Kenney (www.kenney.nl), CC0 1.0, https://kenney.nl/assets/car-kit",
  },
  {
    to: "lab/models/kenney-cars",
    zip: "https://kenney.nl/media/pages/assets/car-kit/1a312ec241-1775131960/kenney_car-kit.zip",
    files: ["sedan.glb", "hatchback-sports.glb", "taxi.glb"],
    credit: "Car Kit by Kenney (www.kenney.nl), CC0 1.0, https://kenney.nl/assets/car-kit",
  },
];

const SINGLES = [
  {
    to: "lab/models/bicycle.glb",
    url: "https://static.poly.pizza/6048701b-fa87-426b-9242-c786ca25fa3a.glb",
    credit: "Bicycle by Poly by Google, CC-BY 3.0, https://poly.pizza/m/19VoUuA2pcN",
  },
  {
    to: "lab/models/motorbike.glb",
    url: "https://static.poly.pizza/f7635710-7cfa-4768-ad70-8366ab485358.glb",
    credit: "Motorcycle by Poly by Google, CC-BY 3.0, https://poly.pizza/m/dse64pqMKAR",
  },
  {
    to: "lab/models/helicopter.glb",
    url: "https://static.poly.pizza/e3dfeb10-5525-4a39-83d8-13a709aaca4b.glb",
    credit: "Helicopter by kazuma, CC0 1.0, https://poly.pizza/m/EQJ2MECUbx",
  },
] as const;

async function download(url: string, to: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`models/download-failed ${url} status=${response.status}`);
  await Bun.write(to, response);
  console.log(`[models] fetched ${to}`);
}

/** One pack: its zip unpacked in the scratch folder, and the models it names copied out with their texture. */
async function unpack(pack: Pack, scratch: string) {
  const name = pack.to.replaceAll("/", "-");
  const zip = join(scratch, `${name}.zip`);
  await download(pack.zip, zip);
  await $`unzip -qo ${zip} -d ${join(scratch, name)}`;
  const from = join(scratch, name, "Models", "GLB format");
  await mkdir(join(publicDir, pack.to, "Textures"), { recursive: true });
  await Promise.all(
    [...pack.files, "Textures/colormap.png"].map((file) =>
      Bun.write(join(publicDir, pack.to, file), Bun.file(join(from, file))),
    ),
  );
  console.log(`[models] unpacked ${pack.to}: ${pack.files.length} models`);
}

/** Each folder's credits, beside its models: what they are, who made them, and their licence. */
const credits = (folder: string) =>
  [
    "# Model credits",
    "",
    ...[...PACKS, ...SINGLES].filter((m) => m.to.startsWith(folder)).map((m) => `- ${m.credit}`),
    "",
  ].join("\n");

const scratch = await mkdtemp(join(tmpdir(), "citymap-models-"));
try {
  await Promise.all([
    ...PACKS.map((pack) => unpack(pack, scratch)),
    ...SINGLES.map((single) => download(single.url, join(publicDir, single.to))),
  ]);
  await Promise.all([
    Bun.write(join(publicDir, "models/CREDITS.md"), credits("models/")),
    Bun.write(join(publicDir, "lab/models/CREDITS.md"), credits("lab/models/")),
  ]);
} finally {
  await rm(scratch, { recursive: true, force: true });
}
