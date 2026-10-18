// The city's search index, built in slices once the city shows; null until it is done, and for no city.
import type { City } from "@citymap/ground-plan";
import { useEffect, useState } from "react";
import { log, reasonOf } from "../log";
import type { SearchIndex } from "./search";
import { searchIndexInSlices } from "./slices";

export function useSearchIndex(city: City | null): SearchIndex | null {
  const [built, setBuilt] = useState<{ readonly city: City; readonly index: SearchIndex } | null>(null);
  useEffect(() => {
    if (!city) return undefined;
    // A new city stops the build in flight between two slices.
    const controller = new AbortController();
    const started = performance.now();
    searchIndexInSlices(city, { signal: controller.signal }).then(
      ({ index, slices }) => {
        log.info("viewer/search-index", {
          entries: index.entries.length,
          slices,
          ms: Math.round(performance.now() - started),
        });
        setBuilt({ city, index });
      },
      (failure: unknown) => {
        if (!controller.signal.aborted) log.error("viewer/search-index-failed", { reason: reasonOf(failure) });
      },
    );
    return () => controller.abort();
  }, [city]);
  return built?.city === city ? built.index : null;
}
