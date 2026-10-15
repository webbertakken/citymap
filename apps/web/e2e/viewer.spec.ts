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
  await expect(page.getByRole("button", { name: "Plan" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Dimetric" }).click();
  await expect(page.getByRole("button", { name: "Dimetric" })).toHaveAttribute("aria-pressed", "true");
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

test("names what is under the pointer, and selects it into the panel", async ({ page, isMobile }, info) => {
  test.skip(isMobile, "hover is a pointer journey");
  // The town's name sits over its heart (the middle of the map is open country between two towns).
  const box = (await page.locator(".label.town").first().boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.getByRole("tooltip")).toBeVisible();
  // The card's title is drawn, not squeezed away by the lines below it.
  await expect(page.getByRole("tooltip").locator("strong")).toBeVisible();
  const named = await page.getByRole("tooltip").locator("strong").textContent();
  await page.screenshot({ path: info.outputPath("hover.png") });
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.getByRole("region", { name: "Selected" })).toContainText(named ?? "");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Selected" })).toContainText("Nothing yet");
});

test("shows one town alone, and the whole city again from the breadcrumb or Escape", async ({
  page,
  isMobile,
}, info) => {
  if (isMobile) await page.getByRole("button", { name: "Towns and districts" }).click();
  await page.getByRole("button", { name: "Show only this town: takken.io old town" }).click();
  const crumbs = page.getByRole("navigation", { name: "Breadcrumb" });
  await expect(crumbs.locator("[aria-current=page]")).toHaveText("takken.io old town");
  await expect(page.getByRole("region", { name: "Towns and districts" }).getByRole("heading")).toHaveCount(1);
  await expect(page.locator(".label.town")).toHaveText(["TAKKEN.IO OLD TOWN"]);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
  await page.screenshot({ path: info.outputPath("drill.png") });
  await crumbs.getByRole("button", { name: "takken.io" }).click();
  await expect(crumbs).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Towns and districts" }).getByRole("heading")).toHaveCount(2);
  if (isMobile) return;
  await page.getByRole("button", { name: "Show only this town: takken.io old town" }).click();
  await page.getByRole("application").focus();
  await page.keyboard.press("Escape");
  await expect(crumbs).toHaveCount(0);
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

test("lays a GitHub repository in a worker, from the field and from the address", async ({ page }) => {
  // GitHub, answered from fixtures: a repository of three folders.
  const tree = ["lib", "src", "docs"].flatMap((folder) =>
    Array.from({ length: 40 }, (_, i) => ({
      path: `${folder}/f${i}.${folder === "docs" ? "md" : "ts"}`,
      type: "blob",
      sha: `${folder}${i}`,
    })),
  );
  await page.route("https://api.github.com/repos/acme/widgets/commits/HEAD", (route) =>
    route.fulfill({
      json: { sha: "c9", commit: { tree: { sha: "t9" } } },
      headers: { "access-control-allow-origin": "*" },
    }),
  );
  await page.route("https://api.github.com/repos/acme/widgets/git/trees/t9?recursive=1", (route) =>
    route.fulfill({ json: { truncated: false, tree }, headers: { "access-control-allow-origin": "*" } }),
  );
  await page.getByLabel("GitHub repository").fill("acme/widgets");
  await page.getByRole("button", { name: "Lay" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("widgets");
  await expect(page.locator(".status")).toHaveText(/towns · 80 lots · single state, not folded$/);
  await expect(page).toHaveURL(/\?repo=acme\/widgets$/);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("widgets");
});
