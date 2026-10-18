import { parseArgs } from "node:util";
import {
  CitymapError,
  DEFAULT_SEPARATIONS,
  SEPARATIONS,
  TOGGLES,
  isSeparation,
  isToggle,
  separationList,
  toggleList,
  type Separation,
  type Toggle,
} from "@citymap/ground-plan";
import type { Camera } from "@citymap/svg";
import { THEME_NAMES } from "@citymap/themes";

export interface LayCommand {
  readonly kind: "lay";
  readonly repo: string;
  readonly to: string;
  readonly out: string | null;
  readonly svg: string | null;
  readonly theme: (typeof THEME_NAMES)[number];
  readonly camera: Camera;
  readonly lock: boolean;
  readonly verbose: boolean;
  readonly tests: boolean;
  readonly densityPct: number;
  readonly jog: "off" | "top-level" | "all";
  readonly warp: boolean;
  readonly loops: boolean;
  readonly voronoi: boolean;
  /** Fold the history (true), or lay the tree at `to` once, as if every file arrived together (false). */
  readonly history: boolean;
  /** The separations on: kinds of folder whose members each become a town, in their own order. */
  readonly separate: readonly Separation[];
  /** The archetype toggles on, in their own order. */
  readonly toggles: readonly Toggle[];
  /** Write the measures section beside the layout. */
  readonly measures: boolean;
  /** Coverage reports to read instead of those at the usual paths. */
  readonly coverage: readonly string[];
}

export type Command = LayCommand | { readonly kind: "help" };

export const USAGE = `Usage: citymap <repository> [options]

Folds the repository's first-parent history into its ground plan and writes the city.

  --to=<ref>          commit to lay (default HEAD)
  --out=<file>        write the city as JSON
  --svg=<file>        write the city as SVG
  --theme=<name>      ${THEME_NAMES.join(", ")} (default paper-atlas)
  --camera=<view>     plan or dimetric (default plan)
  --lock              write citymap.lock.json at the repository root, and resume from it next time
  --tests             give tests land (the land dimension; default: tests and fixtures take none)
  --density=<pct>     share of land covered by lots, 20 to 80 (default 50)
  --jog=<cuts>        off, top-level or all (default top-level)
  --separate=<kinds>  kinds of folder whose members each become a town, comma-separated: ${SEPARATIONS.slice(0, 5).join(", ")},
                      ${SEPARATIONS.slice(5).join(", ")}
                      (default ${DEFAULT_SEPARATIONS.join(",")}; --separate= lays none apart)
  --toggles=<forms>   archetype toggles on, comma-separated: corridor, archipelago, quarters, tiers
                      (default corridor,tiers; --toggles= turns all off)
  --no-warp           draw the plan without its organic warp
  --no-loops          leave dead ends unjoined (default: nearby dead ends are joined by lanes)
  --no-history        lay the tree at --to once, every file at once, without folding its history (no --lock)
  --coverage=<file>   a coverage report (LCOV, Istanbul JSON, Cobertura or JaCoCo) to read instead of the usual
                      paths; repeat it for several
  --no-measures       write the city without its measures (size, tested, history)
  --voronoi           fill each folder's region, the land nearer its lots than any other's, in the SVG
  --verbose           log every plan decision
  --help              show this help`;

const usage = (message: string): never => {
  throw new CitymapError("cli/usage", message);
};

function oneOf<T extends string>(name: string, value: string, options: readonly T[]): T {
  const found = options.find((option) => option === value);
  return found ?? usage(`--${name} is one of ${options.join(", ")}, not ${value}`);
}

/** The toggles a comma-separated list names, each one known. */
function togglesOf(text: string): Toggle[] {
  const names = text.split(",").filter((name) => name !== "");
  const unknown = names.find((name) => !isToggle(name));
  if (unknown !== undefined)
    usage(`--toggles takes ${TOGGLES.slice(0, -1).join(", ")} and ${TOGGLES.at(-1)}, not ${unknown}`);
  return toggleList(names.filter(isToggle));
}

/** The separations a comma-separated list names, each one known. */
function separationsOf(text: string): Separation[] {
  const names = text.split(",").filter((name) => name !== "");
  const unknown = names.find((name) => !isSeparation(name));
  if (unknown !== undefined)
    usage(`--separate takes ${SEPARATIONS.slice(0, -1).join(", ")} and ${SEPARATIONS.at(-1)}, not ${unknown}`);
  return separationList(names.filter(isSeparation));
}

/** The command a command line asks for, or a named rejection. */
export function parseCommandLine(argv: readonly string[]): Command {
  let parsed: ReturnType<typeof parse>;
  try {
    parsed = parse(argv);
  } catch (error) {
    return usage(String(error));
  }
  const { values, positionals } = parsed;
  if (values.help) return { kind: "help" };
  if (positionals.length !== 1) return usage("name one repository");
  if (values["no-history"] && values.lock) return usage("--lock folds history; it cannot go with --no-history");
  if (values["no-measures"] && values.coverage.length > 0)
    return usage("--coverage is read for the measures; it cannot go with --no-measures");
  const density = Number(values.density);
  if (!Number.isInteger(density) || density < 20 || density > 80)
    usage(`--density is an integer from 20 to 80, not ${values.density}`);
  return {
    kind: "lay",
    repo: positionals[0]!,
    to: values.to,
    out: values.out ?? null,
    svg: values.svg ?? null,
    theme: oneOf("theme", values.theme, THEME_NAMES),
    camera: oneOf("camera", values.camera, ["plan", "dimetric"] as const),
    lock: values.lock,
    verbose: values.verbose,
    tests: values.tests,
    densityPct: density,
    jog: oneOf("jog", values.jog, ["off", "top-level", "all"] as const),
    warp: !values["no-warp"],
    loops: !values["no-loops"],
    voronoi: values.voronoi,
    history: !values["no-history"],
    separate: separationsOf(values.separate),
    toggles: togglesOf(values.toggles),
    measures: !values["no-measures"],
    coverage: values.coverage,
  };
}

function parse(argv: readonly string[]) {
  return parseArgs({
    args: [...argv],
    allowPositionals: true,
    strict: true,
    options: {
      to: { type: "string", default: "HEAD" },
      out: { type: "string" },
      svg: { type: "string" },
      theme: { type: "string", default: "paper-atlas" },
      camera: { type: "string", default: "plan" },
      lock: { type: "boolean", default: false },
      verbose: { type: "boolean", default: false },
      tests: { type: "boolean", default: false },
      density: { type: "string", default: "50" },
      jog: { type: "string", default: "top-level" },
      "no-warp": { type: "boolean", default: false },
      "no-loops": { type: "boolean", default: false },
      voronoi: { type: "boolean", default: false },
      "no-history": { type: "boolean", default: false },
      separate: { type: "string", default: DEFAULT_SEPARATIONS.join(",") },
      toggles: { type: "string", default: "corridor,tiers" },
      coverage: { type: "string", multiple: true, default: [] },
      "no-measures": { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
  });
}
