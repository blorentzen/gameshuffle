"use client";

/**
 * Staff page ▸ Players and Penalties. Players: name change requests, appeals, and a player search with Rename, Give a
 * penalty and End break. Penalties: reports and reduced-loss asks, everyone with strikes or a break, and recent
 * penalties with Undo. Accepting a request does the thing (a penalty given, a name changed, a penalty taken back).
 */

import { useEffect, useState } from "react";
import { Button, EmptyState, Input, Modal, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@empac/cascadeds";
import { IconSearch } from "@tabler/icons-react";
import { useToast } from "@/components/toast/ToastProvider";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import { Select } from "@/components/ui/Select";
import { TableScroll } from "@/components/ui/TableScroll";
import type { PenaltyKind } from "@/lib/ladders/discipline";
import type { StaffTabProps } from "./RankedStaffHub";
import { dateOnly, num, relative, type LadderRequest, type StaffPlayer } from "./types";

const KINDS: PenaltyKind[] = ["late", "drop_before", "drop_during", "tag", "other"];
const ERRORS: Record<string, string> = {
  no_rating: "That player has no MMR this season yet, so there's nothing to take a penalty from. A strike still works with 0 MMR.",
  taken: "Someone on this lounge already has that name.",
  decided: "Someone already decided this one.",
  missing: "That's gone. Refresh the page.",
  already: "That penalty was already taken back.",
  no_break: "That player isn't on a break.",
};
const errorText = (e?: string) => (e && ERRORS[e]) || "That didn't work. Try again in a moment.";

// ── Shared pieces ───────────────────────────────────────────────────────────────────────────

/** A window's two buttons (CDS Modal's own actions take no busy or disabled state). */
export function ModalButtons({ label, onClick, busy, disabled, onCancel, danger }: { label: string; onClick: () => void; busy: boolean; disabled?: boolean; onCancel: () => void; danger?: boolean }) {
  return (
    <div className="ranked-review__actions">
      <Button variant={danger ? "danger" : "primary"} loading={busy} disabled={disabled} onClick={onClick}>{label}</Button>
      <Button variant="ghost" onClick={onCancel}>Cancel</Button>
    </div>
  );
}

function useSearch(ladderId: string, q: string): StaffPlayer[] | null {
  const [found, setFound] = useState<{ q: string; players: StaffPlayer[] } | null>(null);
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    let alive = true;
    const id = window.setTimeout(() => {
      fetch(`/api/ranked/${ladderId}/staff?players=${encodeURIComponent(term)}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((j: { players?: StaffPlayer[] }) => { if (alive) setFound({ q: term, players: j.players ?? [] }); })
        .catch(() => { if (alive) setFound({ q: term, players: [] }); });
    }, 250);
    return () => { alive = false; window.clearTimeout(id); };
  }, [ladderId, q]);
  return q.trim().length >= 2 && found?.q === q.trim() ? found.players : null;
}

function RequestRow({ r, act, reload, text, acceptLabel }: { r: LadderRequest; act: StaffTabProps["act"]; reload: () => void; text: string; acceptLabel: string }) {
  const toast = useToast();
  const [busy, setBusy] = useState<"yes" | "no" | null>(null);
  const decide = async (accept: boolean) => {
    setBusy(accept ? "yes" : "no");
    const res = await act({ action: "decide", requestId: r.id, accept });
    setBusy(null);
    if (res.ok) { toast.success(accept ? "Done." : "Denied."); reload(); } else toast.error(errorText(res.error));
  };
  const detail = typeof r.body.reason === "string" ? r.body.reason : typeof r.body.text === "string" ? r.body.text : typeof r.body.why === "string" ? r.body.why : null;
  return (
    <li className="ranked-staff__row">
      <div className="ranked-staff__row-main">
        <span className="ranked-staff__row-title">{text}</span>
        {detail && <span className="ranked-staff__row-why">{detail}</span>}
        <span className="ladder-muted">Asked by {r.byName ?? "a player"} · {relative(r.createdAt)}</span>
      </div>
      <div className="ranked-staff__row-acts">
        <Button size="small" loading={busy === "yes"} disabled={!!busy} onClick={() => decide(true)}>{acceptLabel}</Button>
        <Button size="small" variant="ghost" loading={busy === "no"} disabled={!!busy} onClick={() => decide(false)}>Deny</Button>
      </div>
    </li>
  );
}

function PenaltyModal({ data, act, reload, ladderId, player, onClose }: StaffTabProps & { player: StaffPlayer | null; onClose: () => void }) {
  const toast = useToast();
  const d = data.ladder.settings.discipline;
  const [who, setWho] = useState<StaffPlayer | null>(player);
  const [q, setQ] = useState("");
  const found = useSearch(ladderId, q);
  const [kind, setKind] = useState<PenaltyKind>("late");
  const [mmr, setMmr] = useState(String(d.penalties.late.mmr));
  const [strikes, setStrikes] = useState(String(d.penalties.late.strikes));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const pickKind = (k: PenaltyKind) => { setKind(k); setMmr(String(d.penalties[k].mmr)); setStrikes(String(d.penalties[k].strikes)); };
  const give = async () => {
    if (!who) return;
    setBusy(true);
    const res = await act({ action: "penalty", playerId: who.id, kind, mmr: Number(mmr) || 0, strikes: Number(strikes) || 0, reason });
    setBusy(false);
    if (!res.ok) { toast.error(errorText(res.error)); return; }
    const until = typeof res.breakUntil === "string" ? res.breakUntil : null;
    toast.success(until ? `Penalty given. ${who.name} is on a break until ${dateOnly(until)}.` : `Penalty given to ${who.name}.`);
    reload();
    onClose();
  };
  const label = (k: PenaltyKind) => {
    const p = d.penalties[k];
    const parts = [p.mmr ? `−${num(p.mmr)}` : null, p.strikes ? `${p.strikes} ${p.strikes === 1 ? "strike" : "strikes"}` : null].filter(Boolean);
    return parts.length ? `${p.label} (${parts.join(", ")})` : p.label;
  };
  return (
    <Modal isOpen onClose={onClose} title={who ? `Give ${who.name} a penalty` : "Give a penalty"} footer={<ModalButtons label="Give the penalty" onClick={give} busy={busy} disabled={!who} onCancel={onClose} />}>
      <div className="ranked-form">
        {!who ? (
          <>
            <Input floatingLabel="Player" value={q} onChange={(e) => setQ(e.target.value)} iconBefore={IconSearch} fullWidth autoFocus />
            {found && (found.length ? (
              <ul className="ranked-picks">
                {found.map((p) => <li key={p.id}><Button size="small" variant="secondary" onClick={() => setWho(p)}>{p.name}{p.mmr != null ? ` · ${num(p.mmr)}` : ""}</Button></li>)}
              </ul>
            ) : <p className="ladder-muted">No player by that name.</p>)}
          </>
        ) : (
          <p className="ladder-note">{who.mmr != null ? `${who.name} has ${num(who.mmr)} MMR this season.` : `${who.name} has no MMR this season yet.`}</p>
        )}
        <Select floatingLabel="What for" value={kind} onChange={(v) => pickKind(String(v) as PenaltyKind)} options={KINDS.map((k) => ({ value: k, label: label(k) }))} />
        <div className="ranked-form__pair">
          <Input floatingLabel="MMR off" type="number" min={0} max={5000} value={mmr} onChange={(e) => setMmr(e.target.value)} />
          <Input floatingLabel="Strikes" type="number" min={0} max={5} value={strikes} onChange={(e) => setStrikes(e.target.value)} />
        </div>
        <Input floatingLabel="Reason (shows on their page)" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} fullWidth />
        <p className="ladder-muted">Strikes last {d.strikeDays} days. {d.breakAt ? `${d.breakAt} active strikes start a ${d.breakDays}-day break from the queue.` : "Strikes don't start breaks on this lounge."}</p>
      </div>
    </Modal>
  );
}

function RenameModal({ player, act, reload, onClose }: { player: StaffPlayer; act: StaffTabProps["act"]; reload: () => void; onClose: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(player.name);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const res = await act({ action: "rename", playerId: player.id, name });
    setBusy(false);
    if (res.ok) { toast.success(`${player.name} is now ${name.trim()}.`); reload(); onClose(); } else toast.error(errorText(res.error));
  };
  return (
    <Modal isOpen onClose={onClose} title={`Rename ${player.name}`} footer={<ModalButtons label="Rename" onClick={save} busy={busy} disabled={!name.trim() || name.trim() === player.name} onCancel={onClose} />}>
      <div className="ranked-form">
        <Input floatingLabel="New name" value={name} maxLength={32} onChange={(e) => setName(e.target.value)} fullWidth autoFocus />
        <p className="ladder-muted">Their old name stays on their page with their earlier names, and tables already played keep the name they were played under.</p>
      </div>
    </Modal>
  );
}

// ── Players ─────────────────────────────────────────────────────────────────────────────────

export function StaffPlayers(props: StaffTabProps) {
  const { data, act, reload, ladderId } = props;
  const toast = useToast();
  const [q, setQ] = useState("");
  const found = useSearch(ladderId, q);
  const [penalty, setPenalty] = useState<StaffPlayer | null>(null);
  const [rename, setRename] = useState<StaffPlayer | null>(null);
  const joins = data.requests.filter((r) => r.kind === "join");
  const names = data.requests.filter((r) => r.kind === "name");
  const appeals = data.requests.filter((r) => r.kind === "appeal");
  const onBreak = new Map(data.discipline.filter((x) => x.breakUntil).map((x) => [x.playerId, x.breakUntil!]));
  const endBreak = async (p: StaffPlayer) => {
    const res = await act({ action: "end_break", playerId: p.id });
    if (res.ok) { toast.success(`${p.name}'s break is over.`); reload(); } else toast.error(errorText(res.error));
  };
  return (
    <div className="ranked-staff__panel">
      <section className="ranked-staff__sec" aria-labelledby="staff-joins">
        <h2 id="staff-joins">Players to verify</h2>
        {joins.length ? (
          <ul className="ranked-staff__list">
            {joins.map((r) => <RequestRow key={r.id} r={r} act={act} reload={reload} acceptLabel="Add them" text={`${String(r.body.name ?? "A player")} asks to join${typeof r.body.mkcName === "string" ? ` (MKCentral: ${r.body.mkcName})` : " (no MKCentral profile found)"}`} />)}
          </ul>
        ) : <p className="ladder-muted">Nobody is waiting to join.{data.ladder.settings.staff.autoJoin ? " New players MKCentral vouches for join on their own." : ""}</p>}
      </section>
      <section className="ranked-staff__sec" aria-labelledby="staff-names">
        <h2 id="staff-names">Name changes</h2>
        {names.length ? (
          <ul className="ranked-staff__list">
            {names.map((r) => <RequestRow key={r.id} r={r} act={act} reload={reload} acceptLabel="Approve" text={`${r.player ?? String(r.body.from ?? "A player")} wants to be ${String(r.body.name ?? "")}`} />)}
          </ul>
        ) : <p className="ladder-muted">No name change requests.{data.ladder.settings.staff.autoNames ? " Clean names approve themselves on this lounge." : ""}</p>}
      </section>
      <section className="ranked-staff__sec" aria-labelledby="staff-appeals">
        <h2 id="staff-appeals">Appeals</h2>
        {appeals.length ? (
          <ul className="ranked-staff__list">
            {appeals.map((r) => <RequestRow key={r.id} r={r} act={act} reload={reload} acceptLabel="Take the penalty back" text={`${r.player ?? "A player"} appeals a penalty`} />)}
          </ul>
        ) : <p className="ladder-muted">No appeals.</p>}
      </section>
      <section className="ranked-staff__sec" aria-labelledby="staff-find">
        <h2 id="staff-find">Find a player</h2>
        <div className="ranked-staff__search">
          <Input floatingLabel="Name" value={q} onChange={(e) => setQ(e.target.value)} iconBefore={IconSearch} fullWidth />
        </div>
        {found && (found.length ? (
          <ul className="ranked-staff__list">
            {found.map((p) => (
              <li key={p.id} className="ranked-staff__row">
                <div className="ranked-staff__row-main">
                  <span className="ranked-staff__row-title">{p.name}</span>
                  <span className="ladder-muted">
                    {p.mmr != null ? `${num(p.mmr)} MMR · ${num(p.events)} ${p.events === 1 ? "table" : "tables"} this season` : "No tables this season"}
                    {p.earlierNames.length > 0 && ` · was ${p.earlierNames.join(", ")}`}
                    {onBreak.has(p.id) && ` · on a break until ${dateOnly(onBreak.get(p.id)!)}`}
                  </span>
                </div>
                <div className="ranked-staff__row-acts">
                  <Button size="small" variant="secondary" onClick={() => setPenalty(p)}>Give a penalty</Button>
                  <Button size="small" variant="ghost" onClick={() => setRename(p)}>Rename</Button>
                  {onBreak.has(p.id) && <Button size="small" variant="ghost" onClick={() => endBreak(p)}>End break</Button>}
                </div>
              </li>
            ))}
          </ul>
        ) : <p className="ladder-muted">No player by that name.</p>)}
      </section>
      {penalty && <PenaltyModal {...props} player={penalty} onClose={() => setPenalty(null)} />}
      {rename && <RenameModal player={rename} act={act} reload={reload} onClose={() => setRename(null)} />}
    </div>
  );
}

// ── Penalties ───────────────────────────────────────────────────────────────────────────────

export function StaffPenalties(props: StaffTabProps) {
  const { data, act, reload } = props;
  const toast = useToast();
  const confirm = useConfirm();
  const [giving, setGiving] = useState(false);
  const reports = data.requests.filter((r) => r.kind === "penalty" || r.kind === "reduce");
  const recent = data.log.filter((l) => l.action === "penalty").slice(0, 25);
  const labelOf = (k: unknown) => data.ladder.settings.discipline.penalties[(KINDS.includes(k as PenaltyKind) ? k : "other") as PenaltyKind].label;
  const reportText = (r: LadderRequest) => {
    if (r.kind === "reduce") {
      const missed = Array.isArray(r.body.missed) ? (r.body.missed as { name?: string; key: string; races: number }[]) : [];
      return `Reduced loss on table ${r.table != null ? num(r.table) : "?"}: ${missed.map((m) => `${m.name ?? m.key} missed ${m.races}`).join(", ") || "missed races"}`;
    }
    return `${r.player ?? "A player"}: ${labelOf(r.body.penalty)}${r.table != null ? ` (table ${num(r.table)})` : ""}`;
  };
  const undo = async (logId: string, who: string | null) => {
    if (!(await confirm({ title: "Take this penalty back?", body: `${who ?? "The player"} gets the MMR back and its strikes stop counting.`, confirmLabel: "Take it back" }))) return;
    const res = await act({ action: "undo_penalty", logId });
    if (res.ok) { toast.success("Penalty taken back."); reload(); } else toast.error(errorText(res.error));
  };
  const endBreak = async (playerId: string, name: string) => {
    const res = await act({ action: "end_break", playerId });
    if (res.ok) { toast.success(`${name}'s break is over.`); reload(); } else toast.error(errorText(res.error));
  };
  return (
    <div className="ranked-staff__panel">
      <div className="ranked-staff__bar">
        <Button onClick={() => setGiving(true)}>Give a penalty</Button>
      </div>
      <section className="ranked-staff__sec" aria-labelledby="staff-reports">
        <h2 id="staff-reports">Reports</h2>
        {reports.length ? (
          <ul className="ranked-staff__list">
            {reports.map((r) => <RequestRow key={r.id} r={r} act={act} reload={reload} acceptLabel={r.kind === "reduce" ? "Reduce the loss" : "Give the penalty"} text={reportText(r)} />)}
          </ul>
        ) : <p className="ladder-muted">No reports waiting.</p>}
      </section>
      <section className="ranked-staff__sec" aria-labelledby="staff-strikes">
        <h2 id="staff-strikes">Strikes and breaks</h2>
        {data.discipline.length ? (
          <TableScroll label="Players with strikes or a break">
            <Table>
              <TableHeader>
                <TableRow><TableHead>Player</TableHead><TableHead>Active strikes</TableHead><TableHead>On a break until</TableHead><TableHead><span className="sr-only">Actions</span></TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {data.discipline.map((x) => (
                  <TableRow key={x.playerId}>
                    <TableCell>{x.name}</TableCell>
                    <TableCell className="ladder-num">{x.strikes}</TableCell>
                    <TableCell>{x.breakUntil ? dateOnly(x.breakUntil) : "No break"}</TableCell>
                    <TableCell>{x.breakUntil && <Button size="small" variant="ghost" onClick={() => endBreak(x.playerId, x.name)}>End break</Button>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableScroll>
        ) : (
          <EmptyState variant="subtle" title="Nobody has strikes right now" description={`Strikes last ${data.ladder.settings.discipline.strikeDays} days.`} />
        )}
      </section>
      <section className="ranked-staff__sec" aria-labelledby="staff-recent">
        <h2 id="staff-recent">Recent penalties</h2>
        {recent.length ? (
          <ul className="ranked-staff__list">
            {recent.map((l) => {
              const d = l.detail as { mmr?: number; strikes?: number; reason?: string };
              const parts = [d.mmr ? `−${num(d.mmr)}` : null, d.strikes ? `${d.strikes} ${d.strikes === 1 ? "strike" : "strikes"}` : null].filter(Boolean).join(", ");
              return (
                <li key={l.id} className="ranked-staff__row">
                  <div className="ranked-staff__row-main">
                    <span className="ranked-staff__row-title">{l.player ?? "A player"}{parts ? `: ${parts}` : ""}{l.undone ? " (taken back)" : ""}</span>
                    {d.reason && <span className="ranked-staff__row-why">{d.reason}</span>}
                    <span className="ladder-muted">By {l.actor} · {relative(l.at)}</span>
                  </div>
                  {!l.undone && <Button size="small" variant="ghost" onClick={() => undo(l.id, l.player)}>Take it back</Button>}
                </li>
              );
            })}
          </ul>
        ) : <p className="ladder-muted">No penalties yet.</p>}
      </section>
      {giving && <PenaltyModal {...props} player={null} onClose={() => setGiving(false)} />}
    </div>
  );
}
