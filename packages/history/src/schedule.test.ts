import { describe, expect, it } from "vitest";
import {
  EVERY_COMMIT,
  FOLD_STRIDES,
  foldSchedule,
  isLaid,
  laidCount,
  type FoldSchedule,
  type Strides,
} from "./schedule";

/** The laid indices of a schedule (resumed at `from`), by brute force over the history. */
const laid = (schedule: FoldSchedule, from?: number) =>
  Array.from({ length: schedule.commits }, (_, i) => i).filter((i) => i >= (from ?? 0) && isLaid(schedule, i, from));

/** The laid indices of one more commit, beside those of this many with the new commit added. */
const grown = (commits: number) => [laid(foldSchedule(commits + 1)), [...laid(foldSchedule(commits)), commits]];

/** The rejection of a count or strides the schedule cannot use, naming the field. */
const badSchedule = (field: string) =>
  expect.objectContaining({ code: "history/bad-schedule", detail: expect.objectContaining({ field }) });

const small: Strides = { tail: 4, window: 2, coarseAfter: 8, coarseWindow: 4, grain: 4 };

describe("foldSchedule", () => {
  it("names the strides as the defaults ledger does", () => {
    expect(FOLD_STRIDES).toEqual({ tail: 1000, window: 100, coarseAfter: 10_000, coarseWindow: 1000, grain: 1000 });
  });

  it("folds every commit of a history of 1,999 commits or fewer", () => {
    for (const commits of [0, 1, 2, 999, 1000, 1001, 1999]) {
      const schedule = foldSchedule(commits);
      expect(schedule).toMatchObject({ commits, coarseEnd: 0, tailStart: 0 });
      expect(laidCount(schedule)).toBe(commits);
    }
  });

  it("folds the commits before the tail in windows of 100 from 2,000 commits", () => {
    const schedule = foldSchedule(2000);
    expect(schedule).toMatchObject({ coarseEnd: 0, tailStart: 1000 });
    expect(laid(schedule).slice(0, 10)).toEqual([99, 199, 299, 399, 499, 599, 699, 799, 899, 999]);
    expect(laid(schedule).slice(10)).toEqual(Array.from({ length: 1000 }, (_, i) => 1000 + i));
  });

  it("folds the commits older than the last 10,000 in windows of 1,000", () => {
    const schedule = foldSchedule(77_277);
    expect(schedule).toMatchObject({ commits: 77_277, coarseEnd: 67_000, tailStart: 76_000 });
    const indices = laid(schedule);
    expect(indices.slice(0, 3)).toEqual([999, 1999, 2999]);
    expect(indices.filter((i) => i < 67_000)).toHaveLength(67);
    expect(indices.filter((i) => i >= 67_000 && i < 76_000)).toHaveLength(90);
    expect(indices.filter((i) => i >= 76_000)).toHaveLength(1277);
    expect(laidCount(schedule)).toBe(67 + 90 + 1277);
  });

  it("keeps no coarse zone up to 10,999 commits", () => {
    expect(foldSchedule(10_000)).toMatchObject({ coarseEnd: 0, tailStart: 9000 });
    expect(foldSchedule(10_999)).toMatchObject({ coarseEnd: 0, tailStart: 9000 });
    expect(foldSchedule(11_000)).toMatchObject({ coarseEnd: 1000, tailStart: 10_000 });
  });

  it("anchors windows to the root, each inside one zone, and always lays the last commit", () => {
    for (const commits of [1999, 2000, 2345, 10_999, 11_000, 23_456, 77_277]) {
      const schedule = foldSchedule(commits);
      expect(schedule.tailStart % 1000).toBe(0);
      expect(schedule.coarseEnd % 1000).toBe(0);
      expect(commits - schedule.tailStart).toBeGreaterThanOrEqual(Math.min(commits, 1000));
      expect(commits - schedule.tailStart).toBeLessThan(2000);
      const indices = laid(schedule);
      expect(indices.at(-1)).toBe(commits - 1);
      for (const i of indices.filter((index) => index < schedule.tailStart)) {
        const stride = i < schedule.coarseEnd ? 1000 : 100;
        expect((i + 1) % stride).toBe(0);
      }
    }
  });

  it("lays the same windows and one more commit for one more commit, except where a boundary steps", () => {
    for (const commits of [2500, 3000, 12_345, 13_000]) {
      const [after, extended] = grown(commits);
      expect(after).toEqual(extended);
    }
    // One more commit makes the count a multiple of 1,000: the tail and coarse zones step.
    for (const commits of [1999, 2999, 12_999]) {
      const [after, extended] = grown(commits);
      expect(after).not.toEqual(extended);
    }
  });

  it("lays the first index of a resume, then the schedule of the whole history after it", () => {
    const schedule = foldSchedule(23_456);
    expect(laid(schedule, 0).slice(0, 2)).toEqual([0, 999]);
    expect(laid(schedule, 5000).slice(0, 3)).toEqual([5000, 5999, 6999]);
    expect(laid(schedule, 12_345).slice(0, 3)).toEqual([12_345, 12_999, 13_099]);
    expect(laid(schedule, 22_000).slice(0, 2)).toEqual([22_000, 22_001]);
    expect(laid(schedule, 23_455)).toEqual([23_455]);
    for (const from of [undefined, 0, 1, 999, 5000, 12_345, 22_000, 23_455, 23_456, 30_000])
      expect(laidCount(schedule, from)).toBe(laid(schedule, from).length);
  });

  it("lays any commit beyond the count", () => {
    expect(isLaid(foldSchedule(2000), 2400)).toBe(true);
  });

  it("follows the strides it is given", () => {
    const schedule = foldSchedule(20, small);
    expect(schedule).toMatchObject({ coarseEnd: 12, tailStart: 16 });
    expect(laid(schedule)).toEqual([3, 7, 11, 13, 15, 16, 17, 18, 19]);
    expect(laidCount(foldSchedule(77_277, EVERY_COMMIT))).toBe(77_277);
  });

  it("rejects a count or strides it cannot use, naming the field", () => {
    expect(() => foldSchedule(-1, small)).toThrow(badSchedule("commits"));
    expect(() => foldSchedule(1.5, small)).toThrow(badSchedule("commits"));
    expect(() => foldSchedule(Number.NaN, small)).toThrow(badSchedule("commits"));
    expect(() => foldSchedule(10, { ...small, window: 0 })).toThrow(badSchedule("window"));
    expect(() => foldSchedule(10, { ...small, tail: 2.5 })).toThrow(badSchedule("tail"));
    expect(() => foldSchedule(10, { ...small, coarseWindow: Number.POSITIVE_INFINITY })).toThrow(
      badSchedule("coarseWindow"),
    );
    expect(() => foldSchedule(10, { ...small, grain: 6 })).toThrow(badSchedule("grain"));
    expect(() => foldSchedule(10, { ...small, window: 5, grain: 8 })).toThrow(badSchedule("grain"));
    expect(() => foldSchedule(10, { ...small, coarseAfter: 2 })).toThrow(badSchedule("coarseAfter"));
  });
});
