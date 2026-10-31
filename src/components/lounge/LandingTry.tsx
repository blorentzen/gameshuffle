"use client";

/**
 * "Where would this MMR land?" (lookup picks, 2026-10-21): type a number and the page says its
 * division, about how high that is, and its place this season. The place is MKCentral's exact count
 * (asked a moment after typing stops); if that's slow or busy, it's worked out from the division
 * counts on the page and the line says "about".
 */

import { useEffect, useId, useMemo, useState } from "react";
import { Input } from "@empac/cascadeds";
import type { DivisionStep, MmrGame } from "@/lib/mmr/rules";
import { landing, landingLine } from "@/lib/lounge/lookup";

export function LandingTry({ game, steps, counts, total }: {
  game: MmrGame;
  steps: DivisionStep[];
  counts: { name: string; count: number }[];
  total: number | null;
}) {
  const id = useId();
  const [value, setValue] = useState("");
  const [exact, setExact] = useState<{ key: string; above: number } | null>(null);
  const mmr = /^\d{1,5}$/.test(value.trim()) ? Number(value.trim()) : null;
  const key = `${game}:${mmr}`;

  useEffect(() => {
    if (mmr == null || mmr > 30_000) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/lounge/land?game=${game}&mmr=${mmr}`, { signal: ctrl.signal });
        const j = (await res.json().catch(() => ({}))) as { ok?: boolean; above?: number };
        if (!ctrl.signal.aborted && j.ok && typeof j.above === "number") setExact({ key: `${game}:${mmr}`, above: j.above });
      } catch { /* the estimate stands */ }
    }, 450);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [game, mmr]);

  const line = useMemo(() => {
    if (mmr == null || mmr > 30_000) return null;
    return landingLine(landing(mmr, steps, counts, total, exact?.key === key ? exact.above : null));
  }, [mmr, steps, counts, total, exact, key]);

  return (
    <div className="lounge-land">
      <h3 className="lounge-land__head" id={`${id}-h`}>Where would this MMR land?</h3>
      <div className="lounge-land__row">
        <div className="lounge-land__field">
          <label htmlFor={`${id}-mmr`} className="lounge-lookup__label">Try an MMR</label>
          <Input
            id={`${id}-mmr`}
            type="number"
            inputMode="numeric"
            min={0}
            max={30000}
            step={1}
            value={value}
            onChange={(e) => setValue(e.target.value.slice(0, 5))}
            aria-describedby={`${id}-help ${id}-out`}
            fullWidth
          />
          <p id={`${id}-help`} className="lounge-lookup__help">A number from 0 to 30,000</p>
        </div>
        <p id={`${id}-out`} className="lounge-land__out" role="status">
          {line ?? (value.trim() ? "Type a whole number, like 9000." : "Its division and its place this season show here.")}
        </p>
      </div>
    </div>
  );
}
