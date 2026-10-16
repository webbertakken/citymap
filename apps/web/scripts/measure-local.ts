// Times opening local repositories in the viewer as a person would: Firefox through the folder input (the browser lists
// the whole folder), Chromium through a directory handle (only the git index, HEAD, its ref, the config and the root
// manifests, staged in the origin private file system, as the native dialog cannot be driven).
// Usage: xvfb-run -a bun scripts/measure-local.ts <base url> <checkout …>   (the export served by scripts/serve.ts)
import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { chromium, firefox, type Browser, type Page } from "@playwright/test";

const [base = "https://127.0.0.1:5192", ...checkouts] = process.argv.slice(2);
const MANIFESTS = ["package.json", "pnpm-workspace.yaml", "lerna.json", "Cargo.toml", "go.work", "pyproject.toml"];

/** What the handle path reads of a checkout, as base64 by path. */
function readPart(dir: string): Record<string, string> {
  const head = readFileSync(join(dir, ".git/HEAD"), "utf8").trim();
  const ref = head.startsWith("ref: ") ? head.slice(5) : null;
  const wanted = [".git/HEAD", ".git/config", ".git/index", ".git/packed-refs", ...(ref ? [`.git/${ref}`] : [])];
  const present = [...wanted, ...MANIFESTS].filter((path) => {
    try {
      return statSync(join(dir, path)).isFile();
    } catch {
      return false;
    }
  });
  return Object.fromEntries(present.map((path) => [path, readFileSync(join(dir, path)).toString("base64")]));
}

/** Opens the viewer, waiting for its first city. */
async function viewer(browser: Browser, logs: string[]): Promise<Page> {
  const page = await browser.newPage({ ignoreHTTPSErrors: true, viewport: { width: 1400, height: 900 } });
  page.on("console", (message) => {
    logs.push(message.text());
    if (message.type() === "error") console.error(`measure-local/page ${message.text()}`);
  });
  await page.goto(base);
  await page.getByRole("heading", { level: 1 }).waitFor();
  return page;
}

/** Picks the local repository from More and waits until its city or a failure is shown; the milliseconds, or why. */
async function openAndWait(page: Page, pick: () => Promise<void>): Promise<string> {
  const started = Date.now();
  await pick();
  const shown = page.locator(".status", { hasText: "local, single state, not folded" });
  const failed = page.locator(".notice [role=alert]");
  await shown.or(failed).waitFor({ timeout: 600_000 });
  if (await failed.count()) return `failed=${JSON.stringify(await failed.textContent())}`;
  return `ms=${Date.now() - started}`;
}

const line = (logs: readonly string[], code: string) => logs.find((l) => l.startsWith(code)) ?? `${code} (none)`;

async function throughInput(dir: string) {
  // Headed (run under xvfb-run where there is no display): headless Firefox has no WebGL, which the map needs.
  const browser = await firefox.launch({ headless: false });
  const logs: string[] = [];
  const page = await viewer(browser, logs);
  const ms = await openAndWait(page, async () => {
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "More" }).click();
    await page.getByRole("button", { name: "Open a local repository…" }).click();
    await (await chooser).setFiles(dir, { timeout: 600_000 });
  });
  console.log(
    `measure-local/firefox repo=${basename(dir)} ${ms} ${line(logs, "viewer/local-listed")} ${line(logs, "viewer/local-read")}`,
  );
  await browser.close();
}

async function throughHandle(dir: string) {
  const browser = await chromium.launch();
  const logs: string[] = [];
  const page = await viewer(browser, logs);
  const name = basename(dir);
  await page.evaluate(
    async ({ folder, files }) => {
      const root = await (await navigator.storage.getDirectory()).getDirectoryHandle(folder, { create: true });
      await Promise.all(
        Object.entries(files).map(async ([path, data]) => {
          const parts = path.split("/");
          const at = await parts
            .slice(0, -1)
            .reduce(
              async (parent, part) => (await parent).getDirectoryHandle(part, { create: true }),
              Promise.resolve(root),
            );
          const writable = await (await at.getFileHandle(parts.at(-1)!, { create: true })).createWritable();
          await writable.write(Uint8Array.from(atob(data), (c) => c.charCodeAt(0)));
          await writable.close();
        }),
      );
      Reflect.set(window, "showDirectoryPicker", () => Promise.resolve(root));
    },
    { folder: name, files: readPart(dir) },
  );
  const ms = await openAndWait(page, async () => {
    await page.getByRole("button", { name: "More" }).click();
    await page.getByRole("button", { name: "Open a local repository…" }).click();
  });
  console.log(`measure-local/chromium repo=${name} ${ms} ${line(logs, "viewer/local-read")}`);
  await browser.close();
}

const dirs = checkouts.filter((dir) => readdirSync(dir).includes(".git"));
await dirs.reduce(async (done, dir) => {
  await done;
  await throughHandle(dir);
  await throughInput(dir);
}, Promise.resolve());
