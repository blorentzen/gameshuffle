"use client";

/**
 * The give form on /support (Britton's picks, 2026-10-16): once or monthly,
 * $3 / $5 / $10 / $25 or any other amount, an optional name and note for the
 * supporters wall, then Stripe Checkout (/api/support/checkout). Monthly needs
 * an account so it can be managed from Account ▸ Support. Outside the US the form
 * becomes the waitlist (support is US only for now). A Turnstile check comes before
 * checkout, so bots can't use the page to test stolen cards.
 */

import { useEffect, useState } from "react";
import { Alert, Button, Checkbox, Input, Tabs, Textarea } from "@empac/cascadeds";
import { TurnstileWidget } from "@/components/TurnstileWidget";
import { PaidPlansWaitlist } from "@/components/billing/PaidPlansWaitlist";
import { useSupportStatus } from "@/components/support/useSupportStatus";
import { EVENTS, track } from "@/lib/analytics/events";
import { SUPPORT_AMOUNTS, SUPPORT_DEFAULT, WALL_NAME_MAX, WALL_NOTE_MAX, amountProblem, centsFromInput, dollars, type SupportKind } from "@/lib/support/rules";

/** The check only shows (and is only required) where a Turnstile site key is set. */
const CAPTCHA_ON = !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

export function SupportForm({ canceled = false, back = "/support", thanks = true, wall }: {
  canceled?: boolean;
  /** Where "Sign in to give monthly" comes back to. */
  back?: string;
  /** The "You're a supporter" note (Account ▸ Support shows its own). */
  thanks?: boolean;
  /** A supporter's saved wall settings: the form leaves out its wall fields and sends these (Account ▸ Support). */
  wall?: { name: string | null; note: string | null; show: boolean };
}) {
  const status = useSupportStatus();
  const [kind, setKind] = useState<SupportKind>("once");
  const [preset, setPreset] = useState<number | null>(SUPPORT_DEFAULT);
  const [other, setOther] = useState("");
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [onWall, setOnWall] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [captchaRound, setCaptchaRound] = useState(0);

  // Signed in: their display name starts as the wall name (they can change or clear it).
  const [named, setNamed] = useState(false);
  useEffect(() => {
    if (named || !status?.name) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- filled once, when the status arrives
    setName((n) => n || status.name!.slice(0, WALL_NAME_MAX));
    setNamed(true);
  }, [status, named]);

  const cents = preset ?? centsFromInput(other);
  const problem = preset ? null : other.trim() ? amountProblem(cents) : null;
  const needsSignIn = kind === "monthly" && status && !status.signedIn;

  const give = async () => {
    const p = amountProblem(cents);
    if (p) { setError(p); return; }
    if (CAPTCHA_ON && !captcha) { setError("Finish the quick check above the button first."); return; }
    setBusy(true);
    setError(null);
    const res = await fetch("/api/support/checkout", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(wall
        ? { kind, cents, wallName: wall.name ?? "", wallNote: wall.note ?? "", showOnWall: wall.show && !!wall.name, turnstileToken: captcha }
        : { kind, cents, wallName: name, wallNote: note, showOnWall: onWall && !!name.trim(), turnstileToken: captcha }),
    }).catch(() => null);
    const body = res ? ((await res.json().catch(() => ({}))) as { url?: string; error?: string; message?: string }) : null;
    if (res?.ok && body?.url) {
      track(EVENTS.supportCheckoutStarted, { kind, amount: Math.round((cents ?? 0) / 100) });
      window.location.href = body.url;
      return;
    }
    setBusy(false);
    // The check's token is spent either way, so the next try gets a fresh one.
    setCaptchaRound((n) => n + 1);
    setError(body?.message ?? (body?.error === "sign_in" ? "Sign in to give monthly." : body?.error === "captcha" ? "The quick check didn't go through. Try it again." : "Couldn't open checkout. Try again in a moment."));
  };

  if (status && !status.available) return <PaidPlansWaitlist product="support" />;

  return (
    <form className="support-form" onSubmit={(e) => { e.preventDefault(); void give(); }}>
      {thanks && status?.supporter && <Alert variant="success" title="You're a supporter">Thank you for keeping GameShuffle running. You can give again any time.</Alert>}
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
      {!wall && (
        <>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name for the supporters wall (optional)" aria-label="Your name for the supporters wall" maxLength={WALL_NAME_MAX} />
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="A short note (optional)" aria-label="A short note for the supporters wall" maxLength={WALL_NOTE_MAX} rows={2} />
          <Checkbox checked={onWall && !!name.trim()} onChange={(e) => setOnWall(e.target.checked)} label="Show my name and note on the supporters wall" disabled={!name.trim()} helperText={name.trim() ? undefined : "Add a name to go on the wall."} />
        </>
      )}
      {needsSignIn ? (
        <Button type="button" variant="primary" onClick={() => { window.location.href = `/login?redirect=${encodeURIComponent(back)}`; }}>Sign in to give monthly</Button>
      ) : (
        <>
          <TurnstileWidget onToken={setCaptcha} size="flexible" resetKey={captchaRound} />
          <Button type="submit" variant="primary" disabled={busy || !cents || !!problem || (CAPTCHA_ON && !captcha)}>
            {busy ? "Opening checkout…" : `Give ${cents && !problem ? dollars(cents) : ""}${kind === "monthly" ? " a month" : ""} with Stripe`}
          </Button>
        </>
      )}
      {error && <p className="support-form__error" role="alert">{error}</p>}
      <p className="support-form__fine">
        GameShuffle isn&apos;t a charity, so support isn&apos;t tax-deductible. {kind === "monthly" ? "Change or stop monthly support any time from Account ▸ Support. " : ""}Support is processed by Empac, the studio behind GameShuffle.
      </p>
    </form>
  );
}
