"use client";

/**
 * NamePickerControl — Hub raffle widget (Pro). Viewers join with !enter; the
 * streamer draws N winners here (reveal animates on the overlay) and can clear
 * the pool for a fresh giveaway. Session-scoped, so it takes the session slug.
 * Self-hides for non-Pro (actions return `pro_required`).
 */

import { useEffect, useState, useTransition } from "react";
import { Button } from "@empac/cascadeds";
import {
  clearRaffleAction,
  drawRaffleAction,
  raffleEntryCountAction,
} from "@/app/hub/sessions/[slug]/actions";

const COUNTS = [1, 2, 3, 5, 10];

export function NamePickerControl({ slug }: { slug: string }) {
  const [count, setCount] = useState(1);
  const [remove, setRemove] = useState(true);
  const [entries, setEntries] = useState<number | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);
  const [pending, startTransition] = useTransition();

  // Poll the entrant count so the streamer can see the pool grow.
  useEffect(() => {
    if (hidden) return;
    let alive = true;
    const load = async () => {
      const res = await raffleEntryCountAction(slug);
      if (!alive) return;
      if (res.ok) setEntries(res.count);
      else if (res.error === "pro_required") setHidden(true);
    };
    void load();
    const id = window.setInterval(load, 8000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [slug, hidden]);

  if (hidden) return null;

  const draw = () => {
    setResult(null);
    startTransition(async () => {
      const res = await drawRaffleAction(slug, count, remove);
      if (res.ok) {
        setResult(
          res.winners && res.winners.length
            ? `🎉 ${res.winners.join(", ")}`
            : "No entries yet",
        );
        setEntries((e) => (res.entries != null ? Math.max(0, res.entries - (remove ? (res.winners?.length ?? 0) : 0)) : e));
        window.setTimeout(() => setResult(null), 8000);
      } else if (res.error === "pro_required") {
        setHidden(true);
      }
    });
  };

  const clear = () => {
    startTransition(async () => {
      const res = await clearRaffleAction(slug);
      if (res.ok) {
        setEntries(0);
        setResult(null);
      } else if (res.error === "pro_required") {
        setHidden(true);
      }
    });
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-8)", flexWrap: "wrap" }}>
      <select
        value={count}
        onChange={(e) => setCount(Number(e.target.value))}
        aria-label="Number of winners"
        style={{
          height: 36,
          borderRadius: "var(--radius-8, 0.5rem)",
          border: "1px solid var(--border-default)",
          padding: "0 var(--spacing-8)",
          background: "var(--surface-default)",
          color: "var(--text-primary)",
        }}
      >
        {COUNTS.map((n) => (
          <option key={n} value={n}>
            {n} {n === 1 ? "winner" : "winners"}
          </option>
        ))}
      </select>
      <Button variant="primary" loading={pending} onClick={draw}>
        🎟️ Draw{entries != null ? ` (${entries})` : ""}
      </Button>
      <label style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: "var(--font-size-14)" }}>
        <input type="checkbox" checked={remove} onChange={(e) => setRemove(e.target.checked)} />
        Remove winners
      </label>
      <Button variant="ghost" onClick={clear} disabled={pending || !entries}>
        Clear
      </Button>
      {result ? (
        <span style={{ fontWeight: "var(--font-weight-semibold)" }}>{result}</span>
      ) : null}
    </div>
  );
}
