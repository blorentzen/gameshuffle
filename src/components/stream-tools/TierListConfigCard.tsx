"use client";

/**
 * TierListConfigCard — the streamer-owned Tier List setup (items pool + accent +
 * title), persisted to `streamer_module_defaults`. Shared by the account Stream
 * Tools tab and the Hub Stream Tools tab so editing is identical in both. The
 * Hub pairs this with the live TierListControl (generate + place into tiers).
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button, Chip } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import { useAutosave } from "@/lib/hooks/useAutosave";
import { useBrandTheme } from "@/hooks/useBrandTheme";
import { AccentField, loadModuleConfig, saveModuleConfig, isImageUrl, uploadToolImage } from "./fields";
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

export function TierListConfigCard({ onSaved, live, bare = false }: { onSaved?: () => void; live?: ReactNode; bare?: boolean }) {
  const [cfg, setCfg] = useState<TierCfg>(DEFAULT_TIER);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
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

  const pushItem = (raw: string) => {
    const v = capItem(raw.trim());
    if (!v || cfg.items.length >= TIER_MAX_ITEMS || cfg.items.includes(v)) return;
    setCfg((t) => ({ ...t, items: [...t.items, v] }));
  };
  const addItem = () => {
    pushItem(input);
    setInput("");
  };
  const removeItem = (idx: number) => setCfg((t) => ({ ...t, items: t.items.filter((_, i) => i !== idx) }));

  const handleUpload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    const url = await uploadToolImage(file);
    setUploading(false);
    if (url) pushItem(url);
    else toast.error("Couldn't upload that image. Try again.");
  };

  // Saves itself a moment after a change (site-wide autosave); the Hub uses this card too.
  useAutosave(cfg, async (v) => {
    const ok = await saveModuleConfig("tierlist", v);
    if (ok) onSaved?.();
    else toast.error("Please try again.", { title: "Couldn't save Tier list" });
    return ok;
  }, { ready: !loading, toast: "Tier list saved" });

  if (loading) return null;

  return (
    <section className={bare ? "stream-tools__bare" : "stream-tools__section"} style={vars}>
      {!bare && <h3 className="stream-tools__heading">📊 Tier List</h3>}
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
          <Button
            variant="secondary"
            size="small"
            loading={uploading}
            onClick={() => fileRef.current?.click()}
            disabled={cfg.items.length >= TIER_MAX_ITEMS}
          >
            📷 Upload
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              void handleUpload(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>
        {cfg.items.length > 0 && (
          <div className="stream-tools__chips">
            {cfg.items.map((item, i) => (
              <Chip
                key={`${item}-${i}`}
                size="small"
                label={isImageUrl(item) ? "Image" : item}
                icon={isImageUrl(item) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item} alt="" style={{ width: 22, height: 22, borderRadius: 4, objectFit: "cover", verticalAlign: "middle" }} />
                ) : undefined}
                removable
                onRemove={() => removeItem(i)}
              />
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
      {live ? <div className="stream-tools__live">{live}</div> : null}
    </section>
  );
}
