"use client";

/**
 * OracleConfigCard — the streamer-owned Oracle setup (Magic 8-Ball answers +
 * Truth/Dare prompts + accent), persisted to `streamer_module_defaults`. Shared
 * by the account Stream Tools tab and the Hub Stream Tools tab so a streamer can
 * update 8-ball and truth/dare content in one place, from either surface. The
 * Hub pairs this with the live OracleControl (fire an answer to the overlay).
 */

import { useEffect, useState } from "react";
import { Button, Checkbox } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import { useBrandTheme } from "@/hooks/useBrandTheme";
import { AccentField, loadModuleConfig, saveModuleConfig } from "./fields";
import { ORACLE_ENTRY_MAX } from "@/lib/modules/types";
import { EIGHT_BALL_ANSWERS } from "@/data/eight-ball";
import { getTruthOrDareSet } from "@/data/truth-or-dare";

type ContentMode = "standard" | "custom" | "both";
const MAX_ENTRIES = 40;

interface OracleCfg {
  truthDareSet: string;
  allowMaybe: boolean;
  accentColor: string;
  eightBallMode: ContentMode;
  customEightBall: string[];
  truthDareMode: ContentMode;
  customTruths: string[];
  customDares: string[];
  disabledEightBall: string[];
  disabledTruths: string[];
  disabledDares: string[];
}

const DEFAULT_ORACLE: OracleCfg = {
  truthDareSet: "party",
  allowMaybe: true,
  accentColor: "brand",
  eightBallMode: "standard",
  customEightBall: [],
  truthDareMode: "standard",
  customTruths: [],
  customDares: [],
  disabledEightBall: [],
  disabledTruths: [],
  disabledDares: [],
};

const toLines = (a: string[]) => a.join("\n");
const fromLines = (t: string) =>
  t.split("\n").map((s) => s.trim().slice(0, ORACLE_ENTRY_MAX)).filter(Boolean).slice(0, MAX_ENTRIES);

/** A scrollable checklist of default entries — each toggles on/off. `disabled`
 *  holds the OFF entries (by exact text). Bulk enable/disable at the top. */
