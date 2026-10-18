// Testing Library waits up to this long for what a test awaits (a city to load and draw, a card to appear). Its default,
// one second, is a heuristic that a contended machine (many test projects and other jobs at once) overruns; waiting
// longer for the same outcome asserts the same thing, and a passing wait still returns as soon as it is met.
import { configure } from "@testing-library/react";

/** The longest wait for an awaited element, in milliseconds. */
export const ASYNC_WAIT_MS = 5000;

configure({ asyncUtilTimeout: ASYNC_WAIT_MS });
