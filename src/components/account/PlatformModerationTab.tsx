"use client";

/**
 * Platform admin ▸ People ▸ Moderation (staff): the review queue for reports
 * about accounts and what they post, plus appeals.
 *
 * Each report shows who was reported, why, the reporter's words and the
 * account's standing, with Dismiss, Warn and Suspend up front and the rarer
 * steps (clear the name, bio or banner, limit features, ban) in a "more" menu.
 * Everything that changes an account asks first. Ban and appeals are admin
 * only, here and on the server. Backed by /api/admin/moderation; every action
 * is written to the moderation log there.
 */

import { useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button, Checkbox, EmptyState, Modal, StatCard } from "@empac/cascadeds";
import { IconAlertTriangle, IconExternalLink, IconFlag, IconGavel, IconRefresh, IconShieldCheck } from "@tabler/icons-react";
import { useToast } from "@/components/toast/ToastProvider";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import { LoadingLines } from "@/components/loading/LoadingLines";
import { reportReasonLabel } from "@/lib/moderation/reasons";
import { AdminHeader, AdminPanel, AdminRowMenu, AdminSection, AdminStats } from "@/components/account/admin/AdminKit";

// What the toast says after each action.
const ACTION_TOAST: Record<string, string> = {
  dismiss: "Report dismissed",
  clear_display_name: "Display name cleared",
  clear_bio: "Bio cleared",
  clear_banner: "Banner removed",
  warn: "Warning given",
  restrict: "Limits applied",
  suspend: "Account suspended for 7 days",
  ban: "Account banned",
  unban: "Account restored",
};

// Plain words for the server's refusals.
const ERRORS: Record<string, string> = {
  admin_required: "Only an admin can do that.",
  cannot_moderate_staff: "Only an admin can take action on a staff or admin account.",
  cannot_self_moderate: "You can't take action on your own account.",
  no_such_user: "That account doesn't exist any more. Refresh the list.",
  no_such_appeal: "That appeal has already been dealt with. Refresh the list.",
  no_restrictions: "Untick at least one thing to limit.",
};
const errorText = (code?: string) => ERRORS[code ?? ""] ?? "That didn't go through. Try again.";

// Features the "Limit what they can do" window can switch off (ticked = still allowed).
const CAPS = [
  ["can_message", "Send messages"],
  ["can_chat", "Talk in chat"],
  ["can_submit_ideas", "Submit ideas"],
  ["can_create_sessions", "Start sessions"],
  ["can_join_public_sessions", "Join public sessions"],
  ["is_discoverable", "Show up in search and suggestions"],
] as const;

const TARGET_LABEL: Record<string, string> = {
  idea: "An idea",
  chat_message: "A chat message",
  post: "A post",
  comment: "A comment",
};
const STANDING_LABEL: Record<string, string> = {
  warned: "Warned",
  suspended: "Suspended",
  banned: "Banned",
  restricted: "Limited",
};

interface ReviewReport {
  id: string;
  reason: string;
  severity: "standard" | "elevated";
  details: string | null;
  status: string;
  createdAt: string;
  targetType: string;
  targetId: string;
  targetOwnerId: string | null;
  target: {
    username: string | null;
    displayName: string | null;
    moderationStatus: string | null;
    moderationUntil: string | null;
  } | null;
  targetStanding: { state: string; strikeCount: number } | null;
}

/** Limited, suspended or banned right now (from /api/admin/moderation). */
interface RestrictedAccount {
  userId: string;
  username: string | null;
  displayName: string | null;
  state: "restricted" | "suspended" | "banned";
  restrictions: string[];
  until: string | null;
  strikeCount: number;
}

interface ReviewAppeal {
  id: string;
  userId: string;
  message: string;
  createdAt: string;
  user: { username: string | null; displayName: string | null; moderationStatus: string | null } | null;
}

const PAGE = 25;
const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" });
const dayOnly = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Los_Angeles" });

