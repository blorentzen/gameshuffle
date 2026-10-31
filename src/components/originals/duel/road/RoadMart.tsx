"use client";

/**
 * The road's bag and Mart (tools picks 2026-10-25, https://claude.ai/artifact/2Jvhc2QgmCGMZSTcLMME1o):
 * a line on the start box and the region page with what's in your bag, and the Mart window (a
 * CascadeDS Modal) to buy tools with tokens. Kanto's shelf opens with its badges (Patch Up and Look Ahead
 * from the start, Koga's badge opens the last); every Mart has everything once Kanto is cleared. A
 * cleared region lets you keep one tool for good (ready once a day), picked here.
 * Accounts only (GET /api/trainer-road?mart=<region>, POST { action: "buy" | "keep" }).
 */

import { useCallback, useEffect, useState } from "react";
import { Button, Modal } from "@empac/cascadeds";
import { IconBackpack, IconBuildingStore, IconCoin, IconLock } from "@tabler/icons-react";
import { useToast } from "@/components/toast/ToastProvider";
import type { MartView } from "@/lib/originals/duel/roadView";
import type { ToolItemView } from "@/lib/originals/duel/view";
import type { ToolId } from "@/lib/originals/duel/types";
import { ToolArt } from "../DuelTools";

/** The region's Mart for this account (null for guests, before the tables exist, or while loading). */
export function useMart(region: string | null, signedIn: boolean) {
  const [mart, setMart] = useState<MartView | null>(null);
  const reload = useCallback(async () => {
    if (!region || !signedIn) return;
    const res = await fetch(`/api/trainer-road?mart=${encodeURIComponent(region)}`).catch(() => null);
    setMart(res?.ok ? ((await res.json()) as MartView) : null);
  }, [region, signedIn]);
  useEffect(() => {
    if (!region || !signedIn) return;
    let live = true;
    void fetch(`/api/trainer-road?mart=${encodeURIComponent(region)}`).then(async (r) => { if (live) setMart(r.ok ? ((await r.json()) as MartView) : null); }).catch(() => undefined);
    return () => { live = false; };
  }, [region, signedIn]);
  return { mart, setMart, reload };
}

const holding = (items: ToolItemView[]) => items.filter((i) => i.count > 0 || i.kept);

/** "Patch Up ×3, Look Ahead" (what's in the bag, kept tools marked). */
function bagWords(items: ToolItemView[]): string {
  const have = holding(items);
  if (!have.length) return "Your bag is empty";
  return have.map((i) => `${i.name}${i.count > 1 ? ` ×${i.count}` : ""}${i.kept ? (i.keptReady ? " (kept, ready)" : " (kept, used today)") : ""}`).join(", ");
}

/** The bag on the start box or the region page: what you hold, the rule for this kind of battle, and the Mart. */
export function RoadBagLine({ region, signedIn, rule }: { region: string; signedIn: boolean; rule?: string }) {
  const { mart, setMart } = useMart(region, signedIn);
  const [open, setOpen] = useState(false);
  if (!mart) return null;
  return (
    <div className="road-bag">
      <p className="road-bag__line">
        <IconBackpack size={18} stroke={2} aria-hidden="true" />
        <span><b>Tools:</b> {bagWords(mart.bag.items)}.{rule ? ` ${rule}` : ""}</span>
      </p>
      <Button variant="ghost" size="small" iconBefore={IconBuildingStore} onClick={() => setOpen(true)} className="road-bag__mart">The {mart.regionName} Mart</Button>
      <RoadMartModal open={open} mart={mart} onMart={setMart} onClose={() => setOpen(false)} />
    </div>
  );
}

