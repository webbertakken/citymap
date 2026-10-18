import { afterEach, describe, expect, it, vi } from "vitest";
import { BELL_GAP, BELL_PARTIALS, BELL_RING, audioSpeaker, bellRinger, ringBell, type Speaker } from "./bell";

/** A speaker that writes down every tone it is asked to play: its pitch, its start and stop, and its level's fall. */
function listening() {
  const tones: { pitch: number; start: number; stop: number; peak: number; fallsTo: number }[] = [];
  // A level belongs to the tone made just before it.
  const latest = () => tones.at(-1)!;
  const speaker: Speaker = {
    currentTime: 2,
    destination: {},
    createOscillator: () => {
      const tone = { pitch: 0, start: 0, stop: 0, peak: 0, fallsTo: 0 };
      tones.push(tone);
      return {
        frequency: {
          set value(hz: number) {
            tone.pitch = hz;
          },
        },
        connect: (node) => node,
        start: (at) => (tone.start = at),
        stop: (at) => (tone.stop = at),
      };
    },
    createGain: () => ({
      gain: {
        setValueAtTime: (value: number) => (latest().peak = value),
        exponentialRampToValueAtTime: (value: number) => (latest().fallsTo = value),
      },
      connect: (node) => node,
    }),
  };
  return { speaker, tones };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ringBell", () => {
  it("strikes twice, a moment apart, each strike two partials ringing out", () => {
    const { speaker, tones } = listening();
    ringBell(speaker);
    expect(tones.map((t) => t.pitch)).toEqual([...BELL_PARTIALS, ...BELL_PARTIALS]);
    expect(tones.map((t) => t.start)).toEqual([2, 2, 2 + BELL_GAP, 2 + BELL_GAP]);
    expect(tones.every((t) => t.stop === t.start + BELL_RING)).toBe(true);
    // The second partial at half the first's level, each falling away.
    expect(tones[1]!.peak).toBeCloseTo(tones[0]!.peak / 2, 9);
    expect(tones.every((t) => t.fallsTo < t.peak / 100)).toBe(true);
  });
});

describe("bellRinger", () => {
  it("makes its speaker on the first ring, and rings on it every time", () => {
    const { speaker, tones } = listening();
    const make = vi.fn<() => Speaker>(() => speaker);
    const ring = bellRinger(make);
    expect(make).not.toHaveBeenCalled();
    ring();
    ring();
    expect(make).toHaveBeenCalledOnce();
    expect(tones).toHaveLength(8);
  });

  it("stays silent without a speaker, and says so once", () => {
    const said = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const ring = bellRinger(() => null);
    ring();
    ring();
    expect(said.mock.calls.filter(([line]) => String(line).startsWith("explore/bell-silent"))).toHaveLength(1);
  });
});

describe("audioSpeaker", () => {
  it("is the page's Web Audio, where it has any", () => {
    expect(audioSpeaker()).toBeNull();
    class Fake {
      readonly currentTime = 0;
    }
    vi.stubGlobal("AudioContext", Fake);
    expect(audioSpeaker()).toBeInstanceOf(Fake);
  });
});
