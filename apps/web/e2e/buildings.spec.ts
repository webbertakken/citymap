import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// The Buildings view, colour by measure, and the cards' measures, on the bundled cities the CLI laid with their
// measures (sizes, tests by name, history and comments).

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const cityFile = join(import.meta.dirname, "../public/cities/takken.io/corridor-tiers.json");

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("takken.io");
});

/** Waits until the map has drawn its frame, for a picture of it. */
const drawn = (page: Page) =>
  page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

/** The legend, opened first on a phone, where it folds behind a button. */
async function openLegend(page: Page, isMobile: boolean) {
  if (isMobile) await page.getByRole("button", { name: "Legend" }).click();
  return page.getByRole("region", { name: "Legend" });
}

const violations = async (page: Page) =>
  (await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations.map(
    (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`,
  );

test("stands the buildings in the Buildings view, keeping the centre and zoom, and back", async ({ page }, info) => {
  const town = page.locator(".label.town").first();
  const before = await town.boundingBox();
  await page.screenshot({ path: info.outputPath("plan.png") });
  await page.getByRole("button", { name: "Buildings" }).click();
  await expect(page.locator("main")).toHaveAttribute("data-mode", "buildings");
  await expect(page.getByRole("button", { name: "Buildings" })).toHaveAttribute("aria-pressed", "true");
  await drawn(page);
  await page.screenshot({ path: info.outputPath("buildings.png") });
  // The town's name stays on the map; its place moves with the camera, the centre held.
  await expect(town).toBeVisible();
  await page.getByRole("button", { name: "Buildings" }).click();
  await expect(page.locator("main")).toHaveAttribute("data-mode", "plan");
  await expect.poll(async () => (await town.boundingBox())?.x).toBeCloseTo(before?.x ?? 0, 0);
});

test("names a building at its top, with its measures on the card", async ({ page, isMobile }, info) => {
  test.skip(isMobile, "hover is a pointer journey");
  await page.getByRole("button", { name: "Buildings" }).click();
  await page.getByRole("searchbox").fill("FitFiles");
  await page.keyboard.press("Enter");
  const selected = page.getByRole("region", { name: "Selected" });
  await expect(selected.getByRole("heading", { level: 3 })).toHaveText("FitFiles.ts");
  await expect(selected.getByText("194 lines")).toBeVisible();
  await expect(selected.getByText("A test names it")).toBeVisible();
  await expect(selected.getByText(/^\d+ commits?$|^2$/).first()).toBeVisible();
  // The marker sits at the lot's foot; just above it stands a building (its own, or one in front of it, which hides
  // it), and the pointer names that building, not the ground behind.
  const marker = (await page.locator(".marker").boundingBox())!;
  await page.waitForTimeout(400);
  await page.mouse.move(marker.x + marker.width / 2, marker.y + marker.height / 2 - 6);
  const card = page.getByRole("tooltip");
  await expect(card).toHaveAttribute("data-kind", "file");
  await expect(card.locator("dt", { hasText: "Size" })).toBeVisible();
  await expect(card.locator("dt", { hasText: "Tested" })).toBeVisible();
  await page.screenshot({ path: info.outputPath("card.png") });
});

test("colours by a measure from the keyboard, its scale in the legend", async ({ page, isMobile }, info) => {
  const legend = await openLegend(page, isMobile);
  const colourBy = legend.getByRole("button", { name: "Colour by: Folder" });
  await colourBy.focus();
  await page.keyboard.press("Enter");
  // Tab moves into the menu, onto the choice made.
  await page.keyboard.press("Tab");
  await expect(page.getByRole("radio", { name: "Folder" })).toBeFocused();
  // An arrow moves to the next choice, and choosing closes the menu.
  await page.keyboard.press("ArrowDown");
  await expect(legend.getByRole("button", { name: "Colour by: Tested" })).toBeFocused();
  await expect(legend.getByText("How far tests exercise it")).toBeVisible();
  await expect(legend.getByText("100 %")).toBeVisible();
  await legend.getByRole("button", { name: "Colour by: Tested" }).click();
  await page.getByRole("radio", { name: "Recency" }).click();
  await expect(legend.getByText("When it last changed")).toBeVisible();
  await page.getByRole("button", { name: "Buildings" }).click();
  await expect(legend.getByText(/^Height: size, 1 to 12 floors \(/)).toBeVisible();
  await drawn(page);
  await page.screenshot({ path: info.outputPath("recency.png") });
  expect(await violations(page)).toEqual([]);
  await legend.getByRole("button", { name: "Colour by: Recency" }).click();
  expect(await violations(page)).toEqual([]);
});

test("offers only folder and kind for a city file without measures, saying why", async ({ page, isMobile }) => {
  const text = readFileSync(cityFile, "utf8");
  const bare = text.slice(0, text.indexOf('"measures":')) + text.slice(text.indexOf(',"repository":') + 1);
  await page.getByRole("button", { name: "More" }).click();
  await page
    .getByLabel("City file")
    .setInputFiles({ name: "bare.json", mimeType: "application/json", buffer: Buffer.from(bare) });
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("takken.io");
  await expect(page.locator(".status")).toContainText("lots");
  const legend = await openLegend(page, isMobile);
  await legend.getByRole("button", { name: /^Colour by/ }).click();
  await expect(page.getByRole("radio", { name: "Size" })).toBeDisabled();
  await expect(page.getByRole("radio", { name: "Size" })).toHaveAccessibleDescription("This city file has no measures");
  await expect(page.getByRole("radio", { name: "Kind" })).toBeEnabled();
});

for (const scheme of ["dark", "light"] as const)
  test.describe(`in a ${scheme} scheme`, () => {
    test.use({ colorScheme: scheme });

    test(`passes axe in the Buildings view, coloured by size, ${scheme}`, async ({ page, isMobile }, info) => {
      await page.getByRole("button", { name: "Buildings" }).click();
      const legend = await openLegend(page, isMobile);
      await legend.getByRole("button", { name: /^Colour by/ }).click();
      await page.getByRole("radio", { name: "Size" }).click();
      await drawn(page);
      await page.screenshot({ path: info.outputPath(`size-${scheme}.png`) });
      expect(await violations(page)).toEqual([]);
    });
  });
