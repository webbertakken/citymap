import type { City } from "@citymap/ground-plan";
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { city as cityNamed } from "../components/testing/fixtures";
import { searchIndex } from "./search";
import * as slices from "./slices";
import { useSearchIndex } from "./useSearchIndex";

describe("useSearchIndex", () => {
  it("is null for no city, then the city's index once it is built, logged", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const alpha = cityNamed("alpha");
    const none: { city: City | null } = { city: null };
    const { result, rerender } = renderHook(({ city }) => useSearchIndex(city), { initialProps: none });
    expect(result.current).toBeNull();
    rerender({ city: alpha });
    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).toEqual(searchIndex(alpha)));
    expect(info.mock.calls.map(([line]) => String(line).replace(/ ms=\d+$/, ""))).toContain(
      "viewer/search-index entries=3 slices=1",
    );
    info.mockRestore();
  });

  it("drops a city's build when another city comes, and shows only the new one's", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    // The first build waits until it is stopped; the next one builds.
    const build = vi.spyOn(slices, "searchIndexInSlices");
    build.mockImplementationOnce(
      (_city, { signal } = {}) =>
        new Promise((_resolve, reject) => signal?.addEventListener("abort", () => reject(signal.reason))),
    );
    const { result, rerender } = renderHook(({ city }: { city: City }) => useSearchIndex(city), {
      initialProps: { city: cityNamed("alpha") },
    });
    rerender({ city: cityNamed("beta") });
    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current?.entries[0]?.town).toBe("beta"));
    // The dropped build is neither shown nor a failure.
    expect(info.mock.calls.filter(([line]) => String(line).startsWith("viewer/search-index"))).toHaveLength(1);
    expect(error).not.toHaveBeenCalled();
    build.mockRestore();
    info.mockRestore();
    error.mockRestore();
  });

  it("logs a build that fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    // A town whose lots cannot be read.
    const broken = cityNamed("x");
    Object.defineProperty(broken.towns[0]!, "lots", {
      get: () => {
        throw new Error("unreadable");
      },
    });
    renderHook(() => useSearchIndex(broken));
    await waitFor(() => expect(error).toHaveBeenCalled());
    expect(String(error.mock.calls[0]![0])).toMatch(/^viewer\/search-index-failed reason=/);
    error.mockRestore();
  });
});
