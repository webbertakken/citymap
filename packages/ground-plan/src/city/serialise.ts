import { CitymapError } from "../errors";
import { canonicalJson } from "../plat/canonical";
import { array, object, str, type Check, type ShapeError } from "../plat/validate";
import type { City } from "./city";
import { roadCheck, townCheck } from "./checks";

const cityCheck: Check<City> = object({ repository: str, commit: str, towns: array(townCheck), highways: array(roadCheck) });

/** The city as canonical JSON. */
export const serialiseCity = (city: City): string => canonicalJson(city);

/** Parses and validates a serialised city. */
export function parseCity(text: string): City {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new CitymapError("city/bad-json", "the city is not JSON", { reason: String(error) });
  }
  try {
    return cityCheck(value, "");
  } catch (error) {
    // The validators throw nothing but shape errors.
    const shape = error as ShapeError;
    throw new CitymapError("city/bad-shape", shape.message, { pointer: shape.pointer, expected: shape.expected });
  }
}
