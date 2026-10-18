// The bicycle's bell: a brass ding-ding, made by Web Audio rather than fetched, so it costs nothing to load. Two
// strikes, each two sine partials ringing out, as a bell's metal does.
import { log } from "../log";

/** A tone the speaker plays: its pitch, where it goes, and when it starts and stops. */
export interface Tone {
  readonly frequency: { value: number };
  connect(node: unknown): unknown;
  start(at: number): void;
  stop(at: number): void;
}

/** A level a tone passes through: set at a moment, falling away to another by a later one. */
export interface Level {
  readonly gain: {
    setValueAtTime(value: number, at: number): unknown;
    exponentialRampToValueAtTime(value: number, at: number): unknown;
  };
  connect(node: unknown): unknown;
}

/** What rings the bell: the page's Web Audio, or a stand-in in tests. */
export interface Speaker {
  readonly currentTime: number;
  readonly destination: unknown;
  createOscillator(): Tone;
  createGain(): Level;
}

/** The bell's two partials in hertz (a brass bell's ring and the fifth above it), the second at half the level. */
export const BELL_PARTIALS = [2350, 3520] as const;
/** The two strikes are this many seconds apart; each rings out over this long, from this loud. */
export const BELL_GAP = 0.12;
export const BELL_RING = 0.9;
export const BELL_LEVEL = 0.2;
/** A ring falls away to this level: silence, as exponential ramps cannot reach zero. */
const SILENT = 0.0001;

/** Rings the bell once: two strikes, a moment apart. */
export function ringBell(speaker: Speaker) {
  for (const strike of [0, BELL_GAP])
    BELL_PARTIALS.forEach((pitch, i) => {
      const at = speaker.currentTime + strike;
      const tone = speaker.createOscillator();
      const level = speaker.createGain();
      tone.frequency.value = pitch;
      level.gain.setValueAtTime(BELL_LEVEL / (i + 1), at);
      level.gain.exponentialRampToValueAtTime(SILENT, at + BELL_RING);
      tone.connect(level);
      level.connect(speaker.destination);
      tone.start(at);
      tone.stop(at + BELL_RING);
    });
}

/** The page's Web Audio, or null where it has none. */
export const audioSpeaker = (): Speaker | null => (typeof AudioContext === "undefined" ? null : new AudioContext());

/**
 * A bell to ring: its speaker is made on the first ring (browsers let sound start only from a person's gesture), and
 * without one it stays silent, said once in the log.
 */
export function bellRinger(make: () => Speaker | null) {
  let speaker: Speaker | null | undefined;
  return () => {
    if (speaker === undefined) {
      speaker = make();
      if (!speaker) log.info("explore/bell-silent");
    }
    if (!speaker) return;
    ringBell(speaker);
    log.info("explore/bell");
  };
}
