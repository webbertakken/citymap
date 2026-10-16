"use client";
import { TriangleAlert, X } from "lucide-react";

/** Top centre, floating: an error in one sentence, until dismissed or the next success. */
export function Notice({ message, onDismiss }: { readonly message: string; readonly onDismiss: () => void }) {
  return (
    <div className="glass notice">
      <TriangleAlert size={20} aria-hidden="true" />
      <p role="alert">{message}</p>
      <button type="button" className="icon-button" aria-label="Dismiss" onClick={onDismiss}>
        <X size={20} aria-hidden="true" />
      </button>
    </div>
  );
}
