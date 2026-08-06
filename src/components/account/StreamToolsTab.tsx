"use client";

/**
 * Stream Tools tab — streamer-owned customization for the overlay tools (Pro):
 * dice/coin colors, oracle accent, and custom 8-Ball answers + Truth/Dare
 * prompts (standard set ships; streamers can author their own, char-limited).
 * Persists to `streamer_module_defaults` (gameSlug "*") via /api/account/module-defaults.
 */

import { useEffect, useState } from "react";
import { Button, Checkbox } from "@empac/cascadeds";
import { ORACLE_ENTRY_MAX, BINGO_PROMPT_MAX, TIER_ITEM_MAX } from "@/lib/modules/types";

type ContentMode = "standard" | "custom" | "both";
const MAX_ENTRIES = 40;

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
interface OracleCfg {
  truthDareSet: string;
  allowMaybe: boolean;
  accentColor: string;
  eightBallMode: ContentMode;
  customEightBall: string[];
  truthDareMode: ContentMode;
  customTruths: string[];
  customDares: string[];
}
interface TimerCfg {
  accentColor: string;
  defaultSeconds: number;
}
interface BingoCfg {
  prompts: string[];
  accentColor: string;
  size: number;
  freeCenter: boolean;
}
interface TierCfg {
  items: string[];
  accentColor: string;
  title: string;
}

const DEFAULT_DICE: DiceCfg = { dieColor: "#eef1f6", pipColor: "#1b2740", defaultCount: 2 };
const DEFAULT_COIN: CoinCfg = { style: "gold", headsColor: "#e6b23c", tailsColor: "#d9a94f" };
const DEFAULT_TIMER: TimerCfg = { accentColor: "#2f6fd6", defaultSeconds: 300 };
const TIMER_PRESETS: { label: string; seconds: number }[] = [
  { label: "1 min", seconds: 60 },
  { label: "3 min", seconds: 180 },
  { label: "5 min", seconds: 300 },
  { label: "10 min", seconds: 600 },
  { label: "15 min", seconds: 900 },
];
const DEFAULT_BINGO: BingoCfg = { prompts: [], accentColor: "#7c3aed", size: 5, freeCenter: true };
const BINGO_MAX_PROMPTS = 60;
const DEFAULT_TIER: TierCfg = { items: [], accentColor: "#2f6fd6", title: "Tier List" };
const TIER_MAX_ITEMS = 40;
const DEFAULT_ORACLE: OracleCfg = {
  truthDareSet: "party",
  allowMaybe: true,
  accentColor: "#2f6fd6",
  eightBallMode: "standard",
  customEightBall: [],
  truthDareMode: "standard",
  customTruths: [],
  customDares: [],
};

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

/** Textarea (one entry per line) ↔ string[], trimmed + char-capped + count-capped. */
function toLines(entries: string[]): string {
  return entries.join("\n");
}
function fromLines(text: string): string[] {
  return text
    .split("\n")
    .map((s) => s.trim().slice(0, ORACLE_ENTRY_MAX))
    .filter(Boolean)
    .slice(0, MAX_ENTRIES);
}
function fromLinesBingo(text: string): string[] {
  return text
    .split("\n")
    .map((s) => s.trim().slice(0, BINGO_PROMPT_MAX))
    .filter(Boolean)
    .slice(0, BINGO_MAX_PROMPTS);
}
function fromLinesTier(text: string): string[] {
  return text
    .split("\n")
    .map((s) => s.trim().slice(0, TIER_ITEM_MAX))
    .filter(Boolean)
    .slice(0, TIER_MAX_ITEMS);
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

function ModeSelect({ value, onChange }: { value: ContentMode; onChange: (v: ContentMode) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as ContentMode)}
      style={{ height: 34, borderRadius: 8, border: "1px solid var(--border-default)", padding: "0 var(--spacing-8)", background: "var(--surface-default)", color: "var(--text-primary)" }}
    >
      <option value="standard">Standard set</option>
      <option value="custom">My custom only</option>
      <option value="both">Standard + mine</option>
    </select>
  );
}

