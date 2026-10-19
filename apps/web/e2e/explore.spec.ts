import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// Walking in the city: down from the map through the loading card, on foot by keys or by touch, and back to the map.

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
/** A ride's journey may take this long: a software renderer on a shared runner steps it in few, capped frames. */
const RIDING_MS = 120_000;

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("takken.io");
});

/** Lets the canvas draw a few frames: the walk moves on with the frames. */
const frames = (page: Page, n: number) =>
  page.evaluate(
    (count) =>
      new Promise<void>((resolve) => {
        let left = count;
        const next = () => (--left <= 0 ? resolve() : requestAnimationFrame(next));
        requestAnimationFrame(next);
      }),
    n,
  );

/** Every log line the page writes, as it writes them. */
const logOf = (page: Page) => {
  const lines: string[] = [];
  page.on("console", (message) => lines.push(message.text()));
  return lines;
};

const walking = (page: Page) => page.getByRole("application", { name: /^Walking in takken\.io/ });
/** Waits until the walk is drawn: its canvas in place, and a few frames on. */
async function drawn(page: Page) {
  await expect(page.locator(".explore canvas")).toBeVisible();
  await frames(page, 10);
}

test("walks on foot by the keys and comes back to the map where the walk ended", async ({ page, isMobile }, info) => {
  test.skip(isMobile, "the phone walks by touch, below");
  const lines = logOf(page);
  await page.getByRole("button", { name: "Walk" }).click();
  await expect(walking(page)).toBeVisible();
  await expect(page.getByRole("button", { name: "Walk" })).toHaveAttribute("aria-pressed", "true");
  // The walker walks on Rapier in the nearby streets, the city's own walls behind it.
  await expect(page.getByRole("region", { name: "On foot" })).toContainText("Physics prototype: Rapier");
  // The walls rose and the walk began, both said in the log.
  expect(lines.find((l) => l.startsWith("explore/walls"))).toMatch(/^explore\/walls engine=bespoke buildings=\d+ /);
  expect(lines.find((l) => l.startsWith("explore/enter"))).toMatch(
    /^explore\/enter landing=road buildings=\d+ x=-?\d+\.\d{3} z=-?\d+\.\d{3}$/,
  );
  await drawn(page);
  await page.screenshot({ path: info.outputPath("start.png") });
  await page.keyboard.down("KeyW");
  await frames(page, 60);
  await page.keyboard.up("KeyW");
  await page.screenshot({ path: info.outputPath("walked.png") });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("application", { name: /^Map of takken\.io/ })).toBeVisible();
  const leave = lines.find((l) => l.startsWith("explore/leave"));
  expect(leave).toMatch(/^explore\/leave x=-?\d+\.\d{3} z=-?\d+\.\d{3}$/);
});

test("walks by the stick and the jump button on a phone, and leaves by the card", async ({ page, isMobile }, info) => {
  test.skip(!isMobile, "the stick and the jump button are for touch");
  const walk = page.getByRole("button", { name: "Walk" });
  // Under the thumb, at the bottom in the middle.
  const box = await walk.boundingBox();
  const width = page.viewportSize()?.width ?? 0;
  expect(Math.abs((box?.x ?? 0) + (box?.width ?? 0) / 2 - width / 2)).toBeLessThan(2);
  await walk.tap();
  await expect(walking(page)).toBeVisible();
  await expect(page.locator(".explore-stick")).toBeVisible();
  await expect(page.getByRole("button", { name: "Jump" })).toBeVisible();
  await expect(walk).toBeHidden();
  await drawn(page);
  await page.getByRole("button", { name: "Jump" }).tap();
  await frames(page, 10);
  await page.screenshot({ path: info.outputPath("phone.png") });
  await page.getByRole("button", { name: "Back to the map" }).tap();
  await expect(page.getByRole("application", { name: /^Map of takken\.io/ })).toBeVisible();
});

