"use client";

/**
 * Streaming ▸ Overlay ▸ Tool looks (GS Pro): how the tools look and what they
 * say. One row per tool; Edit opens a side panel (CDS Drawer) and every change
 * saves itself. Dice, coin and timer are the account's tool looks
 * (src/lib/tools/looks.ts), the same ones the free tool pages, the overlay and
 * the control room use, edited with the free pages' own fields; Oracle, Bingo
 * and Tier list use the shared config cards the Hub uses too. Everything
 * persists to `streamer_module_defaults` (gameSlug "*").
 * The stream schedule moved to Streaming ▸ Setup ▸ Schedule.
 */

import { useState, useSyncExternalStore, type ComponentType, type ReactNode } from "react";
import { Button, Drawer, Input, Select } from "@empac/cascadeds";
import { IconChartBar, IconClock, IconCoin, IconCrystalBall, IconDice5, IconLayoutGrid } from "@tabler/icons-react";
import { useBrandTheme } from "@/hooks/useBrandTheme";
import { AdminScreen } from "@/components/account/admin/AdminKit";
import { BingoConfigCard } from "@/components/stream-tools/BingoConfigCard";
import { TierListConfigCard } from "@/components/stream-tools/TierListConfigCard";
import { OracleConfigCard } from "@/components/stream-tools/OracleConfigCard";
import { AccentField } from "@/components/stream-tools/fields";
import { LoadingLines } from "@/components/loading/LoadingLines";
import { useToolLook } from "@/components/tools/looks/useToolLook";
import { DiceLookFields } from "@/components/tools/dice/DiceLookFields";
import { CoinLookFields } from "@/components/tools/coin/CoinLookFields";
import { Coin } from "@/components/tools/coin/Coin";
import { coinLetter, coinPaint, diceDrawn, DEFAULT_COIN_LOOK } from "@/lib/tools/looks";

const TIMER_PRESETS = [60, 180, 300, 600, 900];
const CUSTOM = "custom";

type ToolId = "dice" | "coin" | "oracle" | "timer" | "bingo" | "tierlist";

const noopSubscribe = () => () => {};

const minutes = (s: number) => `${Math.round(s / 60)} minute${Math.round(s / 60) === 1 ? "" : "s"}`;

