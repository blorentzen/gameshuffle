"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Alert, Button, Input } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import { useAuth } from "@/components/auth/AuthProvider";

/**
 * Claiming a guest entry (spec F). Rendered by /claim/[token].
 *
 * Nothing links without an explicit "Link it". The server allows it when the
 * signed-in account's verified email matches the address the entry was saved
 * under, or after a one-time code sent to that address.
 */

type Peek =
  | { kind: "loading" }
  | { kind: "invalid" }
  | { kind: "gone"; state: "expired" | "revoked" }
  | { kind: "claimed"; mine: boolean }
  | { kind: "open"; displayName: string; maskedEmail: string | null; canClaim: boolean; canUseCode: boolean; reason: string | null };

const ERR: Record<string, string> = {
  already_claimed: "It was linked to another account.",
  code_wrong: "That code isn't right. Check the email and try again.",
  code_expired: "That code has expired. Send a new one.",
  code_locked: "Too many wrong tries. Send a new code.",
  expired: "This claim link has expired. Ask the organizer for a new one.",
  revoked: "The organizer withdrew this claim link.",
};

export function ClaimFlow({ tournamentId, token, tournamentHref }: { tournamentId: string; token: string; tournamentHref: string }) {
  const { user } = useAuth();
  const toast = useToast();
  const [peek, setPeek] = useState<Peek>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [codeSentTo, setCodeSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [linked, setLinked] = useState(false);
  const selfHref = `/claim/${encodeURIComponent(token)}`;

  const load = useCallback(async () => {
    const r = await fetch(`/api/tournament/${tournamentId}/claim?token=${encodeURIComponent(token)}`, { cache: "no-store" }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    if (!r?.ok || !j.ok) return setPeek({ kind: "invalid" });
    if (j.claimed) return setPeek({ kind: "claimed", mine: !!j.mine });
    if (j.state === "expired" || j.state === "revoked") return setPeek({ kind: "gone", state: j.state });
    setPeek({ kind: "open", displayName: j.displayName, maskedEmail: j.maskedEmail ?? null, canClaim: !!j.canClaim, canUseCode: !!j.canUseCode, reason: j.reason ?? null });
  }, [tournamentId, token]);

  // Re-check when sign-in state changes, so returning from login updates the prompt.
  useEffect(() => { void Promise.resolve().then(load); }, [load, user?.id]);

  const post = async (body: Record<string, unknown>) => {
    setBusy(true);
    const r = await fetch(`/api/tournament/${tournamentId}/claim`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, ...body }),
    }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    return { ok: !!r?.ok, j };
  };

  const link = async (withCode?: string) => {
    const { ok, j } = await post(withCode ? { code: withCode } : {});
    if (ok) { setLinked(true); toast.success("Entry linked to your account"); }
    else toast.error(ERR[j.error as string] ?? "Couldn't link that entry. Please try again.");
  };
  const sendCode = async () => {
    const { ok, j } = await post({ action: "send_code" });
    if (ok) { setCodeSentTo(j.sentTo ?? "that address"); toast.success(`Code sent to ${j.sentTo ?? "that address"}`); }
    else toast.error(j.error === "rate_limited" ? "Too many codes this hour. Try again later."
      : j.error === "unavailable" ? "Codes aren't switched on yet. Sign in with the address shown instead."
      : "Couldn't send a code. Please try again.");
  };

  if (linked) {
    return (
      <Alert variant="success" title="Linked">
        <p className="claim-flow__p">It&apos;s on your account now, with its original date and results.</p>
        <Link href={tournamentHref} style={{ textDecoration: "none" }}><Button variant="primary" size="small">View the tournament</Button></Link>
      </Alert>
    );
  }
  if (peek.kind === "loading") return <p className="claim-flow__p">Checking this link…</p>;
  if (peek.kind === "invalid") return <Alert variant="error" title="This link doesn't work">It may have been mistyped, or it belongs to a different event.</Alert>;
  if (peek.kind === "gone") {
    return (
      <Alert variant="warning" title={peek.state === "expired" ? "This link has expired" : "This link was withdrawn"}>
        {peek.state === "expired" ? "Claim links expire after a while. Ask the organizer to send you a new one." : "The organizer withdrew it. Ask them if you think that's a mistake."}
      </Alert>
    );
  }
  if (peek.kind === "claimed") {
    return peek.mine
      ? <Alert variant="success" title="Already yours">This entry is already on your account.</Alert>
      : <Alert variant="warning" title="Already claimed">This entry has been linked to an account. If that wasn&apos;t you, ask the organizer.</Alert>;
  }

  const p = peek;
  if (p.canClaim) {
    return (
      <Alert variant="info" title="Is this your entry?">
        <p className="claim-flow__p">
          {p.maskedEmail
            ? <><strong>{p.displayName}</strong> was saved as a guest under {p.maskedEmail}. Link it to keep the results.</>
            : <>The organizer sent you this link for <strong>{p.displayName}</strong>. Link it to keep the results.</>}
        </p>
        <div className="claim-flow__row">
          <Button variant="primary" size="small" onClick={() => link()} disabled={busy}>{busy ? "Linking…" : "Link it"}</Button>
          <Link href={tournamentHref} style={{ textDecoration: "none" }}><Button variant="ghost" size="small">Not me</Button></Link>
        </div>
      </Alert>
    );
  }
  if (p.reason === "signed_out") {
    return (
      <Alert variant="info" title="Keep your results">
        <p className="claim-flow__p"><strong>{p.displayName}</strong> was saved as a guest. Sign in, or create a free account, to link it{p.maskedEmail ? <>. Using {p.maskedEmail} links it in one step</> : null}.</p>
        <div className="claim-flow__row">
          <Link href={`/signup?redirect=${encodeURIComponent(selfHref)}`} style={{ textDecoration: "none" }}><Button variant="primary" size="small">Create a free account</Button></Link>
          <Link href={`/login?redirect=${encodeURIComponent(selfHref)}`} style={{ textDecoration: "none" }}><Button variant="secondary" size="small">Sign in</Button></Link>
        </div>
      </Alert>
    );
  }
  if (p.reason === "email_unverified") {
    return <Alert variant="warning" title="Confirm your email first">Confirm the address on your account, then come back to this link to finish.</Alert>;
  }
  // Signed in with a different address (or a phone-only claim): the code path.
  return (
    <Alert variant="warning" title="Prove it's yours">
      <p className="claim-flow__p">
        <strong>{p.displayName}</strong> was saved under {p.maskedEmail ?? "a different contact"}, not the address on this account.
        {p.canUseCode ? " We'll send a 6-digit code there." : " Sign in with that address to link it."}
      </p>
      {p.canUseCode && (codeSentTo ? (
        <div className="claim-flow__row claim-flow__row--end">
          <Input
            floatingLabel={`Code sent to ${codeSentTo}`}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          />
          <Button variant="primary" size="small" onClick={() => link(code)} disabled={busy || code.length !== 6}>{busy ? "Linking…" : "Link it"}</Button>
          <Button variant="ghost" size="small" onClick={sendCode} disabled={busy}>Send another</Button>
        </div>
      ) : (
        <div className="claim-flow__row">
          <Button variant="primary" size="small" onClick={sendCode} disabled={busy}>Send a code</Button>
        </div>
      ))}
    </Alert>
  );
}
