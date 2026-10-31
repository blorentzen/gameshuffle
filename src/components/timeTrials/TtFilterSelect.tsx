"use client";

/**
 * A filter that's a link per choice but shows as a CDS Select (the vehicle board, the game on a
 * player's page): picking one opens that board's address, so every board keeps its own URL.
 */

import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/Select";

export function TtFilterSelect({ id, label, value, options, className }: {
  id: string; label: string; value: string; options: { value: string; label: string; href: string }[]; className?: string;
}) {
  const router = useRouter();
  return (
    <div className={`tt-filter-select${className ? ` ${className}` : ""}`}>
      <label htmlFor={id} className="sr-only">{label}</label>
      <Select
        id={id}
        value={value}
        options={options.map((o) => ({ value: o.value, label: o.label }))}
        onChange={(v) => { const o = options.find((x) => x.value === v); if (o && o.value !== value) router.push(o.href, { scroll: false }); }}
        fullWidth
      />
    </div>
  );
}
