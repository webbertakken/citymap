import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// Opening a repository on the machine. Chromium's folder dialog cannot be driven, so it is stood in for by a folder
// in the origin private file system: a real FileSystemDirectoryHandle, read by the same code as a picked one.

const PICK = "Open a local repository";
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const env = {
  ...process.env,
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "citymap",
  GIT_AUTHOR_EMAIL: "citymap@example.org",
  GIT_COMMITTER_NAME: "citymap",
  GIT_COMMITTER_EMAIL: "citymap@example.org",
};
const git = (dir: string, ...args: string[]) => execFileSync("git", ["-C", dir, ...args], { env, stdio: "pipe" });

/** A folder of files under `root`. */
function folder(root: string, name: string, files: Record<string, string>): string {
  const dir = join(root, name);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(dir, path, ".."), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** A repository with a workspace, ignored build output and untracked dependencies, committed. */
function repository(root: string, name: string): string {
  const dir = folder(root, name, {
    "package.json": '{ "name": "widgets", "workspaces": ["packages/*"] }\n',
    ".gitignore": "node_modules/\ndist/\n",
    "README.md": "# widgets\n",
    "packages/core/src/index.ts": "export {};\n",
    "packages/core/src/index.test.ts": "export {};\n",
    "packages/ui/src/button.tsx": "export {};\n",
    "packages/ui/src/menu.tsx": "export {};\n",
    "docs/guide.md": "# guide\n",
  });
  git(dir, "init", "--quiet", "--initial-branch=main");
  git(dir, "add", "--all");
  git(dir, "commit", "--quiet", "--message", "start");
  // Ignored and untracked: never on the map.
  folder(dir, "node_modules/left-pad", { "index.js": "" });
  folder(dir, "dist", { "bundle.js": "" });
  return dir;
}

let root = "";
const fixtures: Record<string, string> = {};
test.beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "citymap-local-e2e-"));
  fixtures.widgets = repository(root, "widgets");
  // A repository with a submodule checked out: its git data in .git/modules, its files read through its own index.
  fixtures.withsub = repository(root, "withsub");
  const lib = folder(root, "lib", { "src/core.ts": "export {};\n", "src/util.ts": "export {};\n" });
  git(lib, "init", "--quiet", "--initial-branch=main");
  git(lib, "add", "--all");
  git(lib, "commit", "--quiet", "--message", "lib");
  git(fixtures.withsub, "-c", "protocol.file.allow=always", "submodule", "add", "--quiet", lib, "vendor/lib");
  git(fixtures.withsub, "commit", "--quiet", "--message", "add lib");
  fixtures.split = repository(root, "split");
  git(fixtures.split, "update-index", "--split-index");
  fixtures.sparse = repository(root, "sparse");
  git(fixtures.sparse, "sparse-checkout", "init", "--cone", "--sparse-index");
  git(fixtures.sparse, "sparse-checkout", "set", "packages/core");
  fixtures.fresh = folder(root, "fresh", { "a.ts": "" });
  git(fixtures.fresh, "init", "--quiet");
  git(fixtures.widgets, "worktree", "add", "--quiet", join(root, "linked"));
  fixtures.linked = join(root, "linked");
  fixtures.bare = join(root, "bare.git");
  execFileSync("git", ["init", "--quiet", "--bare", fixtures.bare], { env });
  // A repository with a coverage report where Vitest writes it, outside what git tracks.
  fixtures.covered = repository(root, "covered");
  folder(fixtures.covered, "coverage", {
    "lcov.info": "SF:packages/ui/src/button.tsx\nDA:1,1\nDA:2,0\nend_of_record\n",
  });
  fixtures.site = folder(root, "site", {
    ".gitignore": "out/\n*.log\n",
    "index.html": "",
    "styles/site.css": "",
    "out/page.html": "",
    "debug.log": "",
  });
});
test.afterAll(() => rmSync(root, { recursive: true, force: true }));

