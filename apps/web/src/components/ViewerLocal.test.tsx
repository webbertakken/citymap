import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Snapshot } from "@citymap/ground-plan";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { layHere, type Laid, type Lay } from "../lay/lay";
import type { LocalPorts } from "../local/ports";
import type { PermissionHandle } from "../local/remember";
import { fakeHandle, listedFiles, type Tree } from "../local/testing/folders";
import { StubCanvas, fetcher, fromMore, searchField } from "./testing/fixtures";
import { Viewer } from "./Viewer";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});

const index = (name: string) =>
  new Uint8Array(readFileSync(join(import.meta.dirname, "../local/testing/indexes", `${name}.index`)));
const COMMIT = "c".repeat(40);
/** The v2 fixture's working tree: its index, HEAD and what the reader opens. */
const repo = (name = "v2"): Tree => ({
  ".git": { HEAD: "ref: refs/heads/main\n", refs: { heads: { main: `${COMMIT}\n` } }, index: index(name) },
  "package.json": '{ "workspaces": ["packages/*"] }\n',
});
const PICK = "Open a local repository";
/** The button beside the search box that opens a local repository. */
const pickButton = () => screen.getByRole("button", { name: PICK });
const pick = () => fireEvent.click(pickButton());

const ports = (over: Partial<LocalPorts> = {}): LocalPorts => ({
  support: () => "handle",
  pickFolder: async () => fakeHandle("widgets", repo()),
  recall: async () => null,
  remember: async () => {},
  ...over,
});
const lines = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.map(([line]) => String(line));
const opened = async (folders: LocalPorts, lay: Lay = layHere) => {
  const counted = vi.fn<typeof fetcher>(fetcher);
  render(<Viewer Canvas={StubCanvas} fetcher={counted} lay={lay} folders={folders} />);
  // The first city is drawn and its load done, so the status is its own.
  await screen.findByText("1 towns · 1 lots");
  return counted;
};
/** A lay that waits until it is let go, to see the phases on the way. */
const held = () => {
  let release: (() => Promise<void>) | null = null;
  const lay: Lay = (snapshot: Snapshot, options) =>
    new Promise<Laid>((resolve, reject) => {
      release = () => layHere(snapshot, options).then(resolve, reject);
    });
  return {
    lay,
    release: () =>
      act(async () => {
        await release?.();
      }),
  };
};

