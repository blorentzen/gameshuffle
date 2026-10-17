"use client";

/**
 * The give form on /support (Britton's picks, 2026-10-16): once or monthly,
 * $3 / $5 / $10 / $25 or any other amount, an optional name and note for the
 * supporters wall, then Stripe Checkout (/api/support/checkout). Monthly needs
 * an account so it can be managed in Plans & billing. Outside the US the form
 * says support is open in the US for now.
 */

import { useEffect, useState } from "react";
import { Alert, Button, Checkbox, Input, Tabs, Textarea } from "@empac/cascadeds";
import { EVENTS, track } from "@/lib/analytics/events";
import { SUPPORT_AMOUNTS, SUPPORT_DEFAULT, WALL_NAME_MAX, WALL_NOTE_MAX, amountProblem, centsFromInput, dollars, type SupportKind } from "@/lib/support/rules";

interface Status { available: boolean; signedIn: boolean; supporter: boolean; pro: boolean }

export function SupportForm({ canceled }: { canceled: boolean }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [kind, setKind] = useState<SupportKind>("once");
  const [preset, setPreset] = useState<number | null>(SUPPORT_DEFAULT);
  const [other, setOther] = useState("");
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [onWall, setOnWall] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void fetch("/api/support/status").then((r) => (r.ok ? r.json() : null)).then((s: Status | null) => { if (alive && s) setStatus(s); }).catch(() => { /* the form still works */ });
    return () => { alive = false; };
  }, []);

  const cents = preset ?? centsFromInput(other);
  const problem = preset ? null : other.trim() ? amountProblem(cents) : null;
  const needsSignIn = kind === "monthly" && status && !status.signedIn;

  const give = async () => {
    const p = amountProblem(cents);
    if (p) { setError(p); return; }
    setBusy(true);
    setError(null);
    const res = await fetch("/api/support/checkout", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, cents, wallName: name, wallNote: note, showOnWall: onWall && !!name.trim() }),
    }).catch(() => null);
    const body = res ? ((await res.json().catch(() => ({}))) as { url?: string; error?: string; message?: string }) : null;
    if (res?.ok && body?.url) {
      track(EVENTS.supportCheckoutStarted, { kind, amount: Math.round((cents ?? 0) / 100) });
      window.location.href = body.url;
      return;
    }
    setBusy(false);
    setError(body?.message ?? (body?.error === "sign_in" ? "Sign in to give monthly." : "Couldn't open checkout. Try again in a moment."));
  };

  if (status && !status.available) {
    return (
      <Alert variant="info" title="Support is open in the US for now">
        Thank you for wanting to help. We&apos;ll open support in more countries soon; until then, playing and sharing GameShuffle helps just as much.
      </Alert>
    );
  }

  return (
    <form className="support-form" onSubmit={(e) => { e.preventDefault(); void give(); }}>
      {status?.supporter && <Alert variant="success" title="You're a supporter">Thank you for keeping GameShuffle running. You can give again any time.</Alert>}
      {canceled && <p className="support-form__note">No payment was made. You can try again whenever you like.</p>}
      <Tabs
        variant="pills"
        size="small"
        fullWidth
        activeTab={kind}
        onChange={(id) => setKind(id as SupportKind)}
        tabs={[{ id: "once", label: "Once", content: null }, { id: "monthly", label: "Monthly", content: null }]}
        className="support-form__kind"
      />
      <div className="support-form__amounts" role="group" aria-label="Amount">
        {SUPPORT_AMOUNTS.map((a) => (
          <Button key={a} type="button" variant={preset === a ? "primary" : "secondary"} aria-pressed={preset === a} onClick={() => { setPreset(a); setOther(""); setError(null); }}>
            {dollars(a)}
          </Button>
        ))}
      </div>
      <Input
        value={other}
        onChange={(e) => { setOther(e.target.value); setPreset(null); setError(null); }}
        placeholder="Other amount in dollars"
        aria-label="Other amount in dollars"
        inputMode="decimal"
        variant={problem ? "error" : "default"}
      />
      {problem && <p className="support-form__error">{problem}</p>}
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name for the supporters wall (optional)" aria-label="Your name for the supporters wall" maxLength={WALL_NAME_MAX} />
      <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="A short note (optional)" aria-label="A short note for the supporters wall" maxLength={WALL_NOTE_MAX} rows={2} />
      <Checkbox checked={onWall && !!name.trim()} onChange={(e) => setOnWall(e.target.checked)} label="Show my name and note on the supporters wall" disabled={!name.trim()} helperText={name.trim() ? undefined : "Add a name to go on the wall."} />
      {needsSignIn ? (
        <Button type="button" variant="primary" onClick={() => { window.location.href = "/login?redirect=/support"; }}>Sign in to give monthly</Button>
      ) : (
        <Button type="submit" variant="primary" disabled={busy || !cents || !!problem}>
          {busy ? "Opening checkout…" : `Give ${cents && !problem ? dollars(cents) : ""}${kind === "monthly" ? " a month" : ""} with Stripe`}
        </Button>
      )}
      {error && <p className="support-form__error" role="alert">{error}</p>}
      <p className="support-form__fine">
        GameShuffle isn&apos;t a charity, so support isn&apos;t tax-deductible. {kind === "monthly" ? "Change or stop monthly support any time from Plans & billing. " : ""}Support is processed by Empac, the studio behind GameShuffle.
      </p>
    </form>
  );
}
