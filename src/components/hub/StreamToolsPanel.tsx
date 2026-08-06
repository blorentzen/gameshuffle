"use client";

/**
 * StreamToolsPanel — consolidates the per-session overlay-tool controls
 * (wheel + dice/coin/oracle/raffle/timer/bingo/tier-list) behind a single
 * "Stream Tools" dropdown, so the Hub session header stays uncluttered. Each
 * row hosts the tool's existing self-contained control widget. Closes on
 * outside-click / Escape.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@empac/cascadeds";
import { WheelControl } from "./WheelControl";
import { DiceControl } from "./DiceControl";
import { CoinControl } from "./CoinControl";
import { OracleControl } from "./OracleControl";
import { NamePickerControl } from "./NamePickerControl";
import { TimerControl } from "./TimerControl";
import { BingoControl } from "./BingoControl";
import { TierListControl } from "./TierListControl";

const ROWS: { key: string; label: string; render: (slug: string) => ReactNode }[] = [
  { key: "wheel", label: "🎡 Wheel", render: () => <WheelControl /> },
  { key: "dice", label: "🎲 Dice", render: () => <DiceControl /> },
  { key: "coin", label: "🪙 Coin", render: () => <CoinControl /> },
  { key: "oracle", label: "🎱 Oracle", render: () => <OracleControl /> },
  { key: "raffle", label: "🎟️ Raffle", render: (slug) => <NamePickerControl slug={slug} /> },
  { key: "timer", label: "⏱️ Timer", render: () => <TimerControl /> },
  { key: "bingo", label: "🅱️ Bingo", render: () => <BingoControl /> },
  { key: "tierlist", label: "📊 Tier List", render: () => <TierListControl /> },
];

export function StreamToolsPanel({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <Button variant="secondary" onClick={() => setOpen((o) => !o)}>
        🎛️ Stream Tools {open ? "▲" : "▼"}
      </Button>
      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            left: 0,
            zIndex: 40,
            width: 400,
            maxWidth: "90vw",
            maxHeight: "70vh",
            overflowY: "auto",
            padding: "var(--spacing-8)",
            borderRadius: "var(--radius-12, 0.75rem)",
            border: "1px solid var(--border-default)",
            background: "var(--surface-raised, var(--surface-default))",
            boxShadow: "0 12px 32px rgba(0,0,0,0.35)",
          }}
        >
          {ROWS.map((row, i) => (
            <div
              key={row.key}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                padding: "10px 8px",
                borderTop: i === 0 ? "none" : "1px solid var(--border-subtle, var(--border-default))",
              }}
            >
              <span style={{ fontSize: "var(--font-size-13)", fontWeight: "var(--font-weight-semibold)", color: "var(--text-secondary)" }}>
                {row.label}
              </span>
              {row.render(slug)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
