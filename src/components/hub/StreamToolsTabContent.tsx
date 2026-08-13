"use client";

/**
 * StreamToolsTabContent — the Stream Tools surface for the Hub session detail.
 * Everything in a single COLUMN of setup sections, mirroring Account → Stream
 * Tools (no floating grid/boxes). Bingo / Tier List / Oracle use the shared
 * config cards with their live run controls appended inside the same section;
 * the quick tools (wheel / dice / coin / raffle / timer) get a plain section
 * with their control. Individual controls self-hide for non-Pro.
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

/** A plain setup section for a quick tool (heading + its control). */
function ToolSection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="stream-tools__section">
      <h3 className="stream-tools__heading">{heading}</h3>
      {children}
    </section>
  );
}

export function StreamToolsTabContent({ slug }: { slug: string }) {
  return (
    <section className="hub-detail__section">
      <h2 className="hub-detail__section-title">Stream Tools</h2>
      <p style={{ color: "var(--text-secondary)", fontSize: "var(--font-size-14)", margin: "0 0 var(--spacing-8)" }}>
        Set up and run your overlay tools without leaving the Hub. Changes appear on your OBS overlay
        right away.
      </p>

      {/* One column, one card per tool — same look as Account → Stream Tools. */}
      <div className="stream-tools-tab">
        <ToolSection heading="🎡 Wheel">
          <WheelControl />
        </ToolSection>

        <ToolSection heading="🎲 Dice">
          <DiceControl />
        </ToolSection>

        <ToolSection heading="🪙 Coin">
          <CoinControl />
        </ToolSection>

        <OracleConfigCard live={<OracleControl />} />

        <ToolSection heading="🎟️ Raffle">
          <NamePickerControl slug={slug} />
        </ToolSection>

        <ToolSection heading="⏱️ Timer">
          <TimerControl />
        </ToolSection>

        <BingoConfigCard live={<BingoControl />} />

        <TierListConfigCard live={<TierListControl />} />
      </div>
    </section>
  );
}
