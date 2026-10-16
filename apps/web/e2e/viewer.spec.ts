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

/** Picks a map theme from the Theme menu. */
async function chooseTheme(page: Page, label: string) {
  await page.getByRole("button", { name: "Theme" }).click();
  await page.getByRole("radio", { name: label }).click();
}

/** Opens the drawer where it starts closed (a phone). */
async function openDetails(page: Page, isMobile: boolean) {
  if (isMobile) await page.getByRole("button", { name: "Details", exact: true }).click();
}

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

test("draws the first bundled city with its labels and its list", async ({ page, isMobile }) => {
  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.locator(".label.town").first()).toHaveText("TAKKEN.IO");
  await expect(page.locator(".status")).toContainText("lots");
  await expect(page.getByRole("application", { name: /Map of takken.io/ })).toBeVisible();
  await openDetails(page, isMobile);
  await expect(page.getByRole("region", { name: "Towns" }).getByRole("listitem")).toHaveCount(2);
});

test("starts in Night atlas and a dark interface because the system prefers dark", async ({ page }) => {
  await expect(page.locator("main")).toHaveAttribute("data-theme", "night-atlas");
  const ink = await page.locator(".card-title h1").evaluate((h) => getComputedStyle(h).color);
  expect(ink).toBe("rgb(238, 241, 245)");
});

