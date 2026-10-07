"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, Icon, IconButton, Input, Modal, Select, Switch, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Textarea } from "@empac/cascadeds";
import { SortableList } from "@/components/ui/SortableList";
import { lineOrder, timeLeft } from "@/lib/events/waitlistRules";
import { UserAvatar } from "@/components/UserAvatar";
import { useToast } from "@/components/toast/ToastProvider";
import type { EventType } from "@/lib/events/calendar";
import type { Attendee, AttendeeStatus, MessageAudience } from "@/lib/events/attendees";
import { LoadingLines } from "@/components/loading/LoadingLines";

/**
 * Shared attendee table for organizer pages (events plan, step 4): search,
 * status filter, check-in toggle, waitlist promotion, CSV export, message
 * attendees, and a link to the QR check-in scanner. Same component on the
 * tournament and game-night manage pages; the server decides what a status
 * means per type.
 */

const STATUS_LABEL: Record<AttendeeStatus, string> = {
  registered: "Pending", confirmed: "Confirmed", checked_in: "Checked in", dropped: "Dropped", waitlisted: "Waitlist",
  offered: "Offered", going: "Going", maybe: "Maybe", declined: "Declined",
};
const STATUS_VARIANT: Record<AttendeeStatus, "default" | "success" | "warning" | "error" | "info" | "outline"> = {
  registered: "warning", confirmed: "success", checked_in: "info", dropped: "outline", waitlisted: "warning", offered: "info", going: "success", maybe: "default", declined: "outline",
};

