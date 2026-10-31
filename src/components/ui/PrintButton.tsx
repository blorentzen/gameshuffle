"use client";

/** Prints the page. Pair it with @media print rules that show only what
 *  should be on paper (a receipt, an order). */

import { Button } from "@empac/cascadeds";
import { IconPrinter } from "@tabler/icons-react";

export function PrintButton({ label = "Print", className }: { label?: string; className?: string }) {
  return (
    <Button variant="secondary" size="small" className={className} onClick={() => window.print()}>
      <IconPrinter size={16} aria-hidden /> {label}
    </Button>
  );
}