describe("Viewer, a local repository", () => {
  it("lays a picked folder's single state, says so, and leaves the address and the tab without it", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const remember = vi.fn<LocalPorts["remember"]>(async () => {});
    const { lay, release } = held();
    const counted = await opened(ports({ remember }), lay);
    window.history.replaceState(null, "", "/?repo=acme/widgets");
    const asked = counted.mock.calls.length;
    pick();
    expect(await screen.findByText("widgets: laying out 10 files…")).toBeTruthy();
    // While it lays, the button waits.
    expect(pickButton()).toHaveProperty("disabled", true);
    await release();
    expect(await screen.findByRole("heading", { level: 1, name: "widgets" })).toBeTruthy();
    expect(await screen.findByText(/^\d+ towns · \d+ lots · local, single state, not folded$/)).toBeTruthy();
    expect(document.title).toBe("Local repository · citymap");
    expect(window.location.search).toBe("");
    expect(counted.mock.calls.length).toBe(asked);
    expect(remember).toHaveBeenCalledOnce();
    const logged = lines(info);
    expect(logged).toContain("viewer/local-pick how=handle");
    expect(logged).toContain("viewer/local-index version=2 entries=10 submodules=1");
    expect(logged).toContain("viewer/local-commit how=ref");
    expect(logged.find((l) => l.startsWith("viewer/local-read"))).toMatch(
      /^viewer\/local-read source=index files=10 ms=\d+$/,
    );
    // Remembered, it is offered again.
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    expect(screen.getByRole("button", { name: "Open widgets again" })).toBeTruthy();
  });

  it("lays the folder again with other layout toggles, keeping it private", async () => {
    const laid: unknown[] = [];
    const counting: Lay = async (snapshot, options) => {
      laid.push(options?.toggles);
      return layHere(snapshot, options);
    };
    await opened(ports(), counting);
    pick();
    expect(await screen.findByRole("heading", { level: 1, name: "widgets" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Layout" }));
    fireEvent.click(screen.getByRole("switch", { name: "Quarters" }));
    await vi.waitFor(() =>
      expect(laid).toEqual([
        ["corridor", "tiers"],
        ["corridor", "quarters", "tiers"],
      ]),
    );
    expect(await screen.findByText(/^\d+ towns · \d+ lots · local, single state, not folded$/)).toBeTruthy();
    expect(document.title).toBe("Local repository · citymap");
  });

  it("shows the loading card while a picked folder is laid, and Cancel keeps the last city", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const { lay, release } = held();
    await opened(ports(), lay);
    pick();
    const card = await screen.findByRole("region", { name: "Loading" });
    expect(card.querySelector("h2")?.textContent).toBe("Opening widgets");
    expect(screen.getByRole("progressbar", { name: "Laying out 10 files" })).toBeTruthy();
    expect(screen.getByText("widgets: laying out 10 files…")).toBeTruthy();
    expect(lines(info)).toContain("viewer/load-phase source=local name=widgets phase=index ms=0");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("region", { name: "Loading" })).toBeNull();
    await release();
    await act(() => new Promise((done) => setTimeout(done, 250)));
    expect(screen.getByRole("heading", { level: 1, name: "alpha" })).toBeTruthy();
    expect(screen.getByText("1 towns · 1 lots")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(lines(info).find((l) => l.startsWith("viewer/load-cancelled"))).toMatch(
      /^viewer\/load-cancelled source=local name=widgets phase=lay ms=\d+ why=cancel$/,
    );
    expect(lines(info).some((l) => l.startsWith("viewer/local-read"))).toBe(false);
  });

  it("changes nothing when the folder dialog closes without a folder", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    await opened(ports({ pickFolder: () => Promise.reject(new DOMException("closed", "AbortError")) }));
    pick();
    await vi.waitFor(() => expect(lines(info)).toContain("viewer/local-cancelled how=handle"));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("1 towns · 1 lots")).toBeTruthy();
  });

  it.each([
    [
      "a split index",
      ports({ pickFolder: async () => fakeHandle("widgets", repo("split")) }),
      'widgets has a split index, which is not read here: run "git update-index --no-split-index", then try again.',
      "local/split-index",
    ],
    [
      "a refused folder dialog",
      ports({ pickFolder: () => Promise.reject(new DOMException("no", "SecurityError")) }),
      "The browser did not allow reading the folder.",
      "local/denied",
    ],
  ])("names %s in the notice, logs it and keeps the last city", async (_, folders, sentence, reason) => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await opened(folders);
    pick();
    expect((await screen.findByRole("alert")).textContent).toBe(sentence);
    // The last city stays, and so does what the status said of it.
    expect(screen.getByRole("heading", { level: 1, name: "alpha" })).toBeTruthy();
    expect(screen.getByText("1 towns · 1 lots")).toBeTruthy();
    expect(lines(error).find((l) => l.startsWith("viewer/local-failed"))).toContain(`reason=${reason}`);
  });

  it("opens the remembered folder again once the browser allows it, and says when it does not", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    let answer: PermissionState = "denied";
    const handle: PermissionHandle = {
      ...fakeHandle("widgets", repo()),
      queryPermission: async () => "prompt",
      requestPermission: async () => answer,
    };
    await opened(ports({ recall: async () => handle }));
    expect(lines(info)).toContain("viewer/local-recalled found=yes");
    fromMore("Open widgets again");
    expect((await screen.findByRole("alert")).textContent).toBe("The browser did not allow reading widgets.");
    answer = "granted";
    fromMore("Open widgets again");
    expect(await screen.findByRole("heading", { level: 1, name: "widgets" })).toBeTruthy();
    expect(lines(info)).toContain("viewer/local-pick how=again");
  });

  it("says a lay that fails in the folder's words", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await opened(ports(), () => Promise.reject(new Error("the layout worker failed")));
    pick();
    expect((await screen.findByRole("alert")).textContent).toBe("widgets could not be laid: the layout worker failed.");
    expect(lines(error)).toContain('viewer/local-failed reason="Error: the layout worker failed"');
  });

  it("says the browser refused when asking for the remembered folder fails", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const handle: PermissionHandle = {
      ...fakeHandle("widgets", repo()),
      queryPermission: () => Promise.reject(new DOMException("not now", "SecurityError")),
      requestPermission: async () => "granted",
    };
    await opened(ports({ recall: async () => handle }));
    fromMore("Open widgets again");
    expect((await screen.findByRole("alert")).textContent).toBe("The browser did not allow reading widgets.");
  });

  it("logs a remembered folder it cannot recall or keep, and goes on without it", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await opened(
      ports({
        recall: () => Promise.reject(new Error("no database")),
        remember: () => Promise.reject(new Error("no room")),
        pickFolder: async () => fakeHandle("widgets", { "a.ts": "" }),
      }),
    );
    pick();
    expect(await screen.findByRole("heading", { level: 1, name: "widgets" })).toBeTruthy();
    await vi.waitFor(() => expect(lines(error)).toContain('viewer/local-remember-failed reason="Error: no room"'));
    expect(lines(error)).toContain('viewer/local-recall-failed reason="Error: no database"');
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    expect(screen.queryByRole("button", { name: /again$/ })).toBeNull();
  });

  it("logs a folder without git as walked, and a tracked manifest the working tree lacks", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const { "package.json": _, ...withoutManifest } = repo();
    await opened(ports({ pickFolder: async () => fakeHandle("site", { "a.ts": "", ".gitignore": "x\n" }) }));
    pick();
    expect(await screen.findByRole("heading", { level: 1, name: "site" })).toBeTruthy();
    expect(lines(info)).toContain("viewer/local-walk files=2");
    cleanup();
    await opened(ports({ pickFolder: async () => fakeHandle("widgets", withoutManifest) }));
    pick();
    expect(await screen.findByRole("heading", { level: 1, name: "widgets" })).toBeTruthy();
    expect(lines(info)).toContain("viewer/local-manifest-unread path=package.json");
  });

  it("lists through the folder input where there is no folder dialog, and puts the status back on cancel", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    await opened(ports({ support: () => "input" }));
    const input = screen.getByLabelText("Repository folder");
    expect(input).toHaveProperty("webkitdirectory", true);
    const click = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {});
    pick();
    expect(click).toHaveBeenCalledOnce();
    expect(screen.getByText("Listing the folder's files…")).toBeTruthy();
    fireEvent(input, new Event("cancel"));
    expect(screen.getByText("1 towns · 1 lots")).toBeTruthy();
    pick();
    fireEvent.change(input, { target: { files: [] } });
    expect(screen.getByText("1 towns · 1 lots")).toBeTruthy();
    pick();
    fireEvent.change(input, { target: { files: null } });
    expect(screen.getByText("1 towns · 1 lots")).toBeTruthy();
    pick();
    fireEvent.change(input, { target: { files: listedFiles("widgets", repo()) } });
    expect(await screen.findByRole("heading", { level: 1, name: "widgets" })).toBeTruthy();
    expect(await screen.findByText(/local, single state, not folded$/)).toBeTruthy();
    expect(lines(info)).toContain("viewer/local-listed entries=4");
    expect(lines(info).filter((l) => l === "viewer/local-cancelled how=input")).toHaveLength(3);
  });

  it("says why Safari cannot, and offers nothing on a phone", async () => {
    await opened(ports({ support: () => "safari" }));
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    expect(screen.getByText(/^Safari hides a folder's .git and .gitignore from pages/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: PICK })).toBeNull();
    expect(screen.queryByRole("button", { name: /local repository/ })).toBeNull();
    cleanup();
    await opened(ports({ support: () => "none" }));
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    expect(screen.queryByText("Local repository")).toBeNull();
    expect(screen.queryByRole("button", { name: PICK })).toBeNull();
  });

  it("sits right beside the search box, and More only offers the remembered folder again", async () => {
    await opened(ports());
    const finder = searchField().closest(".finder")!;
    expect(finder.contains(pickButton())).toBe(true);
    expect(finder.querySelector(".search")?.nextElementSibling).toBe(pickButton().parentElement);
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    // Nothing remembered: More holds no local group.
    expect(screen.queryByText("Local repository")).toBeNull();
    expect(screen.getAllByRole("button", { name: PICK })).toHaveLength(1);
  });
});
