import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

// Walking in the city: down from the map through the loading card, on foot by keys or by touch, and back to the map.

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

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
  await expect(page.getByRole("region", { name: "On foot" })).toContainText("Physics prototype: bespoke 2.5D");
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

test("gets on the bicycle parked by the road with E, rides it, and gets off once stopped", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "the keyboard's E; touch uses the prompt's button");
  // Held until what it waits for shows, whatever the frame rate: a slow software renderer steps the walk in fewer,
  // capped frames, so a fixed time covers less ground.
  const holdUntil = async (keys: readonly string[], shown: Locator) => {
    await Promise.all(keys.map((key) => page.keyboard.down(key)));
    await expect(shown).toBeVisible({ timeout: 30_000 });
    await Promise.all(keys.map((key) => page.keyboard.up(key)));
  };
  await page.getByRole("button", { name: "Walk" }).click();
  await drawn(page);
  // The bicycle stands 4 m up the street, 3.2 m to the right at the kerb: diagonally ahead and right.
  await holdUntil(["KeyW", "KeyD"], page.getByRole("button", { name: "Get on the bicycle" }));
  await page.keyboard.press("KeyE");
  await expect(page.getByRole("region", { name: "On the bicycle" })).toBeVisible();
  await holdUntil(["KeyW"], page.getByRole("button", { name: "Slow down to get off the bicycle" }));
  await expect(page.getByRole("button", { name: "Slow down to get off the bicycle" })).toBeDisabled();
  await holdUntil(["Space"], page.getByRole("button", { name: "Get off the bicycle" }));
  await page.keyboard.press("KeyE");
  await expect(page.getByRole("region", { name: "On foot" })).toBeVisible();
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
