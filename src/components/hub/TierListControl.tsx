"use client";

/**
 * TierListControl — Hub tier-list widget (Pro). The Hub is the placement
 * surface: a "Tier List" button expands a panel with New/Clear plus every item
 * and a tier select (S/A/B/C/D or — for the unranked tray). Each change pushes
 * to the overlay via the persistent tier-list event. Self-hides for non-Pro.
 */

import { useEffect, useState, useTransition } from "react";
import { Button, Input } from "@empac/cascadeds";
import {
  getTierListAction,
  newTierListAction,
  placeTierItemAction,
  addTierItemAction,
  removeTierItemAction,
  clearTierListAction,
} from "@/app/hub/sessions/[slug]/actions";

const TIER_ITEM_MAX = 40;

interface TierRow {
  key: string;
  label: string;
  color: string;
}
interface TierItem {
  id: number;
  text: string;
  tier: string | null;
}
interface TierList {
  title: string | null;
  tiers: TierRow[];
  items: TierItem[];
}

export function TierListControl() {
  const [list, setList] = useState<TierList | null>(null);
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [newItem, setNewItem] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await getTierListAction();
      if (!alive) return;
      if (res.ok) setList(res.list);
      else if (res.error === "pro_required") setHidden(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (hidden) return null;

  const create = () => {
    startTransition(async () => {
      const res = await newTierListAction();
      if (res.ok) {
        setList(res.list);
        setOpen(true);
      } else if (res.error === "pro_required") {
        setHidden(true);
      }
    });
  };

  const place = (itemId: number, tier: string | null) => {
    startTransition(async () => {
      const res = await placeTierItemAction(itemId, tier);
      if (res.ok && res.list) setList(res.list);
      else if (!res.ok && res.error === "pro_required") setHidden(true);
    });
  };

  const clear = () => {
    startTransition(async () => {
      const res = await clearTierListAction();
      if (res.ok) {
        setList(null);
        setOpen(false);
      } else if (res.error === "pro_required") {
        setHidden(true);
      }
    });
  };

  const addItem = () => {
    const text = newItem.trim();
    if (!text) return;
    setNewItem("");
    startTransition(async () => {
      const res = await addTierItemAction(text);
      if (res.ok) setList(res.list);
      else if (res.error === "pro_required") setHidden(true);
    });
  };

  const removeItem = (itemId: number) => {
    startTransition(async () => {
      const res = await removeTierItemAction(itemId);
      if (res.ok) setList(res.list);
      else if (res.error === "pro_required") setHidden(true);
    });
  };

  const rankedCount = list?.items.filter((it) => it.tier !== null).length ?? 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-8)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-8)", flexWrap: "wrap" }}>
        <Button variant="secondary" onClick={() => setOpen((o) => !o)}>
          📊 Tier List{list ? ` (${rankedCount}/${list.items.length})` : ""}
        </Button>
        {open && (
          <>
            <Button variant="primary" loading={pending} onClick={create}>
              {list ? "New list" : "Start list"}
            </Button>
            {list && (
              <Button variant="ghost" onClick={clear} disabled={pending}>
                Clear
              </Button>
            )}
          </>
        )}
      </div>

      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-8)", maxWidth: 420 }}>
          {/* Add items right here — no need to leave the Hub. */}
          <div style={{ display: "flex", gap: "var(--spacing-8)" }}>
            <Input
              value={newItem}
              onChange={(e) => setNewItem(e.target.value.slice(0, TIER_ITEM_MAX))}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addItem();
                }
              }}
              placeholder="Add an item…"
              fullWidth
            />
            <Button variant="secondary" onClick={addItem} disabled={pending || !newItem.trim()}>
              Add
            </Button>
          </div>

          {list && list.items.length === 0 && (
            <p style={{ color: "var(--text-secondary)", fontSize: "var(--font-size-14)", margin: 0 }}>
              Add items above to build your list. They&rsquo;re saved for next time.
            </p>
          )}

          {list &&
            list.items.map((it) => (
              <div
                key={it.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--spacing-8)",
                  padding: "4px 8px",
                  borderRadius: 8,
                  border: "1px solid var(--border-default)",
                  background: "var(--surface-default)",
                }}
              >
                <span style={{ flex: "1 1 auto", minWidth: 0, fontSize: "var(--font-size-14)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {it.text}
                </span>
                <select
                  value={it.tier ?? ""}
                  onChange={(e) => place(it.id, e.target.value || null)}
                  disabled={pending}
                  aria-label={`Tier for ${it.text}`}
                  style={{
                    height: 30,
                    borderRadius: 6,
                    border: "1px solid var(--border-default)",
                    padding: "0 6px",
                    background: "var(--surface-default)",
                    color: "var(--text-primary)",
                  }}
                >
                  <option value="">-</option>
                  {list.tiers.map((t) => (
                    <option key={t.key} value={t.key}>{t.label}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => removeItem(it.id)}
                  disabled={pending}
                  aria-label={`Remove ${it.text}`}
                  title="Remove"
                  style={{
                    flex: "0 0 auto",
                    width: 28,
                    height: 28,
                    borderRadius: 6,
                    border: "1px solid var(--border-default)",
                    background: "var(--surface-default)",
                    color: "var(--text-secondary)",
                    cursor: "pointer",
                    lineHeight: 1,
                  }}
                >
                  ×
                </button>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
