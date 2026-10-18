// Plays an animated figure's clips: one motion at a time, blending into the next, at the pace asked for.
import { AnimationMixer, type AnimationAction, type AnimationClip, type Object3D } from "three";
import { log } from "../../log";
import { BLEND, CLIP_OF, type Motion } from "./motion";

export class Animator {
  private readonly mixer: AnimationMixer;
  private readonly actions = new Map<string, AnimationAction>();
  /** Motions asked for that the figure has no clip for: said once each. */
  private readonly missing = new Set<Motion>();
  private current: { readonly motion: Motion; readonly action: AnimationAction } | null = null;

  /** A figure and its clips, each motion played by the clip `names` gives it. */
  constructor(
    model: Object3D,
    clips: readonly AnimationClip[],
    private readonly names: Readonly<Record<Motion, string>> = CLIP_OF,
  ) {
    this.mixer = new AnimationMixer(model);
    for (const clip of clips) this.actions.set(clip.name, this.mixer.clipAction(clip));
  }

  /** The motion now playing, or null before the first. */
  get playing(): Motion | null {
    return this.current?.motion ?? null;
  }

  /** Plays a motion at a pace for a frame of `seconds`: a new motion blends in over `BLEND` as the last one fades. */
  play(motion: Motion, pace: number, seconds: number) {
    if (this.current?.motion !== motion) this.begin(motion);
    if (this.current) this.current.action.timeScale = pace;
    this.mixer.update(seconds);
  }

  /** Starts a motion's clip; a figure without that clip keeps doing what it was doing. */
  private begin(motion: Motion) {
    const action = this.actions.get(this.names[motion]);
    if (!action) {
      if (!this.missing.has(motion)) log.error("explore/clip-missing", { motion });
      this.missing.add(motion);
      return;
    }
    action.reset().play();
    if (this.current) action.crossFadeFrom(this.current.action, BLEND, false);
    this.current = { motion, action };
  }
}
