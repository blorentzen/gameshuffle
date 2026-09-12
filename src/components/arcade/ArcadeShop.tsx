"use client";

/**
 * The Arcade shop grid — buy cosmetic items with Arcade Tokens. Posts to
 * /api/arcade/purchase; updates balance + owned state optimistically.
 */

import { useState } from "react";
import { Card, Button } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import type { ArcadeItem } from "@/data/arcade-items";

export function ArcadeShop({
  items,
  initialOwned,
  initialBalance,
  initialEquippedNameColor,
  signedIn,
}: {
  items: ArcadeItem[];
  initialOwned: string[];
  initialBalance: number;
  initialEquippedNameColor: string | null;
  signedIn: boolean;
}) {
  const toast = useToast();
  const [owned, setOwned] = useState<Set<string>>(new Set(initialOwned));
  const [balance, setBalance] = useState(initialBalance);
  const [equipped, setEquipped] = useState<string | null>(initialEquippedNameColor);
  const [busy, setBusy] = useState<string | null>(null);

  const buy = async (item: ArcadeItem) => {
    if (!signedIn) { window.location.assign("/login?redirect=/arcade"); return; }
    if (owned.has(item.id)) return;
    if (balance < item.price) { toast.error("Not enough tokens for that."); return; }
    setBusy(item.id);
    try {
      const res = await fetch("/api/arcade/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id }),
      });
      const j = await res.json();
      if (res.ok && j.ok) {
        setOwned((s) => new Set(s).add(item.id));
        if (typeof j.balance === "number") setBalance(j.balance);
        if (item.kind === "name_color") setEquipped(item.id); // auto-equipped server-side
        toast.success(`Unlocked ${item.name}!`);
      } else if (j.error === "insufficient_balance") {
        toast.error("Not enough tokens for that.");
      } else if (j.error === "already_owned") {
        setOwned((s) => new Set(s).add(item.id));
      } else {
        toast.error("Couldn't complete the purchase.");
      }
    } catch {
      toast.error("Network error. Try again.");
    }
    setBusy(null);
  };

  const equip = async (itemId: string | null) => {
    setBusy(itemId ?? "clear");
    try {
      const res = await fetch("/api/arcade/equip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId }),
      });
      if (res.ok) {
        setEquipped(itemId);
        toast.success(itemId ? "Name color equipped." : "Name color cleared.");
      } else {
        toast.error("Couldn't equip that.");
      }
    } catch {
      toast.error("Network error. Try again.");
    }
    setBusy(null);
  };

  return (
    <>
      {signedIn && (
        <p style={{ margin: "0 0 var(--spacing-20)", fontSize: "var(--font-size-14)", color: "var(--text-secondary)" }}>
          Your balance: <strong>{balance.toLocaleString()} 🪙</strong>
        </p>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "var(--spacing-16)" }}>
        {items.map((item) => {
          const has = owned.has(item.id);
          const canAfford = balance >= item.price;
          const isNameColor = item.kind === "name_color";
          const isEquipped = isNameColor && equipped === item.id;
          return (
            <Card key={item.id} padding="large">
              <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-12)", marginBottom: "var(--spacing-8)" }}>
                {isNameColor ? (
                  <span style={{ width: 32, height: 32, borderRadius: "8px", background: item.color, flex: "0 0 auto", border: "1px solid var(--border-default)" }} />
                ) : (
                  <span style={{ fontSize: "2rem", lineHeight: 1 }}>{item.emoji}</span>
                )}
                <div>
                  <p style={{ margin: 0, fontWeight: 700, color: isNameColor ? item.color : undefined }}>{item.name}</p>
                  <p style={{ margin: 0, fontSize: "var(--font-size-14)", color: "var(--text-tertiary)" }}>{item.price.toLocaleString()} 🪙</p>
                </div>
              </div>
              <p style={{ margin: "0 0 var(--spacing-16)", fontSize: "var(--font-size-14)", color: "var(--text-secondary)" }}>{item.description}</p>
              {has ? (
                isNameColor ? (
                  <Button
                    variant={isEquipped ? "secondary" : "primary"}
                    size="small"
                    fullWidth
                    loading={busy === item.id || busy === "clear"}
                    onClick={() => equip(isEquipped ? null : item.id)}
                  >
                    {isEquipped ? "Equipped ✓ (unequip)" : "Equip"}
                  </Button>
                ) : (
                  <Button variant="secondary" size="small" disabled fullWidth>Owned ✓</Button>
                )
              ) : (
                <Button
                  variant={signedIn && !canAfford ? "secondary" : "primary"}
                  size="small"
                  fullWidth
                  loading={busy === item.id}
                  onClick={() => buy(item)}
                >
                  {!signedIn ? "Sign in to buy" : canAfford ? "Buy" : "Not enough 🪙"}
                </Button>
              )}
            </Card>
          );
        })}
      </div>
    </>
  );
}
