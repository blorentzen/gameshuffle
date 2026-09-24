"use client";

/**
 * Community raffle card — the repeatable token sink on /c. Members spend tokens
 * to buy weighted entries toward a prize; the owner draws a winner. Optimistic
 * updates; balance + entries refresh from the API. Prizes are organizer-defined
 * non-cash rewards (closed-loop safe).
 */

import { useEffect, useState } from "react";
import { Card, Button, Input } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import { createClient } from "@/lib/supabase/client";

export interface RaffleView {
  id: string;
  title: string;
  prize: string;
  entryCost: number;
  status: "open" | "drawn" | "cancelled";
  winnerName: string | null;
  totalEntries: number;
  entrants: number;
  pot: number;
  yourEntries: number;
}

export interface RaffleWinView { id: string; title: string; prize: string; winnerName: string | null }

export function CommunityRaffle({
  communityId,
  initialRaffle,
  canManage,
  signedIn,
  initialBalance,
  live = false,
  history = [],
}: {
  communityId: string;
  initialRaffle: RaffleView | null;
  canManage: boolean;
  signedIn: boolean;
  initialBalance: number;
  /** Live pot/entrant updates (Circuit-gated). */
  live?: boolean;
  /** Recent past winners (social proof). */
  history?: RaffleWinView[];
}) {
  const toast = useToast();
  const [raffle, setRaffle] = useState<RaffleView | null>(initialRaffle);
  const [balance, setBalance] = useState(initialBalance);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: "", prize: "", entryCost: "100" });

  // Live pot/entrant/winner updates as members buy in (Circuit-gated).
  useEffect(() => {
    if (!live || !raffle) return;
    const raffleId = raffle.id;
    let cancelled = false;
    const refresh = async () => {
      try {
        const res = await fetch(`/api/raffles/${raffleId}`, { cache: "no-store" });
        const j = await res.json().catch(() => null);
        if (!cancelled && j?.ok && j.raffle) setRaffle((r) => (r && r.id === raffleId ? { ...r, ...j.raffle } : r));
      } catch { /* keep current */ }
    };
    const supabase = createClient();
    const channel = supabase
      .channel(`raffle-${raffleId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "gs_raffle_entries", filter: `raffle_id=eq.${raffleId}` }, () => void refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "gs_raffles", filter: `id=eq.${raffleId}` }, () => void refresh())
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, raffle?.id]);

  const buy = async () => {
    if (!raffle) return;
    if (!signedIn) { window.location.assign(`/login?redirect=/c`); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/raffles/${raffle.id}/enter`, { method: "POST" });
      const j = await res.json().catch(() => null);
      if (res.ok && j?.ok) {
        setBalance(j.balance ?? balance);
        setRaffle((r) => r ? { ...r, yourEntries: j.entries ?? r.yourEntries + 1, totalEntries: r.totalEntries + 1, pot: r.pot + r.entryCost, entrants: r.yourEntries === 0 ? r.entrants + 1 : r.entrants } : r);
        toast.success("Entry bought. Good luck!");
      } else if (j?.error === "insufficient_balance") {
        toast.error("Not enough tokens for an entry.");
      } else {
        toast.error("Couldn't buy an entry.");
      }
    } catch { toast.error("Network error. Try again."); }
    setBusy(false);
  };

  const create = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/communities/${communityId}/raffles`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: form.title, prize: form.prize, entryCost: Number(form.entryCost) }),
      });
      const j = await res.json().catch(() => null);
      if (res.ok && j?.ok) {
        setRaffle({ id: j.id, title: form.title.trim(), prize: form.prize.trim(), entryCost: Math.max(1, Number(form.entryCost) || 1), status: "open", winnerName: null, totalEntries: 0, entrants: 0, pot: 0, yourEntries: 0 });
        setCreating(false);
        setForm({ title: "", prize: "", entryCost: "100" });
        toast.success("Raffle started.");
      } else {
        toast.error(j?.error === "migration_pending" ? "Raffles aren't enabled yet." : "Couldn't start the raffle.");
      }
    } catch { toast.error("Network error. Try again."); }
    setBusy(false);
  };

  const draw = async () => {
    if (!raffle || !window.confirm("Draw a winner now? This closes the raffle.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/raffles/${raffle.id}/draw`, { method: "POST" });
      const j = await res.json().catch(() => null);
      if (res.ok && j?.ok) {
        setRaffle((r) => r ? { ...r, status: "drawn", winnerName: j.winnerName } : r);
        toast.success(`Winner: ${j.winnerName}`);
      } else {
        toast.error(j?.error === "no_entries" ? "No entries to draw from yet." : "Couldn't draw a winner.");
      }
    } catch { toast.error("Network error. Try again."); }
    setBusy(false);
  };

  // Nothing to show for a non-manager with no open raffle and no history.
  if (!raffle && !canManage && history.length === 0) return null;

  return (
    <Card padding="large">
      <div style={{ display: "flex", alignItems: "center", gap: "var(--spacing-8)", justifyContent: "space-between", marginBottom: "var(--spacing-12)", flexWrap: "wrap" }}>
        <h2 style={{ fontSize: "var(--font-size-20)", fontWeight: 700, margin: 0 }}>🎟️ Raffle{live && raffle?.status === "open" && <span className="bgn-live-dot"> ● Live</span>}</h2>
        {raffle && raffle.status === "open" && <span style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)" }}>{raffle.entryCost.toLocaleString()} tokens / entry</span>}
      </div>

      {raffle ? (
        <>
          <p style={{ fontWeight: 700, fontSize: "var(--font-size-16)", margin: "0 0 var(--spacing-4)" }}>{raffle.title}</p>
          <p style={{ color: "var(--text-secondary)", margin: "0 0 var(--spacing-12)" }}>Prize: {raffle.prize}</p>

          {raffle.status === "drawn" ? (
            <p style={{ fontWeight: 700, color: "var(--bg-primary, var(--primary-600))" }}>🏆 Winner: {raffle.winnerName ?? "drawn"}</p>
          ) : (
            <>
              <div style={{ display: "flex", gap: "var(--spacing-16)", flexWrap: "wrap", fontSize: "var(--font-size-14)", color: "var(--text-secondary)", marginBottom: "var(--spacing-12)" }}>
                <span><strong>{raffle.totalEntries.toLocaleString()}</strong> entries</span>
                <span><strong>{raffle.entrants.toLocaleString()}</strong> {raffle.entrants === 1 ? "entrant" : "entrants"}</span>
                <span><strong>{raffle.pot.toLocaleString()}</strong> tokens in the pot</span>
                {signedIn && <span>You: <strong>{raffle.yourEntries}</strong></span>}
              </div>
              <div style={{ display: "flex", gap: "var(--spacing-8)", alignItems: "center", flexWrap: "wrap" }}>
                <Button variant="primary" onClick={buy} disabled={busy || (signedIn && balance < raffle.entryCost)}>
                  Buy an entry ({raffle.entryCost.toLocaleString()})
                </Button>
                {signedIn && <span style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)" }}>Balance: {balance.toLocaleString()}</span>}
                {canManage && <Button variant="secondary" size="small" onClick={draw} disabled={busy}>Draw winner</Button>}
              </div>
            </>
          )}
          {canManage && raffle.status !== "open" && (
            <div style={{ marginTop: "var(--spacing-16)" }}>
              <Button variant="secondary" size="small" onClick={() => setCreating(true)}>Start a new raffle</Button>
            </div>
          )}
        </>
      ) : canManage && !creating ? (
        <div>
          <p style={{ color: "var(--text-secondary)", margin: "0 0 var(--spacing-12)" }}>Run a raffle so members can spend their tokens on a shot at a prize.</p>
          <Button variant="primary" onClick={() => setCreating(true)}>Start a raffle</Button>
        </div>
      ) : null}

      {canManage && creating && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-12)", marginTop: raffle ? "var(--spacing-16)" : 0 }}>
          <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Raffle title (e.g. Friday night giveaway)" />
          <Input value={form.prize} onChange={(e) => setForm((f) => ({ ...f, prize: e.target.value }))} placeholder="Prize (a shoutout, pick the next game, a cosmetic…)" />
          <label style={{ display: "flex", alignItems: "center", gap: "var(--spacing-8)", fontSize: "var(--font-size-14)" }}>
            Tokens per entry
            <span style={{ width: "7rem" }}><Input type="number" min={1} value={form.entryCost} onChange={(e) => setForm((f) => ({ ...f, entryCost: e.target.value }))} /></span>
          </label>
          <div style={{ display: "flex", gap: "var(--spacing-8)" }}>
            <Button variant="primary" onClick={create} disabled={busy || !form.title.trim() || !form.prize.trim()}>Start raffle</Button>
            <Button variant="ghost" onClick={() => setCreating(false)} disabled={busy}>Cancel</Button>
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div style={{ marginTop: raffle || canManage ? "var(--spacing-20)" : 0, borderTop: raffle || canManage ? "1px solid var(--border-subtle, var(--border-default))" : "none", paddingTop: raffle || canManage ? "var(--spacing-16)" : 0 }}>
          <h3 className="bgn-side__heading" style={{ marginTop: 0 }}>Recent winners</h3>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "var(--spacing-8)" }}>
            {history.map((h) => (
              <li key={h.id} style={{ display: "flex", justifyContent: "space-between", gap: "var(--spacing-12)", fontSize: "var(--font-size-14)" }}>
                <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>🏆 {h.winnerName ?? "Winner"}</span>
                <span style={{ color: "var(--text-tertiary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.prize}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
