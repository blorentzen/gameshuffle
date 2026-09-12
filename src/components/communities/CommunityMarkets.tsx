"use client";

/**
 * Interactive community market card — predict (free) or stake from the account
 * wallet on a community's open prediction market. Posts to
 * /api/communities/[id]/bet. Members only; non-members see it read-only.
 */

import { useState } from "react";
import Link from "next/link";
import { Button, Input } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";

interface Outcome { outcomeId: string; optionKey: string; label: string; pickerCount: number }
interface Market { id: string; question: string; outcomes: Outcome[] }

export function CommunityMarkets({
  communityId,
  slug,
  markets,
  isMember,
  initialBalance,
}: {
  communityId: string;
  slug: string;
  markets: Market[];
  isMember: boolean;
  initialBalance: number;
}) {
  const toast = useToast();
  const [balance, setBalance] = useState(initialBalance);
  const [amountByMarket, setAmountByMarket] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, string>>({}); // marketId → optionKey chosen

  const act = async (marketId: string, optionKey: string) => {
    if (!isMember) return;
    const amount = (amountByMarket[marketId] ?? "").trim();
    setBusy(`${marketId}:${optionKey}`);
    try {
      const res = await fetch(`/api/communities/${communityId}/bet`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marketId, optionKey, amount: amount || undefined }),
      });
      const j = await res.json();
      if (res.ok && j.ok) {
        setDone((d) => ({ ...d, [marketId]: optionKey }));
        if (typeof j.balance === "number") setBalance(j.balance);
        toast.success(j.mode === "full" ? `Bet placed. Balance: ${j.balance}` : "Prediction locked in.");
      } else if (j.error === "already_picked") {
        toast.error("You've already predicted on this one.");
      } else if (j.error === "insufficient_balance") {
        toast.error("Not enough tokens for that stake.");
      } else if (j.error === "region_unavailable") {
        toast.error("Staking isn't available in your region — predictions only.");
      } else {
        toast.error("Couldn't place that. Try again.");
      }
    } catch {
      toast.error("Network error. Try again.");
    }
    setBusy(null);
  };

  return (
    <>
      {isMember ? (
        <p style={{ margin: "0 0 var(--spacing-12)", fontSize: "var(--font-size-14)", color: "var(--text-tertiary)" }}>
          Your balance: <strong style={{ color: "var(--text-secondary)" }}>{balance.toLocaleString()} 🪙</strong> · leave the stake empty to just predict.
        </p>
      ) : (
        <p style={{ margin: "0 0 var(--spacing-12)", fontSize: "var(--font-size-14)", color: "var(--text-tertiary)" }}>Join the community to predict and bet.</p>
      )}

      {markets.map((m) => {
        const chosen = done[m.id];
        return (
          <div key={m.id} style={{ marginBottom: "var(--spacing-16)" }}>
            <p style={{ margin: "0 0 var(--spacing-8)", fontWeight: 600 }}>{m.question}</p>
            {isMember && !chosen && (
              <div style={{ maxWidth: 160, marginBottom: "var(--spacing-8)" }}>
                <Input
                  type="number"
                  placeholder="Stake (optional)"
                  value={amountByMarket[m.id] ?? ""}
                  onChange={(e) => setAmountByMarket((a) => ({ ...a, [m.id]: e.target.value }))}
                />
              </div>
            )}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--spacing-8)" }}>
              {m.outcomes.map((o) => {
                const isChosen = chosen === o.optionKey;
                return isMember && !chosen ? (
                  <Button
                    key={o.outcomeId}
                    variant="secondary"
                    size="small"
                    loading={busy === `${m.id}:${o.optionKey}`}
                    onClick={() => act(m.id, o.optionKey)}
                  >
                    {o.label} · {o.pickerCount}
                  </Button>
                ) : (
                  <span
                    key={o.outcomeId}
                    style={{
                      fontSize: "var(--font-size-14)", padding: "0.35rem 0.7rem", borderRadius: "0.5rem",
                      border: `1px solid ${isChosen ? "var(--primary-500)" : "var(--border-default)"}`,
                      background: isChosen ? "color-mix(in srgb, var(--primary-500) 12%, var(--surface-default))" : "var(--surface-default)",
                      fontWeight: isChosen ? 700 : 400,
                    }}
                  >
                    {o.label} · {o.pickerCount}{isChosen ? " ✓" : ""}
                  </span>
                );
              })}
            </div>
          </div>
        );
      })}

      <Link href={`/live/${slug}`} style={{ textDecoration: "none" }}>
        <Button variant="ghost" size="small">Open the live page →</Button>
      </Link>
    </>
  );
}