export function AttendeeTable({ type, eventId, capacity: capacityProp = null, checkInHref, compact = false }: { type: EventType; eventId: string; capacity?: number | null; checkInHref: string; compact?: boolean }) {
  const toast = useToast();
  const [rows, setRows] = useState<Attendee[]>([]);
  const [capacity, setCapacity] = useState<number | null>(capacityProp);
  const [taken, setTaken] = useState(0);
  const [waitlistCap, setWaitlistCap] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msgOpen, setMsgOpen] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch(`/api/events/${type}/${eventId}/attendees`, { cache: "no-store" });
    if (r.ok) {
      const j = (await r.json()) as { attendees: Attendee[]; capacity: number | null; taken: number; waitlistCap?: number | null };
      setRows(j.attendees); setCapacity(j.capacity); setTaken(j.taken); setWaitlistCap(j.waitlistCap ?? null);
    }
    setLoading(false);
  }, [type, eventId]);
  useEffect(() => { void load(); }, [load]);

  const statuses = useMemo(() => [...new Set(rows.map((r) => r.status))], [rows]);
  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) =>
      (!status || r.status === status) &&
      (!needle || r.displayName.toLowerCase().includes(needle) || (r.username ?? "").toLowerCase().includes(needle) || (r.email ?? "").toLowerCase().includes(needle)),
    );
  }, [rows, q, status]);
  const waitlisted = rows.filter((r) => r.status === "waitlisted").length;
  const checkedIn = rows.filter((r) => !!r.checkedInAt || r.status === "checked_in").length;
  const seatFree = capacity == null || taken < capacity;

  const toggleCheckIn = async (a: Attendee, checked: boolean) => {
    setBusy(a.id);
    try {
      const r = await fetch(`/api/events/${type}/${eventId}/attendees/check-in`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ attendeeId: a.id, checked }) });
      if (!r.ok) { toast.error("Couldn't update check-in"); return; }
      const j = (await r.json()) as { attendee?: Attendee };
      setRows((prev) => prev.map((x) => (x.id === a.id && j.attendee ? j.attendee : x)));
    } finally { setBusy(null); }
  };

  const promote = async () => {
    setBusy("promote");
    try {
      const r = await fetch(`/api/events/${type}/${eventId}/attendees/promote`, { method: "POST" });
      const j = r.ok ? ((await r.json()) as { promoted?: Attendee | null }) : null;
      if (j?.promoted) { toast.success(`Offered a spot to ${j.promoted.displayName}`); void load(); }
      else toast.info("No one to offer a spot to right now");
    } finally { setBusy(null); }
  };

  const saveCap = async (cap: number | null) => {
    setWaitlistCap(cap);
    const r = await fetch(`/api/events/${type}/${eventId}/waitlist`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "cap", cap }) });
    if (r.ok) toast.success(cap == null ? "No limit on the waitlist" : `Waitlist limited to ${cap}`); else toast.error("Couldn't save the waitlist limit");
  };

  const canCheckIn = (a: Attendee) => a.status !== "dropped" && a.status !== "waitlisted" && a.status !== "declined";

  return (
    <div className="attendees">
      <div className="attendees__toolbar">
        <div className="attendees__stats">
          <span><strong>{taken}</strong>{capacity != null ? ` / ${capacity}` : ""} {type === "tournament" ? "players" : "going"}</span>
          <span><strong>{checkedIn}</strong> checked in</span>
          {waitlisted > 0 && <span><strong>{waitlisted}</strong> waitlisted</span>}
        </div>
        <div className="attendees__actions">
          {waitlisted > 0 && seatFree && <Button variant="secondary" size="small" onClick={() => void promote()} disabled={busy === "promote"}>Offer the open spot</Button>}
          {capacity != null && (
            <Select size="small" aria-label="Waitlist limit" value={waitlistCap == null ? "" : String(waitlistCap)}
              onChange={(v) => void saveCap(v === "" ? null : Number(v))}
              options={[{ value: "", label: "Waitlist: no limit" }, ...[5, 10, 20, 50].map((n) => ({ value: String(n), label: `Waitlist: up to ${n}` }))]} />
          )}
          <Button variant="secondary" size="small" onClick={() => setMsgOpen(true)} disabled={rows.length === 0}>Message attendees</Button>
          <Link href={checkInHref} style={{ textDecoration: "none" }}><Button variant="secondary" size="small">Check-in scanner</Button></Link>
          <a href={`/api/events/${type}/${eventId}/attendees?csv=1`} style={{ textDecoration: "none" }}><Button variant="ghost" size="small">Export CSV</Button></a>
        </div>
      </div>

      <WaitlistPanel type={type} eventId={eventId} rows={rows} onChanged={load} />

      {!compact && rows.length > 6 && (
        <div className="attendees__filters">
          <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, handle or email" fullWidth />
          <Select value={status} onChange={(v) => setStatus(v as string)} options={[{ value: "", label: "All statuses" }, ...statuses.map((s) => ({ value: s, label: STATUS_LABEL[s] }))]} />
        </div>
      )}

      {loading ? (
        <LoadingLines label="Loading attendees" />
      ) : visible.length === 0 ? (
        <p className="attendees__empty">{rows.length === 0 ? "No one has signed up yet. Share the link!" : "No attendees match."}</p>
      ) : (
        <div className="attendees__table">
          <Table dense hoverable>
            <TableHeader>
              <TableRow>
                <TableHead>Attendee</TableHead>
                <TableHead>Status</TableHead>
                {type === "tournament" && !compact && <TableHead>Friend code</TableHead>}
                <TableHead>Joined</TableHead>
                <TableHead style={{ textAlign: "right" }}>Checked in</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>
                    <span className="attendees__who">
                      <UserAvatar user={a.avatar ?? { id: a.id }} size={28} />
                      <span className="attendees__name">
                        {a.username ? <Link href={`/u/${a.username}`}>{a.displayName}</Link> : a.displayName}
                        {!a.userId && <span className="attendees__guest"> · guest{a.email ? ` (${a.email})` : ""}</span>}
                      </span>
                    </span>
                  </TableCell>
                  <TableCell><Badge variant={STATUS_VARIANT[a.status]} size="small">{STATUS_LABEL[a.status]}</Badge></TableCell>
                  {type === "tournament" && !compact && <TableCell>{a.friendCode ?? <span style={{ color: "var(--text-tertiary)" }}>–</span>}</TableCell>}
                  <TableCell>{a.joinedAt ? new Date(a.joinedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "–"}</TableCell>
                  <TableCell style={{ textAlign: "right" }}>
                    {canCheckIn(a) ? (
                      <Switch size="small" checked={!!a.checkedInAt || a.status === "checked_in"} disabled={busy === a.id} onChange={(e) => void toggleCheckIn(a, e.target.checked)} aria-label={`Check in ${a.displayName}`} />
                    ) : <span style={{ color: "var(--text-tertiary)", fontSize: "var(--font-size-12)" }}>–</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <MessageAttendeesModal type={type} eventId={eventId} open={msgOpen} onClose={() => setMsgOpen(false)} counts={{ all: rows.filter((r) => r.status !== "dropped" && r.status !== "declined").length, going: taken, waitlisted, checked_in: checkedIn }} />
    </div>
  );
}

/**
 * The line, for organizers: drag (or the arrow buttons) to reorder, offer a
 * spot to anyone, seat someone straight in, or take an offer back. Live offers
 * sit above the line with their time left.
 */
function WaitlistPanel({ type, eventId, rows, onChanged }: { type: EventType; eventId: string; rows: Attendee[]; onChanged: () => Promise<void> | void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [order, setOrder] = useState<Attendee[] | null>(null);
  const serverLine = useMemo(() => lineOrder(rows.map((r) => ({ ...r, rank: r.rank ?? null, waitlistedAt: r.waitlistedAt ?? null }))), [rows]);
  const line = order ?? serverLine;
  const offers = rows.filter((r) => r.status === "offered");
  if (line.length === 0 && offers.length === 0) return null;

  const call = async (body: Record<string, unknown>, ok: string) => {
    setBusy(true);
    try {
      const r = await fetch(`/api/events/${type}/${eventId}/waitlist`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (r.ok) toast.success(ok); else toast.error("That didn't work. Try again.");
      setOrder(null);
      await onChanged();
    } finally { setBusy(false); }
  };
  const save = (next: Attendee[]) => { setOrder(next); void call({ action: "reorder", ids: next.map((a) => a.id) }, "Waitlist order saved"); };
  const move = (i: number, d: -1 | 1) => {
    const next = [...line];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    save(next);
  };
  const since = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "");

  return (
    <section className="waitlist-panel" aria-label="Waitlist">
      <h3 className="waitlist-panel__title">Waitlist</h3>
      {offers.map((a) => (
        <div key={a.id} className="waitlist-panel__row is-offer">
          <span className="waitlist-panel__name">{a.displayName}{!a.userId && <span className="attendees__guest"> · guest</span>}</span>
          <Badge variant="info" size="small">{a.offerExpiresAt ? `Offer · ${timeLeft(Date.parse(a.offerExpiresAt) - Date.now())} left` : "Offer"}</Badge>
          <span className="waitlist-panel__actions">
            <Button variant="ghost" size="small" disabled={busy} onClick={() => void call({ action: "seat", attendeeId: a.id }, `${a.displayName} is in`)}>Seat now</Button>
            <Button variant="ghost" size="small" disabled={busy} onClick={() => void call({ action: "withdraw", attendeeId: a.id }, "Offer withdrawn")}>Withdraw offer</Button>
          </span>
        </div>
      ))}
      {line.length > 0 && (
        <SortableList items={line} getId={(a) => a.id} onReorder={save} handleLabel={(a) => `Reorder ${a.displayName}`}>
          {(a, handle, i) => (
            <div className="waitlist-panel__row">
              {handle}
              <span className="waitlist-panel__pos">{i + 1}</span>
              <span className="waitlist-panel__name">
                {a.displayName}{!a.userId && <span className="attendees__guest"> · guest</span>}
                <small>waiting since {since(a.waitlistedAt ?? a.joinedAt)}{a.checkedInAt ? " · here (standby)" : ""}</small>
              </span>
              <span className="waitlist-panel__actions">
                <IconButton variant="tertiary" size="small" aria-label={`Move ${a.displayName} up`} disabled={busy || i === 0} onClick={() => move(i, -1)}><Icon name="chevron-up" /></IconButton>
                <IconButton variant="tertiary" size="small" aria-label={`Move ${a.displayName} down`} disabled={busy || i === line.length - 1} onClick={() => move(i, 1)}><Icon name="chevron-down" /></IconButton>
                <Button variant="ghost" size="small" disabled={busy} onClick={() => void call({ action: "offer", attendeeId: a.id }, `Offered a spot to ${a.displayName}`)}>Offer now</Button>
                <Button variant="ghost" size="small" disabled={busy} onClick={() => void call({ action: "seat", attendeeId: a.id }, `${a.displayName} is in`)}>Seat now</Button>
              </span>
            </div>
          )}
        </SortableList>
      )}
      <p className="waitlist-panel__hint">Offer now works even when you&apos;re full: it goes over your cap. Paid events: an offer means they buy a ticket into the spot.</p>
    </section>
  );
}

function MessageAttendeesModal({ type, eventId, open, onClose, counts }: { type: EventType; eventId: string; open: boolean; onClose: () => void; counts: Record<MessageAudience, number> }) {
  const toast = useToast();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<MessageAudience>("all");
  const [alsoText, setAlsoText] = useState(false);
  const [smsInfo, setSmsInfo] = useState<{ allowance: number; used: number } | null>(null);
  const [sending, setSending] = useState(false);

  // Only offer SMS when the organizer's plan actually includes it.
  useEffect(() => {
    if (!open) return;
    fetch("/api/account/phone", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { allowance?: { allowance: number; used: number } } | null) => { if (j?.allowance?.allowance) setSmsInfo({ allowance: j.allowance.allowance, used: j.allowance.used }); })
      .catch(() => {});
  }, [open]);

  const send = async () => {
    if (subject.trim().length < 2 || body.trim().length < 2) { toast.error("Add a subject and a message"); return; }
    setSending(true);
    try {
      const r = await fetch(`/api/events/${type}/${eventId}/message`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subject, body, audience, sms: alsoText }) });
      const j = (await r.json().catch(() => null)) as { sent?: number; emailed?: number; texted?: number; error?: string } | null;
      if (!r.ok) { toast.error(j?.error ?? "Couldn't send"); return; }
      const extras = [j?.emailed ? `${j.emailed} emailed` : null, j?.texted ? `${j.texted} texted` : null].filter(Boolean).join(", ");
      toast.success(`Sent to ${j?.sent ?? 0} attendee${j?.sent === 1 ? "" : "s"}${extras ? ` (${extras})` : ""}`);
      setSubject(""); setBody(""); onClose();
    } finally { setSending(false); }
  };

  const label = (k: MessageAudience, name: string) => `${name} (${counts[k]})`;
  return (
    <Modal isOpen={open} onClose={onClose} title="Message attendees" size="medium"
      primaryAction={{ label: sending ? "Sending…" : "Send", onClick: () => { if (!sending) void send(); } }}
      secondaryAction={{ label: "Cancel", onClick: onClose }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-12)" }}>
        <Select value={audience} onChange={(v) => setAudience(v as MessageAudience)} fullWidth options={[
          { value: "all", label: label("all", "Everyone signed up") },
          { value: "going", label: label("going", type === "tournament" ? "Confirmed players" : "Going") },
          { value: "waitlisted", label: label("waitlisted", "Waitlist") },
          { value: "checked_in", label: label("checked_in", "Checked in") },
        ]} />
        <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" maxLength={120} fullWidth />
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Doors open at 6:30, parking is on the street…" rows={6} maxLength={4000} fullWidth />
        {smsInfo && (
          <label style={{ display: "flex", alignItems: "flex-start", gap: "var(--spacing-8)" }}>
            <Switch checked={alsoText} onChange={(e) => setAlsoText(e.target.checked)} aria-label="Also send as a text" />
            <span style={{ fontSize: "var(--font-size-12)" }}>
              Also text it
              <span style={{ display: "block", color: "var(--text-tertiary)", fontSize: "var(--font-size-12)" }}>
                Goes only to attendees who verified a number and opted in. Uses your plan&apos;s allowance ({smsInfo.used} of {smsInfo.allowance} segments used this month).
              </span>
            </span>
          </label>
        )}
        <p style={{ margin: 0, fontSize: "var(--font-size-12)", color: "var(--text-tertiary)" }}>
          Delivered as an in-app alert and an email to each attendee. Guests without accounts get the email only.
        </p>
      </div>
    </Modal>
  );
}
