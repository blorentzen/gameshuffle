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
import { Button, Select } from "@empac/cascadeds";
import { Lever } from "./live/Lever";
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
    <Lever
      label="Tier list"
      hint={list ? `${rankedCount} of ${list.items.length} placed` : undefined}
      actions={
        <>
          <Button variant="secondary" size="small" className="hub-lever__main" loading={pending} onClick={create}>{list ? "New list" : "Start a list"}</Button>
          {list && <Button variant="ghost" size="small" onClick={clear} disabled={pending}>Clear</Button>}
        </>
      }
    >
      {list && list.items.length === 0 && (
        <p className="hub-lever__note">Your item pool is empty. Add items in Streaming ▸ Overlay ▸ Tool looks, then start a list.</p>
      )}
      {list && list.items.length > 0 && (
        <ul className="hub-lever__tiers">
          {list.items.map((it) => (
            <li key={it.id} className="hub-lever__tier-row">
              <span className="hub-lever__tier-text">{it.text}</span>
              <Select
                size="small"
                aria-label={`Tier for ${it.text}`}
                disabled={pending}
                value={it.tier ?? "none"}
                onChange={(v) => place(it.id, v === "none" ? null : String(v))}
                options={[{ value: "none", label: "Not placed" }, ...list.tiers.map((t) => ({ value: t.key, label: t.label }))]}
              />
            </li>
          ))}
        </ul>
      )}
    </Lever>
  );
}
