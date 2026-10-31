"use client";

/**
 * The give form on /support and Account ▸ Support GameShuffle. Monthly is one
 * of three levels (Britton's picks, 2026-10-19): Supporter $3 (thanks),
 * Backer $9 (GS Pro included) and Champion $25 (GS Pro, top of the wall, the
 * credits); once is any amount from $3, thanks only. An optional name and
 * note for the supporters wall, then Stripe Checkout (/api/support/checkout).
 * Monthly needs an account. An account that already has GS Pro from a plan,
 * a trial or Circuit is pointed to Supporter, so Pro is never charged twice.
 * Outside the US the form becomes the waitlist (US only for now). A Turnstile
 * check comes before checkout, so bots can't use the page to test cards.
 */

import { useEffect, useState } from "react";
import { Alert, Button, Card, Checkbox, Input, Tabs, Textarea } from "@empac/cascadeds";
import { IconCrown, IconHeart, IconStar, type Icon } from "@tabler/icons-react";
import { TurnstileWidget } from "@/components/TurnstileWidget";
import { PaidPlansWaitlist } from "@/components/billing/PaidPlansWaitlist";
import { useSupportStatus } from "@/components/support/useSupportStatus";
import { EVENTS, track } from "@/lib/analytics/events";
import {
  SUPPORT_AMOUNTS, SUPPORT_DEFAULT, SUPPORT_LEVELS, WALL_NAME_MAX, WALL_NOTE_MAX, amountProblem, centsFromInput, dollars, levelPerks, supportLevel,
  type SupportKind, type SupportLevel,
} from "@/lib/support/rules";

/** The check only shows (and is only required) where a Turnstile site key is set. */
const CAPTCHA_ON = !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

const LEVEL_ICON: Record<SupportLevel, Icon> = { supporter: IconHeart, backer: IconStar, champion: IconCrown };