for (const scheme of ["dark", "light"] as const)
  test(`passes axe while walking, ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.getByRole("button", { name: "Walk" }).click();
    await expect(walking(page)).toBeVisible();
    const found = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
    expect(found.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });

test("walks with the Rapier prototype when the address asks for it", async ({ page }) => {
  const lines = logOf(page);
  await page.goto("/?physics=rapier");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("takken.io");
  await page.getByRole("button", { name: "Walk" }).click();
  await expect(page.getByRole("region", { name: "On foot" })).toContainText("Physics prototype: Rapier");
  expect(lines.find((l) => l.startsWith("explore/walls"))).toMatch(/^explore\/walls engine=rapier buildings=\d+ /);
});

test("walks as Kenney's figure, its model loaded with the walk", async ({ page }) => {
  const lines = logOf(page);
  await page.getByRole("button", { name: "Walk" }).click();
  await drawn(page);
  await expect.poll(() => lines.some((l) => l.startsWith("explore/model-normalised url=models/people/"))).toBe(true);
  expect(lines.some((l) => l.startsWith("explore/model-failed"))).toBe(false);
});

/**
 * Keys held until what it waits for holds, whatever the frame rate: a slow software renderer steps the walk in fewer,
 * capped frames, so a fixed time covers less ground.
 */
async function holdUntil(page: Page, keys: readonly string[], until: () => Promise<void>) {
  await Promise.all(keys.map((key) => page.keyboard.down(key)));
  await until();
  await Promise.all(keys.map((key) => page.keyboard.up(key)));
}

/** On foot from the landing to the bicycle, 4 m up the street and 3.2 m right at the kerb; its prompt to get on. */
async function toTheBicycle(page: Page) {
  const prompt = page.getByRole("button", { name: "Get on the bicycle" });
  await holdUntil(page, ["KeyW", "KeyD"], () => expect(prompt).toBeVisible({ timeout: 30_000 }));
  return prompt;
}

test("gets on the bicycle parked by the road with E, rides it, and gets off once stopped", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "the keyboard's E; touch uses the prompt's button");
  const slow = page.getByRole("button", { name: "Slow down to get off the bicycle" });
  await page.getByRole("button", { name: "Walk" }).click();
  await drawn(page);
  await toTheBicycle(page);
  await page.keyboard.press("KeyE");
  await expect(page.getByRole("region", { name: "On the bicycle" })).toBeVisible();
  await holdUntil(page, ["KeyW"], () => expect(slow).toBeVisible({ timeout: 30_000 }));
  await expect(slow).toBeDisabled();
  const off = page.getByRole("button", { name: "Get off the bicycle" });
  await holdUntil(page, ["Space"], () => expect(off).toBeVisible({ timeout: 30_000 }));
  await page.keyboard.press("KeyE");
  await expect(page.getByRole("region", { name: "On foot" })).toBeVisible();
});

test("rides the bicycle: pedals, shifts, brakes, and stops with a foot down, the HUD saying so", async ({
  page,
  isMobile,
}, info) => {
  test.skip(isMobile, "the keyboard rides here; the phone's buttons below");
  // A software renderer on a shared runner steps the ride in fewer, capped frames: give it the time it needs.
  test.setTimeout(RIDING_MS);
  const lines = logOf(page);
  await page.getByRole("button", { name: "Walk" }).click();
  await drawn(page);
  // The city's own vehicles stand about, worked out from its plan.
  expect(lines.find((l) => l.startsWith("explore/parked"))).toMatch(
    /^explore\/parked bicycles=[1-9]\d* cars=[1-9]\d*$/,
  );
  await toTheBicycle(page);
  await page.keyboard.press("KeyE");
  const hud = page.getByRole("region", { name: "Speed, gear and cadence" });
  await expect(hud).toHaveAttribute("data-foot", "down");
  await expect(hud).toContainText("3 of 7");
  await page.keyboard.press("KeyR");
  await expect(hud).toContainText("4 of 7");
  // Pedalled to a city pace: the crank turns and the foot comes up.
  await holdUntil(page, ["KeyW"], () => expect(hud).toContainText(/Speed\s*(1\d|[2-9]\d) km\/h/, { timeout: 30_000 }));
  await expect(hud).toHaveAttribute("data-foot", "up");
  await page.screenshot({ path: info.outputPath("riding.png") });
  const found = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(found.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  // Both brakes to a stop: a foot goes down.
  await holdUntil(page, ["Space", "KeyS"], () => expect(hud).toHaveAttribute("data-foot", "down", { timeout: 30_000 }));
  await expect(hud).toContainText(/Speed\s*0 km\/h/);
  await page.keyboard.press("KeyB");
  await expect.poll(() => lines.some((l) => l === "explore/bell" || l === "explore/bell-silent")).toBe(true);
  expect(lines.some((l) => l.startsWith("explore/thrown"))).toBe(false);
});

test("rides the bicycle by its touch buttons on a phone: brake, ring and the gears", async ({ page, isMobile }) => {
  test.skip(!isMobile, "the touch buttons are for touch");
  const lines = logOf(page);
  await page.getByRole("button", { name: "Walk" }).tap();
  await drawn(page);
  await (await toTheBicycle(page)).tap();
  await expect(page.getByRole("region", { name: "On the bicycle" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Brake" })).toBeVisible();
  const hud = page.getByRole("region", { name: "Speed, gear and cadence" });
  await page.getByRole("button", { name: "Gear up" }).tap();
  await expect(hud).toContainText("4 of 7");
  await page.getByRole("button", { name: "Gear down" }).tap();
  await expect(hud).toContainText("3 of 7");
  await page.getByRole("button", { name: "Ring" }).tap();
  await expect.poll(() => lines.some((l) => l === "explore/bell" || l === "explore/bell-silent")).toBe(true);
});

/** The city shown, as laid: its built lots, each with its path and its footprint in scene units (z south). */
async function lotsOfTakken() {
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const file: { towns: { lots: { vacant: boolean; path: string; pts: { x: number; y: number }[] }[] }[] } = JSON.parse(
    readFileSync(join(import.meta.dirname, "../public/cities/takken.io/corridor-tiers.json"), "utf8"),
  );
  return file.towns.flatMap((town) =>
    town.lots
      .filter((lot) => !lot.vacant && lot.path !== "")
      .map((lot) => ({ path: lot.path, pts: lot.pts.map((p) => ({ x: p.x / 64, z: -p.y / 64 })) })),
  );
}

/** Strictly inside a convex outline, whichever way round it runs. */
const inside = (q: { x: number; z: number }, pts: readonly { x: number; z: number }[]) => {
  const sides = pts.map((a, i) => {
    const b = pts[(i + 1) % pts.length]!;
    return (b.x - a.x) * (q.z - a.z) - (b.z - a.z) * (q.x - a.x);
  });
  return sides.every((s) => s > 0) || sides.every((s) => s < 0);
};

for (const which of [0.1, 0.5, 0.9])
  test(`runs at a selected building and stops at its wall, never inside (${which})`, async ({ page, isMobile }) => {
    test.skip(isMobile, "the keyboard drives the walker here");
    const lots = await lotsOfTakken();
    const target = lots[Math.floor(which * lots.length)]!;
    const lines = logOf(page);
    // Selected through the search, the walk lands before the building, facing it.
    const search = page.getByRole("searchbox");
    await search.fill(target.path);
    await search.press("Enter");
    await page.getByRole("button", { name: "Walk" }).click();
    await drawn(page);
    await page.keyboard.down("ShiftLeft");
    await page.keyboard.down("KeyW");
    await page.waitForTimeout(4000);
    await page.keyboard.up("KeyW");
    await page.keyboard.up("ShiftLeft");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("application", { name: /^Map of takken\.io/ })).toBeVisible();
    const placeIn = (code: string) => {
      const [, x, z] = /x=(-?[\d.]+) z=(-?[\d.]+)/.exec(lines.find((l) => l.startsWith(code)) ?? "") ?? [];
      return { x: Number(x), z: Number(z) };
    };
    expect(lines.find((l) => l.startsWith("explore/enter"))).toMatch(/landing=selected/);
    const start = placeIn("explore/enter");
    const end = placeIn("explore/leave");
    // Four seconds at a run is 18 m unhindered: the building stopped it within a few.
    const travelled = Math.hypot(end.x - start.x, end.z - start.z) * 10;
    expect(travelled).toBeLessThan(12);
    expect(lots.filter((lot) => inside(end, lot.pts)).map((lot) => lot.path)).toEqual([]);
  });

test("names the buildings round the walker on their walls, never more than the pool, and reads the one in sight", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "the search selects the building here");
  const target = (await lotsOfTakken()).find((lot) => lot.path.endsWith(".tsx"))!;
  const search = page.getByRole("searchbox");
  await search.fill(target.path);
  await search.press("Enter");
  await page.getByRole("button", { name: "Walk" }).click();
  await drawn(page);
  // Signs go up within a quarter of a second, for at most the pool's 24 nearest buildings.
  const walk = page.locator(".explore");
  await expect.poll(async () => Number(await walk.getAttribute("data-signs"))).toBeGreaterThan(0);
  expect(Number(await walk.getAttribute("data-signs"))).toBeLessThanOrEqual(24);
  // Landed facing the building: the crosshair reads it.
  const name = target.path.slice(target.path.lastIndexOf("/") + 1);
  await expect(page.getByRole("region", { name: "In sight" })).toContainText(name);
});

test("flies the camera freely with F, over the city, and lands it on the walker", async ({ page, isMobile }, info) => {
  test.skip(isMobile, "the phone flies by its Fly button, in the unit tests");
  await page.getByRole("button", { name: "Walk" }).click();
  await drawn(page);
  await page.keyboard.press("KeyF");
  await expect(page.getByRole("region", { name: "Flying" })).toContainText("F lands");
  await page.keyboard.down("Space");
  await frames(page, 40);
  await page.keyboard.up("Space");
  await page.screenshot({ path: info.outputPath("flying.png") });
  await page.keyboard.press("KeyF");
  await expect(page.getByRole("region", { name: "On foot" })).toBeVisible();
});

/** The prompt's words now, read without waiting: null with nothing within reach. */
const promptNow = (page: Page) =>
  page.evaluate(() => document.querySelector(".explore-use")?.textContent?.replace(/^E/, "") ?? null);

/** Keys held until the prompt says what is wanted, looked for every two frames, at most `checks` times. */
async function holdForPrompt(page: Page, keys: readonly string[], wanted: string, checks: number) {
  const until = async (left: number): Promise<void> => {
    if (left <= 0 || (await promptNow(page)) === wanted) return;
    await frames(page, 2);
    await until(left - 1);
  };
  await Promise.all(keys.map((key) => page.keyboard.down(key)));
  await until(checks);
  await Promise.all(keys.map((key) => page.keyboard.up(key)));
}

/**
 * Routes that hold by geometry, not by time (a frame is anything from 17 to 100 ms of the walk): to the motorbike, 6 m
 * back at the near kerb, the back-right diagonal passes 0.35 m from its outline; to the car, 10 m ahead at the far kerb,
 * the forward-left diagonal from beside the bicycle runs into its side.
 */
async function toTheMotorbike(page: Page) {
  await holdForPrompt(page, ["KeyS", "KeyD"], "Get on the motorbike", 900);
  return page.getByRole("button", { name: "Get on the motorbike", exact: true });
}

async function toTheCar(page: Page) {
  await toTheBicycle(page);
  await holdForPrompt(page, ["KeyW", "KeyA"], "Get in the car", 900);
  return page.getByRole("button", { name: "Get in the car", exact: true });
}

/** Every visible control box of the walk and the map's top row, and any two that overlap or leave the screen. */
const overlapsOf = (page: Page) =>
  page.evaluate(() => {
    const boxes = [...document.querySelectorAll(".glass, .explore-stick, .icon-button")]
      .filter((e) => e instanceof HTMLElement && e.offsetParent !== null && getComputedStyle(e).visibility !== "hidden")
      .filter((e, _i, all) => !all.some((o) => o !== e && o.contains(e)))
      .map((e) => ({
        name: (e.getAttribute("aria-label") ?? e.textContent ?? "").trim(),
        box: e.getBoundingClientRect(),
      }))
      .filter(({ box }) => box.width > 0 && box.height > 0);
    const hits: string[] = [];
    for (const [i, a] of boxes.entries())
      for (const b of boxes.slice(i + 1))
        if (
          a.box.left < b.box.right &&
          b.box.left < a.box.right &&
          a.box.top < b.box.bottom &&
          b.box.top < a.box.bottom
        )
          hits.push(`${a.name} x ${b.name}`);
    const off = boxes
      .filter(
        ({ box }) => box.left < 0 || box.top < 0 || box.right > innerWidth + 0.5 || box.bottom > innerHeight + 0.5,
      )
      .map(({ name }) => `${name} off screen`);
    return [...hits, ...off];
  });

/** On a phone, the walk's controls measured upright and on its side, in place: nothing overlapping either way. */
async function laidOut(page: Page, what: string, isMobile: boolean, shot?: string) {
  if (!isMobile) return;
  const { width, height } = page.viewportSize()!;
  expect(await overlapsOf(page), `${what}, upright`).toEqual([]);
  if (shot) await page.screenshot({ path: shot });
  await page.setViewportSize({ width: height, height: width });
  await frames(page, 2);
  expect(await overlapsOf(page), `${what}, on its side`).toEqual([]);
  await page.setViewportSize({ width, height });
  await frames(page, 2);
}

/** Down into the city by the Walk button: a click, or a tap on a phone. */
async function walkDown(page: Page, isMobile: boolean) {
  const walk = page.getByRole("button", { name: "Walk" });
  await (isMobile ? walk.tap() : walk.click());
  await drawn(page);
}

test("loads everything once behind the card: the engine, the models, the walls and the nearby streets", async ({
  page,
}) => {
  const lines = logOf(page);
  await page.getByRole("button", { name: "Walk" }).click();
  // Shown while the finished load still holds its card: the walk itself is never dimmed.
  await expect(walking(page)).toBeVisible();
  expect(await walking(page).evaluate((walk) => getComputedStyle(walk).opacity)).toBe("1");
  await drawn(page);
  const phases = lines
    .filter((l) => l.startsWith("viewer/load-phase source=explore"))
    .map((l) => /phase=(\w+)/.exec(l)?.[1]);
  expect(phases).toEqual(["engine", "models", "walls", "streets"]);
  expect(lines.find((l) => l.startsWith("explore/streets"))).toMatch(/^explore\/streets buildings=[1-9]\d* ms=\d+$/);
  expect(lines.some((l) => l.startsWith("explore/model-failed"))).toBe(false);
  expect(lines.some((l) => l.startsWith("explore/arcade"))).toBe(false);
});

test("rides the motorbike: throttle, gears that change themselves, both brakes to a stop, and off", async ({
  page,
  isMobile,
}, info) => {
  test.setTimeout(RIDING_MS);
  await walkDown(page, isMobile);
  const on = await toTheMotorbike(page);
  await expect(on).toBeVisible();
  await (isMobile ? on.tap() : page.keyboard.press("KeyE"));
  await expect(page.getByRole("region", { name: "On the motorbike" })).toBeVisible();
  if (!isMobile) await expect(page.getByRole("region", { name: "On the motorbike" })).toContainText("W throttle");
  const hud = page.getByRole("region", { name: "Speed, gear and engine" });
  await expect(hud).toContainText("1 of 5");
  await expect(hud).toHaveAttribute("data-foot", "down");
  // Pulled away hard: it changes up by itself.
  await holdUntil(page, ["KeyW"], () => expect(hud).toContainText(/Gear\s*[2-5] of 5/, { timeout: RIDING_MS / 2 }));
  await expect(hud).toHaveAttribute("data-foot", "up");
  if (isMobile) await expect(page.getByRole("button", { name: "Brake", exact: true })).toBeVisible();
  await laidOut(page, "on the motorbike", isMobile, info.outputPath("motorbike.png"));
  if (!isMobile) await page.screenshot({ path: info.outputPath("motorbike.png") });
  await holdUntil(page, ["Space", "KeyS"], () =>
    expect(page.getByRole("button", { name: "Get off the motorbike", exact: true })).toBeVisible({
      timeout: RIDING_MS / 2,
    }),
  );
  await page.keyboard.press("KeyE");
  await expect(page.getByRole("region", { name: "On foot" })).toBeVisible();
});

test("drives the car on Rapier: engine and gears, brakes then reverses, and leaves it parked where it stopped", async ({
  page,
  isMobile,
}, info) => {
  test.setTimeout(RIDING_MS);
  const lines = logOf(page);
  await walkDown(page, isMobile);
  const into = await toTheCar(page);
  await expect(into).toBeVisible();
  await (isMobile ? into.tap() : page.keyboard.press("KeyE"));
  await expect(page.getByRole("region", { name: "In the car" })).toBeVisible();
  if (!isMobile) await expect(page.getByRole("region", { name: "In the car" })).toContainText("Space handbrake");
  const hud = page.getByRole("region", { name: "Speed, gear and engine" });
  await expect(hud).toBeVisible();
  await holdUntil(page, ["KeyW"], () =>
    expect(hud).toContainText(/Speed\s*([3-9]\d|\d{3}) km\/h/, { timeout: RIDING_MS / 2 }),
  );
  await expect(hud).toContainText(/Engine\s*[1-9],?\d{3} rpm/);
  if (isMobile) await expect(page.getByRole("button", { name: "Handbrake", exact: true })).toBeVisible();
  await laidOut(page, "in the car", isMobile, info.outputPath("car.png"));
  if (!isMobile) await page.screenshot({ path: info.outputPath("driving.png") });
  // S brakes to a stop, then backs up in reverse.
  await holdUntil(page, ["KeyS"], () => expect(hud).toContainText(/Gear\s*R/, { timeout: RIDING_MS / 2 }));
  await holdUntil(page, ["Space"], () =>
    expect(page.getByRole("button", { name: "Get out of the car", exact: true })).toBeVisible({
      timeout: RIDING_MS / 2,
    }),
  );
  await page.keyboard.press("KeyE");
  await expect(page.getByRole("region", { name: "On foot" })).toBeVisible();
  // Out beside it, the car stands where it stopped: within reach again.
  await expect(page.getByRole("button", { name: "Get in the car", exact: true })).toBeVisible();
  expect(lines.some((l) => l.startsWith("explore/arcade"))).toBe(false);
});

test("drives arcade cars where WebAssembly is missing, and says so once", async ({ page, isMobile }) => {
  test.skip(isMobile, "the same on every device");
  test.setTimeout(RIDING_MS);
  const lines = logOf(page);
  await page.addInitScript(() => Reflect.deleteProperty(globalThis, "WebAssembly"));
  await page.goto("/");
  await page.getByRole("button", { name: "Walk" }).click();
  await drawn(page);
  await expect(page.getByRole("region", { name: "On foot" })).toContainText(
    "Cars drive simply here: the physics engine did not load.",
  );
  expect(lines.filter((l) => l.startsWith("explore/arcade reason=engine"))).toHaveLength(1);
  await expect(await toTheCar(page)).toBeVisible();
  await page.keyboard.press("KeyE");
  await expect(page.getByRole("region", { name: "Speed" })).toBeVisible();
});

test("lays out the touch controls on foot, flying and on the bicycle, nothing overlapping either way up", async ({
  page,
  isMobile,
}, info) => {
  test.skip(!isMobile, "the touch layout; the motorbike's and the car's in their own journeys");
  test.setTimeout(RIDING_MS);
  await walkDown(page, true);
  await laidOut(page, "on foot", true);
  await page.getByRole("button", { name: "Fly" }).tap();
  await expect(page.getByRole("button", { name: "Down" })).toBeVisible();
  await laidOut(page, "flying", true);
  await page.getByRole("button", { name: "Fly" }).tap();
  await (await toTheBicycle(page)).tap();
  await holdUntil(page, ["KeyW"], () =>
    expect(page.getByRole("button", { name: "Slow down to get off the bicycle" })).toBeVisible({
      timeout: RIDING_MS / 2,
    }),
  );
  await expect(page.getByRole("button", { name: "Gear up" })).toBeVisible();
  await laidOut(page, "on the bicycle", true, info.outputPath("bicycle.png"));
});

/**
 * The helicopter's HUD now: its speed, altitude and rotor, whether it stands on what lies below, and the nearest roof
 * marked to land on (metres off, and degrees off the nose, positive to the left), or null.
 */
const gauges = (page: Page) =>
  page.evaluate(() => {
    const hud = document.querySelector<HTMLElement>(".explore-hud");
    const value = (term: string) =>
      Number(
        [...(hud?.querySelectorAll("dl > div") ?? [])]
          .find((row) => row.querySelector("dt")?.textContent === term)
          ?.querySelector("dd")
          ?.textContent?.replace(/[^\d.]/g, "") ?? Number.NaN,
      );
    const [distance, bearing] = (hud?.dataset.landing ?? "").split(" ").map(Number);
    return {
      speed: value("Speed"),
      altitude: value("Altitude"),
      rotor: value("Rotor"),
      landed: hud?.dataset.landed === "true",
      landing:
        distance === undefined || bearing === undefined || hud?.dataset.landing === undefined
          ? null
          : { distance, bearing },
    };
  });
type Gauges = Awaited<ReturnType<typeof gauges>>;

/** Holds keys, two frames at a time, until the HUD says what is wanted; at most `checks` looks. */
async function flyUntil(page: Page, keys: readonly string[], wanted: (now: Gauges) => boolean, checks: number) {
  const until = async (left: number): Promise<void> => {
    if (left <= 0 || wanted(await gauges(page))) return;
    await frames(page, 2);
    await until(left - 1);
  };
  await Promise.all(keys.map((key) => page.keyboard.down(key)));
  await until(checks);
  await Promise.all(keys.map((key) => page.keyboard.up(key)));
}

/**
 * How the pilot flies over the nearest marked roof: within `over` metres of its middle, sinking sets it down there (well
 * inside the landing assist's 10 m), once no faster than `arrived` km/h. It flies at the mark no faster than letting go
 * can stop it short (`lettingGo` m/s², the hover assist's 4 or so less its lag), between `least` and `most` km/h;
 * off the nose by more than `offTheNose` degrees it is turned first; flying, it keeps the nose within `onTheNose` from
 * further than `steerFrom` metres (close by, a metre's drift swings the bearing wildly). At most `frames` frames.
 */
const PILOT = {
  over: 6,
  arrived: 10,
  lettingGo: 3,
  least: 5,
  most: 50,
  offTheNose: 25,
  onTheNose: 4,
  steerFrom: 8,
  frames: 20_000,
};

/**
 * Over the nearest marked roof, by a pilot in the page: each frame it reads the HUD and holds W, A and D as a person
 * would (key events on the window, as the keyboard sends them), so the keys follow the flight frame by frame however
 * slowly the runner draws, where a test reading the HUD across the wire would see it late and overshoot every turn.
 * Off the nose, W is let go and A or D turns it to the mark (on the spot once slow); on the nose, W flies it at the mark,
 * slower the nearer it is. W is the only key that flies it along: the HUD's speed has no sign, so slowing is always
 * letting go (the hover assist stops any drift). It lets go of every key there, for sinking to set it down.
 */
async function overTheMark(page: Page) {
  const flown = await page.evaluate(
    (pilot) =>
      new Promise<{ distance: number; speed: number; looks: number } | null>((resolve) => {
        const held = new Set<string>();
        const hold = (code: string, want: boolean) => {
          if (held.has(code) === want) return;
          if (want) held.add(code);
          else held.delete(code);
          window.dispatchEvent(new KeyboardEvent(want ? "keydown" : "keyup", { code, bubbles: true }));
        };
        const letGo = () => ["KeyW", "KeyA", "KeyD"].forEach((code) => hold(code, false));
        let looks = 0;
        const tick = () => {
          looks += 1;
          const hud = document.querySelector<HTMLElement>(".explore-hud");
          const speedText = [...(hud?.querySelectorAll("dl > div") ?? [])]
            .find((row) => row.querySelector("dt")?.textContent === "Speed")
            ?.querySelector("dd")?.textContent;
          const speed = Number(speedText?.replace(/[^\d.]/g, "") ?? Number.NaN);
          const landing = hud?.dataset.landing;
          if (landing === undefined) {
            letGo();
            resolve(null);
            return;
          }
          const [distance = Number.NaN, bearing = Number.NaN] = landing.split(" ").map(Number);
          if (looks > pilot.frames || (distance <= pilot.over && speed <= pilot.arrived)) {
            letGo();
            resolve({ distance, speed, looks });
            return;
          }
          const offTheNose = Math.abs(bearing) > pilot.offTheNose;
          // As fast as letting go can stop it in the distance left, short of the mark by a few metres.
          const stoppable = Math.sqrt(2 * pilot.lettingGo * Math.max(0, distance - 4)) * 3.6;
          hold("KeyW", !offTheNose && speed < Math.max(pilot.least, Math.min(pilot.most, stoppable)));
          const steering = distance > pilot.steerFrom || offTheNose;
          hold("KeyA", steering && bearing > pilot.onTheNose);
          hold("KeyD", steering && bearing < -pilot.onTheNose);
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    PILOT,
  );
  expect(flown, "a marked roof within reach").not.toBeNull();
  expect(flown!.distance, JSON.stringify(flown)).toBeLessThanOrEqual(PILOT.over);
}

test("flies the helicopter: in, spun up, lifted, onto a marked roof, set down there, and out", async ({
  page,
  isMobile,
}, info) => {
  // A flight holds a spin-up, a climb, an approach and a descent: three rides' time on a slow runner.
  test.setTimeout(RIDING_MS * 3);
  const lines = logOf(page);
  await walkDown(page, isMobile);
  // It stands straight on along the landing's road: a run reaches its tail.
  expect(lines.find((l) => l.startsWith("explore/helipad"))).toMatch(/^explore\/helipad x=-?\d+\.\d z=-?\d+\.\d$/);
  await test.step("runs to it", () => holdForPrompt(page, ["KeyW", "ShiftLeft"], "Get in the helicopter", 1500));
  const into = page.getByRole("button", { name: "Get in the helicopter", exact: true });
  await expect(into).toBeVisible();
  await (isMobile ? into.tap() : page.keyboard.press("KeyE"));
  await expect(page.getByRole("region", { name: "In the helicopter" })).toBeVisible();
  if (!isMobile) await expect(page.getByRole("region", { name: "In the helicopter" })).toContainText("Space climbs");
  const hud = page.getByRole("region", { name: "Altitude, climb, speed and rotor" });
  await expect(hud).toHaveAttribute("data-landed", "true");
  // The rotor spins up before it can lift.
  await test.step("spins up", () => expect(hud).toContainText(/Rotor\s*100 %/, { timeout: RIDING_MS / 2 }));
  if (isMobile) {
    await expect(page.getByRole("button", { name: "Up", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Down", exact: true })).toBeVisible();
  }
  await laidOut(page, "in the helicopter", isMobile, info.outputPath("helicopter.png"));
  await test.step("lifts off and climbs", () => flyUntil(page, ["Space"], (now) => now.altitude >= 30, 3000));
  expect(lines).toContain("explore/heli-lifted");
  await expect(page.getByRole("button", { name: "Land to get out of the helicopter" })).toBeDisabled();
  // A roof with room is marked near it.
  await expect(hud).toHaveAttribute("data-landing", /^\d+ -?\d+$/);
  if (!isMobile) await page.screenshot({ path: info.outputPath("flying.png") });
  await test.step("flies over the nearest marked roof", () => overTheMark(page));
  await test.step("sinks onto it, set down on its middle", () =>
    flyUntil(page, ["ShiftLeft"], (now) => now.landed, 3000));
  await expect(hud).toHaveAttribute("data-landed", "true");
  expect(lines.find((l) => l.startsWith("explore/heli-landed"))).toMatch(/^explore\/heli-landed on=roof y=\d+\.\d$/);
  await expect(hud).toHaveAttribute("data-landing", /^0 /);
  if (!isMobile) await page.screenshot({ path: info.outputPath("on-the-roof.png") });
  const out = page.getByRole("button", { name: "Get out of the helicopter", exact: true });
  await expect(out).toBeVisible();
  await (isMobile ? out.tap() : page.keyboard.press("KeyE"));
  await expect(page.getByRole("region", { name: "On foot" })).toBeVisible();
  // Out on the roof beside it: within its reach again.
  await expect(page.getByRole("button", { name: "Get in the helicopter", exact: true })).toBeVisible();
});
