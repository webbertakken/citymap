import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

// A city file as a partial clone writes it when offline: its workspace manifests could not be fetched, and a submodule
// whose files it does not hold lies as one folder holding its .gitlink lot.
const source = join(import.meta.dirname, "../public/cities/redux/corridor-tiers~none.json");

function unfetchedCity(): { text: string; folder: string } {
  const city = JSON.parse(readFileSync(source, "utf8"));
  const lot = city.towns[0].lots.find((l: { path: string; vacant?: boolean }) => !l.vacant && l.path.includes("/"));
  const folder = lot.path.slice(0, lot.path.lastIndexOf("/"));
  lot.path = `${folder}/.gitlink`;
  return { text: JSON.stringify({ ...city, manifests: "unfetchable" }), folder };
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("takken.io");
});

test("says a partial clone's manifests could not be fetched, and why an unread submodule's files are not there", async ({
  page,
  isMobile,
}, info) => {
  const { text } = unfetchedCity();
  await page
    .getByLabel("City file")
    .setInputFiles({ name: "redux.json", mimeType: "application/json", buffer: Buffer.from(text) });
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("redux");
  await page.getByRole("button", { name: "Layout" }).click();
  const group = page.getByRole("group", { name: "Separate towns" });
  await expect(
    group.getByText("This clone's workspace manifests could not be fetched: its workspaces are not known."),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath("unfetched.png") });
  await page.keyboard.press("Escape");
  await page.getByRole("searchbox").fill(".gitlink");
  await expect(page.getByRole("list", { name: "Matches" }).getByRole("button").first()).toBeVisible();
  await page.keyboard.press("Enter");
  // On a phone the details wait behind their button.
  if (isMobile) await page.getByRole("button", { name: "Details", exact: true }).click();
  await expect(page.getByText("This submodule's files are not in this clone").first()).toBeVisible();
  await page.screenshot({ path: info.outputPath("submodule.png") });
});
