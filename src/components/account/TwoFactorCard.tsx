"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button, Input, Modal } from "@empac/cascadeds";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/toast/ToastProvider";
import type { MfaFactor, MfaState } from "@/lib/auth/mfa";

/** Tell the user by SMS that their own account changed (best effort). */
function notifySecurity(kind: "password_changed" | "mfa_enabled" | "mfa_disabled"): void {
  void fetch("/api/account/security-alert", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind }),
  }).catch(() => {});
}


/**
 * Two-factor authentication (Account → Security).
 *
 * Enrolment talks to Supabase Auth directly from the browser because the SDK
 * needs the live session; recovery codes come from our API. A verified factor
 * raises the session to aal2, which is what the middleware checks — so the
 * protection is real, not cosmetic.
 */

type Stage = "idle" | "enrolling" | "codes";

export function TwoFactorCard() {
  const toast = useToast();
  const [state, setState] = useState<MfaState | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [enroll, setEnroll] = useState<{ factorId: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [challengeFor, setChallengeFor] = useState<MfaFactor | null>(null);
  const [challengeCode, setChallengeCode] = useState("");

  const load = useCallback(async () => {
    const r = await fetch("/api/account/mfa", { cache: "no-store" });
    if (r.ok) setState((await r.json()) as MfaState);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const startEnroll = async () => {
    setBusy("enroll");
    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `Authenticator ${new Date().toLocaleDateString()}` });
      if (error || !data) { toast.error(error?.message ?? "Couldn't start setup"); return; }
      setEnroll({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
      setStage("enrolling");
    } finally { setBusy(null); }
  };

  const finishEnroll = async () => {
    if (!enroll) return;
    setBusy("verify");
    try {
      const supabase = createClient();
      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId: enroll.factorId });
      if (chErr || !ch) { toast.error(chErr?.message ?? "Couldn't verify"); return; }
      const { error } = await supabase.auth.mfa.verify({ factorId: enroll.factorId, challengeId: ch.id, code: code.trim() });
      if (error) { toast.error("That code didn't match. Check the app and try again."); return; }
      // First factor verified → issue recovery codes and show them once.
      const r = await fetch("/api/account/mfa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "recovery.regenerate" }) });
      const j = (await r.json().catch(() => null)) as { codes?: string[] } | null;
      setCodes(j?.codes ?? null);
      setStage("codes");
      setEnroll(null); setCode("");
      toast.success("Two-factor authentication is on");
      notifySecurity("mfa_enabled");
      await load();
    } finally { setBusy(null); }
  };

  const cancelEnroll = async () => {
    if (enroll) await createClient().auth.mfa.unenroll({ factorId: enroll.factorId }).catch(() => {});
    setEnroll(null); setCode(""); setStage("idle");
  };

  /** Removing a factor is sensitive: Supabase requires aal2, so challenge first. */
  const removeFactor = async (factor: MfaFactor) => {
    const supabase = createClient();
    if (state?.currentLevel !== "aal2") { setChallengeFor(factor); return; }
    setBusy(factor.id);
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
      if (error) { toast.error(error.message); return; }
      toast.success("Removed");
      notifySecurity("mfa_disabled");
      await load();
    } finally { setBusy(null); }
  };

  const completeChallenge = async () => {
    if (!challengeFor) return;
    setBusy("challenge");
    try {
      const supabase = createClient();
      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId: challengeFor.id });
      if (chErr || !ch) { toast.error("Couldn't start the check"); return; }
      const { error } = await supabase.auth.mfa.verify({ factorId: challengeFor.id, challengeId: ch.id, code: challengeCode.trim() });
      if (error) { toast.error("That code didn't match."); return; }
      setChallengeFor(null); setChallengeCode("");
      await load();
      toast.success("Verified — try again now");
    } finally { setBusy(null); }
  };

  const regenerate = async () => {
    setBusy("codes");
    try {
      const r = await fetch("/api/account/mfa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "recovery.regenerate" }) });
      const j = (await r.json().catch(() => null)) as { codes?: string[]; error?: string } | null;
      if (!r.ok) { toast.error(j?.error === "step_up_required" ? "Enter a code from your authenticator first" : "Couldn't make new codes"); return; }
      setCodes(j?.codes ?? null); setStage("codes");
      await load();
    } finally { setBusy(null); }
  };

  if (!state) return null;
  const verified = state.factors.filter((f) => f.status === "verified");

  return (
    <div className="account-card">
      <div className="twofa__head">
        <h2>Two-factor authentication</h2>
        {state.enabled ? <Badge variant="success">On</Badge> : state.policy === "required" ? <Badge variant="error">Required</Badge> : <Badge variant="warning">Off</Badge>}
      </div>

      {state.policy === "required" && !state.enabled && (
        <Alert variant="warning" title="Required for staff accounts">
          Your account can reach platform tools and other people&apos;s data. Turn on two-factor authentication to keep using them.
        </Alert>
      )}

      <p className="account-tab__intro">
        A second step at sign-in, so a stolen password isn&apos;t enough on its own. We recommend an authenticator app: it works offline and can&apos;t be intercepted like a text.
        {state.phoneAvailable ? " Text-message codes are also available." : ""}
      </p>

      {verified.length > 0 && (
        <ul className="twofa__factors">
          {verified.map((f) => (
            <li key={f.id} className="twofa__factor">
              <span>
                <span className="twofa__factor-name">{f.type === "totp" ? "Authenticator app" : f.type === "phone" ? "Text message" : "Security key"}</span>
                <span className="twofa__factor-meta">{f.friendlyName ?? "Added"} · {new Date(f.createdAt).toLocaleDateString()}</span>
              </span>
              <Button size="small" variant="ghost" onClick={() => void removeFactor(f)} disabled={busy === f.id}>Remove</Button>
            </li>
          ))}
        </ul>
      )}

      {state.enabled && (
        <p className="twofa__codes-note">
          {state.recoveryCodesRemaining} recovery code{state.recoveryCodesRemaining === 1 ? "" : "s"} left.{" "}
          <button type="button" className="events-browser__clear" onClick={() => void regenerate()} disabled={busy === "codes"}>Generate new codes</button>
        </p>
      )}

      {!state.enabled && (
        <Button variant="primary" onClick={() => void startEnroll()} disabled={busy === "enroll"}>
          {busy === "enroll" ? "Starting…" : "Set up authenticator app"}
        </Button>
      )}
      {state.enabled && verified.length < 2 && (
        <Button variant="secondary" size="small" onClick={() => void startEnroll()} disabled={busy === "enroll"}>Add another app</Button>
      )}

      {/* Enrolment */}
      <Modal isOpen={stage === "enrolling"} onClose={() => void cancelEnroll()} title="Set up your authenticator" size="small"
        primaryAction={{ label: busy === "verify" ? "Verifying…" : "Verify and turn on", onClick: () => { if (busy !== "verify") void finishEnroll(); } }}
        secondaryAction={{ label: "Cancel", onClick: () => void cancelEnroll() }}>
        {enroll && (
          <div className="twofa__enroll">
            <p>Scan this with Google Authenticator, 1Password, Authy or any TOTP app, then enter the 6-digit code it shows.</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={enroll.qr} alt="Two-factor setup QR code" className="twofa__qr" width={200} height={200} />
            <details>
              <summary>Can&apos;t scan it?</summary>
              <code className="twofa__secret">{enroll.secret}</code>
            </details>
            <Input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="6-digit code" inputMode="numeric" autoComplete="one-time-code" fullWidth />
          </div>
        )}
      </Modal>

      {/* Recovery codes, shown once */}
      <Modal isOpen={stage === "codes"} onClose={() => { setStage("idle"); setCodes(null); }} title="Save your recovery codes" size="small"
        primaryAction={{ label: "I've saved them", onClick: () => { setStage("idle"); setCodes(null); } }}>
        <p>Each code works once if you lose your device. Keep them somewhere safe — we can&apos;t show them again.</p>
        {codes && (
          <>
            <ul className="twofa__codes">{codes.map((c) => <li key={c}><code>{c}</code></li>)}</ul>
            <Button size="small" variant="secondary" onClick={() => { void navigator.clipboard.writeText(codes.join("\n")); toast.success("Copied"); }}>Copy all</Button>
          </>
        )}
      </Modal>

      {/* Step-up when a sensitive change needs a fresh factor check */}
      <Modal isOpen={!!challengeFor} onClose={() => { setChallengeFor(null); setChallengeCode(""); }} title="Confirm it's you" size="small"
        primaryAction={{ label: busy === "challenge" ? "Checking…" : "Confirm", onClick: () => { if (busy !== "challenge") void completeChallenge(); } }}
        secondaryAction={{ label: "Cancel", onClick: () => { setChallengeFor(null); setChallengeCode(""); } }}>
        <p>Enter the current code from your authenticator app.</p>
        <Input value={challengeCode} onChange={(e) => setChallengeCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="6-digit code" inputMode="numeric" autoComplete="one-time-code" fullWidth />
      </Modal>
    </div>
  );
}
