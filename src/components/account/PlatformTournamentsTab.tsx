"use client";

/**
 * Platform admin ▸ Events ▸ Tournaments (staff).
 *
 * Every tournament on the platform: totals across the top, search, a status
 * filter and a sort, a table (25 rows at a time), and Circuit access per event.
 * Staff can give one tournament full Circuit access for free (sponsored with no
 * player limit, or a pass with a limit) and take it away again; both happen in
 * a window or a confirmation so a row stays one line.
 * Reads/writes /api/admin/tournament-entitlements (newest 100 per search).
 */

import { useCallback, useEffect, useState } from "react";
import {
  Alert, Badge, Button, Input, Modal, Radio, RadioGroup, Select, StatCard,
  Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow,
} from "@empac/cascadeds";
import { IconCalendarEvent, IconCircleCheck, IconPlayerPlay, IconRefresh, IconTrophy } from "@tabler/icons-react";
import { useToast } from "@/components/toast/ToastProvider";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import { LoadingLines } from "@/components/loading/LoadingLines";
import { AdminHeader, AdminRowMenu, AdminSection, AdminStats, AdminTable } from "@/components/account/admin/AdminKit";
import { getGameName } from "@/data/game-registry";

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

type GrantType = "gs_sponsored" | "circuit_events" | "partner_comp";

const TYPE_LABEL: Record<OverrideRow["type"], string> = {
  gs_sponsored: "Sponsored",
  circuit_events: "Circuit pass",
  partner_comp: "Partner, free",
};

const STATUS: Record<string, { label: string; variant: "default" | "success" | "warning" | "error" | "info" | "outline" }> = {
  open: { label: "Sign-ups open", variant: "info" },
  in_progress: { label: "Running", variant: "success" },
  complete: { label: "Finished", variant: "default" },
  cancelled: { label: "Cancelled", variant: "error" },
  draft: { label: "Draft", variant: "outline" },
};
const statusOf = (s: string) => STATUS[s] ?? { label: s.replace(/_/g, " "), variant: "default" as const };

/** "all" stands for no filter: CDS Select treats "" as no choice. */
const FILTERS = [
  { value: "all", label: "All" },
  { value: "open", label: "Sign-ups open" },
  { value: "in_progress", label: "Running" },
  { value: "complete", label: "Finished" },
  { value: "cancelled", label: "Cancelled" },
  { value: "draft", label: "Drafts" },
];

/** Sorting is a Select, not clickable column heads: CDS's sortable heads use
 *  ARIA that screen readers don't support (known CDS gap). */
const SORTS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "title", label: "Title, A to Z" },
  { value: "players", label: "Most players" },
];

const PAGE = 25;
/** The API returns the newest 100 that match. */
const API_LIMIT = 100;
const n = (x: number) => x.toLocaleString();
const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles" });

function accessText(o: OverrideRow): string {
  return `${TYPE_LABEL[o.type]}, ${o.player_cap != null ? `up to ${n(o.player_cap)} players` : "no player limit"}`;
}

