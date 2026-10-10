"use client";

/**
 * Streaming ▸ Overlay ▸ Tool looks (GS Pro): how the overlay tools viewers
 * trigger from chat, the Hub and channel points look and what they say. One
 * row per tool; Edit opens a side panel (CDS Drawer) and every change saves
 * itself. Dice, coin and timer are edited here; Oracle, Bingo and Tier list
 * use the shared config cards the Hub uses too. Configs persist to
 * `streamer_module_defaults` (gameSlug "*") via /api/account/module-defaults.
 * The stream schedule moved to Streaming ▸ Setup ▸ Schedule.
 */

import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { Button, Drawer, Input, Select } from "@empac/cascadeds";
import { IconChartBar, IconClock, IconCoin, IconCrystalBall, IconDice5, IconLayoutGrid } from "@tabler/icons-react";
import { useToast } from "@/components/toast/ToastProvider";
import { useAutosave } from "@/lib/hooks/useAutosave";
import { useBrandTheme } from "@/hooks/useBrandTheme";
import { AdminScreen } from "@/components/account/admin/AdminKit";
import { BingoConfigCard } from "@/components/stream-tools/BingoConfigCard";
import { TierListConfigCard } from "@/components/stream-tools/TierListConfigCard";
import { OracleConfigCard } from "@/components/stream-tools/OracleConfigCard";
import { AccentField, ColorField, loadModuleConfig, saveModuleConfig } from "@/components/stream-tools/fields";
import { LoadingLines } from "@/components/loading/LoadingLines";

interface DiceCfg { dieColor: string; pipColor: string; defaultCount: number }
interface CoinCfg { style: string; headsColor: string; tailsColor: string }
interface TimerCfg { accentColor: string; defaultSeconds: number }

const DEFAULT_DICE: DiceCfg = { dieColor: "#eef1f6", pipColor: "#1b2740", defaultCount: 2 };
const DEFAULT_COIN: CoinCfg = { style: "gold", headsColor: "#e6b23c", tailsColor: "#d9a94f" };
const DEFAULT_TIMER: TimerCfg = { accentColor: "brand", defaultSeconds: 300 };
const TIMER_PRESETS = [60, 180, 300, 600, 900];
const CUSTOM = "custom";

type ToolId = "dice" | "coin" | "oracle" | "timer" | "bingo" | "tierlist";

/** Save one tool's config a moment after it changes. */
function useToolAutosave<T>(moduleId: string, name: string, value: T, ready: boolean) {
  const toast = useToast();
  useAutosave(value, async (v) => {
    const ok = await saveModuleConfig(moduleId, v);
    if (!ok) toast.error("Please try again.", { title: `Couldn't save ${name}` });
    return ok;
  }, { ready, toast: `${name} saved` });
}

const minutes = (s: number) => `${Math.round(s / 60)} minute${Math.round(s / 60) === 1 ? "" : "s"}`;

export function StreamToolsTab() {
  const [dice, setDice] = useState<DiceCfg>(DEFAULT_DICE);
  const [coin, setCoin] = useState<CoinCfg>(DEFAULT_COIN);
  const [timer, setTimer] = useState<TimerCfg>(DEFAULT_TIMER);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<ToolId | null>(null);
  // Swatches and "Theme" accents show the streamer's real brand color.
  const { vars: brandVars, theme } = useBrandTheme();

  useEffect(() => {
    let alive = true;
    (async () => {
      const [d, c, t] = await Promise.all([loadModuleConfig<DiceCfg>("dice"), loadModuleConfig<CoinCfg>("coin"), loadModuleConfig<TimerCfg>("timer")]);
      if (!alive) return;
      if (d) setDice({ ...DEFAULT_DICE, ...d });
      if (c) setCoin({ ...DEFAULT_COIN, ...c });
      if (t) setTimer({ ...DEFAULT_TIMER, ...t });
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  useToolAutosave("dice", "Dice", dice, !loading);
  useToolAutosave("coin", "Coin", coin, !loading);
  useToolAutosave("timer", "Timer", timer, !loading);

  const accent = (v: string) => (!v || v === "brand" ? theme.primary : v);
  const tools: { id: ToolId; name: string; icon: ComponentType<{ size?: number }>; summary: string; swatches: string[] }[] = [
    { id: "dice", name: "Dice", icon: IconDice5, summary: `${dice.defaultCount} ${dice.defaultCount === 1 ? "die" : "dice"} by default`, swatches: [dice.dieColor, dice.pipColor] },
    { id: "coin", name: "Coin", icon: IconCoin, summary: "Heads and tails colors", swatches: [coin.headsColor, coin.tailsColor] },
    { id: "oracle", name: "Oracle", icon: IconCrystalBall, summary: "Magic 8-ball, yes or no, truth or dare", swatches: [] },
    { id: "timer", name: "Timer", icon: IconClock, summary: `${minutes(timer.defaultSeconds)} by default`, swatches: [accent(timer.accentColor)] },
    { id: "bingo", name: "Bingo", icon: IconLayoutGrid, summary: "Board size, free square and prompts", swatches: [] },
    { id: "tierlist", name: "Tier list", icon: IconChartBar, summary: "Title and the items to rank", swatches: [] },
  ];
  const current = tools.find((t) => t.id === open) ?? null;

  const panel: Record<ToolId, ReactNode> = {
    dice: (
      <div className="tool-panel-form">
        <ColorField label="Dice color" value={dice.dieColor} onChange={(v) => setDice({ ...dice, dieColor: v })} />
        <ColorField label="Pip color" value={dice.pipColor} onChange={(v) => setDice({ ...dice, pipColor: v })} />
        <Input type="number" min={1} max={6} fullWidth floatingLabel="Dice to roll by default" value={String(dice.defaultCount)}
          onChange={(e) => setDice({ ...dice, defaultCount: Math.max(1, Math.min(6, Number(e.target.value) || 1)) })} />
      </div>
    ),
    coin: (
      <div className="tool-panel-form">
        <ColorField label="Heads color" value={coin.headsColor} onChange={(v) => setCoin({ ...coin, headsColor: v })} />
        <ColorField label="Tails color" value={coin.tailsColor} onChange={(v) => setCoin({ ...coin, tailsColor: v })} />
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
    <AdminScreen title="Tool looks" intro="Colors and words for the tools viewers trigger from chat, the Hub and channel points. They follow your brand theme unless you give one its own color. Changes save as you go.">
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
      <Drawer open={!!current} onClose={() => setOpen(null)} title={current?.name ?? "Tool look"} subtitle="Changes save as you go." size="standard">
        <div className="tool-panel" style={brandVars}>{current ? panel[current.id] : null}</div>
      </Drawer>
    </AdminScreen>
  );
}
