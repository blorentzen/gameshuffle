"use client";

/**
 * "This is me" on a player listed from the Top 10 sheets (round 4, picks 2026-11-04, SGSXW3sBrn6GJSinYimSnc 4A): a
 * link that shows the name is theirs, and an optional note. An updater or staff check it; once approved the times
 * move to the account and later sheet reads come straight there.
 */

import { useState } from "react";
import Link from "next/link";
import { Button, FormField, Input, Modal, Textarea } from "@empac/cascadeds";
import { IconUserCheck } from "@tabler/icons-react";
import { useToast } from "@/components/toast/ToastProvider";

const ERRORS: Record<string, string> = {
  taken: "That name is already matched to an account.",
  pending: "You've already asked. An updater will look at it.",
  bad_link: "Add a link starting with https://",
  slow_down: "That's a lot of claims today. Try again tomorrow.",
  signin: "Sign in first.",
};

export function TtClaimButton({ player, name, signedIn, state, returnTo }: {
  player: string; name: string; signedIn: boolean; returnTo: string;
  /** The viewer's own latest claim on this name. */
  state: { status: "pending" | "approved" | "denied" | "undone"; reason: string | null } | null;
}) {
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(state?.status === "pending");
  const toast = useToast();

  if (!signedIn) return <p className="tt-note">Is {name} you? <Link href={`/login?redirect=${encodeURIComponent(returnTo)}`}>Sign in</Link> to put these times on your account.</p>;
  if (sent) return <p className="tt-note" role="status">You asked to put {name}&apos;s times on your account. An updater will check it and you&apos;ll get a notification.</p>;

  async function send() {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/time-trials/claims", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ player, link, note }) });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!j.ok) { setError(ERRORS[j.error ?? ""] ?? "That didn't go through. Try again."); return; }
      setSent(true); setOpen(false);
      toast.success("Sent. An updater will check it.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="tt-claim">
      {state?.status === "denied"
        ? <p className="tt-note">Your last claim wasn&apos;t approved{state.reason ? `: ${state.reason}` : "."} You can ask again with a different link.</p>
        : <p className="tt-note">Is {name} you? Put these times on your account.</p>}
      <Button variant="secondary" iconBefore={IconUserCheck} onClick={() => setOpen(true)}>This is me</Button>
      <Modal isOpen={open} onClose={() => setOpen(false)} title={`Is ${name} you?`} size="small">
        <form className="tt-form" onSubmit={(e) => { e.preventDefault(); void send(); }}>
          <p className="tt-note">An updater checks that this name is yours, then these times move to your account, and any more that come in go straight to you.</p>
          <FormField label="A link that shows it's you" htmlFor="tt-claim-link" required helperText="Your MKCentral page, a channel or post under that name, or a clip of one of these runs.">
            <Input id="tt-claim-link" value={link} onChange={(e) => setLink(e.target.value)} inputMode="url" autoComplete="off" placeholder="https://" fullWidth />
          </FormField>
          <FormField label="Anything else the updater should know (optional)" htmlFor="tt-claim-note">
            <Textarea id="tt-claim-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={500} fullWidth />
          </FormField>
          {error && <p className="tt-form__error" role="alert">{error}</p>}
          <div className="tt-add__actions"><Button type="submit" variant="primary" loading={busy} disabled={!/^https:\/\/\S{4,}/.test(link.trim())}>Send</Button></div>
        </form>
      </Modal>
    </div>
  );
}
