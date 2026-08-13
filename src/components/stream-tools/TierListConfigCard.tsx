"use client";

/**
 * TierListConfigCard — the streamer-owned Tier List setup (items pool + accent +
 * title), persisted to `streamer_module_defaults`. Shared by the account Stream
 * Tools tab and the Hub Stream Tools tab so editing is identical in both. The
 * Hub pairs this with the live TierListControl (generate + place into tiers).
 */

import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import { useBrandTheme } from "@/hooks/useBrandTheme";
import { AccentField, loadModuleConfig, saveModuleConfig, isImageUrl } from "./fields";
import { TIER_ITEM_MAX } from "@/lib/modules/types";

interface TierCfg {
  items: string[];
  accentColor: string;
  title: string;
}
const DEFAULT_TIER: TierCfg = { items: [], accentColor: "brand", title: "Tier List" };
const TIER_MAX_ITEMS = 40;
const URL_MAX = 500; // image URLs are longer than the text cap — don't truncate them

/** Cap text items to TIER_ITEM_MAX, but let image URLs keep their full length. */
const capItem = (v: string) => (isImageUrl(v) ? v.slice(0, URL_MAX) : v.slice(0, TIER_ITEM_MAX));

const toLines = (a: string[]) => a.join("\n");
const fromLinesTier = (t: string) =>
  t.split("\n").map((s) => capItem(s.trim())).filter(Boolean).slice(0, TIER_MAX_ITEMS);

export function TierListConfigCard({ onSaved, live }: { onSaved?: () => void; live?: ReactNode }) {
  const [cfg, setCfg] = useState<TierCfg>(DEFAULT_TIER);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const { vars } = useBrandTheme();

  useEffect(() => {
    let alive = true;
    (async () => {
      const c = await loadModuleConfig<TierCfg>("tierlist");
      if (!alive) return;
      if (c) setCfg({ ...DEFAULT_TIER, ...c });
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const addItem = () => {
    const v = capItem(input.trim());
    setInput("");
    if (!v || cfg.items.length >= TIER_MAX_ITEMS || cfg.items.includes(v)) return;
    setCfg((t) => ({ ...t, items: [...t.items, v] }));
  };
  const removeItem = (idx: number) => setCfg((t) => ({ ...t, items: t.items.filter((_, i) => i !== idx) }));

  const save = async () => {
    setSaving(true);
    const ok = await saveModuleConfig("tierlist", cfg);
    setSaving(false);
    if (ok) {
      toast.success("Your changes are live.", { title: "Tier List saved" });
      onSaved?.();
    } else {
      toast.error("Please try again.", { title: "Couldn't save Tier List" });
    }
  };

  if (loading) return null;

  return (
    <section className="stream-tools__section" style={vars}>
      <h3 className="stream-tools__heading">📊 Tier List</h3>
      <div className="stream-tools__row">
        <AccentField label="Accent" value={cfg.accentColor} onChange={(v) => setCfg({ ...cfg, accentColor: v })} />
        <label style={{ display: "inline-flex", alignItems: "center", gap: "var(--spacing-8)", fontSize: "var(--font-size-14)" }}>
          Title
          <input
            type="text"
            value={cfg.title}
            onChange={(e) => setCfg({ ...cfg, title: e.target.value.slice(0, 40) })}
            placeholder="Tier List"
            style={{ height: 30, width: 160, borderRadius: 6, border: "1px solid var(--border-default)", padding: "0 8px", background: "var(--surface-default)", color: "var(--text-primary)" }}
          />
        </label>
      </div>
      <div className="stream-tools__field">
        <div className="stream-tools__field-head">
          <strong>Items to rank</strong>
          <span style={{ fontSize: "var(--font-size-12)", color: "var(--text-secondary)" }}>
            {cfg.items.length} / {TIER_MAX_ITEMS} · placed into S/A/B/C/D from the Hub
          </span>
        </div>
        <div className="stream-tools__additem">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value.slice(0, URL_MAX))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addItem();
              }
            }}
            placeholder="Add text or an image URL, press Enter"
            disabled={cfg.items.length >= TIER_MAX_ITEMS}
          />
          <Button variant="secondary" size="small" onClick={addItem} disabled={!input.trim() || cfg.items.length >= TIER_MAX_ITEMS}>
            Add
          </Button>
        </div>
        {cfg.items.length > 0 && (
          <div className="stream-tools__chips">
            {cfg.items.map((item, i) => (
              <span key={`${item}-${i}`} className="stream-tools__chip">
                {isImageUrl(item) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item}
                    alt=""
                    style={{ width: 22, height: 22, borderRadius: 4, objectFit: "cover", verticalAlign: "middle" }}
                  />
                ) : (
                  item
                )}
                <button type="button" aria-label={`Remove ${isImageUrl(item) ? "image" : item}`} onClick={() => removeItem(i)}>×</button>
              </span>
            ))}
          </div>
        )}
        <details className="stream-tools__bulk">
          <summary>Bulk edit / paste a list</summary>
          <textarea
            className="stream-tools__textarea"
            placeholder={`One item per line (max ${TIER_ITEM_MAX} chars). e.g. Mario Kart tracks, characters, chat's game suggestions.`}
            rows={6}
            value={toLines(cfg.items)}
            onChange={(e) => setCfg({ ...cfg, items: fromLinesTier(e.target.value) })}
          />
        </details>
      </div>
      <Button variant="secondary" size="small" loading={saving} onClick={save}>
        Save tier list
      </Button>
      {live ? <div className="stream-tools__live">{live}</div> : null}
    </section>
  );
}
