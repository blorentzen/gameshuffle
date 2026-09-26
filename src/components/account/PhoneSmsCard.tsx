"use client";

import Link from "next/link";

import { useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button, Input, Switch } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import type { SmsCategory } from "@/lib/sms/consent";

/**
 * Phone number + text-message preferences (Account → Security).
 *
 * Verify once with a code, then choose which kinds of texts you want. Consent
 * is per category and every change is logged, because that is what carriers and
 * the TCPA expect. US numbers only for now.
 */

interface PhonePayload {
  e164: string | null;
  verified: boolean;
  lineType: string | null;
  country: string;
  consent: Record<SmsCategory, boolean>;
  available: boolean;
  allowance: { planId: string; allowance: number; used: number; remaining: number | null };
  categories: { id: SmsCategory; label: string; helper: string; optional: boolean }[];
}

const ERROR_COPY: Record<string, string> = {
  invalid_number: "That doesn't look like a US phone number.",
  region_not_supported: "We can only text US numbers right now.",
  landline: "That's a landline — it can't receive texts.",
  number_in_use: "That number is already on another GameShuffle account.",
  not_configured: "Texting isn't switched on yet.",
  bad_code: "That code didn't match. Try again.",
  no_pending_number: "Add your number first.",
};

export function PhoneSmsCard() {
  const toast = useToast();
  const [data, setData] = useState<PhonePayload | null>(null);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"idle" | "code">("idle");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/account/phone", { cache: "no-store" });
    if (r.ok) setData((await r.json()) as PhonePayload);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const post = async (body: Record<string, unknown>) => {
    const r = await fetch("/api/account/phone", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (!r.ok) throw new Error((j.error as string) ?? "failed");
    return j;
  };

  const start = async () => {
    setBusy("start");
    try {
      await post({ action: "start", phone });
      setStage("code");
      toast.success("Code sent");
    } catch (e) {
      toast.error(ERROR_COPY[(e as Error).message] ?? "Couldn't send the code");
    } finally { setBusy(null); }
  };

  const check = async () => {
    setBusy("check");
    try {
      await post({ action: "check", code });
      setStage("idle"); setCode(""); setPhone("");
      toast.success("Number verified");
      await load();
    } catch (e) {
      toast.error(ERROR_COPY[(e as Error).message] ?? "Couldn't verify that code");
    } finally { setBusy(null); }
  };

  const toggle = async (category: SmsCategory, optedIn: boolean) => {
    setBusy(category);
    try {
      const j = await post({ action: "consent", category, optedIn });
      setData((d) => (d ? { ...d, consent: (j.consent as PhonePayload["consent"]) ?? d.consent } : d));
    } catch {
      toast.error("Couldn't save that preference");
    } finally { setBusy(null); }
  };

  const remove = async () => {
    setBusy("remove");
    try {
      await fetch("/api/account/phone", { method: "DELETE" });
      toast.success("Number removed");
      await load();
    } finally { setBusy(null); }
  };

  if (!data) return null;

  return (
    <div className="account-card">
      <h2>Text messages</h2>
      {!data.available ? (
        <p className="account-tab__intro">Text messaging isn&apos;t switched on yet. It&apos;s coming for event reminders and organizer updates.</p>
      ) : !data.verified ? (
        <>
          <p className="account-tab__intro">
            Add a US mobile number for GameShuffle event reminders and messages from organizers. We&apos;ll text a code to confirm it&apos;s yours, and you pick which texts you want next. Message frequency varies with the events you join. Message and data rates may apply. Reply STOP to opt out, HELP for help. See our <Link href="/privacy#text-messages">Privacy Policy</Link> and <Link href="/terms">Terms</Link>.
          </p>
          {stage === "idle" ? (
            <div className="phone-row">
              <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 123-4567" autoComplete="tel" fullWidth />
              <Button variant="primary" onClick={() => void start()} disabled={busy === "start" || phone.trim().length < 10}>{busy === "start" ? "Sending…" : "Send code"}</Button>
            </div>
          ) : (
            <div className="phone-row">
              <Input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))} placeholder="6-digit code" inputMode="numeric" autoComplete="one-time-code" fullWidth />
              <Button variant="primary" onClick={() => void check()} disabled={busy === "check" || code.length < 4}>{busy === "check" ? "Checking…" : "Verify"}</Button>
              <Button variant="ghost" onClick={() => { setStage("idle"); setCode(""); }}>Change number</Button>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="phone-verified">
            <div>
              <strong>{data.e164}</strong> <Badge variant="success" size="small">Verified</Badge>
              {data.lineType && <span className="phone-meta"> · {data.lineType}</span>}
            </div>
            <Button size="small" variant="ghost" onClick={() => void remove()} disabled={busy === "remove"}>Remove</Button>
          </div>

          <div className="phone-categories">
            {data.categories.map((c) => (
              <label key={c.id} className="phone-category">
                <Switch
                  checked={!!data.consent[c.id]}
                  disabled={!c.optional || busy === c.id}
                  onChange={(e) => void toggle(c.id, e.target.checked)}
                  aria-label={c.label}
                />
                <span>
                  <span className="phone-category__label">{c.label}</span>
                  <span className="phone-category__helper">{c.helper}</span>
                </span>
              </label>
            ))}
          </div>

          <p className="phone-fineprint">
            GameShuffle texts only what you tick above. Message frequency varies with the events you join. Reply STOP to any message to turn texts off, HELP for help. Message and data rates may apply. US numbers only for now. We never sell or share your number. See our <Link href="/privacy#text-messages">Privacy Policy</Link> and <Link href="/terms">Terms</Link>.
          </p>
        </>
      )}

      {data.allowance.allowance > 0 && (
        <Alert variant="info" title="Your sending allowance">
          Your plan includes {data.allowance.allowance.toLocaleString()} text segments per month for messaging your attendees. {data.allowance.used.toLocaleString()} used so far this month.
        </Alert>
      )}
    </div>
  );
}
