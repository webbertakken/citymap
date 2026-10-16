"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export interface PopoverProps {
  /** The button's accessible name. */
  readonly label: string;
  /** What the button shows: an icon. */
  readonly face: ReactNode;
  /** The popover's content; `close` closes it and returns focus to the button. */
  readonly children: (close: () => void) => ReactNode;
}

/** A button that opens a floating panel; Escape, a pick or a press outside closes it. */
export function Popover({ label, face, children }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  // Closing by Escape or a pick hands focus back to the button; a press elsewhere leaves it where it went.
  const close = () => {
    setOpen(false);
    document.getElementById(`${id}-button`)?.focus();
  };
  useEffect(() => {
    const outside = (event: Event) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && event.target instanceof Node && root.current?.contains(event.target)) {
        setOpen(false);
        document.getElementById(`${id}-button`)?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [id]);
  return (
    <div ref={root} className="popover-root">
      <button
        id={`${id}-button`}
        type="button"
        className="glass icon-button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        {face}
      </button>
      <div id={id} className="glass popover" hidden={!open}>
        {open && children(close)}
      </div>
    </div>
  );
}
