import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

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
  await expect(page.getByRole("region", { name: "On foot" })).toContainText("Physics prototype: Rapier");
  // The walls rose and the walk began, both said in the log.
  expect(lines.find((l) => l.startsWith("explore/walls"))).toMatch(/^explore\/walls engine=rapier buildings=\d+ /);
  expect(lines.find((l) => l.startsWith("explore/enter"))).toMatch(/^explore\/enter landing=road buildings=\d+$/);
  await drawn(page);
  await page.screenshot({ path: info.outputPath("start.png") });
  await page.keyboard.down("KeyW");
  await frames(page, 60);
  await page.keyboard.up("KeyW");
  await page.screenshot({ path: info.outputPath("walked.png") });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("application", { name: /^Map of takken\.io/ })).toBeVisible();
  const leave = lines.find((l) => l.startsWith("explore/leave"));
  expect(leave).toMatch(/^explore\/leave x=-?\d+\.\d z=-?\d+\.\d$/);
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
