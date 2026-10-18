import { beforeEach, describe, expect, it, vi } from "vitest";
import { city as cityNamed, twin } from "../components/testing/fixtures";
import { drain, hearing, herePort } from "./port";
import { cityWork, opening, type Answer, type Task } from "./work";

const work = cityWork({ city: twin, measures: null });
const look = { ask: "look", theme: "dracula", colourBy: "folder", first: null } as const;
const named = (answer: Answer) =>
  answer.kind === "scene" ? `scene ${answer.theme} ${answer.town ?? ""}` : `table ${answer.theme} ${answer.colourBy}`;

let info: ReturnType<typeof vi.spyOn>;
let error: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  info = vi.spyOn(console, "info").mockImplementation(() => {});
  error = vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("herePort", () => {
  it("makes what the opening left at once, and holds it until heard, in order", () => {
    const { tasks } = opening(work, look);
    const port = herePort(work, tasks);
    const heard: string[] = [];
    port.listen((answer) => heard.push(named(answer)));
    expect(heard).toEqual(["scene dracula alpha", "scene dracula alpha/apps/web"]);
  });

  it("answers an ask on the calling thread, table first, then the whole city and every town", () => {
    const port = herePort(work);
    const heard: string[] = [];
    port.listen((answer) => heard.push(named(answer)));
    port.ask({ ask: "look", theme: "paper-atlas", colourBy: "kind", first: "alpha/apps/web" });
    port.ask({ ask: "table", theme: "paper-atlas", colourBy: "folder" });
    expect(heard).toEqual([
      "table paper-atlas kind",
      "scene paper-atlas ",
      "scene paper-atlas alpha/apps/web",
      "scene paper-atlas alpha",
      "table paper-atlas folder",
    ]);
  });

  it("makes and tells nothing once ended", () => {
    const port = herePort(work);
    const heard: Answer[] = [];
    port.end();
    port.listen((answer) => heard.push(answer));
    port.ask(look);
    port.end();
    expect(heard).toEqual([]);
  });
});

describe("hearing", () => {
  it("logs each answer with the time since the ask that made it, or since it began", () => {
    let now = 100;
    const heard = hearing(() => now);
    now = 150;
    heard.asked({ ask: "look", theme: "dracula", colourBy: "kind", first: null });
    now = 190;
    heard.tell({ kind: "scene", theme: "dracula", town: null, scene: null });
    heard.tell({ kind: "table", theme: "dracula", colourBy: "kind", table: new Float32Array(4) });
    heard.tell({ kind: "scene", theme: "night-atlas", town: "a", scene: null });
    expect(info.mock.calls.map(([line]: unknown[]) => line)).toEqual([
      "viewer/city-scene theme=dracula town= ms=40",
      "viewer/city-table theme=dracula by=kind ms=40",
      "viewer/city-scene theme=night-atlas town=a ms=90",
    ]);
  });

  it("holds nothing after it ended, and hears nothing", () => {
    const heard = hearing();
    const told: Answer[] = [];
    heard.tell({ kind: "scene", theme: "dracula", town: null, scene: null });
    heard.end();
    heard.listen((answer) => told.push(answer));
    heard.tell({ kind: "scene", theme: "dracula", town: "a", scene: null });
    expect(told).toEqual([]);
    expect(heard.ended()).toBe(true);
  });
});

describe("drain", () => {
  it("logs a task that fails and makes the rest; stops when told", () => {
    const tasks: Task[] = [
      {
        key: "scene dracula a",
        make: () => {
          throw new Error("no room");
        },
      },
      { key: "scene dracula b", make: () => ({ kind: "scene", theme: "dracula", town: "b", scene: null }) },
    ];
    const told: Answer[] = [];
    drain(
      tasks,
      (answer) => told.push(answer),
      () => false,
    );
    expect(told.map(named)).toEqual(["scene dracula b"]);
    expect(error).toHaveBeenCalledWith('viewer/city-task-failed task="scene dracula a" reason="Error: no room"');
    drain(
      tasks,
      (answer) => told.push(answer),
      () => true,
    );
    expect(told).toHaveLength(1);
  });

  it("answers the town of a one-town city as the whole city's", () => {
    const one = cityWork({ city: cityNamed("solo"), measures: null });
    const port = herePort(one, opening(one, look).tasks);
    const told: Answer[] = [];
    port.listen((answer) => told.push(answer));
    expect(told).toEqual([{ kind: "scene", theme: "dracula", town: "solo", scene: null }]);
  });
});
