"use client";

/**
 * Mods tab on /account — the streamer's surface for managing the
 * humans who can take operational actions on their stream (approve
 * code requests, kick prequeue, release codes, clear no-shows).
 *
 * Three lists rendered in priority order:
 *
 *   - Active   — claimed mods with full mod power
 *   - Invited  — invites the streamer has sent; can resend or cancel
 *   - Pending  — auto-imported from Twitch but not yet invited; the
 *                streamer reviews who they actually want to mod for
 *                them before generating a signup link
 *
 * Two settings sit below the lists, per the mod-accounts spec:
 *   - Auto-revoke mods when they lose their Twitch mod badge
 *   - Allow mods to release room codes (only relevant in RC
 *     approval-share mode — wires up the code-sharing spec hook)
 *
 * Per `specs/gs-pro-updates/gs-mod-accounts-spec.md`.
 */

import { useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button, Input, Switch } from "@empac/cascadeds";

type ModStatus = "pending" | "invited" | "active" | "revoked";

interface ModRow {
  id: string;
  gs_user_id: string | null;
  twitch_user_id: string | null;
  discord_user_id: string | null;
  display_name: string;
  status: ModStatus;
  source: "twitch_auto_import" | "streamer_manual";
  invited_at: string | null;
  invite_token: string | null;
  invite_expires_at: string | null;
  claimed_at: string | null;
  created_at: string;
}

interface MyInviteRow {
  id: string;
  invite_token: string;
  invited_at: string | null;
  invite_expires_at: string | null;
  streamer_user_id: string;
  streamer_name: string;
}

interface ListResponse {
  ok: true;
  mods: { active: ModRow[]; invited: ModRow[]; pending: ModRow[] };
  myInvites: MyInviteRow[];
  selfSlug: string | null;
  settings: {
    autoRevokeLostTwitchMods: boolean;
    allowModCodeRelease: boolean;
  };
  twitchModsLastSyncedAt: string | null;
}

interface SyncResult {
  imported: number;
  preserved: number;
  revoked: number;
  lastSyncedAt: string;
}

function inviteLink(token: string): string {
  if (typeof window === "undefined") return `/mod/invite/${token}`;
  return `${window.location.origin}/mod/invite/${token}`;
}

function formatRelative(iso: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}

function identitySummary(row: ModRow): string {
  const parts: string[] = [];
  if (row.twitch_user_id) parts.push("Twitch");
  if (row.discord_user_id) parts.push("Discord");
  if (row.gs_user_id) parts.push("GS linked");
  return parts.length === 0 ? "—" : parts.join(" · ");
}

