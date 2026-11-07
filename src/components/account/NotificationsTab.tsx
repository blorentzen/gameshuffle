"use client";

/**
 * Settings ▸ Notifications (journeys picks 2026-11-06, 8A): one row per kind of news, with the three ways it can
 * reach you side by side, On site (the bell and the Comms Center), Email and Discord (a message from the GameShuffle
 * bot), as CDS Chips that toggle. Rows sit in three short sections; account and safety notices always come through on
 * site. Texts keep their own card (per-category consent, PhoneSmsCard), and GameShuffle's own emails follow as rows
 * with only an Email chip. Each change saves at once and says so with a toast.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { Alert, Chip } from "@empac/cascadeds";
import { IconBell, IconBrandDiscord, IconMail } from "@tabler/icons-react";
import { useToast } from "@/components/toast/ToastProvider";
import { LoadingLines } from "@/components/loading/LoadingLines";
import { ArrowLink } from "@/components/ui/ArrowLink";
import { PhoneSmsCard } from "@/components/account/PhoneSmsCard";
import { NOTIFICATION_GROUPS, NOTIFICATION_SECTIONS, type NotifChannel } from "@/lib/social/notificationGroups";
import { ALL_EMAIL_CATEGORIES, EMAIL_CATEGORY_DESCRIPTIONS, EMAIL_CATEGORY_LABELS, type EmailCategory } from "@/lib/email/subscription-categories";

type Channels = Record<string, Record<NotifChannel, boolean>>;

interface Prefs {
  channels: Channels;
  email: Record<EmailCategory, boolean> | null;
  emailAddress: string | null;
  discordLinked: boolean;
  discordBlocked: string | null;
}

const WAYS: { kind: NotifChannel; label: string; how: string; icon: typeof IconBell }[] = [
  { kind: "site", label: "On site", how: "on GameShuffle", icon: IconBell },
  { kind: "email", label: "Email", how: "by email", icon: IconMail },
  { kind: "discord", label: "Discord", how: "on Discord", icon: IconBrandDiscord },
];

export function NotificationsTab({ bare = false }: { bare?: boolean } = {}) {
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

  const patch = async (key: string, body: unknown): Promise<Record<string, unknown> | null> => {
    setSaving(key);
    const r = await fetch("/api/account/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    setSaving(null);
    const j = r ? await r.json().catch(() => null) : null;
    if (!r?.ok || !j?.ok) { toast.error("Couldn't save that. Try again."); return null; }
    toast.success("Saved");
    return j as Record<string, unknown>;
  };

  const toggle = async (group: string, kind: NotifChannel) => {
    if (!prefs) return;
    const on = !prefs.channels[group]?.[kind];
    const j = await patch(`${group}:${kind}`, { channel: { group, kind, on } });
    if (j?.channels) setPrefs({ ...prefs, channels: j.channels as Channels, discordBlocked: kind === "discord" && on ? null : prefs.discordBlocked });
  };

  const toggleNews = async (category: EmailCategory) => {
    if (!prefs?.email) return;
    const on = !prefs.email[category];
    if (await patch(`news:${category}`, { email: { category, on } })) setPrefs({ ...prefs, email: { ...prefs.email, [category]: on } });
  };

  const unavailable = (kind: NotifChannel): boolean =>
    !prefs || (kind === "discord" && !prefs.discordLinked) || (kind === "email" && !prefs.emailAddress);

  return (
    <>
      {!bare && (
        <div className="account-card">
          <h2 className="account-tab__heading">Notifications</h2>
          <p className="account-tab__intro">Each kind of news can reach you on GameShuffle, by email and on Discord. Changes save as you go.</p>
        </div>
      )}
      {failed && <Alert variant="error">Couldn&apos;t load your notification settings. Refresh to try again.</Alert>}

      <section className="notif-prefs" aria-label="What reaches you, and how">
        {!prefs ? <LoadingLines lines={6} label="Loading notification settings" /> : (
          <>
            {prefs.discordBlocked ? (
              <Alert variant="warning">
                Discord didn&apos;t let the GameShuffle bot message you. It can only message people who share a server with it and allow
                messages from server members. Fix that in Discord, then turn a Discord chip off and on again.
              </Alert>
            ) : !prefs.discordLinked ? (
              <p className="notif-prefs__note">
                Discord messages come from the GameShuffle bot. <ArrowLink href="/settings/security">Link Discord first</ArrowLink>
              </p>
            ) : null}

            {NOTIFICATION_SECTIONS.map((sec) => (
              <div key={sec.id} className="notif-prefs__section">
                <h2 className="notif-prefs__title">{sec.label}</h2>
                <ul className="notif-rows">
                  {NOTIFICATION_GROUPS.filter((g) => g.section === sec.id).map((g) => (
                    <li key={g.id} className="notif-row">
                      <span className="notif-row__words"><b>{g.label}</b><small>{g.helper}</small></span>
                      <span className="notif-row__ways" role="group" aria-label={`How ${g.label.toLowerCase()} reach you`}>
                        {WAYS.map((w) => {
                          const on = !!prefs.channels[g.id]?.[w.kind];
                          const off = unavailable(w.kind);
                          return (
                            <Chip
                              key={w.kind}
                              clickable
                              selected={on && !off}
                              disabled={off || saving === `${g.id}:${w.kind}`}
                              onClick={() => void toggle(g.id, w.kind)}
                              variant={on && !off ? "primary" : "outline"}
                              icon={<w.icon size={16} stroke={1.8} aria-hidden="true" />}
                              label={w.label}
                              aria-label={`${g.label} ${w.how}`}
                            />
                          );
                        })}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <p className="notif-prefs__note">Account and safety notices always come through on site. Everything here also shows in your <Link href="/comms">Comms Center</Link> while On site is on.</p>
          </>
        )}
      </section>

      <PhoneSmsCard />

      <section className="notif-prefs" aria-labelledby="notif-news">
        <h2 id="notif-news" className="notif-prefs__title">From GameShuffle</h2>
        <p className="notif-prefs__sub">
          {prefs?.emailAddress ? <>Sent to {prefs.emailAddress}. </> : null}
          Emails about your account, billing and security always send.
        </p>
        {!prefs ? <LoadingLines lines={3} label="Loading email settings" /> : !prefs.email ? (
          <p className="notif-prefs__sub">Add an email address to your account to choose these.</p>
        ) : (
          <ul className="notif-rows">
            {ALL_EMAIL_CATEGORIES.map((c) => {
              const on = !!prefs.email?.[c];
              return (
                <li key={c} className="notif-row">
                  <span className="notif-row__words"><b>{EMAIL_CATEGORY_LABELS[c]}</b><small>{EMAIL_CATEGORY_DESCRIPTIONS[c]}</small></span>
                  <span className="notif-row__ways">
                    <Chip
                      clickable
                      selected={on}
                      disabled={saving === `news:${c}`}
                      onClick={() => void toggleNews(c)}
                      variant={on ? "primary" : "outline"}
                      icon={<IconMail size={16} stroke={1.8} aria-hidden="true" />}
                      label="Email"
                      aria-label={`${EMAIL_CATEGORY_LABELS[c]} by email`}
                    />
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