/** The account's standing as badges: status (with an end date) and strikes. */
function Standing({ status, until, strikes, now }: { status: string | null | undefined; until?: string | null; strikes?: number; now: number }) {
  const label = status && status !== "ok" ? (STANDING_LABEL[status] ?? status) : null;
  // A suspension that has run out still reads "suspended" until something else changes it.
  const text = until && status === "suspended"
    ? (new Date(until).getTime() > now ? `${label} until ${dayOnly(until)}` : `Suspension ended ${dayOnly(until)}`)
    : label;
  return (
    <>
      {label && <Badge variant={status === "banned" ? "error" : "warning"} size="small">{text}</Badge>}
      {strikes != null && strikes > 0 && <Badge variant="warning" size="small">{strikes} {strikes === 1 ? "strike" : "strikes"}</Badge>}
    </>
  );
}

function ProfileLink({ username }: { username: string | null | undefined }) {
  if (!username) return null;
  return (
    <a href={`/u/${username}`} target="_blank" rel="noreferrer" className="admin-people-link">
      @{username}
      <IconExternalLink size={14} aria-hidden />
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

export function PlatformModerationTab() {
  const [reports, setReports] = useState<ReviewReport[] | null>(null);
  const [appeals, setAppeals] = useState<ReviewAppeal[]>([]);
  const [restricted, setRestricted] = useState<RestrictedAccount[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  // When the list was loaded: judges whether a suspension has run out.
  const [loadedAt, setLoadedAt] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [shown, setShown] = useState(PAGE);
  // "Limit what they can do" window: the report + which features stay allowed.
  const [restrictFor, setRestrictFor] = useState<ReviewReport | null>(null);
  const [allow, setAllow] = useState<Record<string, boolean>>({});
  const toast = useToast();
  const confirm = useConfirm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/moderation", { cache: "no-store" });
      if (!res.ok) { setLoadError(true); return; }
      const body = (await res.json()) as { reports: ReviewReport[]; appeals: ReviewAppeal[]; restricted?: RestrictedAccount[]; isAdmin: boolean };
      setReports(body.reports ?? []);
      setAppeals(body.appeals ?? []);
      setRestricted(body.restricted ?? []);
      setIsAdmin(body.isAdmin);
      setLoadedAt(Date.now());
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  async function send(id: string, body: Record<string, unknown>, done: string) {
    setBusy(id);
    try {
      const res = await fetch("/api/admin/moderation", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).catch(() => null);
      if (!res?.ok) {
        const b = (await res?.json().catch(() => ({}))) as { error?: string } | undefined;
        toast.error(errorText(b?.error));
        return;
      }
      toast.success(done);
      await load();
    } finally {
      setBusy(null);
    }
  }

  /** Act on a report. Account actions target the content OWNER (author or
   *  sender), which equals targetId for profile reports. */
  async function act(report: ReviewReport, action: string, ask?: { title: string; body: string; confirmLabel: string }, extra?: Record<string, unknown>) {
    if (ask && !(await confirm(ask))) return;
    await send(report.id, { action, targetUserId: report.targetOwnerId ?? report.targetId, reportId: report.id, ...extra }, ACTION_TOAST[action] ?? "Done");
  }

  function openRestrict(report: ReviewReport) {
    setAllow(Object.fromEntries(CAPS.map(([k]) => [k, true])));
    setRestrictFor(report);
  }
  async function submitRestrict() {
    if (!restrictFor) return;
    // Unticked features become restrictions ({cap: false}).
    const restrictions: Record<string, boolean> = {};
    for (const [k] of CAPS) if (allow[k] === false) restrictions[k] = false;
    const report = restrictFor;
    setRestrictFor(null);
    await act(report, "restrict", undefined, { restrictions });
  }

  /** Lift a limit, suspension or ban early (admins; the API refuses anyone else). */
  async function lift(account: RestrictedAccount) {
    const name = account.displayName || account.username || "this account";
    const what = account.state === "banned" ? "ban" : account.state === "suspended" ? "suspension" : "limits";
    const ok = await confirm({ title: `Lift ${name}'s ${what}?`, body: "They can use GameShuffle normally again straight away. Their strikes stay on record.", confirmLabel: `Lift ${what}`, danger: false });
    if (!ok) return;
    await send(account.userId, { action: "unban", targetUserId: account.userId }, account.state === "banned" ? "Ban lifted" : account.state === "suspended" ? "Suspension lifted" : "Limits lifted");
  }

  async function actAppeal(appeal: ReviewAppeal, action: "grant_appeal" | "deny_appeal", name: string) {
    const ok = await confirm(action === "grant_appeal"
      ? { title: `Grant ${name}'s appeal?`, body: "This lifts their suspension or ban straight away.", confirmLabel: "Grant appeal", danger: false }
      : { title: `Deny ${name}'s appeal?`, body: "Their suspension or ban stays as it is, and the appeal is closed.", confirmLabel: "Deny appeal" });
    if (!ok) return;
    await send(appeal.id, { action, appealId: appeal.id }, action === "grant_appeal" ? "Appeal granted" : "Appeal denied");
  }

  const header = (
    <AdminHeader
      title="Moderation"
      intro="Reports about accounts and what they post, the most serious first, then oldest first. Every action is logged."
      actions={<Button variant="secondary" size="small" iconBefore={IconRefresh} loading={loading} disabled={loading} aria-label="Refresh" onClick={() => void load()}>Refresh</Button>}
    />
  );

  if (reports === null) {
    return (
      <div className="account-card admin-screen">
        {header}
        {loadError
          ? <Alert variant="error">Couldn&apos;t load the moderation queue. Try Refresh in a moment.</Alert>
          : <LoadingLines label="Loading the moderation queue" />}
      </div>
    );
  }

  const elevated = reports.filter((r) => r.severity === "elevated").length;
  const more = Math.min(PAGE, reports.length - shown);
  const allowedCount = CAPS.filter(([k]) => allow[k] !== false).length;

  return (
    <div className="account-card admin-screen">
      {header}
      {loadError && <Alert variant="error">Couldn&apos;t refresh the queue. This is the list from before; try Refresh again.</Alert>}

      <AdminStats label="Moderation queue" columns={3}>
        <StatCard label="Open reports" value={reports.length.toLocaleString()} icon={<IconFlag size={20} />} variant={reports.length > 0 ? "accent" : "default"} />
        <StatCard label="Serious reports" value={elevated.toLocaleString()} source="Sexual content or self-harm" icon={<IconAlertTriangle size={20} />} />
        <StatCard label="Appeals waiting" value={appeals.length.toLocaleString()} source="Admins decide these" icon={<IconGavel size={20} />} />
      </AdminStats>

      <AdminSection
        title="Reports"
        intro={<>Warnings, limits, suspensions and bans each add a strike to the account. A suspension ends on its own after 7 days; {isAdmin ? "a ban lasts until an appeal is granted." : "only admins can ban."}</>}
      >
        {reports.length === 0 ? (
          <EmptyState variant="bordered" icon={<IconShieldCheck size={28} />} title="No open reports" description="New reports show here as soon as someone sends one. Nothing to review right now." />
        ) : (
          <>
            <ul className="admin-people-list" aria-label="Open reports">
              {reports.slice(0, shown).map((r) => {
                const name = r.target?.displayName || r.target?.username || "Unknown account";
                const disabled = busy === r.id;
                const what = TARGET_LABEL[r.targetType];
                return (
                  <li key={r.id}>
                    <AdminPanel className="admin-people-item">
                      <div className="admin-people-head">
                        <h3 className="admin-people-name">{name}</h3>
                        <ProfileLink username={r.target?.username} />
                        {r.severity === "elevated" && <Badge variant="error" size="small">Serious</Badge>}
                        {what && <Badge variant="info" size="small">{`${what} was reported`}</Badge>}
                        <Standing status={r.target?.moderationStatus} until={r.target?.moderationUntil} strikes={r.targetStanding?.strikeCount} now={loadedAt} />
                      </div>
                      <p className="admin-people-reason">{reportReasonLabel(r.reason)}</p>
                      {r.details && <blockquote className="admin-people-quote">{r.details}</blockquote>}
                      <p className="admin-people-time">Reported {when(r.createdAt)} Pacific</p>
                      <div className="admin-people-actions">
                        <Button size="small" variant="secondary" disabled={disabled} onClick={() => void act(r, "dismiss")} aria-label={`Dismiss the report about ${name}`}>Dismiss</Button>
                        <Button size="small" variant="secondary" disabled={disabled} onClick={() => void act(r, "warn", {
                          title: `Warn ${name}?`, body: "Their account is marked as warned, it adds a strike, and this report is closed.", confirmLabel: "Warn",
                        })} aria-label={`Warn ${name}`}>Warn</Button>
                        <Button size="small" variant="secondary" disabled={disabled} onClick={() => void act(r, "suspend", {
                          title: `Suspend ${name} for 7 days?`, body: "Their profile is hidden and they can't take part until the suspension ends on its own. It adds a strike.", confirmLabel: "Suspend for 7 days",
                        }, { durationHours: 168 })} aria-label={`Suspend 7 days: ${name}`}>Suspend 7 days</Button>
                        <AdminRowMenu
                          label={`More actions for ${name}`}
                          items={[
                            { label: "Clear display name", disabled, onClick: () => void act(r, "clear_display_name", { title: `Clear ${name}'s display name?`, body: "Their profile shows their username instead. They can set a new name later. This report is closed.", confirmLabel: "Clear name" }) },
                            { label: "Clear bio", disabled, onClick: () => void act(r, "clear_bio", { title: `Clear ${name}'s bio?`, body: "The bio is deleted and can't be brought back. This report is closed.", confirmLabel: "Clear bio" }) },
                            { label: "Remove banner", disabled, onClick: () => void act(r, "clear_banner", { title: `Remove ${name}'s banner?`, body: "The picture is deleted for good. This report is closed.", confirmLabel: "Remove banner" }) },
                            { label: "Limit what they can do…", disabled, onClick: () => openRestrict(r) },
                            ...(isAdmin ? [
                              { type: "divider" as const },
                              { label: "Ban for good", danger: true, disabled, onClick: () => void act(r, "ban", { title: `Ban ${name} for good?`, body: "Their profile is hidden and they can't take part. It lasts until an admin grants an appeal.", confirmLabel: "Ban" }) },
                            ] : []),
                          ]}
                        />
                      </div>
                    </AdminPanel>
                  </li>
                );
              })}
            </ul>
            {more > 0 && (
              <div>
                <Button variant="ghost" size="small" onClick={() => setShown((s) => s + PAGE)}>Show {more} more</Button>
              </div>
            )}
          </>
        )}
      </AdminSection>

      <AdminSection
        title="Restricted right now"
        intro={isAdmin ? "Accounts that are limited, suspended or banned at the moment. Lift one early here; a suspension also ends on its own." : "Accounts that are limited, suspended or banned at the moment. Only admins can lift one early."}
      >
        {restricted.length === 0 ? (
          <EmptyState variant="bordered" icon={<IconShieldCheck size={28} />} title="Nobody is restricted" description="Accounts show here while a limit, suspension or ban is in place." />
        ) : (
          <ul className="admin-people-list" aria-label="Restricted accounts">
            {restricted.map((a) => {
              const name = a.displayName || a.username || "Unknown account";
              const limited = a.restrictions.map((k) => CAPS.find(([c]) => c === k)?.[1] ?? k);
              return (
                <li key={a.userId}>
                  <AdminPanel className="admin-people-item">
                    <div className="admin-people-head">
                      <h3 className="admin-people-name">{name}</h3>
                      <ProfileLink username={a.username} />
                      <Badge size="small" variant={a.state === "banned" ? "error" : a.state === "suspended" ? "warning" : "info"}>
                        {a.state === "banned" ? "Banned" : a.state === "suspended" ? (a.until ? `Suspended until ${when(a.until)}` : "Suspended") : "Limited"}
                      </Badge>
                    </div>
                    <p className="admin-people-time">
                      {a.state === "restricted" && limited.length ? `Can't: ${limited.join(", ")}. ` : ""}
                      {a.strikeCount ? `${a.strikeCount} strike${a.strikeCount === 1 ? "" : "s"}` : ""}
                    </p>
                    {isAdmin && (
                      <div className="admin-people-actions">
                        <Button size="small" variant="secondary" disabled={busy === a.userId} onClick={() => void lift(a)} aria-label={`Lift ${name}'s ${a.state === "banned" ? "ban" : a.state === "suspended" ? "suspension" : "limits"}`}>Lift</Button>
                      </div>
                    )}
                  </AdminPanel>
                </li>
              );
            })}
          </ul>
        )}
      </AdminSection>

      <AdminSection
        title="Appeals"
        intro={isAdmin ? "People asking for a suspension or ban to be lifted." : "People asking for a suspension or ban to be lifted. Only admins can decide them; you can read them here."}
      >
        {appeals.length === 0 ? (
          <EmptyState variant="bordered" icon={<IconGavel size={28} />} title="No appeals waiting" description="An appeal shows here when a suspended or banned person asks for another look." />
        ) : (
          <ul className="admin-people-list" aria-label="Appeals waiting">
            {appeals.map((a) => {
              const name = a.user?.displayName || a.user?.username || "Unknown account";
              const disabled = busy === a.id;
              return (
                <li key={a.id}>
                  <AdminPanel className="admin-people-item">
                    <div className="admin-people-head">
                      <h3 className="admin-people-name">{name}</h3>
                      <ProfileLink username={a.user?.username} />
                      <Standing status={a.user?.moderationStatus} now={loadedAt} />
                    </div>
                    <blockquote className="admin-people-quote">{a.message}</blockquote>
                    <p className="admin-people-time">Sent {when(a.createdAt)} Pacific</p>
                    {isAdmin && (
                      <div className="admin-people-actions">
                        <Button size="small" variant="secondary" disabled={disabled} onClick={() => void actAppeal(a, "grant_appeal", name)} aria-label={`Grant ${name}'s appeal`}>Grant</Button>
                        <Button size="small" variant="secondary" disabled={disabled} onClick={() => void actAppeal(a, "deny_appeal", name)} aria-label={`Deny ${name}'s appeal`}>Deny</Button>
                      </div>
                    )}
                  </AdminPanel>
                </li>
              );
            })}
          </ul>
        )}
      </AdminSection>

      {restrictFor && (
        <Modal
          isOpen
          onClose={() => setRestrictFor(null)}
          title={`Limit what ${restrictFor.target?.displayName || restrictFor.target?.username || "this account"} can do`}
          size="small"
          footer={
            <div className="admin-people-modal-footer">
              <Button variant="ghost" onClick={() => setRestrictFor(null)}>Cancel</Button>
              <Button variant="primary" disabled={allowedCount === CAPS.length} onClick={() => void submitRestrict()}>Apply limits</Button>
            </div>
          }
        >
          <div className="admin-people-form">
            <p className="admin-people-help">
              Untick what this account can no longer do. A lighter step than a suspension: the profile stays up. It adds a strike and closes this report.
            </p>
            {CAPS.map(([k, label]) => (
              <Checkbox
                key={k}
                label={label}
                checked={allow[k] !== false}
                onChange={(e) => setAllow((cur) => ({ ...cur, [k]: e.target.checked }))}
              />
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