export function ModsTab() {
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [copiedTokenId, setCopiedTokenId] = useState<string | null>(null);

  // Manual-add form state
  const [addTwitchLogin, setAddTwitchLogin] = useState("");
  const [addDiscordId, setAddDiscordId] = useState("");
  const [addDiscordHandle, setAddDiscordHandle] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/account/mods");
      const body = (await res.json()) as ListResponse | { ok: false; error: string };
      if (!body.ok) {
        setError(body.error ?? "Couldn't load mods.");
        return;
      }
      setData(body);
    } catch {
      setError("Network error loading mods.");
    }
  }, []);

  useEffect(() => {
    void load().finally(() => setLoading(false));
  }, [load]);

  const sync = async () => {
    setSyncing(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/twitch/mods/sync", { method: "POST" });
      const body = await res.json();
      if (!body.ok) {
        const reasons: Record<string, string> = {
          twitch_not_connected: "Connect Twitch on the Integrations tab first.",
          missing_scope_moderation_read:
            "Reconnect Twitch — the new mod-import permission needs to be authorized. The Twitch dashboard has a banner with the reconnect link.",
        };
        setError(reasons[body.error as string] ?? body.error ?? "Sync failed.");
        return;
      }
      const result = body.result as SyncResult;
      setSuccess(
        `Synced — ${result.imported} new · ${result.preserved} preserved · ${result.revoked} revoked.`,
      );
      await load();
    } catch {
      setError("Network error syncing.");
    } finally {
      setSyncing(false);
    }
  };

  const addByTwitch = async () => {
    if (!addTwitchLogin.trim()) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/account/mods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ twitch_login: addTwitchLogin.trim() }),
      });
      const body = await res.json();
      if (!body.ok) {
        const reasons: Record<string, string> = {
          twitch_user_not_found: "No Twitch user found with that handle.",
          twitch_lookup_failed: "Couldn't reach Twitch to look up that user. Try again.",
          mod_already_exists: "That mod is already in your list.",
        };
        setError(reasons[body.error as string] ?? body.error ?? "Add failed.");
        return;
      }
      setSuccess("Mod added. Copy their invite link below to send.");
      setAddTwitchLogin("");
      await load();
    } finally {
      setBusy(false);
    }
  };

  const addByDiscord = async () => {
    if (!addDiscordId.trim()) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/account/mods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          discord_user_id: addDiscordId.trim(),
          discord_handle: addDiscordHandle.trim() || undefined,
        }),
      });
      const body = await res.json();
      if (!body.ok) {
        const reasons: Record<string, string> = {
          discord_user_id_invalid:
            "Discord user IDs are 15-25 digit numbers. Right-click a user in Discord → Copy User ID (developer mode required).",
          mod_already_exists: "That mod is already in your list.",
        };
        setError(reasons[body.error as string] ?? body.error ?? "Add failed.");
        return;
      }
      setSuccess("Discord mod added. Copy their invite link below to send.");
      setAddDiscordId("");
      setAddDiscordHandle("");
      await load();
    } finally {
      setBusy(false);
    }
  };

  const regenerateInvite = async (modId: string) => {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/account/mods/${modId}/invite`, {
        method: "POST",
      });
      const body = await res.json();
      if (!body.ok) {
        setError(body.error ?? "Couldn't generate invite link.");
        return;
      }
      setSuccess("Fresh invite link generated. Copy it below.");
      await load();
    } finally {
      setBusy(false);
    }
  };

  const cancelInvite = async (modId: string) => {
    if (!confirm("Cancel this invite? The link will stop working. The mod stays in your pending list.")) {
      return;
    }
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/account/mods/${modId}/invite`, {
        method: "DELETE",
      });
      const body = await res.json();
      if (!body.ok) {
        setError(body.error ?? "Couldn't cancel invite.");
        return;
      }
      setSuccess("Invite cancelled.");
      await load();
    } finally {
      setBusy(false);
    }
  };

  const revokeMod = async (modId: string, displayName: string) => {
    if (!confirm(`Revoke ${displayName}'s mod access? They'll lose all mod power on your streams.`)) {
      return;
    }
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/account/mods", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: modId }),
      });
      const body = await res.json();
      if (!body.ok) {
        setError(body.error ?? "Couldn't revoke.");
        return;
      }
      setSuccess(`${displayName} revoked.`);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const toggleAutoRevoke = async (next: boolean) => {
    await patchSettings({ auto_revoke_lost_twitch_mods: next });
  };
  const toggleAllowCodeRelease = async (next: boolean) => {
    await patchSettings({ allow_mod_code_release: next });
  };
  const patchSettings = async (body: Record<string, boolean>) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/account/mods", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Setting save failed.");
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async (token: string, modId: string) => {
    try {
      await navigator.clipboard.writeText(inviteLink(token));
      setCopiedTokenId(modId);
      setTimeout(() => setCopiedTokenId((cur) => (cur === modId ? null : cur)), 2000);
    } catch {
      setError("Couldn't copy. Long-press to select the link manually.");
    }
  };

  /** Accept a pending mod invite for the current user. Same endpoint
   *  the magic-link claim flow uses — this surface just spares the
   *  invitee from re-finding the original link after they've linked
   *  the matching identity. */
  const acceptInvite = async (token: string, streamerName: string) => {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/account/mods/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const body = await res.json();
      if (!body.ok) {
        const reasons: Record<string, string> = {
          invite_not_found: "This invite isn't valid anymore.",
          invite_not_open: "This invite has already been used.",
          invite_expired: "This invite expired. Ask the streamer for a fresh one.",
          invite_for_different_account:
            "This invite is bound to a different identity. Reach out to the streamer.",
        };
        setError(reasons[body.error as string] ?? body.error ?? "Couldn't accept.");
        return;
      }
      // Land them on the streamer's mod view with the success banner.
      window.location.href = `/mod/${body.streamerSlug}?claimed=1`;
      void streamerName; // bound for the success-message variant; redirect supersedes
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="account-card">
        <h2>Mods</h2>
        <p
          style={{
            color: "var(--text-tertiary)",
            fontSize: "var(--font-size-14)",
            margin: 0,
          }}
        >
          Loading…
        </p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="account-card">
        <h2>Mods</h2>
        <Alert variant="error">
          {error ?? "Couldn't load your mod list."}{" "}
          <Button variant="ghost" size="small" onClick={load}>
            Retry
          </Button>
        </Alert>
      </div>
    );
  }

  const { active, invited, pending } = data.mods;
  const myInvites = data.myInvites;

  return (
    <>
      {myInvites.length > 0 && (
        <div
          className="account-card"
          style={{
            borderLeft: "4px solid var(--success-500)",
          }}
        >
          <h2 style={{ marginTop: 0 }}>
            {myInvites.length === 1
              ? "You've been invited to mod"
              : `${myInvites.length} mod invites waiting for you`}
          </h2>
          <p
            style={{
              fontSize: "var(--font-size-14)",
              color: "var(--text-secondary)",
              margin: "0 0 var(--spacing-16)",
              lineHeight: "var(--line-height-relaxed)",
            }}
          >
            {myInvites.length === 1
              ? "A streamer invited you to mod their GameShuffle stream. Accept below to gain mod power on their surfaces."
              : "Streamers invited you to mod for them. Accept each below to gain mod power on their surfaces."}
          </p>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--spacing-8)",
            }}
          >
            {myInvites.map((inv) => (
              <div
                key={inv.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "var(--spacing-12)",
                  padding: "var(--spacing-12)",
                  border: "1px solid var(--border-default)",
                  borderRadius: "var(--radius-6)",
                  background: "var(--background-secondary)",
                  flexWrap: "wrap",
                }}
              >
                <div style={{ flex: 1, minWidth: "12rem" }}>
                  <div
                    style={{
                      fontSize: "var(--font-size-16)",
                      fontWeight: "var(--font-weight-semibold)",
                    }}
                  >
                    {inv.streamer_name}
                  </div>
                  <div
                    style={{
                      fontSize: "var(--font-size-12)",
                      color: "var(--text-tertiary)",
                      lineHeight: "var(--line-height-snug)",
                    }}
                  >
                    Invited {formatRelative(inv.invited_at)}
                    {inv.invite_expires_at &&
                      ` · expires ${new Date(
                        inv.invite_expires_at,
                      ).toLocaleDateString()}`}
                  </div>
                </div>
                <Button
                  variant="primary"
                  size="small"
                  onClick={() =>
                    acceptInvite(inv.invite_token, inv.streamer_name)
                  }
                  disabled={busy}
                >
                  Accept invite →
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="account-card">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            flexWrap: "wrap",
            gap: "var(--spacing-8)",
            marginBottom: "var(--spacing-12)",
          }}
        >
          <div>
            <h2 style={{ margin: 0 }}>Mods</h2>
            <p
              style={{
                fontSize: "var(--font-size-12)",
                color: "var(--text-tertiary)",
                margin: "var(--spacing-4) 0 0",
                lineHeight: "var(--line-height-snug)",
              }}
            >
              Mods help your stream run — approve code requests, kick
              prequeue, release codes, clear no-shows. They can&rsquo;t
              change session config or your account settings.
            </p>
          </div>
          <div
            style={{
              display: "flex",
              gap: "var(--spacing-8)",
              alignItems: "center",
            }}
          >
            <span
              style={{
                fontSize: "var(--font-size-12)",
                color: "var(--text-tertiary)",
              }}
            >
              Twitch synced {formatRelative(data.twitchModsLastSyncedAt)}
            </span>
            {data.selfSlug && (
              <a
                href={`/mod/${data.selfSlug}`}
                style={{ textDecoration: "none" }}
              >
                <Button variant="ghost" size="small">
                  Preview mod view ↗
                </Button>
              </a>
            )}
            <Button
              variant="secondary"
              size="small"
              onClick={sync}
              disabled={syncing || busy}
            >
              {syncing ? "Syncing…" : "Sync now ↻"}
            </Button>
          </div>
        </div>

        {error && (
          <div style={{ marginBottom: "var(--spacing-12)" }}>
            <Alert variant="error" onClose={() => setError(null)}>
              {error}
            </Alert>
          </div>
        )}
        {success && (
          <div style={{ marginBottom: "var(--spacing-12)" }}>
            <Alert variant="success" onClose={() => setSuccess(null)}>
              {success}
            </Alert>
          </div>
        )}

        {/* Active ────────────────────────────────────────── */}
        <ModSection
          title="Active"
          count={active.length}
          empty="No active mods yet. Invite someone from your pending list below."
        >
          {active.map((m) => (
            <ModRowDisplay
              key={m.id}
              row={m}
              right={
                <Button
                  variant="ghost"
                  size="small"
                  onClick={() => revokeMod(m.id, m.display_name)}
                  disabled={busy}
                >
                  Revoke
                </Button>
              }
              meta={
                <>
                  {identitySummary(m)} · claimed{" "}
                  {formatRelative(m.claimed_at)}
                </>
              }
            />
          ))}
        </ModSection>

        {/* Invited ───────────────────────────────────────── */}
        {invited.length > 0 && (
          <ModSection title="Invited" count={invited.length}>
            {invited.map((m) => (
              <ModRowDisplay
                key={m.id}
                row={m}
                meta={
                  <>
                    {identitySummary(m)} · sent {formatRelative(m.invited_at)}
                    {m.invite_expires_at &&
                      ` · expires ${new Date(
                        m.invite_expires_at,
                      ).toLocaleDateString()}`}
                  </>
                }
                right={
                  <div
                    style={{
                      display: "flex",
                      gap: "var(--spacing-6)",
                      flexWrap: "wrap",
                    }}
                  >
                    {m.invite_token && (
                      <Button
                        variant="secondary"
                        size="small"
                        onClick={() => copyLink(m.invite_token as string, m.id)}
                        disabled={busy}
                      >
                        {copiedTokenId === m.id ? "Copied ✓" : "Copy link"}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="small"
                      onClick={() => regenerateInvite(m.id)}
                      disabled={busy}
                    >
                      Regenerate
                    </Button>
                    <Button
                      variant="ghost"
                      size="small"
                      onClick={() => cancelInvite(m.id)}
                      disabled={busy}
                    >
                      Cancel
                    </Button>
                  </div>
                }
              />
            ))}
          </ModSection>
        )}

        {/* Pending ───────────────────────────────────────── */}
        <ModSection
          title="Pending Twitch mods"
          count={pending.length}
          empty={
            data.twitchModsLastSyncedAt
              ? "No pending Twitch mods. Click Sync now if you've added mods on Twitch recently."
              : "Click Sync now to auto-import your Twitch moderator list."
          }
          hint="Auto-imported from your Twitch moderator list. Click Invite to generate a one-time signup link you can DM them."
        >
          {pending.map((m) => (
            <ModRowDisplay
              key={m.id}
              row={m}
              meta={
                <>
                  Twitch · imported {formatRelative(m.created_at)}
                </>
              }
              right={
                <Button
                  variant="primary"
                  size="small"
                  onClick={() => regenerateInvite(m.id)}
                  disabled={busy}
                >
                  Invite
                </Button>
              }
            />
          ))}
        </ModSection>
      </div>

      {/* Manual add ──────────────────────────────────────── */}
      <div className="account-card">
        <h2>Add mod manually</h2>
        <p
          style={{
            fontSize: "var(--font-size-12)",
            color: "var(--text-tertiary)",
            margin: "0 0 var(--spacing-12)",
            lineHeight: "var(--line-height-snug)",
          }}
        >
          Add someone who isn&rsquo;t in your Twitch mod list — a Discord-only
          community manager, a friend you trust to operate the stream, etc.
        </p>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--spacing-12)",
          }}
        >
          <div>
            <label
              className="account-card__label"
              style={{ display: "block", marginBottom: "var(--spacing-4)" }}
            >
              By Twitch handle
            </label>
            <div
              style={{
                display: "flex",
                gap: "var(--spacing-8)",
                alignItems: "flex-start",
              }}
            >
              <Input
                placeholder="@username"
                value={addTwitchLogin}
                onChange={(e) => setAddTwitchLogin(e.target.value)}
                disabled={busy}
                fullWidth
              />
              <Button
                variant="secondary"
                onClick={addByTwitch}
                disabled={busy || !addTwitchLogin.trim()}
              >
                Add
              </Button>
            </div>
          </div>
          <div>
            <label
              className="account-card__label"
              style={{ display: "block", marginBottom: "var(--spacing-4)" }}
            >
              By Discord user ID
            </label>
            <div
              style={{
                display: "flex",
                gap: "var(--spacing-8)",
                alignItems: "flex-start",
              }}
            >
              <Input
                placeholder="123456789012345678"
                value={addDiscordId}
                onChange={(e) => setAddDiscordId(e.target.value)}
                disabled={busy}
              />
              <Input
                placeholder="Display name (optional)"
                value={addDiscordHandle}
                onChange={(e) => setAddDiscordHandle(e.target.value)}
                disabled={busy}
                fullWidth
              />
              <Button
                variant="secondary"
                onClick={addByDiscord}
                disabled={busy || !addDiscordId.trim()}
              >
                Add
              </Button>
            </div>
            <p
              style={{
                fontSize: "var(--font-size-12)",
                color: "var(--text-tertiary)",
                margin: "var(--spacing-4) 0 0",
                lineHeight: "var(--line-height-snug)",
              }}
            >
              Right-click a user in Discord → Copy User ID (requires
              Developer Mode in Discord settings → Advanced).
            </p>
          </div>
        </div>
      </div>

      {/* Settings ────────────────────────────────────────── */}
      <div className="account-card">
        <h2>Settings</h2>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--spacing-12)",
          }}
        >
          <SettingRow
            label="Auto-revoke mods when they lose Twitch mod status"
            hint="When ON, mods who lose their Twitch mod badge auto-flip to revoked on the next sync. Turn OFF if you demod for testing."
            checked={data.settings.autoRevokeLostTwitchMods}
            onToggle={() => toggleAutoRevoke(!data.settings.autoRevokeLostTwitchMods)}
            disabled={busy}
          />
          <SettingRow
            label="Allow mods to release room codes"
            hint="When using approval-mode room code sharing, mods can press the Release button. When OFF, only you can release codes."
            checked={data.settings.allowModCodeRelease}
            onToggle={() => toggleAllowCodeRelease(!data.settings.allowModCodeRelease)}
            disabled={busy}
          />
        </div>
      </div>
    </>
  );
}

