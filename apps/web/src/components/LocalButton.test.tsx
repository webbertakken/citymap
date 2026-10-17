import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LOCAL_TIP, LocalButton } from "./LocalButton";
import type { LocalRepository } from "./useLocalRepository";

afterEach(cleanup);

const local = (over: Partial<LocalRepository> = {}): LocalRepository => ({
  support: "handle",
  busy: false,
  pick: () => {},
  again: null,
  input: null,
  ...over,
});
const button = () => screen.getByRole("button", { name: "Open a local repository" });
const tip = () => document.getElementById(button().getAttribute("aria-describedby")!)!;

describe("LocalButton", () => {
  it("opens the folder dialog on a click", () => {
    const pick = vi.fn<() => void>();
    render(<LocalButton local={local({ pick })} />);
    fireEvent.click(button());
    expect(pick).toHaveBeenCalledOnce();
  });

  it("is described by its tooltip, word for word, shown while hovered or focused", () => {
    render(<LocalButton local={local({ support: "input" })} />);
    expect(tip().getAttribute("role")).toBe("tooltip");
    expect(tip().textContent).toBe(LOCAL_TIP);
    expect(LOCAL_TIP).toBe(
      "Open a local repository: as it is now, not folded over its history. For a folded city, run citymap <folder> --out=city.json, then open the file.",
    );
    expect(tip().hidden).toBe(true);
    const root = button().parentElement!;
    fireEvent.pointerEnter(root);
    expect(tip().hidden).toBe(false);
    fireEvent.pointerLeave(root);
    expect(tip().hidden).toBe(true);
    fireEvent.focus(button());
    expect(tip().hidden).toBe(false);
    fireEvent.blur(button());
    expect(tip().hidden).toBe(true);
  });

  it("hides its tooltip on Escape, and lets an Escape without one pass", () => {
    render(<LocalButton local={local()} />);
    fireEvent.focus(button());
    // fireEvent answers false when the event's default was prevented.
    expect(fireEvent.keyDown(button(), { key: "a" })).toBe(true);
    expect(tip().hidden).toBe(false);
    expect(fireEvent.keyDown(button(), { key: "Escape" })).toBe(false);
    expect(tip().hidden).toBe(true);
    expect(fireEvent.keyDown(button(), { key: "Escape" })).toBe(true);
  });

  it("waits while a folder is read", () => {
    render(<LocalButton local={local({ busy: true })} />);
    expect(button()).toHaveProperty("disabled", true);
  });

  it.each(["safari", "none"] as const)("is not there with %s support", (support) => {
    const { container } = render(<LocalButton local={local({ support })} />);
    expect(container.innerHTML).toBe("");
  });
});