export function PlatformTournamentsTab() {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [sort, setSort] = useState("newest");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const [grantFor, setGrantFor] = useState<Row | null>(null);
  const toast = useToast();
  const confirm = useConfirm();

  const load = useCallback(async (search: string, status: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/tournament-entitlements?q=${encodeURIComponent(search)}&status=${encodeURIComponent(status === "all" ? "" : status)}`, { cache: "no-store" });
      if (!res.ok) { setFailed(true); setRows((r) => r ?? []); return; }
      const j = await res.json().catch(() => ({}));
      setRows(Array.isArray(j.tournaments) ? j.tournaments : []);
      setCounts((j.counts as Record<string, number>) ?? {});
      setFailed(false);
      setShown(PAGE);
    } catch {
      setFailed(true);
      setRows((r) => r ?? []);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(q, filter), q ? 250 : 0);
    return () => clearTimeout(t);
  }, [q, filter, load]);

  const grant = async (tournamentId: string, type: GrantType, playerCap: number | null, note: string | null) => {
    const res = await fetch("/api/admin/tournament-entitlements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tournamentId, type, playerCap, note }),
    }).catch(() => null);
    if (!res?.ok) { toast.error("Couldn't give the access. Try again."); return false; }
    toast.success(type === "gs_sponsored" ? "Tournament sponsored" : type === "partner_comp" ? "Partner access given" : "Circuit pass given");
    void load(q, filter);
    return true;
  };

  const revoke = async (t: Row, o: OverrideRow) => {
    const ok = await confirm({
      title: `Take Circuit access away from ${t.title}?`,
      body: "It goes back to whatever the organizer's own plan allows. You can give access again later.",
      confirmLabel: "Take access away",
    });
    if (!ok) return;
    const res = await fetch(`/api/admin/tournament-entitlements?id=${o.id}`, { method: "DELETE" }).catch(() => null);
    if (res?.ok) { toast.success("Circuit access taken away"); void load(q, filter); }
    else toast.error("Couldn't take the access away. Try again.");
  };

  const sorted = [...(rows ?? [])].sort((a, b) => {
    if (sort === "title") return a.title.localeCompare(b.title);
    if (sort === "players") return b.participants - a.participants;
    const byDate = (a.createdAt ?? "").localeCompare(b.createdAt ?? "");
    return sort === "oldest" ? byDate : -byDate;
  });
  const visible = sorted.slice(0, shown);
  const more = Math.min(PAGE, sorted.length - shown);
  const filtered = !!q || filter !== "all";

  return (
    <div className="account-card admin-screen">
      <AdminHeader
        title="Tournaments"
        intro="Every tournament on GameShuffle. Give one event every Circuit feature for free, whatever the organizer's plan and even while Circuit billing is off."
        actions={<Button variant="secondary" size="small" iconBefore={IconRefresh} loading={busy} disabled={busy} aria-label="Refresh" onClick={() => void load(q, filter)}>Refresh</Button>}
      />

      {rows === null && !failed ? <LoadingLines label="Loading tournaments" /> : (
        <>
          {/* Platform totals, not page totals: they answer "how much is out there". */}
          <AdminStats label="Tournaments at a glance">
            <StatCard label="All tournaments" value={n(counts.total ?? 0)} source={`${n(counts.draft ?? 0)} still drafts`} icon={<IconTrophy size={20} />} variant="accent" />
            <StatCard label="Sign-ups open" value={n(counts.open ?? 0)} icon={<IconCalendarEvent size={20} />} />
            <StatCard label="Running now" value={n(counts.in_progress ?? 0)} icon={<IconPlayerPlay size={20} />} />
            <StatCard label="Finished" value={n(counts.complete ?? 0)} source={`${n(counts.cancelled ?? 0)} cancelled`} icon={<IconCircleCheck size={20} />} />
          </AdminStats>

          {failed && <Alert variant="error">Couldn&apos;t load the tournaments. Try Refresh in a moment.</Alert>}

          <AdminSection
            title="All tournaments"
            intro={<><strong>Sponsored</strong> gives every Circuit feature with no player limit. A <strong>Circuit pass</strong> does the same up to a player limit you set. Open a tournament&apos;s name to manage it.</>}
          >
            <div className="admin-filters admin-events-filters">
              <Input type="search" fullWidth floatingLabel="Search by title" value={q} onChange={(e) => setQ(e.target.value)} />
              <Select floatingLabel="Show" value={filter} onChange={(v) => setFilter(String(v))} options={FILTERS} fullWidth />
              <Select floatingLabel="Sort" value={sort} onChange={(v) => { setSort(String(v)); setShown(PAGE); }} options={SORTS} fullWidth />
            </div>

            <AdminTable label="Tournaments">
              <Table variant="striped" hoverable dense>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tournament</TableHead>
                    <TableHead>Organizer</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead align="right">Players</TableHead>
                    <TableHead>Circuit access</TableHead>
                    <TableHead align="right"><span className="sr-only">Actions</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6}>
                        <TableEmpty
                          title={filtered ? "No tournaments match" : "No tournaments yet"}
                          description={filtered ? "Try another search, or show all tournaments." : "They show here as soon as an organizer makes one."}
                        />
                      </TableCell>
                    </TableRow>
                  ) : visible.map((t) => {
                    const o = t.override;
                    const st = statusOf(t.status);
                    return (
                      <TableRow key={t.id}>
                        <TableCell>
                          <a href={`/tournament/${t.id}/manage`} className="admin-table__link admin-events-title">{t.title}</a>
                          <span className="admin-table__sub">{getGameName(t.gameSlug)}{t.createdAt ? ` · made ${day(t.createdAt)}` : ""}</span>
                        </TableCell>
                        <TableCell>{t.organizer}</TableCell>
                        <TableCell><Badge variant={st.variant} size="small">{st.label}</Badge></TableCell>
                        <TableCell align="right" className="admin-num">{n(t.participants)}{t.maxParticipants ? ` of ${n(t.maxParticipants)}` : ""}</TableCell>
                        <TableCell>
                          {o ? (
                            <>
                              <span className="admin-table__grant">{accessText(o)}</span>
                              {o.note && <span className="admin-table__sub">{o.note}</span>}
                            </>
                          ) : (
                            <span className="admin-table__sub">Organizer&apos;s plan</span>
                          )}
                        </TableCell>
                        <TableCell align="right">
                          <span className="admin-row-actions">
                            {o ? (
                              <AdminRowMenu
                                label={`More for ${t.title}`}
                                items={[{ label: "Take Circuit access away", danger: true, onClick: () => void revoke(t, o) }]}
                              />
                            ) : (
                              <Button variant="ghost" size="small" onClick={() => setGrantFor(t)} aria-label={`Give access to ${t.title}`}>Give access</Button>
                            )}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </AdminTable>

            {(more > 0 || (rows?.length ?? 0) >= API_LIMIT) && (
              <div className="admin-events-more">
                {more > 0 && <Button variant="ghost" size="small" onClick={() => setShown((s) => s + PAGE)}>Show {more} more</Button>}
                {(rows?.length ?? 0) >= API_LIMIT && <p className="admin-updated">This list holds the newest {API_LIMIT} that match. Search by title to find an older one.</p>}
              </div>
            )}
          </AdminSection>
        </>
      )}

      {grantFor && <GrantModal tournament={grantFor} onClose={() => setGrantFor(null)} onGrant={grant} />}
    </div>
  );
}

/** Give one tournament Circuit access: sponsored (no limit) or a pass with a limit. */
function GrantModal({ tournament, onClose, onGrant }: {
  tournament: Row;
  onClose: () => void;
  onGrant: (id: string, type: GrantType, cap: number | null, note: string | null) => Promise<boolean>;
}) {
  const [type, setType] = useState<GrantType>("gs_sponsored");
  const [cap, setCap] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const capValue = cap.trim() ? Number(cap) : null;
  const capOk = capValue === null || (Number.isInteger(capValue) && capValue >= 1);

  const submit = async () => {
    if (!capOk) return;
    setBusy(true);
    const ok = await onGrant(tournament.id, type, type === "circuit_events" ? capValue : null, note.trim() || null);
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Circuit access for ${tournament.title}`}
      size="small"
      footer={
        <div className="admin-events-modal-footer">
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" loading={busy} disabled={busy || !capOk} onClick={() => void submit()}>
            {type === "gs_sponsored" ? "Sponsor it" : type === "partner_comp" ? "Give partner access" : "Give the pass"}
          </Button>
        </div>
      }
    >
      <div className="admin-events-form">
        <RadioGroup name="circuit-access" label="What to give" value={type} onChange={(v) => setType(v as GrantType)}>
          <Radio value="gs_sponsored" label="Sponsored" helperText="Every Circuit feature, no player limit, free." />
          <Radio value="circuit_events" label="Circuit pass" helperText="Every Circuit feature up to a player limit." />
          <Radio value="partner_comp" label="Partner, free" helperText="For a venue or partner we work with: every Circuit feature, no player limit, free." />
        </RadioGroup>
        {type === "circuit_events" && (
          <Input type="number" min={1} inputMode="numeric" fullWidth floatingLabel="Player limit (leave empty for none)" value={cap} onChange={(e) => setCap(e.target.value)} error={!capOk} />
        )}
        <Input type="text" fullWidth floatingLabel="Note for staff (invoice number, partner…)" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
        <p className="admin-updated">It takes effect straight away and shows on this list until someone takes it away.</p>
      </div>
    </Modal>
  );
}
