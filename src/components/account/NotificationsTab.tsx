"use client";

/**
 * Account › Notifications: every way GameShuffle reaches you, in one place.
 *   On GameShuffle  the bell and the Comms Center, muted by group
 *                   (notificationGroups.ts); account and moderation notices
 *                   always come through
 *   Text messages   phone, verification and per-category consent (PhoneSmsCard)
 *   Email           news by category; account, billing and security emails
 *                   always send
 * Each switch saves on change and says so with a toast.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { Alert, Switch } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import { LoadingLines } from "@/components/loading/LoadingLines";
import { PhoneSmsCard } from "@/components/account/PhoneSmsCard";
import { NOTIFICATION_GROUPS } from "@/lib/social/notificationGroups";
import { ALL_EMAIL_CATEGORIES, EMAIL_CATEGORY_DESCRIPTIONS, EMAIL_CATEGORY_LABELS, type EmailCategory } from "@/lib/email/subscription-categories";

interface Prefs { muted: string[]; email: Record<EmailCategory, boolean> | null; emailAddress: string | null }

export function NotificationsTab() {
  const toast = useToast();
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/account/notifications", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: Prefs & { ok: boolean }) => (j.ok ? setPrefs(j) : setFailed(true)))
      .catch(() => setFailed(true));
  }, []);

  const patch = async (key: string, body: unknown): Promise<boolean> => {
    setSaving(key);
    const r = await fetch("/api/account/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    setSaving(null);
    if (!r?.ok) { toast.error("Couldn't save that. Try again."); return false; }
    toast.success("Saved");
    return true;
  };

  const toggleGroup = async (id: string, on: boolean) => {
    if (!prefs) return;
    const muted = on ? prefs.muted.filter((m) => m !== id) : [...prefs.muted, id];
    if (await patch(`g:${id}`, { muted })) setPrefs({ ...prefs, muted });
  };

  const toggleEmail = async (category: EmailCategory, on: boolean) => {
    if (!prefs?.email) return;
    if (await patch(`e:${category}`, { email: { category, on } })) setPrefs({ ...prefs, email: { ...prefs.email, [category]: on } });
  };

  return (
    <>
      <div className="account-card">
        <h2 className="account-tab__heading">Notifications</h2>
        <p className="account-tab__intro">Choose what reaches you on GameShuffle, by text and by email. Changes save as you go.</p>
        {failed && <Alert variant="error">Couldn&apos;t load your notification settings. Refresh to try again.</Alert>}
      </div>

      <div className="account-card notif-prefs">
        <h3 className="notif-prefs__title">On GameShuffle</h3>
        <p className="notif-prefs__sub">What shows on the bell and in your <Link href="/comms">Comms Center</Link>. Account and safety notices always come through.</p>
        {!prefs ? <LoadingLines lines={4} label="Loading notification settings" /> : (
          <div className="notif-prefs__list">
            {NOTIFICATION_GROUPS.map((g) => (
              <Switch
                key={g.id}
                checked={!prefs.muted.includes(g.id)}
                disabled={saving === `g:${g.id}`}
                onChange={(e) => void toggleGroup(g.id, e.target.checked)}
                label={g.label}
                helperText={g.helper}
              />
            ))}
          </div>
        )}
      </div>

      <PhoneSmsCard />

      <div className="account-card notif-prefs">
        <h3 className="notif-prefs__title">Email</h3>
        <p className="notif-prefs__sub">
          {prefs?.emailAddress ? <>Sent to {prefs.emailAddress}. </> : null}
          Emails about your account, billing and security always send.
        </p>
        {!prefs ? <LoadingLines lines={3} label="Loading email settings" /> : !prefs.email ? (
          <p className="notif-prefs__sub">Add an email address to your account to choose emails.</p>
        ) : (
          <div className="notif-prefs__list">
            {ALL_EMAIL_CATEGORIES.map((c) => (
              <Switch
                key={c}
                checked={!!prefs.email?.[c]}
                disabled={saving === `e:${c}`}
                onChange={(e) => void toggleEmail(c, e.target.checked)}
                label={EMAIL_CATEGORY_LABELS[c]}
                helperText={EMAIL_CATEGORY_DESCRIPTIONS[c]}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