test("switches city, view and theme", async ({ page }) => {
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("button", { name: /^redux/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("redux");
  await expect(page.getByRole("button", { name: "Plan" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "3D" }).click();
  await expect(page.getByRole("button", { name: "3D" })).toHaveAttribute("aria-pressed", "true");
  await chooseTheme(page, "Dracula");
  await expect(page.locator("main")).toHaveAttribute("data-theme", "dracula");
  await expect(page.getByRole("radio", { name: "Dracula" })).toBeHidden();
});

test("finds a file, flies to it and selects it", async ({ page, isMobile }, info) => {
  await page.getByRole("searchbox").fill("tailwind");
  const matches = page.getByRole("list", { name: "Matches" }).getByRole("button");
  await expect(matches.first()).toBeVisible();
  expect(await matches.count()).toBeLessThanOrEqual(7);
  await page.screenshot({ path: info.outputPath("search.png") });
  const name = (await matches.first().locator(".option-text > span").first().textContent())!.replace(
    /^(File|Folder) /,
    "",
  );
  await page.keyboard.press("Enter");
  await expect(page.locator(".marker")).toBeVisible();
  // The marker rings the place without hiding its name: names stack above it.
  const layer = (selector: string) => page.locator(selector).evaluate((e) => Number(getComputedStyle(e).zIndex));
  expect(await layer(".marker")).toBeLessThan(await layer(".labels"));
  await openDetails(page, isMobile);
  await expect(page.getByRole("region", { name: "Selected" })).toContainText(name);
  await page.screenshot({ path: info.outputPath("found.png") });
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
  const reached = await tabThrough(page, 8);
  expect(reached.join(" | ")).toMatch(/Map of takken.io/);
  expect(reached.join(" | ")).toMatch(/Search files and folders/);
  expect(reached.join(" | ")).toMatch(/3D/);
  expect(reached.join(" | ")).toMatch(/More/);
  await page.keyboard.press("/");
  await expect(page.getByRole("searchbox")).toBeFocused();
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

const CARDS = [".card-title", ".search", ".controls", ".zoom", ".legend", ".drawer", ".details-button"];

/** Every pair of visible cards whose boxes meet. */
async function overlapping(page: Page): Promise<string[]> {
  const measured = await Promise.all(
    CARDS.map(async (selector) => {
      const card = page.locator(selector);
      return { selector, box: (await card.isVisible()) ? await card.boundingBox() : null };
    }),
  );
  const boxes = measured.flatMap(({ selector, box }) => (box ? [{ selector, box }] : []));
  return boxes.flatMap((a, i) =>
    boxes
      .slice(i + 1)
      .filter(
        (b) =>
          a.box.x < b.box.x + b.box.width &&
          b.box.x < a.box.x + a.box.width &&
          a.box.y < b.box.y + b.box.height &&
          b.box.y < a.box.y + a.box.height,
      )
      .map((b) => `${a.selector} × ${b.selector}`),
  );
}

/** The overlaps at each window size in turn, by width. */
async function overlapsAt(page: Page, sizes: readonly [number, number][]): Promise<Record<number, string[]>> {
  const [first, ...rest] = sizes;
  if (!first) return {};
  await page.setViewportSize({ width: first[0], height: first[1] });
  const here = await overlapping(page);
  return { [first[0]]: here, ...(await overlapsAt(page, rest)) };
}

test("lays the cards out so none covers another, at every width", async ({ page, isMobile }, info) => {
  await page.screenshot({ path: info.outputPath("cards.png") });
  if (isMobile) {
    expect(await overlapping(page)).toEqual([]);
    return;
  }
  // The wide layout, the medium one where the search sits under the title, and the narrow one.
  const sizes: [number, number][] = [
    [1400, 900],
    [1101, 800],
    [1100, 800],
    [900, 700],
    [761, 700],
    [760, 700],
    [360, 640],
  ];
  const found = await overlapsAt(page, sizes);
  expect(found).toEqual(Object.fromEntries(sizes.map(([w]) => [w, []])));
});

test("keeps the drawer as a closed sheet on a phone, and as a panel that hides on a desktop", async ({
  page,
  isMobile,
}) => {
  const drawer = page.getByRole("complementary", { name: "Details" });
  if (isMobile) {
    await expect(drawer).toBeHidden();
    await page.getByRole("button", { name: "Details", exact: true }).click();
    await expect(drawer).toBeVisible();
    const box = (await drawer.boundingBox())!;
    expect(box.y + box.height).toBeCloseTo(page.viewportSize()!.height, 0);
  } else await expect(drawer).toBeVisible();
  await page.getByRole("button", { name: "Hide details" }).click();
  await expect(drawer).toBeHidden();
  await expect(page.getByRole("button", { name: "Details", exact: true })).toBeVisible();
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
  await openDetails(page, isMobile);
  const towns = page.getByRole("region", { name: "Towns" });
  await towns.getByRole("button", { name: "takken.io old town" }).click();
  const crumbs = page.getByRole("navigation", { name: "Breadcrumb" });
  await expect(crumbs.locator("[aria-current=page]")).toHaveText("takken.io old town");
  await expect(towns.getByRole("listitem")).toHaveCount(1);
  await expect(page.locator(".label.town")).toHaveText(["TAKKEN.IO OLD TOWN"]);
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
  await page.screenshot({ path: info.outputPath("drill.png") });
  await crumbs.getByRole("button", { name: "takken.io" }).click();
  await expect(crumbs).toHaveCount(0);
  await expect(towns.getByRole("listitem")).toHaveCount(2);
  if (isMobile) return;
  await towns.getByRole("button", { name: "takken.io old town" }).click();
  await page.getByRole("application").focus();
  await page.keyboard.press("Escape");
  await expect(crumbs).toHaveCount(0);
});

/** Axe over the page with its menus and matches open, so every card is judged. */
async function axeEverything(page: Page, isMobile: boolean) {
  const violations = async () =>
    (await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations.map(
      (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`,
    );
  expect(await violations()).toEqual([]);
  await page.getByRole("searchbox").fill("src");
  await expect(page.getByRole("list", { name: "Matches" })).toBeVisible();
  expect(await violations()).toEqual([]);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "More" }).click();
  expect(await violations()).toEqual([]);
  await page.keyboard.press("Escape");
  await openDetails(page, isMobile);
  expect(await violations()).toEqual([]);
}

test("passes axe with no WCAG 2.2 AA violations, dark", async ({ page, isMobile }) => {
  await axeEverything(page, isMobile);
});

test.describe("in a light system scheme", () => {
  test.use({ colorScheme: "light" });

  test("passes axe with no WCAG 2.2 AA violations, light", async ({ page, isMobile }, info) => {
    await expect(page.locator("main")).toHaveAttribute("data-theme", "paper-atlas");
    const ink = await page.locator(".card-title h1").evaluate((h) => getComputedStyle(h).color);
    expect(ink).toBe("rgb(31, 29, 25)");
    await page.screenshot({ path: info.outputPath("light.png") });
    await axeEverything(page, isMobile);
  });
});

for (const [theme, label] of [
  ["paper-atlas", "Paper atlas"],
  ["night-atlas", "Night atlas"],
  ["beck", "Beck schematic"],
  ["nolli", "Nolli noir"],
  ["dracula", "Dracula"],
] as const) {
  test(`renders in ${theme}`, async ({ page }, info) => {
    await chooseTheme(page, label);
    await page.waitForTimeout(300);
    await page.screenshot({ path: info.outputPath(`${theme}.png`) });
    await expect(page.locator("main")).toHaveAttribute("data-theme", theme);
  });
}

test("lays a GitHub repository in a worker, from the field and from the address", async ({ page }) => {
  // Nothing reaches the real GitHub: the owner's suggestions are unknown here.
  await page.route("https://api.github.com/**", (route) =>
    route.fulfill({ status: 404, json: {}, headers: { "access-control-allow-origin": "*" } }),
  );
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
  await page.getByRole("searchbox").fill("acme/widgets");
  await page.getByRole("button", { name: /^Lay acme\/widgets from GitHub/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("widgets");
  await expect(page.locator(".status")).toHaveText(/towns · 80 lots · single state, not folded$/);
  await expect(page).toHaveURL(/\?repo=acme\/widgets$/);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("widgets");
});
