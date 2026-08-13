"use client";

/**
 * BingoConfigCard — the streamer-owned Community Bingo setup (prompt pool +
 * accent + size + free center), persisted to `streamer_module_defaults`. Shared
 * by the account Stream Tools tab and the Hub Stream Tools tab. The Hub pairs
 * this with the live BingoControl (generate a board + mark squares).
 */

import { useEffect, useState, type ReactNode } from "react";
import { Button, Checkbox } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import { useBrandTheme } from "@/hooks/useBrandTheme";
import { AccentField, loadModuleConfig, saveModuleConfig, isImageUrl } from "./fields";
import { BINGO_PROMPT_MAX } from "@/lib/modules/types";

interface BingoCfg {
  prompts: string[];
  accentColor: string;
  size: number;
  freeCenter: boolean;
}
const DEFAULT_BINGO: BingoCfg = { prompts: [], accentColor: "brand", size: 5, freeCenter: true };
const BINGO_MAX_PROMPTS = 60;
const URL_MAX = 500; // image URLs are longer than the text cap — don't truncate them

const toLines = (a: string[]) => a.join("\n");
const fromLinesBingo = (t: string) =>
  t
    .split("\n")
    .map((s) => {
      const v = s.trim();
      return isImageUrl(v) ? v.slice(0, URL_MAX) : v.slice(0, BINGO_PROMPT_MAX);
    })
    .filter(Boolean)
    .slice(0, BINGO_MAX_PROMPTS);

export function BingoConfigCard({ onSaved, live }: { onSaved?: () => void; live?: ReactNode }) {
  const [cfg, setCfg] = useState<BingoCfg>(DEFAULT_BINGO);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const { vars } = useBrandTheme();

  useEffect(() => {
    let alive = true;
    (async () => {
      const c = await loadModuleConfig<BingoCfg>("bingo");
      if (!alive) return;
      if (c) setCfg({ ...DEFAULT_BINGO, ...c });
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const save = async () => {
    setSaving(true);
    const ok = await saveModuleConfig("bingo", cfg);
    setSaving(false);
    if (ok) {
      toast.success("Your changes are live.", { title: "Bingo saved" });
      onSaved?.();
    } else {
      toast.error("Please try again.", { title: "Couldn't save Bingo" });
    }
  };

  if (loading) return null;

  return (
    <section className="stream-tools__section" style={vars}>
      <h3 className="stream-tools__heading">🅱️ Community Bingo</h3>
      <div className="stream-tools__row">
        <AccentField label="Accent" value={cfg.accentColor} onChange={(v) => setCfg({ ...cfg, accentColor: v })} />
        <label style={{ display: "inline-flex", alignItems: "center", gap: "var(--spacing-8)", fontSize: "var(--font-size-14)" }}>
          Board size
          <select
            value={cfg.size}
            onChange={(e) => setCfg({ ...cfg, size: Number(e.target.value) })}
            style={{ height: 34, borderRadius: 8, border: "1px solid var(--border-default)", padding: "0 var(--spacing-8)", background: "var(--surface-default)", color: "var(--text-primary)" }}
          >
            <option value={3}>3×3</option>
            <option value={4}>4×4</option>
            <option value={5}>5×5</option>
          </select>
        </label>
        <Checkbox
          label="Free center square"
          checked={cfg.freeCenter}
          onChange={(e) => setCfg({ ...cfg, freeCenter: e.target.checked })}
        />
      </div>
      <div className="stream-tools__field">
        <div className="stream-tools__field-head">
          <strong>Bingo prompts</strong>
          <span style={{ fontSize: "var(--font-size-12)", color: "var(--text-secondary)" }}>
            {cfg.prompts.length} / {BINGO_MAX_PROMPTS} · need ≥ {cfg.size * cfg.size} to fill a {cfg.size}×{cfg.size}
          </span>
        </div>
        <textarea
          className="stream-tools__textarea"
          placeholder={`One prompt per line (text or an image URL, max ${BINGO_PROMPT_MAX} chars). Leave empty to use the default stream-moments pool.`}
          rows={6}
          value={toLines(cfg.prompts)}
          onChange={(e) => setCfg({ ...cfg, prompts: fromLinesBingo(e.target.value) })}
        />
      </div>
      <Button variant="secondary" size="small" loading={saving} onClick={save}>
        Save bingo
      </Button>
      {live ? <div className="stream-tools__live">{live}</div> : null}
    </section>
  );
}
