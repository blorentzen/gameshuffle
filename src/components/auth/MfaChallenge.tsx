"use client";

import { useEffect, useState } from "react";
import { Alert, Button, Input } from "@empac/cascadeds";
import { createClient } from "@/lib/supabase/client";

/**
 * The second step at sign-in. Shown when the password succeeded but the session
 * is still `aal1` while the account has a verified factor — i.e. Supabase is
 * waiting for the other half. A recovery code is accepted as the fallback; it
 * is consumed server-side and then removes the block for this sign-in.
 */
export function MfaChallenge({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [factorId, setFactorId] = useState<string | null>(null);
  const [factorType, setFactorType] = useState<"totp" | "phone">("totp");
  const [code, setCode] = useState("");
  const [useRecovery, setUseRecovery] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.mfa.listFactors().then(({ data }) => {
      const verified = [...(data?.totp ?? []), ...(data?.phone ?? [])].find((f) => f.status === "verified");
      if (verified) {
        setFactorId(verified.id);
        setFactorType((verified.factor_type as "totp" | "phone") ?? "totp");
      }
    }).catch(() => {});
  }, []);

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      if (useRecovery) {
        const r = await fetch("/api/account/mfa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "recovery.consume", code }) });
        if (!r.ok) { setError("That recovery code isn't valid or has already been used."); return; }
        onDone();
        return;
      }
      if (!factorId) { setError("No second factor found on this account."); return; }
      const supabase = createClient();
      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId });
      if (chErr || !ch) { setError(chErr?.message ?? "Couldn't start the check."); return; }
      const { error: vErr } = await supabase.auth.mfa.verify({ factorId, challengeId: ch.id, code: code.trim() });
      if (vErr) { setError("That code didn't match. Codes change every 30 seconds."); return; }
      onDone();
    } finally { setBusy(false); }
  };

  return (
    <div className="auth-page__form auth-mfa">
      <h2 className="auth-mfa__title">Two-step verification</h2>
      <p className="auth-mfa__subtitle">
        {useRecovery
          ? "Enter one of the recovery codes you saved."
          : factorType === "phone"
            ? "Enter the code we just texted you."
            : "Enter the current code from your authenticator app."}
      </p>

      {error && <Alert variant="error" onClose={() => setError(null)}>{error}</Alert>}

      <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="auth-mfa__form">
        <Input
          value={code}
          onChange={(e) => setCode(useRecovery ? e.target.value.toUpperCase().slice(0, 11) : e.target.value.replace(/\D/g, "").slice(0, 6))}
          placeholder={useRecovery ? "XXXXX-XXXXX" : "6-digit code"}
          inputMode={useRecovery ? "text" : "numeric"}
          autoComplete="one-time-code"
          autoFocus
          fullWidth
        />
        <Button type="submit" variant="primary" fullWidth disabled={busy || code.length < 5}>{busy ? "Checking…" : "Verify"}</Button>
      </form>

      <div className="auth-mfa__links">
        <button type="button" className="auth-mfa__link" onClick={() => { setUseRecovery((v) => !v); setCode(""); setError(null); }}>
          {useRecovery ? "Use my authenticator instead" : "Use a recovery code"}
        </button>
        <button type="button" className="auth-mfa__link" onClick={onCancel}>Sign in as someone else</button>
      </div>
    </div>
  );
}
