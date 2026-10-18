import { canonicalJson } from "../plat/canonical";
import { parseJson, validate } from "../plat/schema";
import { citySchema } from "./checks";
import type { City } from "./city";

/** The city as canonical JSON. */
export const serialiseCity = (city: City): string => canonicalJson(city);

/** Validates a parsed value as a city, or rejects it with `city/bad-shape` and the pointer of the first fault. */
export const validateCity = (value: unknown): City => validate(citySchema, value, "city/bad-shape");

/** Parses and validates a serialised city. */
export const parseCity = (text: string): City => validateCity(parseJson(text, "city/bad-json"));
