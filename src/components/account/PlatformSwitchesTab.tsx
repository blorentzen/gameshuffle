"use client";

/**
 * Platform admin ▸ Switches: every platform switch the code reads (from
 * src/lib/platform/switches.ts), whether or not it has a database row yet,
 * grouped by what it affects. Each says what On and Off mean and who changed
 * it last. Admins flip them, after a confirmation; staff can see them.
 * Changes reach the site within about 30 seconds (the flags are cached).
 */

import { useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button, Switch } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import { LoadingLines } from "@/components/loading/LoadingLines";
import { SWITCHES, SWITCH_GROUPS } from "@/lib/platform/switches";
import { AdminHeader } from "@/components/account/admin/AdminKit";

interface FlagRow { key: string; enabled: boolean; updated_at: string; updated_by?: string | null }

const when = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles" });

export function PlatformSwitchesTab() {
  const toast = useToast();
  const confirm = useConfirm();
  const [rows, setRows] = useState<Map<string, FlagRow> | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [canEdit, setCanEdit] = useState(false);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const d = await fetch("/api/admin/platform-flags", { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    if (!d?.ok) { setError(true); return; }
    setRows(new Map((d.flags as FlagRow[]).map((f) => [f.key, f])));
    setNames(d.names ?? {});
    setCanEdit(!!d.canEdit);
  }, []);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const flip = async (key: string, next: boolean) => {
    const def = SWITCHES.find((s) => s.key === key)!;
    const ok = await confirm({ title: `Turn ${next ? "on" : "off"} "${def.name}"?`, body: next ? def.turnOn : def.turnOff, confirmLabel: next ? "Turn on" : "Turn off" });
    if (!ok) return;
    setBusy(key);
    const r = await fetch("/api/admin/platform-flags", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, enabled: next }) }).then((res) => res.json()).catch(() => null);
    setBusy(null);
    if (!r?.ok) { toast.error(r?.error === "admins_only" ? "Only admins can change switches." : "That didn't save. Try again."); return; }
    toast.success(`${def.name}: ${next ? "on" : "off"}`);
    void load();
  };

  return (
    <div className="account-card admin-screen switches">
      <AdminHeader title="Switches" intro="Turn platform features on or off without a deploy. Changes reach the site within about 30 seconds." />
      {!canEdit && rows && <Alert variant="info">Only admins can change switches. You can see where each one stands.</Alert>}
      {error ? <Alert variant="error">Couldn&apos;t load the switches. Try again in a minute.</Alert> : !rows ? <LoadingLines label="Loading" /> : (
        SWITCH_GROUPS.map((group) => (
          <section key={group} className="switches__group" aria-labelledby={`sw-${group}`}>
            <h2 id={`sw-${group}`} className="switches__h">{group}</h2>
            <ul className="switches__list">
              {SWITCHES.filter((s) => s.group === group).map((s) => {
                const row = rows.get(s.key);
                const on = row ? row.enabled : !!s.defaultOn;
                const by = row?.updated_by ? names[row.updated_by] : null;
                return (
                  <li key={s.key} className="switches__row">
                    <div className="switches__text">
                      <div className="switches__name">{s.name} <Badge variant={on ? "success" : "default"} size="small">{on ? "On" : "Off"}</Badge></div>
                      <p className="switches__desc">{s.description}</p>
                      <p className="switches__meta">{row ? `Changed ${when(row.updated_at)}${by ? ` by ${by}` : ""}` : `Never changed (${s.defaultOn ? "on" : "off"} by default)`} · <span className="switches__key">{s.key}</span></p>
                      {s.key === "organizer_billing_enabled" && <CircuitNoticePanel on={on} />}
                    </div>
                    <Switch aria-label={s.name} checked={on} disabled={!canEdit || busy === s.key} onChange={(e) => void flip(s.key, e.target.checked)} />
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
      <p className="switches__code">Set in code (changes need a deploy): Guides, and the hidden-game switches in <span className="switches__key">src/lib/games-visibility.ts</span>.</p>
    </div>
  );
}

interface NoticeStatus { launched: boolean; launchLabel: string | null; graceLabel: string | null; noticeSentAt: string | null; recipients: number; sent: number; canSend: boolean }

/**
 * The Circuit launch email (Terms §3.4), under the Circuit billing switch:
 * how many organizers used Circuit before the launch, how many have the
 * email, and a button to email the rest once the switch is on.
 */
function CircuitNoticePanel({ on }: { on: boolean }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [st, setSt] = useState<NoticeStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const d = await fetch("/api/admin/circuit-notice", { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    if (d?.ok) setSt(d as NoticeStatus);
  }, []);
  useEffect(() => { void Promise.resolve().then(load); }, [load, on]);
  if (!st) return null;

  const left = st.recipients - st.sent;
  const send = async () => {
    const ok = await confirm({
      title: `Email ${left} organizer${left === 1 ? "" : "s"}?`,
      body: `They each get one email: their earlier tournaments keep Circuit for good, and new ones stay free until ${st.graceLabel}. Then the plans and prices.`,
      confirmLabel: "Send the email",
    });
    if (!ok) return;
    setBusy(true);
    const r = await fetch("/api/admin/circuit-notice", { method: "POST" }).then((res) => res.json()).catch(() => null);
    setBusy(false);
    if (!r?.ok) { toast.error(r?.error === "not_launched" ? "Turn Circuit billing on first, so the email can name the dates." : r?.error === "admins_only" ? "Only admins can send it." : "That didn't send. Try again."); return; }
    if (r.failed) toast.warning(`Sent ${r.sent}. ${r.failed} didn't go out (no email on the account or the send failed); press it again to retry.`);
    else toast.success(`Sent to ${r.sent} organizer${r.sent === 1 ? "" : "s"}.`);
    void load();
  };

  return (
    <div className="switches__notice">
      <p className="switches__notice-title">Launch email</p>
      {!st.launched ? (
        <p className="switches__desc">
          {st.recipients
            ? `${st.recipients} organizer${st.recipients === 1 ? "" : "s"} ran tournaments in the preview. The Terms promise them an email at least 30 days before any charge, so once this is on, send it here. Their Circuit stays free for 30 days from the email.`
            : "Nobody has run a tournament yet, so there's nobody to email."}
        </p>
      ) : (
        <>
          <p className="switches__desc">
            Launched {st.launchLabel}. {st.sent} of {st.recipients} earlier organizer{st.recipients === 1 ? " has" : "s have"} the email.
            {st.noticeSentAt ? ` Their free Circuit runs until ${st.graceLabel}.` : ` Their free Circuit runs 30 days from when you send it (${st.graceLabel} if you send it today).`}
          </p>
          {left > 0 && (
            st.canSend
              ? <Button size="small" variant={st.sent ? "secondary" : "primary"} loading={busy} disabled={busy} onClick={() => void send()}>{st.sent ? `Email the other ${left}` : `Email ${left} organizer${left === 1 ? "" : "s"}`}</Button>
              : <p className="switches__meta">Only admins can send it.</p>
          )}
        </>
      )}
    </div>
  );
}
