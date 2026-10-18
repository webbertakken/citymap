import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const cityFile = join(import.meta.dirname, "../public/cities/redux/corridor-tiers~none.json");

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

test("switches city and theme, starting in plan view", async ({ page }) => {
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("button", { name: /^redux/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("redux");
  await expect(page.locator("main")).toHaveAttribute("data-mode", "plan");
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

test("switches the city's layout by keyboard, a tooltip naming each toggle, and loads its variant", async ({
  page,
  isMobile,
}, info) => {
  const layout = page.getByRole("button", { name: "Layout" });
  await layout.focus();
  await page.keyboard.press("Enter");
  await expect(layout).toHaveAttribute("aria-expanded", "true");
  const switches = page.getByRole("group", { name: "City layout" }).getByRole("switch");
  await expect(switches).toHaveCount(4);
  await page.keyboard.press("Tab");
  const corridor = page.getByRole("switch", { name: "Corridor" });
  await expect(corridor).toBeFocused();
  await expect(corridor).toBeChecked();
  const tip = page.getByRole("tooltip").filter({ hasText: "when one folder holds nearly everything" });
  await expect(tip).toBeVisible();
  await expect(corridor).toHaveAccessibleDescription(
    "when one folder holds nearly everything, the small folders beside it gather into one corner quarter behind a short avenue, instead of thin strips round the edge.",
  );
  await page.screenshot({ path: info.outputPath("toggles.png") });
  const variant = page.waitForResponse((r) => r.url().endsWith("/cities/takken.io/tiers.json"));
  await page.keyboard.press("Space");
  expect((await variant).ok()).toBe(true);
  await expect(corridor).not.toBeChecked();
  await expect(page.locator(".status")).toContainText("lots");
  // The popover stays open while switches change; Escape hides the tooltip first, then closes the popover.
  await page.keyboard.press("Escape");
  await expect(tip).toBeHidden();
  await expect(layout).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(layout).toHaveAttribute("aria-expanded", "false");
  await expect(layout).toBeFocused();
  if (isMobile) return;
  // A pointer resting on a switch's row shows its tooltip, beside the panel.
  await layout.click();
  await page.getByRole("switch", { name: "Tiers" }).hover();
  await expect(page.getByRole("tooltip").filter({ hasText: "a town's size sets its widest road" })).toBeVisible();
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
  const reached = await tabThrough(page, 11);
  expect(reached.join(" | ")).toMatch(/Map of takken.io/);
  expect(reached.join(" | ")).toMatch(/Search files and folders/);
  expect(reached.join(" | ")).toMatch(/Plan/);
  expect(reached.join(" | ")).toMatch(/Buildings/);
  expect(reached.join(" | ")).toMatch(/Theme/);
  expect(reached.join(" | ")).toMatch(/Layout/);
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

const CARDS = [
  ".card-title",
  ".search",
  ".controls",
  ".zoom",
  ".legend",
  ".legend-button",
  ".drawer",
  ".details-button",
];

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
  // The card's name is drawn, not squeezed away by the lines below it.
  await expect(page.getByRole("tooltip").locator(".hit-name")).toBeVisible();
  const named = await page.getByRole("tooltip").locator(".hit-name").textContent();
  await page.screenshot({ path: info.outputPath("hover.png") });
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.getByRole("region", { name: "Selected" })).toContainText(named ?? "");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Selected" })).toContainText("Nothing yet");
});

/** A move of the map by its arrow keys, and the edge it takes the found place to. */
const EDGES: [string, string[]][] = [
  ["the middle", []],
  ["the right edge", Array<string>(4).fill("ArrowLeft")],
  ["the left edge", Array<string>(4).fill("ArrowRight")],
  ["the bottom edge", Array<string>(4).fill("ArrowUp")],
  ["the top edge", Array<string>(4).fill("ArrowDown")],
  ["the bottom right corner", [...Array<string>(4).fill("ArrowLeft"), ...Array<string>(4).fill("ArrowUp")]],
  ["the top right corner", [...Array<string>(4).fill("ArrowLeft"), ...Array<string>(4).fill("ArrowDown")]],
  // The legend holds the very corner, so the place stops just above it.
  ["the bottom left corner", [...Array<string>(4).fill("ArrowRight"), ...Array<string>(2).fill("ArrowUp")]],
  ["the top left corner", [...Array<string>(4).fill("ArrowRight"), ...Array<string>(4).fill("ArrowDown")]],
];

/** Presses the keys in order. */
async function press(page: Page, keys: readonly string[]): Promise<void> {
  const [first, ...rest] = keys;
  if (first === undefined) return;
  await page.keyboard.press(first);
  await press(page, rest);
}

for (const [edge, keys] of EDGES)
  test(`keeps a long path's card whole inside the map at ${edge}, clear of the pointer`, async ({
    page,
    isMobile,
  }, info) => {
    test.skip(isMobile, "hover is a pointer journey");
    // Flights are instant, so the keys move the map from where the flight ends.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.getByRole("button", { name: "Hide details" }).click();
    const map = page.getByRole("application");
    const bounds = (await map.boundingBox())!;
    // The file with the longest path in takken.io, and a long name without a slash.
    await page.getByRole("searchbox").fill("ZemismartZigbee");
    await page.keyboard.press("Enter");
    await map.focus();
    await press(page, keys);
    const ring = (await page.locator(".marker").boundingBox())!;
    const pointer = { x: ring.x + ring.width / 2, y: ring.y + ring.height / 2 };
    await page.mouse.move(pointer.x, pointer.y);
    const card = page.getByRole("tooltip");
    await expect(card).toHaveAttribute("data-kind", "file");
    await expect(card.locator(".hit-name")).toHaveText("BlogPost-JayN-ZemismartZigbeeRollerShadeMotor.pdf");
    const box = (await card.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(bounds.x);
    expect(box.y).toBeGreaterThanOrEqual(bounds.y);
    expect(box.x + box.width).toBeLessThanOrEqual(bounds.x + bounds.width);
    expect(box.y + box.height).toBeLessThanOrEqual(bounds.y + bounds.height);
    const covered =
      pointer.x >= box.x && pointer.x <= box.x + box.width && pointer.y >= box.y && pointer.y <= box.y + box.height;
    expect(covered, "the card is clear of the pointer").toBe(false);
    // No text is cut: every element holds what it draws (but what is only for screen readers, which is clipped by design).
    const clipped = await card.evaluate((element) =>
      [element, ...element.querySelectorAll(":not(.visually-hidden, .visually-hidden *)")]
        .filter((e) => e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1)
        .map((e) => e.className),
    );
    expect(clipped).toEqual([]);
    await page.screenshot({ path: info.outputPath("long-path.png") });
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

/** Axe over the page with its menus, matches and a hover card open, so every card is judged. */
async function axeEverything(page: Page, isMobile: boolean) {
  const violations = async () =>
    (await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations.map(
      (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`,
    );
  expect(await violations()).toEqual([]);
  if (!isMobile) {
    const town = (await page.locator(".label.town").first().boundingBox())!;
    await page.mouse.move(town.x + town.width / 2, town.y + town.height / 2);
    await expect(page.getByRole("tooltip")).toBeVisible();
    expect(await violations()).toEqual([]);
    await page.mouse.move(1, 1);
  }
  await page.getByRole("searchbox").fill("src");
  await expect(page.getByRole("list", { name: "Matches" })).toBeVisible();
  expect(await violations()).toEqual([]);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "More" }).click();
  expect(await violations()).toEqual([]);
  await page.keyboard.press("Escape");
  // The layout toggles, a tooltip shown.
  await page.getByRole("button", { name: "Layout" }).click();
  await page.getByRole("switch", { name: "Quarters" }).focus();
  await expect(page.getByRole("tooltip").filter({ hasText: "planned quarters" })).toBeVisible();
  expect(await violations()).toEqual([]);
  await page.keyboard.press("Escape");
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
  const status = page.locator(".status");
  await expect(status).toHaveText(/towns · 80 lots · single state, not folded$/);
  // The status wraps rather than being cut.
  expect(await status.evaluate((e) => e.scrollWidth <= e.clientWidth && e.scrollHeight <= e.clientHeight)).toBe(true);
  await expect(page).toHaveURL(/\?repo=acme\/widgets$/);
  // Another layout lays the snapshot again, in the worker.
  await page.getByRole("button", { name: "Layout" }).click();
  await page.getByRole("switch", { name: "Quarters" }).check();
  await expect(page.locator(".status")).toHaveText(/towns · 80 lots · single state, not folded$/);
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("widgets");
});