/** A folder as base64 files and nested folders, for the origin private file system; git's objects stay empty. */
interface Staged {
  readonly [name: string]: string | Staged;
}
function treeOf(dir: string): Staged {
  return Object.fromEntries(
    readdirSync(dir, { withFileTypes: true }).map((entry) => {
      const path = join(dir, entry.name);
      if (!entry.isDirectory()) return [entry.name, readFileSync(path).toString("base64")];
      return [entry.name, ["objects", "hooks", "logs"].includes(entry.name) ? {} : treeOf(path)];
    }),
  );
}

/** Stands a folder in the origin private file system in for the one the person would pick. */
async function stage(page: Page, name: string) {
  const dir = fixtures[name]!;
  const files = await page.evaluate(
    async ({ base, tree }) => {
      let written = 0;
      const place = async (at: FileSystemDirectoryHandle, staged: Staged): Promise<void> => {
        await Promise.all(
          Object.entries(staged).map(async ([entry, value]) => {
            if (typeof value !== "string") return place(await at.getDirectoryHandle(entry, { create: true }), value);
            const writable = await (await at.getFileHandle(entry, { create: true })).createWritable();
            await writable.write(Uint8Array.from(atob(value), (c) => c.charCodeAt(0)));
            written++;
            return writable.close();
          }),
        );
      };
      await place(await (await navigator.storage.getDirectory()).getDirectoryHandle(base, { create: true }), tree);
      Reflect.set(window, "__pick", base);
      return written;
    },
    { base: dir.slice(dir.lastIndexOf("/") + 1), tree: treeOf(dir) },
  );
  expect(files).toBeGreaterThan(0);
}

/** The folder dialog, answered with the staged folder, or closed when nothing is staged. */
async function standInForTheDialog(page: Page) {
  await page.addInitScript(() => {
    Reflect.set(window, "showDirectoryPicker", async () => {
      const name: unknown = Reflect.get(window, "__pick");
      if (typeof name !== "string") throw new DOMException("The user aborted a request.", "AbortError");
      return (await navigator.storage.getDirectory()).getDirectoryHandle(name);
    });
  });
}

/** Waits until the map has drawn its frame, for a picture of it. */
const drawn = (page: Page) =>
  page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

/** Opens a folder: the button beside the search box, or More's "Open {name} again". */
async function openFolder(page: Page, again?: string) {
  if (again === undefined) return page.getByRole("button", { name: PICK }).click();
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("button", { name: again }).click();
}

/** Requests that leave the page's own origin, and any that name the folder. */
function watchRequests(page: Page, name: string) {
  const leaks: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.hostname !== "127.0.0.1" || request.url().includes(name)) leaks.push(request.url());
  });
  return leaks;
}