// ---------- Subcomponents ---------------------------------------------------

function ModSection({
  title,
  count,
  empty,
  hint,
  children,
}: {
  title: string;
  count: number;
  empty?: string;
  hint?: string;
  children?: React.ReactNode;
}) {
  return (
    <div style={{ marginTop: "var(--spacing-12)" }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: "var(--spacing-8)",
          marginBottom: "var(--spacing-6)",
        }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: "var(--font-size-14)",
            fontWeight: "var(--font-weight-semibold)",
          }}
        >
          {title}
        </h3>
        <Badge variant="default" size="small">
          {count}
        </Badge>
      </div>
      {hint && (
        <p
          style={{
            fontSize: "var(--font-size-12)",
            color: "var(--text-tertiary)",
            margin: "0 0 var(--spacing-8)",
            lineHeight: "var(--line-height-snug)",
          }}
        >
          {hint}
        </p>
      )}
      {count === 0 ? (
        <p
          style={{
            fontSize: "var(--font-size-12)",
            color: "var(--text-tertiary)",
            margin: 0,
            fontStyle: "italic",
          }}
        >
          {empty}
        </p>
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--spacing-6)",
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

function ModRowDisplay({
  row,
  meta,
  right,
}: {
  row: ModRow;
  meta: React.ReactNode;
  right: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "var(--spacing-12)",
        padding: "var(--spacing-8) var(--spacing-12)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-6)",
        background: "var(--background-secondary)",
        flexWrap: "wrap",
      }}
    >
      <div style={{ flex: 1, minWidth: "12rem" }}>
        <div
          style={{
            fontSize: "var(--font-size-14)",
            fontWeight: "var(--font-weight-semibold)",
          }}
        >
          {row.display_name}
        </div>
        <div
          style={{
            fontSize: "var(--font-size-12)",
            color: "var(--text-tertiary)",
            lineHeight: "var(--line-height-snug)",
          }}
        >
          {meta}
        </div>
      </div>
      <div>{right}</div>
    </div>
  );
}

function SettingRow({
  label,
  hint,
  checked,
  onToggle,
  disabled,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onToggle: () => void;
  disabled: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: "var(--spacing-12)",
        flexWrap: "wrap",
      }}
    >
      <div style={{ flex: 1, minWidth: "16rem" }}>
        <div
          style={{
            fontSize: "var(--font-size-14)",
            fontWeight: "var(--font-weight-semibold)",
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontSize: "var(--font-size-12)",
            color: "var(--text-tertiary)",
            lineHeight: "var(--line-height-snug)",
          }}
        >
          {hint}
        </div>
      </div>
      <Switch checked={checked} onChange={onToggle} disabled={disabled} />
    </div>
  );
}
