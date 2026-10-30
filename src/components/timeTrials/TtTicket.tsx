"use client";

/**
 * A report ticket's thread (round 2, 5A). The reporter and the time's owner can write (the owner usually
 * answering with proof); reviewers can ask, or keep or remove the time with a reason everyone here sees.
 */

import { useState } from "react";
import { Button, FormField, Input, Textarea } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import type { TicketState, TicketView } from "@/lib/timeTrials/review";

const STATE: Record<TicketState, { label: string; tone: string }> = {
  open: { label: "Waiting on a reviewer", tone: "wait" },
  waiting_review: { label: "Waiting on a reviewer", tone: "wait" },
  waiting_owner: { label: "Waiting on the time's owner", tone: "wait" },
  kept: { label: "Kept", tone: "ok" },
  removed: { label: "Removed", tone: "bad" },
};

const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" });

export function TtTicket({ initial }: { initial: TicketView }) {
  const [view, setView] = useState(initial);
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"reply" | "kept" | "removed" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const open = view.state !== "kept" && view.state !== "removed";
  const st = STATE[view.state];

  async function refresh() {
    const j = (await fetch(`/api/time-trials/tickets/${view.id}`).then((r) => r.json()).catch(() => ({}))) as { ok?: boolean; ticket?: TicketView };
    if (j.ok && j.ticket) setView(j.ticket);
  }

  async function reply() {
    setBusy("reply"); setError(null);
    try {
      const j = (await fetch(`/api/time-trials/tickets/${view.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reply", body, link: link.trim() || null }) }).then((r) => r.json()).catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!j.ok) { setError(j.error === "bad_link" ? "Use a full link starting with https://." : j.error === "closed" ? "This ticket is closed." : "That didn't send. Try again."); return; }
      setBody(""); setLink("");
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  async function decide(outcome: "kept" | "removed") {
    setBusy(outcome); setError(null);
    try {
      const j = (await fetch(`/api/time-trials/tickets/${view.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "decide", outcome, note }) }).then((r) => r.json()).catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!j.ok) { setError("That didn't save. Try again."); return; }
      toast.success(outcome === "kept" ? "Kept" : "Removed");
      setNote("");
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="tt-ticket" aria-label="Ticket">
      <p className="tt-ticket__state"><span className={`tt-chip tt-chip--${st.tone}`}>{st.label}</span></p>
      {view.decisionNote && !open && <p className="tt-note">{view.decisionNote}</p>}
      <ol className="tt-thread">
        {view.messages.map((m) => (
          <li key={m.id} className={`tt-msg tt-msg--${m.role}`}>
            <p className="tt-msg__who"><b>{m.role === "reporter" ? `${m.name} (reported it)` : m.role === "owner" ? `${m.name} (the time's owner)` : m.name}</b> <span className="tt-muted">{dateFmt.format(new Date(m.at))}</span></p>
            <p className="tt-msg__body">{m.body}</p>
            {m.link && <p className="tt-msg__link"><a href={m.link} target="_blank" rel="noopener noreferrer nofollow">{m.link}</a></p>}
          </li>
        ))}
      </ol>

      {open && (
        <form className="tt-form" onSubmit={(e) => { e.preventDefault(); void reply(); }}>
          <FormField label={view.role === "owner" ? "Your answer" : view.role === "reviewer" ? "Ask or add a note" : "Add something"} htmlFor="tt-ticket-body">
            <Textarea id="tt-ticket-body" value={body} onChange={(e) => setBody(e.target.value)} rows={3} maxLength={1000} fullWidth />
          </FormField>
          <FormField label="A link (optional)" htmlFor="tt-ticket-link" helperText={view.role === "owner" ? "Your full run, a clip or the screenshot, starting with https://" : "Starting with https://"}>
            <Input id="tt-ticket-link" value={link} onChange={(e) => setLink(e.target.value)} inputMode="url" autoComplete="off" fullWidth />
          </FormField>
          <div className="tt-add__actions"><Button type="submit" variant="secondary" loading={busy === "reply"} disabled={!body.trim()}>Send</Button></div>
        </form>
      )}

      {open && view.role === "reviewer" && (
        <div className="tt-decide">
          <FormField label="Reason (everyone in the ticket sees it)" htmlFor="tt-ticket-note">
            <Input id="tt-ticket-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} fullWidth />
          </FormField>
          <div className="tt-add__actions">
            <Button variant="primary" loading={busy === "kept"} onClick={() => void decide("kept")}>Keep the time</Button>
            <Button variant="danger" loading={busy === "removed"} onClick={() => void decide("removed")}>Remove the time</Button>
          </div>
        </div>
      )}
      {error && <p className="tt-form__error" role="alert">{error}</p>}
    </section>
  );
}
