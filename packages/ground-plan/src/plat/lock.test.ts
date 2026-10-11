import { describe, expect, it } from "vitest";
import { parseLock, serialiseLock } from "./lock";
import { emptyPlat } from "./plat";

const lock = { commit: "a".repeat(40), index: 3, plat: emptyPlat("source") };

describe("parseLock and serialiseLock", () => {
  it("round-trips", () => {
    expect(parseLock(serialiseLock(lock))).toEqual(lock);
  });

  it.each([
    ["{", "lock/bad-json"],
    ['{"commit":"x","index":1,"plat":{}}', "lock/bad-shape: /commit"],
    [`{"commit":"${"a".repeat(40)}","index":-1,"plat":{}}`, "lock/bad-shape: /index"],
    [`{"commit":"${"a".repeat(40)}","index":1,"plat":{}}`, "plat/bad-version"],
  ])("rejects %s", (text, message) => {
    expect(() => parseLock(text)).toThrow(message);
  });
});
