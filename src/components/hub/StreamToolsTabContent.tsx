"use client";

/**
 * StreamToolsTabContent — the full-width Stream Tools surface for the Hub
 * session detail (a dedicated tab). The quick tools (wheel / dice / coin /
 * oracle / raffle / timer) get a control card each; Bingo and Tier List get the
 * full treatment — the same setup editor as Account → Stream Tools (shared
 * config card) PLUS their live run controls, so a streamer configures AND runs
 * them without leaving the Hub. Individual controls self-hide for non-Pro.
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
import { BingoConfigCard } from "@/components/stream-tools/BingoConfigCard";
import { TierListConfigCard } from "@/components/stream-tools/TierListConfigCard";
import { OracleConfigCard } from "@/components/stream-tools/OracleConfigCard";

const QUICK_TOOLS: { key: string; label: string; render: (slug: string) => ReactNode }[] = [
  { key: "wheel", label: "🎡 Wheel", render: () => <WheelControl /> },
  { key: "dice", label: "🎲 Dice", render: () => <DiceControl /> },
  { key: "coin", label: "🪙 Coin", render: () => <CoinControl /> },
  { key: "raffle", label: "🎟️ Raffle", render: (slug) => <NamePickerControl slug={slug} /> },
  { key: "timer", label: "⏱️ Timer", render: () => <TimerControl /> },
];

/** A tool that pairs its setup editor with its live run controls. */
function ToolWorkbench({ setup, live }: { setup: ReactNode; live: ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
        gap: "var(--spacing-16)",
        alignItems: "start",
      }}
      className="stream-tools-workbench"
    >
      {setup}
      <div
        style={{
          padding: "var(--spacing-16)",
          borderRadius: "var(--radius-12, 0.75rem)",
          border: "1px solid var(--border-default)",
          background: "var(--surface-default)",
        }}
      >
        <h3 className="stream-tools__heading" style={{ marginTop: 0 }}>▶️ Run it live</h3>
        {live}
      </div>
    </div>
  );
}

export function StreamToolsTabContent({ slug }: { slug: string }) {
  return (
    <section className="hub-detail__section">
      <h2 className="hub-detail__section-title">Stream Tools</h2>
      <p style={{ color: "var(--text-secondary)", fontSize: "var(--font-size-14)", margin: "0 0 var(--spacing-16)" }}>
        Set up and run your overlay tools without leaving the Hub. Changes appear on your OBS overlay
        right away.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(20rem, 1fr))",
          gap: "var(--spacing-16)",
          alignItems: "start",
          marginBottom: "var(--spacing-24)",
        }}
      >
        {QUICK_TOOLS.map((row) => (
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

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-24)" }}>
        <ToolWorkbench setup={<OracleConfigCard />} live={<OracleControl />} />
        <ToolWorkbench setup={<BingoConfigCard />} live={<BingoControl />} />
        <ToolWorkbench setup={<TierListConfigCard />} live={<TierListControl />} />
      </div>
    </section>
  );
}
