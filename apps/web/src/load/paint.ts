// Lets the browser paint before a long piece of work on the main thread, so the phase it is in is seen.

/** The longest wait for a frame: a hidden tab draws none. */
const FRAME_WAIT_MS = 100;

/** Resolves once a frame has been drawn, or after `FRAME_WAIT_MS` when none comes. */
export const afterPaint = () =>
  new Promise<void>((resolve) => {
    const fallback = setTimeout(resolve, FRAME_WAIT_MS);
    requestAnimationFrame(() =>
      setTimeout(() => {
        clearTimeout(fallback);
        resolve();
      }, 0),
    );
  });
