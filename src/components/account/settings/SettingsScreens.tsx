"use client";

/**
 * Account ▸ Settings: General · Sign-in & security · Notifications · Privacy,
 * plus Plans & billing. Switches and fields autosave (ProfileStore); only the
 * password change and deleting the account have buttons, since both need
 * checking before they happen.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Alert, Button, Input, Select, Switch } from "@empac/cascadeds";
import { IconCircleCheck } from "@tabler/icons-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { isEmailVerified } from "@/lib/auth-utils";
import { AdminField, AdminScreen, AdminSection, SaveStatus } from "@/components/account/admin/AdminKit";
import { useProfileStore } from "@/components/account/profile/ProfileStore";
import { LoadingLines } from "@/components/loading/LoadingLines";
import { ThemeToggle } from "@/components/account/ThemeToggle";
import { ConnectionsCard } from "@/components/account/ConnectionsCard";
import { TwoFactorCard } from "@/components/account/TwoFactorCard";
import { NotificationsTab } from "@/components/account/NotificationsTab";
import { BlockedUsersManager } from "@/components/account/BlockedUsersManager";
import { PlansTab } from "@/components/account/PlansTab";
import { allTimeZones, currentZoneLabel, isValidTimeZone } from "@/lib/time/format";

/** CDS Select hides its label for "", so a word stands in for an empty choice. */
const AUTO = "auto";
const NONE = "none";

/** Tell the person by text that their own account changed (best effort). */
function notifySecurity(kind: "password_changed"): void {
  void fetch("/api/account/security-alert", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind }),
  }).catch(() => {});
}

export function SettingsGeneralScreen() {
  const { user } = useAuth();
  const { loading, fields, set, status } = useProfileStore();
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  if (loading || !user) return <AdminScreen title="General"><LoadingLines label="Loading" /></AdminScreen>;
  const verified = isEmailVerified(user);
  const resend = async () => {
    await createClient().auth.resend({ type: "signup", email: user.email! });
    setCooldown(60);
  };
  const zones = allTimeZones();

  return (
    <AdminScreen title="General" intro="Your email, how GameShuffle looks for you, and your timezone." actions={<SaveStatus status={status} />}>
      <AdminSection title="Email">
        <div className="admin-form">
          <AdminField label="Email address" helper="Change it by contacting support. Sign-in links and receipts go here.">
            {(id, d) => <Input id={id} aria-describedby={d} fullWidth type="email" value={user.email || ""} disabled />}
          </AdminField>
          {verified ? (
            <p className="settings-verified"><IconCircleCheck size={16} aria-hidden /> Verified</p>
          ) : (
            <div className="settings-unverified">
              <span>Not verified yet. Some features (joining tournaments, for one) need a verified email.</span>
              <Button variant="secondary" size="small" disabled={cooldown > 0} onClick={() => void resend()}>
                {cooldown > 0 ? `Sent. Resend in ${cooldown}s` : "Send the verification email"}
              </Button>
            </div>
          )}
        </div>
      </AdminSection>

      <AdminSection title="Display" intro="Light or dark for GameShuffle's own screens. How your public pages look is on Theming.">
        <ThemeToggle bare />
      </AdminSection>

      <AdminSection title="Timezone" intro="Event times show in this zone. We set it when you sign in; leave it on automatic to see Pacific and Eastern.">
        <div className="admin-form">
          <AdminField label="Your timezone">
            {(id) => (
              <Select
                id={id}
                fullWidth
                value={fields.timezone || AUTO}
                onChange={(v) => { const s = String(v); set({ timezone: s === AUTO ? "" : s }); }}
                options={[
                  { value: AUTO, label: "Automatic (Pacific and Eastern)" },
                  ...zones.map((tz) => ({ value: tz, label: `${tz.replace(/_/g, " ")}${isValidTimeZone(tz) ? ` (${currentZoneLabel(tz)})` : ""}` })),
                ]}
              />
            )}
          </AdminField>
        </div>
      </AdminSection>

      <AdminSection title="Your live page">
        <Switch
          checked={fields.showRecapOnLivePage}
          onChange={(e) => set({ showRecapOnLivePage: e.target.checked })}
          label="Show my last stream's recap when I'm offline"
          helperText="Your /live page shows a 'last time' recap between streams. Turn off for a plainer offline page."
        />
      </AdminSection>
    </AdminScreen>
  );
}