export function StreamToolsTab() {
  const [dice, setDice] = useState<DiceCfg>(DEFAULT_DICE);
  const [coin, setCoin] = useState<CoinCfg>(DEFAULT_COIN);
  const [oracle, setOracle] = useState<OracleCfg>(DEFAULT_ORACLE);
  const [timer, setTimer] = useState<TimerCfg>(DEFAULT_TIMER);
  const [bingo, setBingo] = useState<BingoCfg>(DEFAULT_BINGO);
  const [tierlist, setTierlist] = useState<TierCfg>(DEFAULT_TIER);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [d, c, o, t, b, tl] = await Promise.all([
        loadConfig<DiceCfg>("dice"),
        loadConfig<CoinCfg>("coin"),
        loadConfig<OracleCfg>("oracle"),
        loadConfig<TimerCfg>("timer"),
        loadConfig<BingoCfg>("bingo"),
        loadConfig<TierCfg>("tierlist"),
      ]);
      if (!alive) return;
      if (d) setDice({ ...DEFAULT_DICE, ...d });
      if (c) setCoin({ ...DEFAULT_COIN, ...c });
      if (o) setOracle({ ...DEFAULT_ORACLE, ...o });
      if (t) setTimer({ ...DEFAULT_TIMER, ...t });
      if (b) setBingo({ ...DEFAULT_BINGO, ...b });
      if (tl) setTierlist({ ...DEFAULT_TIER, ...tl });
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
    setStatus(ok ? `${label} saved.` : `Couldn't save ${label}.`);
    window.setTimeout(() => setStatus(null), 3500);
  };

  if (loading) return <p style={{ color: "var(--text-secondary)" }}>Loading…</p>;

  return (
    <div className="stream-tools-tab">
      <h2 className="account-tab__heading">Stream Tools</h2>
      <p className="account-tab__intro">
        Customize how your overlay tools look and what they say. These apply to the dice, coin,
        oracle, timer, bingo, and tier-list tools triggered from chat, the Hub, and channel points.
      </p>

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

      {/* Oracle */}
      <section className="stream-tools__section">
        <h3 className="stream-tools__heading">🎱 Oracle (8-Ball / Yes-No / Truth or Dare)</h3>

        <div className="stream-tools__row">
          <ColorField label="Card accent" value={oracle.accentColor} onChange={(v) => setOracle({ ...oracle, accentColor: v })} />
          <Checkbox
            label="Yes/No can answer “Maybe”"
            checked={oracle.allowMaybe}
            onChange={(e) => setOracle({ ...oracle, allowMaybe: e.target.checked })}
          />
        </div>

        <div className="stream-tools__field">
          <div className="stream-tools__field-head">
            <strong>Magic 8-Ball answers</strong>
            <ModeSelect value={oracle.eightBallMode} onChange={(v) => setOracle({ ...oracle, eightBallMode: v })} />
          </div>
          <textarea
            className="stream-tools__textarea"
            placeholder={`One custom answer per line (max ${ORACLE_ENTRY_MAX} chars each)`}
            rows={4}
            value={toLines(oracle.customEightBall)}
            onChange={(e) => setOracle({ ...oracle, customEightBall: fromLines(e.target.value) })}
          />
        </div>

        <div className="stream-tools__field">
          <div className="stream-tools__field-head">
            <strong>Truth or Dare</strong>
            <ModeSelect value={oracle.truthDareMode} onChange={(v) => setOracle({ ...oracle, truthDareMode: v })} />
            <select
              value={oracle.truthDareSet}
              onChange={(e) => setOracle({ ...oracle, truthDareSet: e.target.value })}
              aria-label="Standard set"
              style={{ height: 34, borderRadius: 8, border: "1px solid var(--border-default)", padding: "0 var(--spacing-8)", background: "var(--surface-default)", color: "var(--text-primary)" }}
            >
              <option value="clean">Clean set</option>
              <option value="party">Party set</option>
              <option value="couples">Couples set</option>
            </select>
          </div>
          <div className="stream-tools__row stream-tools__row--stack">
            <div style={{ flex: 1, minWidth: 220 }}>
              <label className="stream-tools__sublabel">Custom Truths</label>
              <textarea
                className="stream-tools__textarea"
                placeholder={`One truth per line (max ${ORACLE_ENTRY_MAX} chars)`}
                rows={4}
                value={toLines(oracle.customTruths)}
                onChange={(e) => setOracle({ ...oracle, customTruths: fromLines(e.target.value) })}
              />
            </div>
            <div style={{ flex: 1, minWidth: 220 }}>
              <label className="stream-tools__sublabel">Custom Dares</label>
              <textarea
                className="stream-tools__textarea"
                placeholder={`One dare per line (max ${ORACLE_ENTRY_MAX} chars)`}
                rows={4}
                value={toLines(oracle.customDares)}
                onChange={(e) => setOracle({ ...oracle, customDares: fromLines(e.target.value) })}
              />
            </div>
          </div>
        </div>

        <Button variant="secondary" size="small" loading={saving === "oracle"} onClick={() => save("oracle", oracle, "Oracle")}>
          Save oracle
        </Button>
      </section>

      {/* Timer */}
      <section className="stream-tools__section">
        <h3 className="stream-tools__heading">⏱️ Stream Timer</h3>
        <div className="stream-tools__row">
          <ColorField label="Accent" value={timer.accentColor} onChange={(v) => setTimer({ ...timer, accentColor: v })} />
          <label style={{ display: "inline-flex", alignItems: "center", gap: "var(--spacing-8)", fontSize: "var(--font-size-14)" }}>
            Default duration
            <select
              value={timer.defaultSeconds}
              onChange={(e) => setTimer({ ...timer, defaultSeconds: Number(e.target.value) })}
              style={{ height: 34, borderRadius: 8, border: "1px solid var(--border-default)", padding: "0 var(--spacing-8)", background: "var(--surface-default)", color: "var(--text-primary)" }}
            >
              {TIMER_PRESETS.map((p) => (
                <option key={p.seconds} value={p.seconds}>{p.label}</option>
              ))}
            </select>
          </label>
        </div>
        <Button variant="secondary" size="small" loading={saving === "timer"} onClick={() => save("timer", timer, "Timer")}>
          Save timer
        </Button>
      </section>

      {/* Bingo */}
      <section className="stream-tools__section">
        <h3 className="stream-tools__heading">🅱️ Community Bingo</h3>
        <div className="stream-tools__row">
          <ColorField label="Accent" value={bingo.accentColor} onChange={(v) => setBingo({ ...bingo, accentColor: v })} />
          <label style={{ display: "inline-flex", alignItems: "center", gap: "var(--spacing-8)", fontSize: "var(--font-size-14)" }}>
            Board size
            <select
              value={bingo.size}
              onChange={(e) => setBingo({ ...bingo, size: Number(e.target.value) })}
              style={{ height: 34, borderRadius: 8, border: "1px solid var(--border-default)", padding: "0 var(--spacing-8)", background: "var(--surface-default)", color: "var(--text-primary)" }}
            >
              <option value={3}>3×3</option>
              <option value={4}>4×4</option>
              <option value={5}>5×5</option>
            </select>
          </label>
          <Checkbox
            label="Free center square"
            checked={bingo.freeCenter}
            onChange={(e) => setBingo({ ...bingo, freeCenter: e.target.checked })}
          />
        </div>
        <div className="stream-tools__field">
          <div className="stream-tools__field-head">
            <strong>Bingo prompts</strong>
            <span style={{ fontSize: "var(--font-size-13)", color: "var(--text-secondary)" }}>
              {bingo.prompts.length} / {BINGO_MAX_PROMPTS} · need ≥ {bingo.size * bingo.size} to fill a {bingo.size}×{bingo.size}
            </span>
          </div>
          <textarea
            className="stream-tools__textarea"
            placeholder={`One prompt per line (max ${BINGO_PROMPT_MAX} chars). Leave empty to use the default stream-moments pool.`}
            rows={6}
            value={toLines(bingo.prompts)}
            onChange={(e) => setBingo({ ...bingo, prompts: fromLinesBingo(e.target.value) })}
          />
        </div>
        <Button variant="secondary" size="small" loading={saving === "bingo"} onClick={() => save("bingo", bingo, "Bingo")}>
          Save bingo
        </Button>
      </section>

      {/* Tier List */}
      <section className="stream-tools__section">
        <h3 className="stream-tools__heading">📊 Tier List</h3>
        <div className="stream-tools__row">
          <ColorField label="Accent" value={tierlist.accentColor} onChange={(v) => setTierlist({ ...tierlist, accentColor: v })} />
          <label style={{ display: "inline-flex", alignItems: "center", gap: "var(--spacing-8)", fontSize: "var(--font-size-14)" }}>
            Title
            <input
              type="text"
              value={tierlist.title}
              onChange={(e) => setTierlist({ ...tierlist, title: e.target.value.slice(0, 40) })}
              placeholder="Tier List"
              style={{ height: 30, width: 160, borderRadius: 6, border: "1px solid var(--border-default)", padding: "0 8px", background: "var(--surface-default)", color: "var(--text-primary)" }}
            />
          </label>
        </div>
        <div className="stream-tools__field">
          <div className="stream-tools__field-head">
            <strong>Items to rank</strong>
            <span style={{ fontSize: "var(--font-size-13)", color: "var(--text-secondary)" }}>
              {tierlist.items.length} / {TIER_MAX_ITEMS} · placed into S/A/B/C/D from the Hub
            </span>
          </div>
          <textarea
            className="stream-tools__textarea"
            placeholder={`One item per line (max ${TIER_ITEM_MAX} chars). e.g. Mario Kart tracks, characters, chat's game suggestions.`}
            rows={6}
            value={toLines(tierlist.items)}
            onChange={(e) => setTierlist({ ...tierlist, items: fromLinesTier(e.target.value) })}
          />
        </div>
        <Button variant="secondary" size="small" loading={saving === "tierlist"} onClick={() => save("tierlist", tierlist, "Tier List")}>
          Save tier list
        </Button>
      </section>

      {status ? <p className="stream-tools__status">{status}</p> : null}
    </div>
  );
}