test.describe("a local repository through Chromium's folder dialog", () => {
  test.skip(({ isMobile }) => isMobile, "a phone picks no folders");

  test.beforeEach(async ({ page }) => {
    await standInForTheDialog(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("takken.io");
  });

  test("lays exactly the tracked files, keeps them on the machine, and remembers the folder", async ({
    page,
  }, info) => {
    const logs: string[] = [];
    page.on("console", (message) => logs.push(message.text()));
    await stage(page, "widgets");
    const leaks = watchRequests(page, "widgets");
    // Right beside the search box, level with it; the search keeps its place and width.
    const search = (await page.locator(".search").boundingBox())!;
    const button = (await page.getByRole("button", { name: PICK }).boundingBox())!;
    expect(button.x - (search.x + search.width)).toBe(8);
    expect([button.y, button.height]).toEqual([search.y, search.height]);
    expect(search.x + search.width / 2).toBe(1400 / 2);
    expect(search.width).toBe(520);
    await page.getByRole("button", { name: PICK }).hover();
    const tip = page.getByRole("tooltip").filter({ hasText: "not folded over its history" });
    await expect(tip).toBeVisible();
    // Under the button, its right edge on the button's, clear of the search.
    const tipBox = (await tip.boundingBox())!;
    expect(tipBox.y).toBeGreaterThanOrEqual(search.y + search.height);
    expect(tipBox.x + tipBox.width).toBe(button.x + button.width);
    await page.screenshot({ path: info.outputPath("beside-search.png") });
    expect((await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations.map((v) => v.id)).toEqual([]);
    await page.getByRole("button", { name: PICK }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("widgets");
    await expect(page.locator(".status")).toContainText("local, single state, not folded");
    await expect(page).toHaveTitle("Local repository · citymap");
    expect(new URL(page.url()).search).toBe("");
    expect(leaks).toEqual([]);
    // Tracked files only: the workspace members are towns, node_modules and dist are nowhere.
    await page.getByRole("searchbox").fill("left-pad");
    await expect(page.getByText("No folders or files match")).toBeVisible();
    await page.getByRole("searchbox").fill("button");
    await expect(page.getByRole("list", { name: "Matches" })).toContainText("packages/ui/src/button.tsx");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    expect(logs).toContainEqual(expect.stringMatching(/^viewer\/local-read source=index files=8 ms=\d+$/));
    expect(logs).toContainEqual("viewer/local-commit how=ref");
    await drawn(page);
    await page.screenshot({ path: info.outputPath("local.png") });
    // Reopened later, the remembered folder is offered again, and opens once the browser allows it.
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("takken.io");
    await openFolder(page, "Open widgets again");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("widgets");
  });

  test("lays a checked-out submodule as a town of its own, and offers the separations it records", async ({
    page,
  }, info) => {
    const logs: string[] = [];
    page.on("console", (message) => logs.push(message.text()));
    await stage(page, "withsub");
    await openFolder(page);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("withsub");
    expect(logs).toContainEqual("viewer/local-submodule path=vendor/lib files=2");
    await expect(page.getByRole("region", { name: "Towns" })).toContainText("vendor/lib");
    await page.getByRole("searchbox").fill("core");
    await expect(page.getByRole("list", { name: "Matches" })).toContainText("vendor/lib/src/core.ts");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Layout" }).click();
    const separate = page.getByRole("group", { name: "Separate towns" });
    await expect(separate.locator("label")).toHaveText(["Workspaces", "Submodules", "Packages"]);
    await separate.getByRole("switch", { name: "Submodules" }).focus();
    await expect(page.getByRole("tooltip").filter({ hasText: "laid from the commit it is pinned to" })).toBeVisible();
    await page.screenshot({ path: info.outputPath("separate-towns.png") });
    expect((await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations.map((v) => v.id)).toEqual([]);
    // Turned off, the submodule's files join the main town.
    await separate.getByRole("switch", { name: "Submodules" }).click();
    await expect(page.getByRole("region", { name: "Towns" })).not.toContainText("vendor/lib");
  });

  test("honours .gitignore in a folder without git", async ({ page }) => {
    const logs: string[] = [];
    page.on("console", (message) => logs.push(message.text()));
    await stage(page, "site");
    await openFolder(page);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("site");
    expect(logs).toContainEqual("viewer/local-walk files=3");
  });

  test("changes nothing when the dialog closes without a folder", async ({ page }) => {
    await openFolder(page);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("takken.io");
    await expect(page.locator(".notice")).toHaveCount(0);
  });

  for (const [name, sentence] of [
    ["split", /split has a split index, which is not read here: run "git update-index --no-split-index"/],
    ["sparse", /sparse has a sparse index, which is not read here: run "git sparse-checkout reapply/],
    ["fresh", /^fresh has no git index yet: nothing is checked out or staged\.$/],
    ["linked", /^linked keeps its git data outside the folder/],
    ["bare", /^bare\.git is git's own data, not a working tree/],
  ] as const)
    test(`names ${name} in the notice and keeps the last city`, async ({ page }, info) => {
      await stage(page, name);
      await openFolder(page);
      await expect(page.locator(".notice [role=alert]")).toHaveText(sentence);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("takken.io");
      await expect(page.locator(".status")).toHaveText(/lots$/);
      if (name === "split") await page.screenshot({ path: info.outputPath("failure.png") });
    });
});

test.describe("in a light system scheme", () => {
  test.use({ colorScheme: "light" });
  test.skip(({ isMobile }) => isMobile, "a phone picks no folders");

  test("passes axe with the local repository shown and More open", async ({ page }, info) => {
    await standInForTheDialog(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("takken.io");
    await stage(page, "widgets");
    await openFolder(page);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("widgets");
    await drawn(page);
    await page.screenshot({ path: info.outputPath("local-light.png") });
    await page.getByRole("button", { name: "More" }).click();
    expect((await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations.map((v) => v.id)).toEqual([]);
    // The separate towns, declared workspaces deciding packages: the note and a disabled switch.
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Layout" }).click();
    const separate = page.getByRole("group", { name: "Separate towns" });
    await expect(separate).toContainText("Declared workspaces decide; turn Workspaces off to choose.");
    await expect(separate.getByRole("switch", { name: "Packages" })).toBeDisabled();
    await page.screenshot({ path: info.outputPath("separate-towns-light.png") });
    expect((await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze()).violations.map((v) => v.id)).toEqual([]);
  });
});

test.describe("a local repository through the folder input", () => {
  test.skip(({ isMobile }) => isMobile, "a phone picks no folders");

  test("lists the folder, then lays the tracked files", async ({ page }) => {
    // As in Firefox: no folder dialog.
    await page.addInitScript(() =>
      Object.defineProperty(window, "showDirectoryPicker", { value: undefined, configurable: true }),
    );
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("takken.io");
    const chooser = page.waitForEvent("filechooser");
    await openFolder(page);
    await expect(page.locator(".status")).toHaveText("Listing the folder's files…");
    await (await chooser).setFiles(fixtures.widgets!);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("widgets");
    await expect(page.locator(".status")).toContainText("local, single state, not folded");
    await page.getByRole("searchbox").fill("left-pad");
    await expect(page.getByText("No folders or files match")).toBeVisible();
  });
});

test("offers no local repository on a phone", async ({ page, isMobile }) => {
  test.skip(!isMobile, "a phone only");
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("takken.io");
  await page.getByRole("button", { name: "More" }).click();
  await expect(page.getByRole("button", { name: /^Open a city file/ })).toBeVisible();
  await expect(page.getByRole("button", { name: PICK })).toHaveCount(0);
});

test.describe("a local repository's measures", () => {
  test.skip(({ isMobile }) => isMobile, "a phone picks no folders");

  test.beforeEach(async ({ page }) => {
    await standInForTheDialog(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("takken.io");
  });

  test("reads its files' lines and its coverage report, keeping both on the machine", async ({ page }, info) => {
    await stage(page, "covered");
    const leaks = watchRequests(page, "covered");
    await openFolder(page);
    await expect(page.locator(".status")).toContainText("local, single state, not folded");
    await page.getByRole("searchbox").fill("button");
    await page.keyboard.press("Enter");
    const selected = page.getByRole("region", { name: "Selected" });
    await expect(selected.getByRole("heading", { level: 3 })).toHaveText("button.tsx");
    await expect(selected.getByText("50 %")).toBeVisible();
    await expect(selected.getByText("Coverage report")).toBeVisible();
    await expect(selected.locator(".hit-rows > div", { hasText: "Size" })).toContainText("1 line");
    await page.getByRole("button", { name: /^Colour by/ }).click();
    await expect(page.getByRole("radio", { name: "Size" })).toBeEnabled();
    await expect(page.getByRole("radio", { name: /^Churn/ })).toHaveAccessibleDescription("Needs the CLI's history");
    await page.getByRole("radio", { name: "Tested" }).click();
    await page.getByRole("button", { name: "Buildings" }).click();
    await drawn(page);
    await page.screenshot({ path: info.outputPath("covered.png") });
    expect(leaks).toEqual([]);
  });
});
