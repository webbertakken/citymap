import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
// Fetches the glTF models the model lab compares against the procedural ones, into public/lab/models (gitignored).
// Usage: bun scripts/fetch-lab-models.ts
// Kenney's packs are CC0; the poly.pizza bicycle and motorbike are CC-BY 3.0 (Poly by Google) and are credited in
// public/lab/models/CREDITS.md, which this script writes.
import { $ } from "bun";

const out = resolve(import.meta.dirname, "../public/lab/models");

interface Pack {
  readonly folder: string;
  readonly zip: string;
  readonly files: readonly string[];
}

const PACKS: readonly Pack[] = [
  {
    folder: "kenney-cars",
    zip: "https://kenney.nl/media/pages/assets/car-kit/1a312ec241-1775131960/kenney_car-kit.zip",
    files: ["sedan.glb", "hatchback-sports.glb", "taxi.glb"],
  },
  {
    folder: "kenney-people",
    zip: "https://kenney.nl/media/pages/assets/mini-characters/bfc7e272b4-1774770718/kenney_mini-characters.zip",
    files: ["character-male-a.glb", "character-female-b.glb"],
  },
];

const SINGLES = [
  {
    file: "bicycle.glb",
    url: "https://static.poly.pizza/6048701b-fa87-426b-9242-c786ca25fa3a.glb",
    credit: "Bicycle by Poly by Google, CC-BY 3.0, https://poly.pizza/m/19VoUuA2pcN",
  },
  {
    file: "motorbike.glb",
    url: "https://static.poly.pizza/f7635710-7cfa-4768-ad70-8366ab485358.glb",
    credit: "Motorcycle by Poly by Google, CC-BY 3.0, https://poly.pizza/m/dse64pqMKAR",
  },
  {
    file: "helicopter.glb",
    url: "https://static.poly.pizza/e3dfeb10-5525-4a39-83d8-13a709aaca4b.glb",
    credit: "Helicopter by kazuma, CC0 1.0, https://poly.pizza/m/EQJ2MECUbx",
  },
] as const;

async function download(url: string, to: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`lab-models/download-failed ${url} status=${response.status}`);
  await Bun.write(to, response);
  console.log(`[lab-models] fetched ${to}`);
}

/** One pack: its zip unpacked in the scratch folder, and the models it names copied out with their texture. */
async function unpack(pack: Pack, scratch: string) {
  const zip = join(scratch, `${pack.folder}.zip`);
  await download(pack.zip, zip);
  await $`unzip -qo ${zip} -d ${join(scratch, pack.folder)}`;
  const from = join(scratch, pack.folder, "Models", "GLB format");
  await mkdir(join(out, pack.folder, "Textures"), { recursive: true });
  await Promise.all(
    [...pack.files, "Textures/colormap.png"].map((file) =>
      Bun.write(join(out, pack.folder, file), Bun.file(join(from, file))),
    ),
  );
  console.log(`[lab-models] unpacked ${pack.folder}: ${pack.files.length} models`);
}

await mkdir(out, { recursive: true });
const scratch = await mkdtemp(join(tmpdir(), "citymap-lab-"));
try {
  await Promise.all([
    ...PACKS.map((pack) => unpack(pack, scratch)),
    ...SINGLES.map((single) => download(single.url, join(out, single.file))),
  ]);
  await Bun.write(
    join(out, "CREDITS.md"),
    [
      "# Model credits",
      "",
      "- Car Kit and Mini Characters by Kenney (www.kenney.nl), CC0 1.0",
      ...SINGLES.map((s) => `- ${s.credit}`),
      "",
    ].join("\n"),
  );
} finally {
  await rm(scratch, { recursive: true, force: true });
}
