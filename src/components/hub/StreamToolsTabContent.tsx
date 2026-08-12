"use client";

/**
 * StreamToolsTabContent — the full-width Stream Tools surface for the Hub
 * session detail (a dedicated tab, replacing the cramped header dropdown). Each
 * overlay tool (wheel / dice / coin / oracle / raffle / timer / bingo / tier
 * list) gets its own card with room for its complete control widget. Individual
 * controls self-hide for non-Pro streamers.
 */

import type { ReactNode } from "react";
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

export function StreamToolsTabContent({ slug }: { slug: string }) {
  return (
    <section className="hub-detail__section">
      <h2 className="hub-detail__section-title">Stream Tools</h2>
      <p style={{ color: "var(--text-secondary)", fontSize: "var(--font-size-14)", margin: "0 0 var(--spacing-16)" }}>
        Trigger and adjust your overlay tools live. Changes appear on your OBS overlay right away.
      </p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(20rem, 1fr))",
          gap: "var(--spacing-16)",
          alignItems: "start",
        }}
      >
        {ROWS.map((row) => (
          <div
            key={row.key}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--spacing-8)",
              padding: "var(--spacing-16)",
              borderRadius: "var(--radius-12, 0.75rem)",
              border: "1px solid var(--border-default)",
              background: "var(--surface-default)",
            }}
          >
            <span style={{ fontSize: "var(--font-size-14)", fontWeight: "var(--font-weight-semibold)", color: "var(--text-secondary)" }}>
              {row.label}
            </span>
            {row.render(slug)}
          </div>
        ))}
      </div>
    </section>
  );
}
