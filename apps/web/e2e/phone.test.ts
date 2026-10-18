import { describe, expect, it } from "vitest";
import { BUSY_SHARE, REFERENCE_MS, phoneRate, tooBusyForAPhone } from "./phone";

describe("tooBusyForAPhone", () => {
  it("lets a machine time the phone while its work stays within 1.3x the reference", () => {
    expect(BUSY_SHARE * REFERENCE_MS).toBeCloseTo(55.9);
    expect(tooBusyForAPhone(43)).toBeNull();
    expect(tooBusyForAPhone(55.9)).toBeNull();
  });

  it("says why a busier machine cannot, naming its work and the limit", () => {
    expect(tooBusyForAPhone(56)).toBe(
      "the machine is busy: its work took 56.0 ms, beyond 56 ms (1.3x the reference), so it is slower than the phone it stands for",
    );
    expect(tooBusyForAPhone(103)).toMatch(/^the machine is busy: its work took 103\.0 ms/);
  });

  it("reads against the reference and share it is given", () => {
    expect(tooBusyForAPhone(60, 50)).toBeNull();
    expect(tooBusyForAPhone(60, 50, 1.1)).toMatch(/beyond 55 ms \(1\.1x the reference\)/);
  });
});

describe("phoneRate", () => {
  it("slows the machine to the phone, never below 1", () => {
    expect(phoneRate(43)).toBe(4);
    expect(phoneRate(86)).toBe(2);
    expect(phoneRate(400)).toBe(1);
  });
});
