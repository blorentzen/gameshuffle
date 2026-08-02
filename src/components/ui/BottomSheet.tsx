"use client";

/**
 * Minimal bottom sheet, local to GameShuffle (CDS Drawer is left/right only —
 * the one CDS gap from Spec 1/2 Phase 0). Portals to body, scrim-dismiss + Esc,
 * slides up from the bottom edge. Used for touch profile cards.
 */

import { useEffect } from "react";
import { createPortal } from "react-dom";

export function BottomSheet({
  isOpen,
  onClose,
  children,
}: {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === "undefined") return null;

  return createPortal(
    <div className="gs-sheet" role="dialog" aria-modal="true">
      <button type="button" className="gs-sheet__scrim" aria-label="Close" onClick={onClose} />
      <div className="gs-sheet__panel">
        <span className="gs-sheet__grip" aria-hidden="true" />
        {children}
      </div>
    </div>,
    document.body,
  );
}