export function SupportForm({ canceled = false, back = "/support", thanks = true, wall, startLevel }: {
  canceled?: boolean;
  /** Where "Sign in to give monthly" comes back to. */
  back?: string;
  /** The "You're a supporter" note (Account ▸ Support shows its own). */
  thanks?: boolean;
  /** A supporter's saved wall settings: the form leaves out its wall fields and sends these (Account ▸ Support). */
  wall?: { name: string | null; note: string | null; show: boolean };
  /** The level picked to start (a link like /support?level=backer). */
  startLevel?: SupportLevel | null;
}) {
  const status = useSupportStatus();
  const [kind, setKind] = useState<SupportKind>("monthly");
  const [level, setLevel] = useState<SupportLevel>(startLevel ?? "supporter");
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

  const def = supportLevel(level)!;
  const current = status?.level ?? null;
  const cents = kind === "monthly" ? def.cents : preset ?? centsFromInput(other);
  const problem = kind === "once" && !preset && other.trim() ? amountProblem(cents) : null;
  const needsSignIn = kind === "monthly" && status && !status.signedIn;
  // GS Pro from a plan, trial or Circuit: a level with GS Pro would charge for Pro twice.
  const proTwice = kind === "monthly" && def.pro && !!status?.proElsewhere;
  const sameLevel = kind === "monthly" && current === level;

  const give = async () => {
    const p = amountProblem(cents);
    if (p) { setError(p); return; }
    if (CAPTCHA_ON && !captcha) { setError("Finish the quick check above the button first."); return; }
    setBusy(true);
    setError(null);
    const wallFields = wall
      ? { wallName: wall.name ?? "", wallNote: wall.note ?? "", showOnWall: wall.show && !!wall.name }
      : { wallName: name, wallNote: note, showOnWall: onWall && !!name.trim() };
    const res = await fetch("/api/support/checkout", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, cents, ...(kind === "monthly" ? { level } : {}), ...wallFields, turnstileToken: captcha }),
    }).catch(() => null);
    const body = res ? ((await res.json().catch(() => ({}))) as { url?: string; error?: string; message?: string }) : null;
    if (res?.ok && body?.url) {
      track(EVENTS.supportCheckoutStarted, { kind, amount: Math.round((cents ?? 0) / 100), ...(kind === "monthly" ? { level } : {}) });
      window.location.assign(body.url);
      return;
    }
    setBusy(false);
    // The check's token is spent either way, so the next try gets a fresh one.
    setCaptchaRound((n) => n + 1);
    setError(body?.message ?? (body?.error === "sign_in" ? "Sign in to support monthly." : body?.error === "captcha" ? "The quick check didn't go through. Try it again." : "Couldn't open checkout. Try again in a moment."));
  };

  if (status && !status.available) return <PaidPlansWaitlist product="support" />;

  const label = kind === "monthly"
    ? current ? `Switch to ${def.name}, ${dollars(def.cents)} a month` : `Support as a ${def.name}, ${dollars(def.cents)} a month`
    : `Support with ${cents && !problem ? dollars(cents) : "this amount"}`;

  return (
    <form className="support-form" onSubmit={(e) => { e.preventDefault(); void give(); }}>
      {thanks && status?.supporter && <Alert variant="success" title="You're a supporter">Thank you for keeping GameShuffle running. You can give again any time.</Alert>}
      {canceled && <p className="support-form__note">No payment was made. You can try again whenever you like.</p>}
      <Tabs
        variant="pills"
        size="small"
        fullWidth
        activeTab={kind}
        onChange={(id) => { setKind(id as SupportKind); setError(null); }}
        tabs={[{ id: "monthly", label: "Monthly", content: null }, { id: "once", label: "Once", content: null }]}
        className="support-form__kind"
      />
      {kind === "monthly" ? (
        <div className="support-levels" role="group" aria-label="Monthly level">
          {SUPPORT_LEVELS.map((l) => {
            const LevelIcon = LEVEL_ICON[l.id];
            return (
              <Card
                key={l.id}
                variant="outlined"
                padding="small"
                interactive
                selected={level === l.id}
                onClick={() => { setLevel(l.id); setError(null); }}
                className={`support-level support-level--${l.id}`}
                aria-label={`${l.name}, ${dollars(l.cents)} a month${l.pro ? ", GS Pro included" : ""}${level === l.id ? ", selected" : ""}`}
              >
                <span className="support-level__head">
                  <span className={`support-level__tile support-level__tile--${l.id}`} aria-hidden="true"><LevelIcon size={18} stroke={2} /></span>
                  {current === l.id && <span className="support-level__yours">Your level</span>}
                </span>
                <span className="support-level__name">{l.name}</span>
                <span className="support-level__price">{dollars(l.cents)} a month</span>
                <span className="support-level__perks">
                  {levelPerks(l, !!status?.supporterLooks).map((p) => <span key={p} className="support-level__perk">{p}</span>)}
                </span>
              </Card>
            );
          })}
        </div>
      ) : (
        <>
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
        </>
      )}
      {proTwice && (
        <p className="support-form__note" role="status">You already have GS Pro. Supporter adds the thank-yous without a second charge; to back at this level, cancel GS Pro in Plans &amp; billing first.</p>
      )}
      {!wall && (
        <>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name for the supporters wall (optional)" aria-label="Your name for the supporters wall" maxLength={WALL_NAME_MAX} />
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="A short note (optional)" aria-label="A short note for the supporters wall" maxLength={WALL_NOTE_MAX} rows={2} />
          <Checkbox checked={onWall && !!name.trim()} onChange={(e) => setOnWall(e.target.checked)} label="Show my name and note on the supporters wall" disabled={!name.trim()} helperText={name.trim() ? undefined : "Add a name to go on the wall."} />
        </>
      )}
      {needsSignIn ? (
        <Button type="button" variant="primary" onClick={() => window.location.assign(`/login?redirect=${encodeURIComponent(back)}`)}>Sign in to support monthly</Button>
      ) : (
        <>
          <TurnstileWidget onToken={setCaptcha} size="flexible" resetKey={captchaRound} />
          <Button type="submit" variant="primary" disabled={busy || !cents || !!problem || proTwice || sameLevel || (CAPTCHA_ON && !captcha)}>
            {busy ? "Opening checkout…" : sameLevel ? `You're a ${def.name}` : label}
          </Button>
        </>
      )}
      {error && <p className="support-form__error" role="alert">{error}</p>}
      <p className="support-form__fine">
        {kind === "monthly" && def.pro
          ? "Backer and Champion include GS Pro, so they're taxed like GS Pro. "
          : "GameShuffle isn't a charity, so support isn't tax-deductible. "}
        {kind === "monthly" ? `${current ? "Switching starts the new level now and ends the old one, with the unused time credited. " : ""}Change or stop any time from Account ▸ Support GameShuffle. ` : ""}
        Support is processed by Empac, the studio behind GameShuffle.
      </p>
    </form>
  );
}
