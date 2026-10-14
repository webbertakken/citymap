import { CitymapError } from "@citymap/ground-plan";
import { afterEach, describe, expect, it, vi } from "vitest";
import { log, logLine, reasonOf } from "./log";

afterEach(() => vi.restoreAllMocks());

describe("logLine", () => {
  it("writes the code, then each field, quoting values with spaces or quotes", () => {
    expect(logLine("viewer/open", { name: "my city", towns: 3, file: 'a"b' })).toBe(
      'viewer/open name="my city" towns=3 file="a\\"b"',
    );
    expect(logLine("viewer/city")).toBe("viewer/city");
  });
});

describe("reasonOf", () => {
  it("names an engine rejection by its code, and anything else by its text", () => {
    expect(reasonOf(new CitymapError("city/bad-json", "no"))).toBe("city/bad-json");
    expect(reasonOf(new Error("offline"))).toBe("Error: offline");
  });
});

describe("log", () => {
  it("writes decisions as information and failures as errors", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    log.info("viewer/city");
    log.error("viewer/open-failed", { reason: "x" });
    expect(info).toHaveBeenCalledWith("viewer/city");
    expect(error).toHaveBeenCalledWith("viewer/open-failed reason=x");
  });
});
