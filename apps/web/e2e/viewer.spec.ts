import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const cityFile = join(import.meta.dirname, "../public/cities/redux.json");

/** Presses Tab n times, in order, naming each element that takes focus. */
async function tabThrough(page: Page, n: number, seen: string[] = []): Promise<string[]> {
  if (n === 0) return seen;
  await page.keyboard.press("Tab");
  const name = await page.evaluate(
    () => document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.textContent?.trim() ?? "",
  );
  return tabThrough(page, n - 1, [...seen, name]);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("takken.io");
});

test("draws the first bundled city with its labels and its list", async ({ page }) => {
  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.locator(".label.town").first()).toHaveText("TAKKEN.IO");
  await expect(page.getByRole("status").or(page.locator(".status"))).toContainText("lots");
  await expect(page.getByRole("application", { name: /Map of takken.io/ })).toBeVisible();
});

test("starts in Night atlas because the system prefers dark", async ({ page }) => {
  await expect(page.getByLabel("Theme")).toHaveValue("night-atlas");
});

test("switches city, view and theme", async ({ page }) => {
  await page.getByLabel("City", { exact: true }).selectOption("redux.json");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("redux");
  await page.getByRole("button", { name: "Plan" }).click();
  await expect(page.getByRole("button", { name: "Plan" })).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("Theme").selectOption("dracula");
  await expect(page.locator("main")).toHaveAttribute("data-theme", "dracula");
});

test("opens a city file, and keeps the last city when a file is not a city", async ({ page }) => {
  await page.getByLabel("City file").setInputFiles(cityFile);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("redux");
  await page
    .getByLabel("City file")
    .setInputFiles({ name: "bad.json", mimeType: "application/json", buffer: Buffer.from("{") });
  await expect(page.getByRole("alert").filter({ hasText: "city" })).toHaveText(
    /^That file is not a city: city\/bad-json/,
  );
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("redux");
  expect(readFileSync(cityFile, "utf8").length).toBeGreaterThan(0);
});

test("reaches every control and the map by keyboard, and moves the map with keys", async ({ page, isMobile }) => {
  test.skip(isMobile, "keyboard journey on desktop");
  const reached = await tabThrough(page, 9);
  expect(reached.join(" | ")).toMatch(/Open a city file/);
  expect(reached.join(" | ")).toMatch(/Dimetric/);
  expect(reached.join(" | ")).toMatch(/Map of takken.io/);
  const map = page.getByRole("application");
  await map.focus();
  const before = await page.locator(".label.town").first().boundingBox();
  await page.keyboard.press("ArrowRight");
  const after = await page.locator(".label.town").first().boundingBox();
  expect(after?.x).not.toBe(before?.x);
  await page.keyboard.press("0");
  await expect
    .poll(async () => (await page.locator(".label.town").first().boundingBox())?.x)
    .toBeCloseTo(before?.x ?? 0, 0);
});

test("folds the town list behind a button on a phone", async ({ page, isMobile }) => {
  test.skip(!isMobile, "phone layout");
  const toggle = page.getByRole("button", { name: "Towns and districts" });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(page.getByRole("region", { name: "Towns and districts" })).toBeVisible();
});

test("passes axe with no WCAG 2.2 AA violations", async ({ page }) => {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
});

for (const theme of ["paper-atlas", "night-atlas", "beck", "nolli", "dracula"]) {
  test(`renders in ${theme}`, async ({ page }, info) => {
    await page.getByLabel("Theme").selectOption(theme);
    await page.waitForTimeout(300);
    await page.screenshot({ path: info.outputPath(`${theme}.png`) });
    await expect(page.locator("main")).toHaveAttribute("data-theme", theme);
  });
}