function DefaultChecklist({
  items,
  disabled,
  onToggle,
  onBulk,
}: {
  items: string[];
  disabled: string[];
  onToggle: (text: string, on: boolean) => void;
  onBulk: (on: boolean) => void;
}) {
  const off = new Set(disabled);
  const onCount = items.filter((i) => !off.has(i)).length;
  return (
    <div className="stream-tools__checklist">
      <div className="stream-tools__checklist-head">
        <span>{onCount} of {items.length} on</span>
        <span className="stream-tools__checklist-bulk">
          <button type="button" onClick={() => onBulk(true)}>Enable all</button>
          <button type="button" onClick={() => onBulk(false)}>Disable all</button>
        </span>
      </div>
      <div className="stream-tools__checklist-body">
        {items.map((text) => (
          <label key={text} className="stream-tools__check">
            <input type="checkbox" checked={!off.has(text)} onChange={(e) => onToggle(text, e.target.checked)} />
            <span>{text}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

export function OracleConfigCard({ onSaved }: { onSaved?: () => void }) {
  const [oracle, setOracle] = useState<OracleCfg>(DEFAULT_ORACLE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const { vars } = useBrandTheme();

  useEffect(() => {
    let alive = true;
    (async () => {
      const c = await loadModuleConfig<OracleCfg>("oracle");
      if (!alive) return;
      if (c) setOracle({ ...DEFAULT_ORACLE, ...c });
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const save = async () => {
    setSaving(true);
    const ok = await saveModuleConfig("oracle", oracle);
    setSaving(false);
    if (ok) {
      toast.success("Your changes are live.", { title: "Oracle saved" });
      onSaved?.();
    } else {
      toast.error("Please try again.", { title: "Couldn't save Oracle" });
    }
  };

  if (loading) return null;

  const eightBallTexts = EIGHT_BALL_ANSWERS.map((a) => a.text);
  const tdSet = getTruthOrDareSet(oracle.truthDareSet);
  const tdTruths = tdSet?.truths ?? [];
  const tdDares = tdSet?.dares ?? [];
  const toggleDisabled = (key: "disabledEightBall" | "disabledTruths" | "disabledDares", text: string, on: boolean) =>
    setOracle((o) => ({ ...o, [key]: on ? o[key].filter((t) => t !== text) : [...o[key], text] }));
  const bulkDisabled = (key: "disabledEightBall" | "disabledTruths" | "disabledDares", all: string[], on: boolean) =>
    setOracle((o) => ({ ...o, [key]: on ? [] : [...all] }));

  return (
    <section className="stream-tools__section" style={vars}>
      <h3 className="stream-tools__heading">🎱 Oracle (8-Ball / Yes-No / Truth or Dare)</h3>

      <div className="stream-tools__row">
        <AccentField label="Card accent" value={oracle.accentColor} onChange={(v) => setOracle({ ...oracle, accentColor: v })} />
        <Checkbox
          label="Yes/No can answer “Maybe”"
          checked={oracle.allowMaybe}
          onChange={(e) => setOracle({ ...oracle, allowMaybe: e.target.checked })}
        />
      </div>

      <div className="stream-tools__field">
        <div className="stream-tools__field-head">
          <strong>Magic 8-Ball answers</strong>
        </div>
        <p className="stream-tools__hint">The classic answers ship on by default. Untick any you don&apos;t want, then add your own below.</p>
        <DefaultChecklist
          items={eightBallTexts}
          disabled={oracle.disabledEightBall}
          onToggle={(text, on) => toggleDisabled("disabledEightBall", text, on)}
          onBulk={(on) => bulkDisabled("disabledEightBall", eightBallTexts, on)}
        />
        <label className="stream-tools__sublabel" style={{ marginTop: "var(--spacing-12)" }}>Your custom answers</label>
        <textarea
          className="stream-tools__textarea"
          placeholder={`One custom answer per line (max ${ORACLE_ENTRY_MAX} chars each)`}
          rows={3}
          value={toLines(oracle.customEightBall)}
          onChange={(e) => setOracle({ ...oracle, customEightBall: fromLines(e.target.value) })}
        />
      </div>

      <div className="stream-tools__field">
        <div className="stream-tools__field-head">
          <strong>Truth or Dare</strong>
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
        <p className="stream-tools__hint">Toggle any prompt from the selected set off, and add your own. Switching sets shows that set&apos;s prompts.</p>
        <div className="stream-tools__row stream-tools__row--stack">
          <div style={{ flex: 1, minWidth: 240 }}>
            <label className="stream-tools__sublabel">Truths</label>
            <DefaultChecklist
              items={tdTruths}
              disabled={oracle.disabledTruths}
              onToggle={(text, on) => toggleDisabled("disabledTruths", text, on)}
              onBulk={(on) => bulkDisabled("disabledTruths", tdTruths, on)}
            />
            <label className="stream-tools__sublabel" style={{ marginTop: "var(--spacing-8)" }}>Your custom truths</label>
            <textarea
              className="stream-tools__textarea"
              placeholder={`One truth per line (max ${ORACLE_ENTRY_MAX} chars)`}
              rows={3}
              value={toLines(oracle.customTruths)}
              onChange={(e) => setOracle({ ...oracle, customTruths: fromLines(e.target.value) })}
            />
          </div>
          <div style={{ flex: 1, minWidth: 240 }}>
            <label className="stream-tools__sublabel">Dares</label>
            <DefaultChecklist
              items={tdDares}
              disabled={oracle.disabledDares}
              onToggle={(text, on) => toggleDisabled("disabledDares", text, on)}
              onBulk={(on) => bulkDisabled("disabledDares", tdDares, on)}
            />
            <label className="stream-tools__sublabel" style={{ marginTop: "var(--spacing-8)" }}>Your custom dares</label>
            <textarea
              className="stream-tools__textarea"
              placeholder={`One dare per line (max ${ORACLE_ENTRY_MAX} chars)`}
              rows={3}
              value={toLines(oracle.customDares)}
              onChange={(e) => setOracle({ ...oracle, customDares: fromLines(e.target.value) })}
            />
          </div>
        </div>
      </div>

      <Button variant="secondary" size="small" loading={saving} onClick={save}>
        Save oracle
      </Button>
    </section>
  );
}