export function SettingsSecurityScreen() {
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const change = async () => {
    setError(null);
    setDone(false);
    if (pw.length < 8) return setError("Use at least 8 characters.");
    if (!/[A-Z]/.test(pw)) return setError("Add an uppercase letter.");
    if (!/[a-z]/.test(pw)) return setError("Add a lowercase letter.");
    if (!/[0-9]/.test(pw)) return setError("Add a number.");
    if (!/[^A-Za-z0-9]/.test(pw)) return setError("Add a special character, like ! or #.");
    if (pw !== confirm) return setError("The two passwords don't match.");
    setBusy(true);
    const { error: e } = await createClient().auth.updateUser({ password: pw });
    setBusy(false);
    if (e) { setError(e.message.includes("same") ? "That's your current password. Pick a new one." : "Couldn't change your password. Try again."); return; }
    setDone(true);
    setPw("");
    setConfirm("");
    notifySecurity("password_changed");
  };

  return (
    <AdminScreen title="Sign-in & security" intro="The accounts you sign in with, your password and two-factor sign-in.">
      <ConnectionsCard />
      <AdminSection title="Password" intro="At least 8 characters, with an uppercase letter, a lowercase letter, a number and a special character.">
        <form className="admin-form" onSubmit={(e) => { e.preventDefault(); void change(); }}>
          {error && <Alert variant="error" onClose={() => setError(null)}>{error}</Alert>}
          {done && <Alert variant="success" onClose={() => setDone(false)}>Password changed.</Alert>}
          <div className="admin-form-grid">
            <AdminField label="New password">
              {(id) => <Input id={id} fullWidth type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />}
            </AdminField>
            <AdminField label="Type it again">
              {(id) => <Input id={id} fullWidth type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />}
            </AdminField>
          </div>
          <div><Button type="submit" variant="primary" loading={busy} disabled={busy || !pw || !confirm}>Change password</Button></div>
        </form>
      </AdminSection>
      <TwoFactorCard />
    </AdminScreen>
  );
}

export function SettingsNotificationsScreen() {
  return (
    <AdminScreen title="Notifications" intro="What reaches you on GameShuffle, by text and by email. Changes save as you go.">
      <NotificationsTab bare />
    </AdminScreen>
  );
}

const DELETE_REASONS = [
  { value: NONE, label: "Prefer not to say" },
  { value: "not_using", label: "Not using it enough" },
  { value: "missing_features", label: "Missing features I need" },
  { value: "too_expensive", label: "Too expensive" },
  { value: "found_alternative", label: "Found an alternative" },
  { value: "just_testing", label: "Was just testing" },
  { value: "other", label: "Other" },
];

export function SettingsPrivacyScreen() {
  const { signOut } = useAuth();
  const { loading, fields, set, status, setUsernameError } = useProfileStore();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [reason, setReason] = useState(NONE);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const remove = async () => {
    if (typed !== "DELETE") return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch("/api/account/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: reason === NONE ? null : reason }) });
      if (!res.ok) { setDeleteError("Couldn't delete your account. Try again, or contact support."); setDeleting(false); return; }
      await signOut();
    } catch { setDeleteError("Couldn't reach the server. Check your connection and try again."); setDeleting(false); }
  };

  return (
    <AdminScreen title="Privacy" intro="Who can see your profile, who you've blocked, and your data." actions={<SaveStatus status={status} />}>
      <AdminSection title="Who can see your profile">
        {loading ? <LoadingLines label="Loading" /> : (
          <>
            <Switch
              checked={fields.isPublic}
              onChange={(e) => {
                if (e.target.checked && !fields.username.trim()) { setUsernameError("Choose a username before making your profile public."); return; }
                set({ isPublic: e.target.checked });
              }}
              label="Public profile"
              helperText="Anyone can see your profile, gamertags and shared setups. Needs a username."
            />
            {fields.isPublic && !fields.username.trim() && <Alert variant="warning">Choose a username on <Link href="/account?tab=profile">About you</Link> first.</Alert>}
            <p className="admin-field__help">Who sees your gamertags is set on <Link href="/account?tab=gamertags">Gamertags &amp; socials</Link>.</p>
          </>
        )}
      </AdminSection>

      <BlockedUsersManager />

      <AdminSection title="Your data" intro="Ask for a copy of your data, a correction, or to opt out of marketing. We answer within 30 days.">
        <div><Button variant="secondary" onClick={() => { window.location.href = "/account/privacy/data-request"; }}>Make a privacy request</Button></div>
      </AdminSection>

      <AdminSection title="Delete your account" intro="Deletes your account and everything in it, and cancels any subscription. This can't be undone.">
        <p className="admin-field__help">Want a copy first? <a href="/account/privacy/data-request">Request your data</a> before deleting; we can&apos;t recover it afterwards.</p>
        {!open ? (
          <div><Button variant="danger" onClick={() => setOpen(true)}>Delete my account</Button></div>
        ) : (
          <div className="settings-delete">
            <p className="settings-delete__warn">This deletes your profile, saved setups, tournament history and everything else on your account.</p>
            {deleteError && <Alert variant="error" onClose={() => setDeleteError(null)}>{deleteError}</Alert>}
            <div className="admin-form-grid">
              <AdminField label="Mind sharing why? (optional)">
                {(id) => <Select id={id} fullWidth value={reason} onChange={(v) => setReason(String(v))} options={DELETE_REASONS} />}
              </AdminField>
              <AdminField label="Type DELETE to confirm">
                {(id) => <Input id={id} fullWidth value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="DELETE" autoComplete="off" />}
              </AdminField>
            </div>
            <div className="settings-delete__actions">
              <Button variant="danger" loading={deleting} disabled={typed !== "DELETE" || deleting} onClick={() => void remove()}>Delete my account for good</Button>
              <Button variant="ghost" onClick={() => { setOpen(false); setTyped(""); setDeleteError(null); setReason(NONE); }}>Keep my account</Button>
            </div>
          </div>
        )}
      </AdminSection>
    </AdminScreen>
  );
}

export function PlansScreen() {
  return (
    <AdminScreen title="Plans & billing" intro="Your plan, what each plan includes, and billing.">
      <PlansTab />
    </AdminScreen>
  );
}
