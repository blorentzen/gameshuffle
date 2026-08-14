"use client";

/**
 * Stream Tools tab — streamer-owned customization for the overlay tools (Pro):
 * dice/coin colors, oracle accent, and custom 8-Ball answers + Truth/Dare
 * prompts (standard set ships; streamers can author their own, char-limited).
 * Persists to `streamer_module_defaults` (gameSlug "*") via /api/account/module-defaults.
 */

import { useEffect, useState } from "react";
import { Button } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import { useBrandTheme } from "@/hooks/useBrandTheme";
import { BrandThemeBar } from "@/components/account/BrandThemeBar";
import { BingoConfigCard } from "@/components/stream-tools/BingoConfigCard";
import { TierListConfigCard } from "@/components/stream-tools/TierListConfigCard";
import { OracleConfigCard } from "@/components/stream-tools/OracleConfigCard";

interface DiceCfg {
  dieColor: string;
  pipColor: string;
  defaultCount: number;
}
interface CoinCfg {
  style: string;
  headsColor: string;
  tailsColor: string;
}
interface TimerCfg {
  accentColor: string;
  defaultSeconds: number;
}

const DEFAULT_DICE: DiceCfg = { dieColor: "#eef1f6", pipColor: "#1b2740", defaultCount: 2 };
const DEFAULT_COIN: CoinCfg = { style: "gold", headsColor: "#e6b23c", tailsColor: "#d9a94f" };
const DEFAULT_TIMER: TimerCfg = { accentColor: "brand", defaultSeconds: 300 };
const TIMER_PRESETS: { label: string; seconds: number }[] = [
  { label: "1 min", seconds: 60 },
  { label: "3 min", seconds: 180 },
  { label: "5 min", seconds: 300 },
  { label: "10 min", seconds: 600 },
  { label: "15 min", seconds: 900 },
];
async function loadConfig<T>(moduleId: string): Promise<Partial<T> | null> {
  try {
    const res = await fetch(`/api/account/module-defaults?moduleId=${moduleId}&gameSlug=*`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const body = await res.json();
    return (body.config as Partial<T> | null) ?? null;
  } catch {
    return null;
  }
}

async function saveConfig(moduleId: string, config: unknown): Promise<boolean> {
  try {
    const res = await fetch("/api/account/module-defaults", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ moduleId, gameSlug: "*", config }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: "var(--spacing-8)", fontSize: "var(--font-size-14)" }}>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: 34, height: 28, border: "1px solid var(--border-default)", borderRadius: 6, background: "none", padding: 0, cursor: "pointer" }}
      />
      {label}
    </label>
  );
}

/** Accent picker that follows the global brand theme by default ("brand"), with
 *  a Custom mode for a per-tool hex override. Store value is "brand" | hex. */
function AccentField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const brand = !value || value === "brand";
  const segBtn = (active: boolean): React.CSSProperties => ({
    padding: "3px 10px",
    fontSize: "var(--font-size-12)",
    fontWeight: "var(--font-weight-semibold)",
    cursor: "pointer",
    border: "none",
    background: active ? "var(--bg-primary)" : "transparent",
    color: active ? "var(--text-on-primary)" : "var(--text-secondary)",
  });
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--spacing-8)", fontSize: "var(--font-size-14)", flexWrap: "wrap" }}>
      <span>{label}</span>
      <span style={{ display: "inline-flex", borderRadius: 999, border: "1px solid var(--border-default)", overflow: "hidden" }}>
        <button type="button" style={segBtn(brand)} onClick={() => onChange("brand")}>Theme</button>
        <button type="button" style={segBtn(!brand)} onClick={() => onChange(brand ? "#2f6fd6" : value)}>Custom</button>
      </span>
      {brand ? (
        <span
          title="Follows your brand theme (set it in the Theme tab)"
          style={{ width: 34, height: 28, borderRadius: 6, border: "1px solid var(--border-default)", background: "var(--brand-primary)" }}
        />
      ) : (
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ width: 34, height: 28, border: "1px solid var(--border-default)", borderRadius: 6, background: "none", padding: 0, cursor: "pointer" }}
        />
      )}
    </span>
  );
}

