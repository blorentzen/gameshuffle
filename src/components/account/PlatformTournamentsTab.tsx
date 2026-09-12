"use client";

/**
 * Platform Admin → Tournaments. Staff surface to see recent tournaments and
 * grant per-tournament Circuit access overrides: mark an event GS Sponsored
 * (full access), or issue a Circuit Events pass with a player cap. Reads/writes
 * /api/admin/tournament-entitlements.
 */

import { useCallback, useEffect, useState } from "react";
import { Button, Input } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";

interface OverrideRow {
  id: string;
  type: "gs_sponsored" | "circuit_events" | "partner_comp";
  player_cap: number | null;
  note: string | null;
  stripe_invoice_id: string | null;
  created_at: string;
  expires_at: string | null;
}
interface Row {
  id: string;
  title: string;
  status: string;
  gameSlug: string;
  maxParticipants: number | null;
  participants: number;
  organizer: string;
  override: OverrideRow | null;
}

const TYPE_LABEL: Record<OverrideRow["type"], string> = {
  gs_sponsored: "GS Sponsored",
  circuit_events: "Circuit Events",
  partner_comp: "Partner comp",
};

export function PlatformTournamentsTab() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [eventsFor, setEventsFor] = useState<string | null>(null); // tournament id with the Circuit Events form open
  const [capDraft, setCapDraft] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const toast = useToast();

  const load = useCallback(async (search: string) => {
    setLoading(true);
    const res = await fetch(`/api/admin/tournament-entitlements?q=${encodeURIComponent(search)}`);
    const j = await res.json().catch(() => ({}));
    setRows(Array.isArray(j.tournaments) ? j.tournaments : []);
    setLoading(false);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(q), q ? 250 : 0);
    return () => clearTimeout(t);
  }, [q, load]);

  const grant = async (tournamentId: string, type: OverrideRow["type"], playerCap: number | null, note: string | null) => {
    setBusy(tournamentId);
    const res = await fetch("/api/admin/tournament-entitlements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tournamentId, type, playerCap, note }),
    });
    setBusy(null);
    if (res.ok) {
      toast.success(`${TYPE_LABEL[type]} granted.`);
      setEventsFor(null); setCapDraft(""); setNoteDraft("");
      void load(q);
    } else {
      toast.error("Could not grant override.");
    }
  };

  const revoke = async (o: OverrideRow) => {
    setBusy(o.id);
    const res = await fetch(`/api/admin/tournament-entitlements?id=${o.id}`, { method: "DELETE" });
    setBusy(null);
    if (res.ok) { toast.success("Override revoked."); void load(q); }
    else toast.error("Could not revoke.");
  };

  return (
    <div className="account-card">
      <h2 style={{ fontSize: "var(--font-size-20)", marginBottom: "0.25rem" }}>Tournament access</h2>
      <p style={{ fontSize: "var(--font-size-14)", color: "var(--text-tertiary)", marginBottom: "1rem" }}>
        Grant a single tournament full GameShuffle Circuit access — mark it <strong>GS Sponsored</strong> (unlimited),
        or issue a <strong>Circuit Events</strong> pass with a player cap. Overrides win over the billing flag and subscriptions.
      </p>

      <Input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tournaments by title…" style={{ marginBottom: "1rem" }} />

      {loading ? (
        <p style={{ color: "var(--text-tertiary)" }}>Loading…</p>
      ) : rows.length === 0 ? (
        <p style={{ color: "var(--text-tertiary)" }}>No tournaments found.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
          {rows.map((t) => {
            const o = t.override;
            const opening = eventsFor === t.id;
            return (
              <div key={t.id} style={{ border: "1px solid var(--border-default)", borderRadius: "0.6rem", padding: "0.7rem 0.85rem", background: "var(--background-secondary)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.75rem", flexWrap: "wrap" }}>
                  <div style={{ minWidth: 0 }}>
                    <a href={`/tournament/${t.id}/manage`} style={{ fontWeight: 700, fontSize: "var(--font-size-14)", color: "var(--text-primary)" }}>{t.title}</a>
                    <div style={{ fontSize: "var(--font-size-12)", color: "var(--text-tertiary)", marginTop: 2 }}>
                      {t.organizer} · {t.status.replace("_", " ")} · {t.participants}{t.maxParticipants ? `/${t.maxParticipants}` : ""} players
                    </div>
                  </div>
                  {o && (
                    <span style={{ fontSize: "var(--font-size-12)", fontWeight: 700, color: "var(--primary-700, var(--primary-600))", background: "color-mix(in srgb, var(--primary-500) 14%, var(--surface-default))", padding: "0.2rem 0.55rem", borderRadius: 999, whiteSpace: "nowrap" }}>
                      {TYPE_LABEL[o.type]}{o.player_cap != null ? ` · cap ${o.player_cap}` : " · unlimited"}
                    </span>
                  )}
                </div>

                <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginTop: "0.6rem", alignItems: "center" }}>
                  {o ? (
                    <Button variant="ghost" size="small" disabled={busy === o.id} onClick={() => revoke(o)}>Revoke {TYPE_LABEL[o.type]}</Button>
                  ) : (
                    <>
                      <Button variant="secondary" size="small" disabled={busy === t.id} onClick={() => grant(t.id, "gs_sponsored", null, null)}>Mark GS Sponsored</Button>
                      <Button variant="ghost" size="small" onClick={() => { setEventsFor(opening ? null : t.id); setCapDraft(""); setNoteDraft(""); }}>Circuit Events…</Button>
                    </>
                  )}
                </div>

                {opening && !o && (
                  <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "center", marginTop: "0.5rem", paddingTop: "0.5rem", borderTop: "1px solid var(--border-subtle, var(--border-default))" }}>
                    <input type="number" min={1} value={capDraft} onChange={(e) => setCapDraft(e.target.value)} placeholder="Player cap"
                      style={{ width: 110, height: 34, borderRadius: 6, border: "1px solid var(--border-default)", background: "var(--surface-default)", color: "var(--text-primary)", padding: "0 8px", boxSizing: "border-box", fontSize: "var(--font-size-14)" }} />
                    <input type="text" value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} placeholder="Note (invoice #, org…)"
                      style={{ flex: "1 1 200px", minWidth: 0, height: 34, borderRadius: 6, border: "1px solid var(--border-default)", background: "var(--surface-default)", color: "var(--text-primary)", padding: "0 8px", boxSizing: "border-box", fontSize: "var(--font-size-14)" }} />
                    <Button variant="primary" size="small" disabled={busy === t.id} onClick={() => grant(t.id, "circuit_events", capDraft.trim() ? Number(capDraft) : null, noteDraft.trim() || null)}>Grant pass</Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
