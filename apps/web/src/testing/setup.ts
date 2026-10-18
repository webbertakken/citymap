// Testing Library waits up to this long for what a test awaits (a city to load and draw, a card to appear). Its default,
// one second, is a heuristic that a contended machine (many test projects and other jobs at once) overruns; waiting
// longer for the same outcome asserts the same thing, and a passing wait still returns as soon as it is met. It stays
// under Vitest's five-second test timeout, so a wait that is never met fails naming what it waited for.
import { configure } from "@testing-library/react";

/** The longest wait for an awaited element, in milliseconds. */
export const ASYNC_WAIT_MS = 4000;

configure({ asyncUtilTimeout: ASYNC_WAIT_MS });
