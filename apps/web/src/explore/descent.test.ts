import type { Walls } from "@citymap/world";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Step } from "../load/step";
import { ARCADE_WORDS, descent, type Descending } from "./descent";
import type { Garage } from "./physics/garage";

const walls = (): Walls & { disposed: boolean } => {
  const made = {
    disposed: false,
    move: () => ({ feet: { x: 0, y: 0, z: 0 }, grounded: true }),
    clearance: () => 0,
    dispose: () => {
      made.disposed = true;
    },
  };
  return made;
};
const garage = (): Garage => ({
  follow: () => ({ standing: 0, waiting: 0, nearest: Infinity }),
  walls: { move: (feet) => ({ feet, grounded: true }), clearance: () => 0, dispose: () => undefined },
  drive: (vehicles) => vehicles,
  keepingUp: () => true,
  load: () => 0,
  dispose: () => undefined,
});

/** Going down with stand-ins, every step heard. */
function goingDown(overrides: Partial<Descending> = {}) {
  const steps: Step[] = [];
  const made = walls();
  const how: Descending = {
    loadEngine: () => Promise.resolve(),
    loadModels: async (onCount) => {
      onCount(0, 2);
      onCount(2, 2);
    },
    raise: async (_footprints, { onStep }) => {
      onStep?.({ phase: "walls", done: 1, of: 1 });
      return made;
    },
    openGarage: async (_footprints, { onStep }) => {
      onStep?.({ phase: "streets", done: 3, of: 3 });
      return garage();
    },
    ...overrides,
  };
  return { steps, made, go: descent(how), onStep: (step: Step) => steps.push(step) };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("going down into the city", () => {
  it("loads the engine, the models, the walls and the nearby streets, in that order, each said", async () => {
    const { steps, go, onStep, made } = goingDown();
    const down = await go([], { x: 1, z: 2 }, { onStep });
    expect(steps.map((s) => s.phase)).toEqual(["engine", "models", "models", "walls", "streets"]);
    expect(steps[2]).toEqual({ phase: "models", done: 2, of: 2 });
    expect(down.walls).toBe(made);
    expect(down.garage).not.toBeNull();
    expect(down.arcade).toBeNull();
  });

  it("opens the garage at the landing, with the measuring traffic asked for", async () => {
    const openGarage = vi.fn<Descending["openGarage"]>(async () => garage());
    const { go } = goingDown({ openGarage, traffic: 20 });
    await go([], { x: 1, z: 2 }, {});
    expect(openGarage.mock.calls[0]![1]).toMatchObject({ at: { x: 1, z: 2 }, traffic: 20 });
  });

  it("goes down all the same when the engine does not load, its cars arcade cars, and says why", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const openGarage = vi.fn<Descending["openGarage"]>();
    const { go } = goingDown({ loadEngine: () => Promise.reject(new Error("no WebAssembly")), openGarage });
    const down = await go([], { x: 0, z: 0 }, {});
    expect(down).toMatchObject({ garage: null, arcade: "engine" });
    expect(openGarage).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith('explore/arcade reason=engine detail="Error: no WebAssembly"');
  });

  it("drives arcade cars when the garage cannot open", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { go } = goingDown({ openGarage: () => Promise.reject(new Error("out of memory")) });
    expect(await go([], { x: 0, z: 0 }, {})).toMatchObject({ garage: null, arcade: "engine" });
    expect(error).toHaveBeenCalledWith('explore/arcade reason=engine detail="Error: out of memory"');
  });

  it("stops when cancelled, freeing the walls it raised", async () => {
    const cancel = new AbortController();
    const { go, made } = goingDown({
      openGarage: () => {
        cancel.abort();
        return Promise.reject(new Error("aborted"));
      },
    });
    await expect(go([], { x: 0, z: 0 }, { signal: cancel.signal })).rejects.toThrow("aborted");
    expect(made.disposed).toBe(true);
  });

  it("stops before the models or the walls when cancelled early", async () => {
    const cancel = new AbortController();
    const raise = vi.fn<Descending["raise"]>();
    const { go } = goingDown({
      loadEngine: async () => cancel.abort(),
      raise,
    });
    await expect(go([], { x: 0, z: 0 }, { signal: cancel.signal })).rejects.toThrow(/abort/i);
    expect(raise).not.toHaveBeenCalled();
    const later = new AbortController();
    const { go: goLater } = goingDown({ loadModels: async () => later.abort(), raise });
    await expect(goLater([], { x: 0, z: 0 }, { signal: later.signal })).rejects.toThrow(/abort/i);
    expect(raise).not.toHaveBeenCalled();
  });

  it("says why cars drive simply, in a sentence each", () => {
    expect(ARCADE_WORDS.engine).toBe("Cars drive simply here: the physics engine did not load.");
    expect(ARCADE_WORDS.slow).toBe("Cars drive simply here: this device could not keep up.");
  });
});