/** The Mart window: your balance, the shelf (each tool's card, what it does, its price, how many you hold), and the tool to keep in a cleared region. */
export function RoadMartModal({ open, mart, onMart, onClose }: { open: boolean; mart: MartView; onMart: (m: MartView) => void; onClose: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState<ToolId | null>(null);
  const post = async (body: Record<string, unknown>, done: string) => {
    const res = await fetch("/api/trainer-road", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    if (res?.ok) { onMart((await res.json()) as MartView); toast.success(done); return; }
    const err = ((await res?.json().catch(() => ({}))) as { error?: string } | undefined)?.error;
    toast.error(err === "insufficient_balance" ? "Not enough tokens for that." : err === "full" ? `Your bag holds ${mart.bag.max} of each tool.` : err === "shelf" ? "That's not on this Mart's shelf yet." : err === "kept" ? "You've already kept a tool here." : "Couldn't do that. Try again in a moment.");
  };
  const buy = async (i: ToolItemView) => {
    setBusy(i.id);
    await post({ action: "buy", region: mart.region, tool: i.id, nonce: `${i.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }, `${i.name} is in your bag.`);
    setBusy(null);
  };
  const keep = async (i: ToolItemView) => {
    setBusy(i.id);
    await post({ action: "keep", region: mart.region, tool: i.id }, `${i.name} is yours to keep. It's ready once a day.`);
    setBusy(null);
  };
  const kept = mart.keep?.tool ? mart.bag.items.find((i) => i.id === mart.keep!.tool) ?? null : null;
  return (
    <Modal isOpen={open} onClose={onClose} title={`The ${mart.regionName} Mart`} size="medium" className="road-mart">
      <p className="road-mart__balance"><IconCoin size={18} stroke={2} aria-hidden="true" /><span>You have <b>{mart.balance.toLocaleString("en-US")}</b> tokens</span></p>
      <p className="road-mart__rule">Use {mart.bag.duel === 1 ? "one tool" : `up to ${mart.bag.duel} tools`} in a Trainer Road duel or the Daily Duel, in Easy or Normal; none in Hard. Your bag holds {mart.bag.max} of each.</p>
      <ul className="road-mart__shelf">
        {mart.bag.items.map((i) => {
          const onShelf = mart.shelf.includes(i.id);
          const full = i.count >= mart.bag.max;
          return (
            <li key={i.id} className={`road-mart__item${onShelf ? "" : " road-mart__item--locked"}`}>
              <ToolArt item={i} className="road-mart__art" />
              <div className="road-mart__words">
                <p className="road-mart__name"><b>{i.name}</b><span>{i.count > 0 ? `×${i.count} in your bag` : "None in your bag"}</span></p>
                <p className="road-mart__line">{i.line}</p>
              </div>
              <div className="road-mart__buy">
                {onShelf ? (
                  <Button variant="secondary" size="small" onClick={() => void buy(i)} disabled={!!busy || full || mart.balance < i.price} loading={busy === i.id} aria-label={`Buy ${i.name} for ${i.price} tokens`}>
                    {full ? "Bag full" : `Buy · ${i.price}`}
                  </Button>
                ) : (
                  <span className="road-mart__opens"><IconLock size={14} stroke={2} aria-hidden="true" />{mart.opens[i.id] ? `Opens with ${mart.opens[i.id]}` : "Not here yet"}</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="road-mart__credits">Pictures: {mart.bag.items.filter((i) => i.art?.credit).map((i) => i.art!.credit.replace(/\.$/, "")).join("; ")}.</p>
      {mart.keep && (
        <section className="road-mart__keep" aria-labelledby="road-mart-keep">
          <h3 id="road-mart-keep" className="road-mart__keep-title">Keep one for good</h3>
          {kept ? (
            <p className="road-mart__line">You kept <b>{kept.name}</b> for clearing {mart.regionName}. It&apos;s ready once a day{kept.keptReady ? ", and ready now." : "; used today."}</p>
          ) : (
            <>
              <p className="road-mart__line">For clearing {mart.regionName}, pick one tool to keep. It never runs out: it&apos;s ready once a day, on top of your bag.</p>
              <div className="road-mart__keeps">
                {mart.bag.items.map((i) => (
                  <Button key={i.id} variant="secondary" size="small" onClick={() => void keep(i)} disabled={!!busy} loading={busy === i.id}>{i.name}</Button>
                ))}
              </div>
            </>
          )}
        </section>
      )}
    </Modal>
  );
}