export function StreamToolsTab() {
  const [dice, setDice] = useState<DiceCfg>(DEFAULT_DICE);
  const [coin, setCoin] = useState<CoinCfg>(DEFAULT_COIN);
  const [timer, setTimer] = useState<TimerCfg>(DEFAULT_TIMER);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const toast = useToast();
  // Apply the streamer's saved brand theme so the "Theme" accent swatches show
  // their real color (matching the live overlay), not the site default.
  const { vars: brandVars } = useBrandTheme();

  useEffect(() => {
    let alive = true;
    (async () => {
      const [d, c, t] = await Promise.all([
        loadConfig<DiceCfg>("dice"),
        loadConfig<CoinCfg>("coin"),
        loadConfig<TimerCfg>("timer"),
      ]);
      if (!alive) return;
      if (d) setDice({ ...DEFAULT_DICE, ...d });
      if (c) setCoin({ ...DEFAULT_COIN, ...c });
      if (t) setTimer({ ...DEFAULT_TIMER, ...t });
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const save = async (moduleId: string, config: unknown, label: string) => {
    setSaving(moduleId);
    const ok = await saveConfig(moduleId, config);
    setSaving(null);
    // A toast per save so it's unmistakable the change landed (or didn't).
    if (ok) toast.success("Your changes are live.", { title: `${label} saved` });
    else toast.error("Please try again.", { title: `Couldn't save ${label}` });
  };

  if (loading) return <p style={{ color: "var(--text-secondary)" }}>Loading…</p>;

  return (
    <div className="stream-tools-tab" style={brandVars}>
      <h2 className="account-tab__heading">Stream Tools</h2>
      <p className="account-tab__intro">
        Customize how your overlay tools look and what they say. These apply to the dice, coin,
        oracle, timer, bingo, and tier-list tools triggered from chat, the Hub, and channel points.
      </p>
      <BrandThemeBar context="your tool accents" />

      {/* Dice */}
      <section className="stream-tools__section">
        <h3 className="stream-tools__heading">🎲 Dice</h3>
        <div className="stream-tools__row">
          <ColorField label="Dice color" value={dice.dieColor} onChange={(v) => setDice({ ...dice, dieColor: v })} />
          <ColorField label="Pip color" value={dice.pipColor} onChange={(v) => setDice({ ...dice, pipColor: v })} />
          <label style={{ display: "inline-flex", alignItems: "center", gap: "var(--spacing-8)", fontSize: "var(--font-size-14)" }}>
            Default dice
            <input
              type="number"
              min={1}
              max={6}
              value={dice.defaultCount}
              onChange={(e) => setDice({ ...dice, defaultCount: Math.max(1, Math.min(6, Number(e.target.value) || 1)) })}
              style={{ width: 56, height: 30, borderRadius: 6, border: "1px solid var(--border-default)", padding: "0 6px", background: "var(--surface-default)", color: "var(--text-primary)" }}
            />
          </label>
        </div>
        <Button variant="secondary" size="small" loading={saving === "dice"} onClick={() => save("dice", dice, "Dice")}>
          Save dice
        </Button>
      </section>

      {/* Coin */}
      <section className="stream-tools__section">
        <h3 className="stream-tools__heading">🪙 Coin</h3>
        <div className="stream-tools__row">
          <ColorField label="Heads color" value={coin.headsColor} onChange={(v) => setCoin({ ...coin, headsColor: v })} />
          <ColorField label="Tails color" value={coin.tailsColor} onChange={(v) => setCoin({ ...coin, tailsColor: v })} />
        </div>
        <Button variant="secondary" size="small" loading={saving === "coin"} onClick={() => save("coin", coin, "Coin")}>
          Save coin
        </Button>
      </section>

      {/* Oracle — shared config card (same component the Hub uses). */}
      <OracleConfigCard />

      {/* Timer */}
      <section className="stream-tools__section">
        <h3 className="stream-tools__heading">⏱️ Stream Timer</h3>
        <div className="stream-tools__row">
          <AccentField label="Accent" value={timer.accentColor} onChange={(v) => setTimer({ ...timer, accentColor: v })} />
          <label style={{ display: "inline-flex", alignItems: "center", gap: "var(--spacing-8)", fontSize: "var(--font-size-14)" }}>
            Default duration
            <select
              value={TIMER_PRESETS.some((p) => p.seconds === timer.defaultSeconds) ? String(timer.defaultSeconds) : "custom"}
              onChange={(e) => { if (e.target.value !== "custom") setTimer({ ...timer, defaultSeconds: Number(e.target.value) }); }}
              style={{ height: 34, borderRadius: 8, border: "1px solid var(--border-default)", padding: "0 var(--spacing-8)", background: "var(--surface-default)", color: "var(--text-primary)" }}
            >
              {TIMER_PRESETS.map((p) => (
                <option key={p.seconds} value={p.seconds}>{p.label}</option>
              ))}
              <option value="custom">Custom…</option>
            </select>
          </label>
          <label style={{ display: "inline-flex", alignItems: "center", gap: "var(--spacing-8)", fontSize: "var(--font-size-14)" }}>
            Custom (min)
            <input
              type="number"
              min={1}
              max={1440}
              value={Math.max(1, Math.round(timer.defaultSeconds / 60))}
              onChange={(e) => setTimer({ ...timer, defaultSeconds: Math.max(1, Math.min(1440, Number(e.target.value) || 1)) * 60 })}
              style={{ width: 72, height: 30, borderRadius: 6, border: "1px solid var(--border-default)", padding: "0 6px", background: "var(--surface-default)", color: "var(--text-primary)" }}
            />
          </label>
        </div>
        <Button variant="secondary" size="small" loading={saving === "timer"} onClick={() => save("timer", timer, "Timer")}>
          Save timer
        </Button>
      </section>

      {/* Bingo + Tier List — shared config cards (same components the Hub uses). */}
      <BingoConfigCard />
      <TierListConfigCard />
    </div>
  );
}
