import { canonicalJson } from "../plat/canonical";
import { parseJson, validate } from "../plat/schema";
import type { City } from "./city";
import { citySchema } from "./checks";

/** The city as canonical JSON. */
export const serialiseCity = (city: City): string => canonicalJson(city);

/** Parses and validates a serialised city. */
export const parseCity = (text: string): City => validate(citySchema, parseJson(text, "city/bad-json"), "city/bad-shape");
