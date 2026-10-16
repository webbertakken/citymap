"use client";
import { Landmark } from "lucide-react";

export interface TitleCardProps {
  readonly title: string;
  readonly status: string;
  /** The name of the one town shown, or null for the whole city. */
  readonly town: string | null;
  readonly onWhole: () => void;
}

/** Top left: the city's name, the breadcrumb while one town is shown, and what is happening. */
export function TitleCard({ title, status, town, onWhole }: TitleCardProps) {
  return (
    <header className="glass card-title">
      <h1>
        <Landmark size={22} aria-hidden="true" />
        <span>{title}</span>
      </h1>
      {town !== null && (
        <nav aria-label="Breadcrumb" className="crumbs">
          <ol>
            <li>
              <button type="button" onClick={onWhole}>
                {title}
              </button>
            </li>
            <li aria-current="page">{town}</li>
          </ol>
        </nav>
      )}
      <p className="status" aria-live="polite">
        {status}
      </p>
    </header>
  );
}
