"use client";

/**
 * Platform Admin → Tournaments.
 *
 * Was a flat list of cards that only did entitlement grants: no status filter,
 * no totals, no sort, and raw <input> elements inside an expanding row. That is
 * unusable for moderation once there are more tournaments than fit on a screen.
 *
 * Now a scannable table: platform-wide totals across the top, search + status
 * filter, sortable columns, and the Circuit Events grant moved into a modal so
 * a row stays one line. Reads/writes /api/admin/tournament-entitlements.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Button, Input, Modal, Select, StatCard,
  Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow,
} from "@empac/cascadeds";
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
  createdAt?: string;
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
  const [statusFilter, setStatusFilter] = useState("");
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [sort, setSort] = useState<{ key: "title" | "participants" | "created"; dir: "asc" | "desc" }>({ key: "created", dir: "desc" });
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [eventsFor, setEventsFor] = useState<string | null>(null); // tournament id with the Circuit Events form open
  const [capDraft, setCapDraft] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const toast = useToast();

  const load = useCallback(async (search: string, status: string) => {
    setLoading(true);
    const res = await fetch(`/api/admin/tournament-entitlements?q=${encodeURIComponent(search)}&status=${encodeURIComponent(status)}`);
    const j = await res.json().catch(() => ({}));
    setRows(Array.isArray(j.tournaments) ? j.tournaments : []);
    setCounts((j.counts as Record<string, number>) ?? {});
    setLoading(false);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(q, statusFilter), q ? 250 : 0);
    return () => clearTimeout(t);
  }, [q, statusFilter, load]);

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
      void load(q, statusFilter);
    } else {
      toast.error("Could not grant override.");
    }
  };

  const revoke = async (o: OverrideRow) => {
    setBusy(o.id);
    const res = await fetch(`/api/admin/tournament-entitlements?id=${o.id}`, { method: "DELETE" });
    setBusy(null);
    if (res.ok) { toast.success("Override revoked."); void load(q, statusFilter); }
    else toast.error("Could not revoke.");
  };

  const STATUSES = [
    { value: "", label: "All statuses" },
    { value: "open", label: "Registration" },
    { value: "in_progress", label: "In progress" },
    { value: "complete", label: "Completed" },
    { value: "cancelled", label: "Cancelled" },
    { value: "draft", label: "Draft" },
  ];

  const sorted = [...rows].sort((a, b) => {
    const d = sort.dir === "asc" ? 1 : -1;
    if (sort.key === "title") return a.title.localeCompare(b.title) * d;
    if (sort.key === "participants") return (a.participants - b.participants) * d;
    return ((a.createdAt ?? "").localeCompare(b.createdAt ?? "")) * d;
  });
  const toggleSort = (key: typeof sort.key) =>
    setSort((s2) => ({ key, dir: s2.key === key && s2.dir === "desc" ? "asc" : "desc" }));
  const dirFor = (key: typeof sort.key) => (sort.key === key ? sort.dir : null);

  const eventsRow = rows.find((t) => t.id === eventsFor) ?? null;

  return (
    <div className="account-card">
      <h2 className="account-tab__heading">Tournaments</h2>
      <p className="account-tab__intro">
        Every tournament on the platform. Grant a single event full Circuit access —
        mark it <strong>GS Sponsored</strong> (unlimited) or issue a{" "}
        <strong>Circuit Events</strong> pass with a player cap. Overrides win over the
        billing flag and subscriptions.
      </p>

      {/* Platform totals, not page totals — these answer "how much is out there". */}
      <div className="admin-stats">
        {[
          { label: "Total", key: "total" },
          { label: "Registration", key: "open" },
          { label: "In progress", key: "in_progress" },
          { label: "Completed", key: "complete" },
          { label: "Cancelled", key: "cancelled" },
        ].map((c) => (
          <StatCard
            key={c.key}
            label={c.label}
            value={counts[c.key] ?? 0}
            variant={c.key === "total" ? "accent" : "default"}
          />
        ))}
      </div>

      <div className="admin-filters">
        <Input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by title…"
          fullWidth
        />
        <Select
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as string)}
          options={STATUSES}
          aria-label="Filter by status"
          fullWidth
        />
      </div>

      {loading ? (
        <p style={{ color: "var(--text-tertiary)" }}>Loading…</p>
      ) : (
        <div className="admin-table">
          <Table variant="striped" hoverable dense>
            <TableHeader>
              <TableRow>
                <TableHead sortable sortDirection={dirFor("title")} onSort={() => toggleSort("title")}>Tournament</TableHead>
                <TableHead>Organizer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead align="right" sortable sortDirection={dirFor("participants")} onSort={() => toggleSort("participants")}>Players</TableHead>
                <TableHead>Access</TableHead>
                <TableHead align="right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.length === 0 ? (
                <TableRow>
                  <TableCell>
                    <TableEmpty
                      title="No tournaments found"
                      description={q || statusFilter ? "Try clearing the search or status filter." : "Nothing on the platform yet."}
                    />
                  </TableCell>
                </TableRow>
              ) : sorted.map((t) => {
                const o = t.override;
                return (
                  <TableRow key={t.id}>
                    <TableCell>
                      <a href={`/tournament/${t.id}/manage`} className="admin-table__link">{t.title}</a>
                      <span className="admin-table__sub">{t.gameSlug}</span>
                    </TableCell>
                    <TableCell>{t.organizer}</TableCell>
                    <TableCell><span className={`lounge-status lounge-status--${t.status}`}>{t.status.replace("_", " ")}</span></TableCell>
                    <TableCell align="right">{t.participants}{t.maxParticipants ? ` / ${t.maxParticipants}` : ""}</TableCell>
                    <TableCell>
                      {o ? (
                        <span className="admin-table__grant">
                          {TYPE_LABEL[o.type]}{o.player_cap != null ? ` · cap ${o.player_cap}` : " · unlimited"}
                        </span>
                      ) : (
                        <span className="admin-table__sub">Standard</span>
                      )}
                    </TableCell>
                    <TableCell align="right">
                      {o ? (
                        <Button variant="ghost" size="small" disabled={busy === o.id} onClick={() => revoke(o)}>Revoke</Button>
                      ) : (
                        <span className="admin-table__actions">
                          <Button variant="secondary" size="small" disabled={busy === t.id} onClick={() => grant(t.id, "gs_sponsored", null, null)}>Sponsor</Button>
                          <Button variant="ghost" size="small" onClick={() => { setEventsFor(t.id); setCapDraft(""); setNoteDraft(""); }}>Pass…</Button>
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* The grant form was an expanding row with raw <input>s, which broke the
          table rhythm and skipped the design system. */}
      <Modal
        isOpen={!!eventsRow}
        onClose={() => setEventsFor(null)}
        title={eventsRow ? `Circuit Events pass — ${eventsRow.title}` : "Circuit Events pass"}
        size="small"
        primaryAction={{
          label: busy === eventsFor ? "Granting…" : "Grant pass",
          onClick: () => {
            if (!eventsFor) return;
            void grant(eventsFor, "circuit_events", capDraft.trim() ? Number(capDraft) : null, noteDraft.trim() || null);
            setEventsFor(null);
          },
        }}
        secondaryAction={{ label: "Cancel", onClick: () => setEventsFor(null) }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-12)" }}>
          <Input
            type="number"
            min={1}
            value={capDraft}
            onChange={(e) => setCapDraft(e.target.value)}
            floatingLabel="Player cap"
            fullWidth
          />
          <Input
            type="text"
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            floatingLabel="Note (invoice #, org…)"
            fullWidth
          />
          <p style={{ margin: 0, fontSize: "var(--font-size-12)", color: "var(--text-tertiary)" }}>
            Leave the cap empty for an uncapped pass.
          </p>
        </div>
      </Modal>
    </div>
  );
}
