"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, Input, Modal, Select, Switch, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Textarea } from "@empac/cascadeds";
import { UserAvatar } from "@/components/UserAvatar";
import { useToast } from "@/components/toast/ToastProvider";
import type { EventType } from "@/lib/events/calendar";
import type { Attendee, AttendeeStatus, MessageAudience } from "@/lib/events/attendees";

/**
 * Shared attendee table for organizer pages (events plan, step 4): search,
 * status filter, check-in toggle, waitlist promotion, CSV export, message
 * attendees, and a link to the QR check-in scanner. Same component on the
 * tournament and game-night manage pages; the server decides what a status
 * means per type.
 */

const STATUS_LABEL: Record<AttendeeStatus, string> = {
  registered: "Pending", confirmed: "Confirmed", checked_in: "Checked in", dropped: "Dropped", waitlisted: "Waitlist",
  going: "Going", maybe: "Maybe", declined: "Declined",
};
const STATUS_VARIANT: Record<AttendeeStatus, "default" | "success" | "warning" | "error" | "info" | "outline"> = {
  registered: "warning", confirmed: "success", checked_in: "info", dropped: "outline", waitlisted: "warning", going: "success", maybe: "default", declined: "outline",
};

export function AttendeeTable({ type, eventId, capacity: capacityProp = null, checkInHref, compact = false }: { type: EventType; eventId: string; capacity?: number | null; checkInHref: string; compact?: boolean }) {
  const toast = useToast();
  const [rows, setRows] = useState<Attendee[]>([]);
  const [capacity, setCapacity] = useState<number | null>(capacityProp);
  const [taken, setTaken] = useState(0);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msgOpen, setMsgOpen] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch(`/api/events/${type}/${eventId}/attendees`, { cache: "no-store" });
    if (r.ok) {
      const j = (await r.json()) as { attendees: Attendee[]; capacity: number | null; taken: number };
      setRows(j.attendees); setCapacity(j.capacity); setTaken(j.taken);
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
      if (j?.promoted) { toast.success(`${j.promoted.displayName} moved off the waitlist`); void load(); }
      else toast.info("No one to promote right now");
    } finally { setBusy(null); }
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
          {waitlisted > 0 && seatFree && <Button variant="secondary" size="small" onClick={() => void promote()} disabled={busy === "promote"}>Promote next</Button>}
          <Button variant="secondary" size="small" onClick={() => setMsgOpen(true)} disabled={rows.length === 0}>Message attendees</Button>
          <Link href={checkInHref} style={{ textDecoration: "none" }}><Button variant="secondary" size="small">Check-in scanner</Button></Link>
          <a href={`/api/events/${type}/${eventId}/attendees?csv=1`} style={{ textDecoration: "none" }}><Button variant="ghost" size="small">Export CSV</Button></a>
        </div>
      </div>

      {!compact && rows.length > 6 && (
        <div className="attendees__filters">
          <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, handle or email" fullWidth />
          <Select value={status} onChange={(v) => setStatus(v as string)} options={[{ value: "", label: "All statuses" }, ...statuses.map((s) => ({ value: s, label: STATUS_LABEL[s] }))]} />
        </div>
      )}

      {loading ? (
        <p className="attendees__empty">Loading attendees…</p>
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

function MessageAttendeesModal({ type, eventId, open, onClose, counts }: { type: EventType; eventId: string; open: boolean; onClose: () => void; counts: Record<MessageAudience, number> }) {
  const toast = useToast();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<MessageAudience>("all");
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (subject.trim().length < 2 || body.trim().length < 2) { toast.error("Add a subject and a message"); return; }
    setSending(true);
    try {
      const r = await fetch(`/api/events/${type}/${eventId}/message`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subject, body, audience }) });
      const j = (await r.json().catch(() => null)) as { sent?: number; emailed?: number; error?: string } | null;
      if (!r.ok) { toast.error(j?.error ?? "Couldn't send"); return; }
      toast.success(`Sent to ${j?.sent ?? 0} attendee${j?.sent === 1 ? "" : "s"}${j?.emailed ? ` (${j.emailed} emailed)` : ""}`);
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
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Doors open at 6:30, parking is on the street…" rows={6} maxLength={4000} />
        <p style={{ margin: 0, fontSize: "var(--font-size-12)", color: "var(--text-tertiary)" }}>
          Delivered as an in-app alert and an email to each attendee. Guests without accounts get the email only.
        </p>
      </div>
    </Modal>
  );
}
