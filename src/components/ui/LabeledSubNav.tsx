"use client";

/**
 * CDS SubNav with a name. SubNav renders a <nav> but takes no label, so two on a page (or one
 * beside the site nav) are landmarks nobody can tell apart (axe landmark-unique). This names
 * the inner <nav> once it mounts. A CDS gap to raise upstream (an aria-label prop).
 */

import { useEffect, useRef, type ComponentProps } from "react";
import { SubNav } from "@empac/cascadeds";

export function LabeledSubNav({ label, ...props }: ComponentProps<typeof SubNav> & { label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.querySelector("nav")?.setAttribute("aria-label", label); }, [label]);
  return <div ref={ref} style={{ display: "contents" }}><SubNav {...props} /></div>;
}
