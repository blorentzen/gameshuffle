"use client";

import { useState, type ReactNode } from "react";
import { SupportMoment } from "@/components/support/SupportMoment";

/**
 * A free tool's body, plus the Support moment once the tool has been used: the first button pressed
 * inside it counts (Britton's pick, 2026-10-19: after the tool is used, not on page load).
 */
export function ToolBody({ children }: { children: ReactNode }) {
  const [used, setUsed] = useState(false);
  return (
    <>
      <div className="free-tool__body" onClickCapture={(e) => { if (!used && (e.target as HTMLElement).closest("button")) setUsed(true); }}>{children}</div>
      <SupportMoment from="tool" title="Enjoying the free tools?" ready={used} />
    </>
  );
}
