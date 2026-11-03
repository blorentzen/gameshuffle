"use client";

/**
 * The Season menu on ladder pages (history import picks 2026-11-01, pick 8A): CDS Select, opening the same page for
 * another season (?season=N; the current season is the page without it).
 */

import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/Select";

export function LadderSeasonSelect({ options, value, basePath }: { options: { value: string; label: string }[]; value: string; basePath: string }) {
  const router = useRouter();
  return (
    <div className="ladder-season">
      <Select
        floatingLabel="Season"
        options={options}
        value={value}
        onChange={(v) => { const s = String(v); router.push(s === options[0]?.value ? basePath : `${basePath}?season=${s}`); }}
      />
    </div>
  );
}
