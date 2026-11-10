"use client";

/**
 * A filter that's a link per choice but shows as a CDS Select (the vehicle board, the game on a
 * player's page): picking one opens that board's address, so every board keeps its own URL.
 */

import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/Select";

type Choice = { value: string; label: string; href: string };

/** `groups` instead of `options` for a long list (Kirby Air Riders' machines by type). */
export function TtFilterSelect({ id, label, value, options, groups, className }: {
  id: string; label: string; value: string; options?: Choice[]; groups?: { label: string; options: Choice[] }[]; className?: string;
}) {
  const router = useRouter();
  const all = groups ? groups.flatMap((g) => g.options) : options ?? [];
  const plain = (list: Choice[]) => list.map((o) => ({ value: o.value, label: o.label }));
  return (
    <div className={`tt-filter-select${className ? ` ${className}` : ""}`}>
      <label htmlFor={id} className="sr-only">{label}</label>
      <Select
        id={id}
        value={value}
        {...(groups ? { groups: groups.map((g) => ({ label: g.label, options: plain(g.options) })) } : { options: plain(all) })}
        onChange={(v) => { const o = all.find((x) => x.value === v); if (o && o.value !== value) router.push(o.href, { scroll: false }); }}
        fullWidth
      />
    </div>
  );
}
