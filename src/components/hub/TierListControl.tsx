"use client";

/**
 * TierListControl — Hub tier-list LIVE control (Pro). Generates a list from the
 * streamer's item pool (edited in the Stream Tools setup / Account settings),
 * then places each item into S/A/B/C/D from here; every change pushes to the
 * overlay via the persistent tier-list event. Item pool editing lives in the
 * setup card (TierListConfigCard) so there's one source of truth. Self-hides
 * for non-Pro.
 */

import { useEffect, useState, useTransition } from "react";
import { Button } from "@empac/cascadeds";
import {
  getTierListAction,
  newTierListAction,
  placeTierItemAction,
  clearTierListAction,
} from "@/app/hub/sessions/[slug]/actions";

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
  const [hidden, setHidden] = useState(false);
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
      if (res.ok) setList(res.list);
      else if (res.error === "pro_required") setHidden(true);
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
      if (res.ok) setList(null);
      else if (res.error === "pro_required") setHidden(true);
    });
  };

  const rankedCount = list?.items.filter((it) => it.tier !== null).length ?? 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-8)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-8)", flexWrap: "wrap" }}>
        <Button variant="primary" loading={pending} onClick={create}>
          {list ? "New list from pool" : "Start list"}
        </Button>
        {list && (
          <>
            <span style={{ fontSize: "var(--font-size-14)", color: "var(--text-secondary)" }}>
              {rankedCount}/{list.items.length} placed
            </span>
            <Button variant="ghost" onClick={clear} disabled={pending}>
              Clear
            </Button>
          </>
        )}
      </div>

      {list && list.items.length === 0 && (
        <p style={{ color: "var(--text-secondary)", fontSize: "var(--font-size-14)", margin: 0 }}>
          Your item pool is empty. Add items in <strong>Setup</strong>, save, then start a list.
        </p>
      )}

      {list && list.items.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {list.items.map((it) => (
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
