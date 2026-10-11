import { parseArgs } from "node:util";
import { CitymapError } from "@citymap/ground-plan";
import { THEME_NAMES, type Camera } from "@citymap/svg";

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
  --no-warp           draw the plan without its organic warp
  --verbose           log every plan decision
  --help              show this help`;

const usage = (message: string): never => {
  throw new CitymapError("cli/usage", message);
};

function oneOf<T extends string>(name: string, value: string, options: readonly T[]): T {
  const found = options.find((option) => option === value);
  return found ?? usage(`--${name} is one of ${options.join(", ")}, not ${value}`);
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
      help: { type: "boolean", default: false },
    },
  });
}