export function StreamToolsTab() {
  const diceLook = useToolLook("dice", { toast: "Dice look saved" });
  const coinLook = useToolLook("coin", { toast: "Coin look saved" });
  const timerLook = useToolLook("timer", { toast: "Timer saved" });
  const dice = diceLook.look;
  const coin = coinLook.look;
  const timer = timerLook.look;
  const setTimer = timerLook.setLook;
  const loading = !diceLook.ready || !coinLook.ready || !timerLook.ready;
  const { pro, brand, avatarUrl } = diceLook;
  const [open, setOpen] = useState<ToolId | null>(null);
  // The CDS Drawer renders differently on the server, so it mounts after hydration.
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  // Swatches and "Theme" accents show the streamer's real brand color.
  const { vars: brandVars, theme } = useBrandTheme();

  const accent = (v: string) => (!v || v === "brand" ? theme.primary : v);
  const drawnDice = diceDrawn(dice, { pro, brand });
  const paint = coinPaint({ ...coin, heads: coinLetter(coin.heads, DEFAULT_COIN_LOOK.heads), tails: coinLetter(coin.tails, DEFAULT_COIN_LOOK.tails) }, { pro, brand, avatarUrl });
  const tools: { id: ToolId; name: string; icon: ComponentType<{ size?: number }>; summary: string; swatches: string[] }[] = [
    { id: "dice", name: "Dice", icon: IconDice5, summary: `${dice.defaultCount} ${dice.defaultCount === 1 ? "die" : "dice"} by default, ${drawnDice.material.label.toLowerCase()}`, swatches: [drawnDice.dieColor, drawnDice.pipColor] },
    { id: "coin", name: "Coin", icon: IconCoin, summary: `${coin.heads || "H"} and ${coin.tails || "T"}`, swatches: [paint.base] },
    { id: "oracle", name: "Oracle", icon: IconCrystalBall, summary: "Magic 8-ball, yes or no, truth or dare", swatches: [] },
    { id: "timer", name: "Timer", icon: IconClock, summary: `${minutes(timer.defaultSeconds)} by default`, swatches: [accent(timer.accentColor)] },
    { id: "bingo", name: "Bingo", icon: IconLayoutGrid, summary: "Board size, free square and prompts", swatches: [] },
    { id: "tierlist", name: "Tier list", icon: IconChartBar, summary: "Title and the items to rank", swatches: [] },
  ];
  const current = tools.find((t) => t.id === open) ?? null;

  const panel: Record<ToolId, ReactNode> = {
    dice: (
      <div className="tool-panel-form tool-look-form">
        <DiceLookFields look={dice} onChange={diceLook.setLook} pro={pro} brand={brand} stream from="tool-looks" />
      </div>
    ),
    coin: (
      <div className="tool-panel-form tool-look-form">
        <div className="tool-look-form__preview" aria-hidden="true"><Coin paint={paint} rotation={0} /></div>
        <CoinLookFields look={coin} onChange={coinLook.setLook} pro={pro} hasPicture={!!avatarUrl} from="tool-looks" />
      </div>
    ),
    timer: (
      <div className="tool-panel-form">
        <AccentField label="Accent" value={timer.accentColor} onChange={(v) => setTimer({ ...timer, accentColor: v })} />
        <Select
          fullWidth
          floatingLabel="Default length"
          value={TIMER_PRESETS.includes(timer.defaultSeconds) ? String(timer.defaultSeconds) : CUSTOM}
          onChange={(v) => { if (v !== CUSTOM) setTimer({ ...timer, defaultSeconds: Number(v) }); }}
          options={[...TIMER_PRESETS.map((s) => ({ value: String(s), label: minutes(s) })), { value: CUSTOM, label: "Another length" }]}
        />
        <Input type="number" min={1} max={1440} fullWidth floatingLabel="Length in minutes" value={String(Math.max(1, Math.round(timer.defaultSeconds / 60)))}
          onChange={(e) => setTimer({ ...timer, defaultSeconds: Math.max(1, Math.min(1440, Number(e.target.value) || 1)) * 60 })} />
      </div>
    ),
    oracle: <OracleConfigCard bare />,
    bingo: <BingoConfigCard bare />,
    tierlist: <TierListConfigCard bare />,
  };

  return (
    <AdminScreen title="Tool looks" intro="How your tools look and what they say, on your overlay, in the control room and on the free tool pages when you're signed in. The dice and coin take your brand theme with Match my brand; the other tools follow it unless you give one its own color. Changes save as you go.">
      {loading ? <LoadingLines label="Loading" /> : (
        <ul className="tool-list" style={brandVars}>
          {tools.map((t) => {
            const Icon = t.icon;
            return (
              <li key={t.id} className="tool-row">
                <span className="tool-row__icon" aria-hidden><Icon size={20} /></span>
                <span className="tool-row__text"><strong>{t.name}</strong><span>{t.summary}</span></span>
                <span className="tool-row__swatches" aria-hidden>{t.swatches.map((c, i) => <i key={i} style={{ background: c }} />)}</span>
                <Button variant="ghost" size="small" onClick={() => setOpen(t.id)} aria-label={`Edit ${t.name}`}>Edit</Button>
              </li>
            );
          })}
        </ul>
      )}
      {hydrated && <Drawer open={!!current} onClose={() => setOpen(null)} title={current?.name ?? "Tool look"} subtitle="Changes save as you go." size="standard">
        <div className="tool-panel" style={brandVars}>{current ? panel[current.id] : null}</div>
      </Drawer>}
    </AdminScreen>
  );
}
