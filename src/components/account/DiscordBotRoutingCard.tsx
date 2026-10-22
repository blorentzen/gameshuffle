"use client";

/**
 * "Streamer Discord Bot" card — separate from the OAuth Connections
 * surface above it because installing the bot into a Discord server is
 * a different concept from linking your Discord identity to your GS
 * account.
 *
 * Surfaces (in order):
 *   1. Install / Remove
 *   2. Announcement channel picker
 *   3. Per-event POST toggles (defaults ON — bot is visible by default)
 *   4. Optional ping role picker
 *   5. Per-event PING toggles (defaults OFF — only fire when the
 *      streamer has opted in AND a role is picked)
 *
 * Per `specs/gs-pro-updates/gs-discord-cross-platform-spec.md` §Account UI.
 */

import { useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button, Switch } from "@empac/cascadeds";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/toast/ToastProvider";
import { useConfirm } from "@/components/confirm/ConfirmProvider";

type EventKey =
  | "stream_live"
  | "round_open"
  | "round_close"
  | "recap"
  | "qotd"
  | "lounge";
type EventFlags = Partial<Record<EventKey, boolean>>;

interface RoutingState {
  guildId: string | null;
  guildName: string | null;
  channelId: string | null;
  notifyRoleId: string | null;
  eventSubscriptions: EventFlags | null;
  eventPings: EventFlags | null;
}

interface ChannelOption {
  id: string;
  name: string;
}

interface RoleOption {
  id: string;
  name: string;
}

const EVENT_LABELS: Array<{
  key: EventKey;
  label: string;
  hint: string;
}> = [
  {
    key: "stream_live",
    label: "Stream goes live",
    hint: "Posts an embed when you go live (and edits it on category swap + stream end).",
  },
  {
    key: "round_open",
    label: "Picks & bans opens",
    hint: "Drives viewers to the live page to vote before close.",
  },
  {
    key: "round_close",
    label: "Picks & bans closes",
    hint: "Posts the close + ballot count so viewers see results landed.",
  },
  {
    key: "recap",
    label: "Stream recap ready",
    hint: "Posts the post-stream summary embed once the recap snapshot is computed.",
  },
  {
    key: "qotd",
    label: "Question of the Day",
    hint: "Posts today's !qotd question to your channel once a day, even when you're not streaming. Off unless you turn it on.",
  },
  {
    key: "lounge",
    label: "Lounge rank-ups",
    hint: "Posts when a member who confirmed their Mario Kart lounge name on GameShuffle reaches a new division. Off unless you turn it on.",
  },
];

/**
 * Posting default is per-key; pings always default OFF.
 *
 * Everything defaults ON except `qotd` — the other events react to
 * something you just did (went live, opened a round), whereas QOTD posts
 * on a daily schedule on its own, so it's opt-in. Mirrors SUB_DEFAULTS in
 * `src/lib/adapters/discord/index.ts` — keep the two in sync.
 */
const SUB_DEFAULTS: Record<EventKey, boolean> = {
  stream_live: true,
  round_open: true,
  round_close: true,
  recap: true,
  qotd: false,
  lounge: false,
};

const subOn = (flags: EventFlags | null, key: EventKey) =>
  flags?.[key] ?? SUB_DEFAULTS[key];
const pingOn = (flags: EventFlags | null, key: EventKey) =>
  flags?.[key] === true;

/** Plain-language versions of the install callback's failure codes. */
const INSTALL_ERRORS: Record<string, string> = {
  server_limit: "You're at your server limit: the bot runs in 1 server on a free account and up to 5 with GS Pro. Forget a server on the Discord Bot tab to make room.",
  server_already_linked: "That server is already connected to another GameShuffle account. Whoever connected it can remove the bot from their Discord settings on GameShuffle, then you can add it here.",
  access_denied: "Install cancelled. Nothing changed.",
};

interface ServerSummary { guildId: string; name: string | null; isMain: boolean; removed: boolean; active: boolean }

export function DiscordBotRoutingCard() {
  const confirm = useConfirm();
  // The server this card is set up for (?guild=, else the main one).
  const [guildId, setGuildId] = useState<string | null>(() => (typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("guild") : null));
  const [servers, setServers] = useState<ServerSummary[]>([]);
  const [serverLimit, setServerLimit] = useState(1);
  const withGuild = useCallback(
    (url: string) => (guildId ? `${url}${url.includes("?") ? "&" : "?"}guild=${encodeURIComponent(guildId)}` : url),
    [guildId],
  );
  const [routing, setRouting] = useState<RoutingState | null>(null);
  const [channels, setChannels] = useState<ChannelOption[] | null>(null);
  const [roles, setRoles] = useState<RoleOption[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const toast = useToast();

  const loadRouting = useCallback(async () => {
    try {
      const res = await fetch(withGuild("/api/discord/bot/routing"));
      const body = await res.json();
      if (!body.ok) {
        setError(body.error ?? "Couldn't load Discord routing.");
        return;
      }
      setRouting(body.routing);
      setServers((body.servers as ServerSummary[]) ?? []);
      setServerLimit((body.limit as number) ?? 1);
    } catch {
      setError("Network error loading Discord routing.");
    }
  }, [withGuild]);

  const loadChannels = useCallback(async () => {
    try {
      const res = await fetch(withGuild("/api/discord/bot/channels"));
      const body = await res.json();
      if (!body.ok) {
        if (res.status === 404) {
          setChannels([]);
          return;
        }
        setError(body.error ?? "Couldn't load Discord channels.");
        return;
      }
      setChannels(body.channels);
    } catch {
      setError("Network error loading Discord channels.");
    }
  }, [withGuild]);

  const loadRoles = useCallback(async () => {
    try {
      const res = await fetch(withGuild("/api/discord/bot/roles"));
      const body = await res.json();
      if (!body.ok) {
        if (res.status === 404) {
          setRoles([]);
          return;
        }
        setError(body.error ?? "Couldn't load Discord roles.");
        return;
      }
      setRoles(body.roles);
    } catch {
      setError("Network error loading Discord roles.");
    }
  }, [withGuild]);

  useEffect(() => {
    void loadRouting().finally(() => setLoading(false));
  }, [loadRouting]);

  useEffect(() => {
    if (!routing?.guildId) return;
    void loadChannels();
    void loadRoles();
  }, [routing?.guildId, loadChannels, loadRoles]);

  // Reflect the ?discord_installed=1 / ?discord_install_error=... flash
  // from the OAuth callback.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const installed = params.get("discord_installed");
    if (installed === "1") {
      setSuccess("GameShuffle bot added. Pick a channel for this server below.");
    } else if (installed === "again") {
      setSuccess("GameShuffle bot reconnected to this server. Your settings are as you left them.");
    }
    const err = params.get("discord_install_error");
    if (err) setError(INSTALL_ERRORS[err] ?? `Install failed: ${err.replace(/_/g, " ")}`);
  }, []);

  const patchRouting = async (
    body: Record<string, unknown>,
    optimistic?: (r: RoutingState) => RoutingState,
  ) => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(withGuild("/api/discord/bot/routing"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data.ok) {
        toast.error("Couldn't save routing. Try again.");
        return false;
      }
      if (optimistic) {
        setRouting((r) => (r ? optimistic(r) : r));
      }
      toast.success("Routing saved");
      return true;
    } catch {
      toast.error("Couldn't save routing. Try again.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const saveChannel = (channelId: string) =>
    patchRouting(
      { channel_id: channelId || null },
      (r) => ({ ...r, channelId: channelId || null }),
    );

  const saveRole = (roleId: string) =>
    patchRouting(
      { notify_role_id: roleId || null },
      (r) => ({ ...r, notifyRoleId: roleId || null }),
    );

  const toggleSubscription = (key: EventKey, next: boolean) => {
    const current: EventFlags = routing?.eventSubscriptions ?? {};
    const merged: EventFlags = { ...current, [key]: next };
    return patchRouting(
      { event_subscriptions: merged },
      (r) => ({ ...r, eventSubscriptions: merged }),
    );
  };

  const togglePing = (key: EventKey, next: boolean) => {
    const current: EventFlags = routing?.eventPings ?? {};
    const merged: EventFlags = { ...current, [key]: next };
    return patchRouting(
      { event_pings: merged },
      (r) => ({ ...r, eventPings: merged }),
    );
  };

  /** Fire a real embed at the configured channel to verify the bot
   *  can post end-to-end. Same role as the Twitch "Send test chat
   *  message" button — the goal is for streamers to find out
   *  Discord is broken BEFORE they're mid-stream. */
  const testPost = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(withGuild("/api/discord/bot/test-post"), { method: "POST" });
      const body = await res.json();
      if (!body.ok) {
        const reasons: Record<string, string> = {
          integration_disabled:
            "Discord integration is temporarily disabled site-wide. Check back soon.",
          unauthenticated: "You need to be signed in.",
          bot_not_installed:
            "Install the GameShuffle bot in your Discord first.",
          channel_not_configured:
            "Pick an announcement channel above, then try again.",
          missing_access:
            "The bot can't post to that channel. Check that the channel still exists and the bot has View Channels + Send Messages permission. Re-select the channel or reinstall the bot to fix.",
          post_failed:
            `Discord rejected the post: ${body.detail ?? "unknown reason"}.`,
        };
        setError(reasons[body.error as string] ?? body.error ?? "Test post failed.");
        return;
      }
      setSuccess("Test post landed in your Discord channel. You're all set.");
    } catch {
      setError("Network error sending test post.");
    } finally {
      setSaving(false);
    }
  };

  const removeBot = async () => {
    if (
      !(await confirm({ title: `Forget ${routing?.guildName ?? "this server"}?`, body: "GameShuffle stops posting there, and its channel, role, log and AutoMod settings are cleared. Remove the bot from the server in Discord too.", confirmLabel: "Forget server" }))
    ) {
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(withGuild("/api/discord/bot/routing"), { method: "DELETE" });
      const body = await res.json();
      if (!body.ok) {
        setError(body.error ?? "Couldn't remove routing.");
        return;
      }
      setChannels(null);
      setRoles(null);
      setSuccess("Server forgotten.");
      // Show the next server (or the empty state) without a reload.
      const next = servers.find((g) => g.guildId !== routing?.guildId);
      const url = new URL(window.location.href);
      if (next) url.searchParams.set("guild", next.guildId); else url.searchParams.delete("guild");
      window.history.replaceState(null, "", url.toString());
      if ((next?.guildId ?? null) === guildId) void loadRouting();
      else setGuildId(next?.guildId ?? null);
    } catch {
      setError("Network error removing routing.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="account-card">
        <h2>Streamer Discord Bot</h2>
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

  const installed = !!routing?.guildId;
  const noRolePicked = !routing?.notifyRoleId;

  return (
    <div className="account-card">
      <h2>Streamer Discord Bot</h2>
      <p
        style={{
          marginBottom: "var(--spacing-12)",
          fontSize: "var(--font-size-14)",
          color: "var(--text-secondary)",
        }}
      >
        Install the GameShuffle bot in your Discord server to get
        announcements when you go live, when picks/bans rounds open, and
        more.
      </p>

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

      {!installed ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--spacing-12)",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-8)",
            padding: "var(--spacing-16) var(--spacing-16)",
            background: "var(--background-secondary)",
            flexWrap: "wrap",
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontWeight: "var(--font-weight-semibold)",
                fontSize: "var(--font-size-16)",
              }}
            >
              Not installed
            </div>
            <p
              style={{
                fontSize: "var(--font-size-12)",
                color: "var(--text-secondary)",
                margin: "var(--spacing-4) 0 0",
                lineHeight: "var(--line-height-snug)",
              }}
            >
              You&rsquo;ll be redirected to Discord to pick which server and
              grant the permissions the bot needs.
            </p>
          </div>
          <a
            href="/api/discord/bot/install/start"
            style={{ textDecoration: "none" }}
          >
            <Button variant="primary" size="small">
              Install in your Discord
            </Button>
          </a>
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--spacing-16)",
          }}
        >
          <div className="dbot-servers" style={{ marginBottom: 0 }}>
            {servers.length > 1 ? (
              <Select floatingLabel="Server" value={routing?.guildId ?? ""}
                onChange={(v) => {
                  const id = typeof v === "string" ? v : (v[0] ?? "");
                  if (!id || id === routing?.guildId) return;
                  const url = new URL(window.location.href);
                  url.searchParams.set("guild", id);
                  window.history.replaceState(null, "", url.toString());
                  setChannels(null);
                  setRoles(null);
                  setGuildId(id);
                }}
                options={servers.map((g) => ({ value: g.guildId, label: `${g.name ?? "Server"}${g.isMain ? " (main)" : ""}${g.removed ? " (bot removed)" : !g.active ? " (paused)" : ""}` }))} />
            ) : <span />}
            <div className="dbot-servers__actions">
              <span style={{ fontSize: "var(--font-size-12)", color: "var(--text-secondary)" }}>
                {servers.filter((g) => !g.removed).length} of {serverLimit} server{serverLimit === 1 ? "" : "s"}
              </span>
              {servers.filter((g) => !g.removed).length < serverLimit && (
                <a href="/api/discord/bot/install/start" style={{ textDecoration: "none" }}>
                  <Button variant="secondary" size="small">Add another server</Button>
                </a>
              )}
            </div>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "var(--spacing-12)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-8)",
              padding: "var(--spacing-12) var(--spacing-16)",
              background: "var(--background-primary)",
              flexWrap: "wrap",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--spacing-8)",
              }}
            >
              <Badge variant="success" size="small">
                Installed
              </Badge>
              <span
                style={{
                  fontWeight: "var(--font-weight-semibold)",
                  fontSize: "var(--font-size-16)",
                }}
              >
                {routing?.guildName ?? "Discord server"}
              </span>
            </div>
            <div
              style={{
                display: "flex",
                gap: "var(--spacing-6)",
                flexWrap: "wrap",
              }}
            >
              <Button
                variant="secondary"
                size="small"
                onClick={testPost}
                disabled={saving || !routing?.channelId}
                title={
                  routing?.channelId
                    ? undefined
                    : "Pick a channel below first."
                }
              >
                Send test post
              </Button>
              <Button
                variant="ghost"
                size="small"
                onClick={removeBot}
                disabled={saving}
              >
                Remove
              </Button>
            </div>
          </div>

          <label className="account-card__label" style={{ display: "block" }}>
            Announcement channel
            <Select
              fullWidth
              value={routing?.channelId ?? ""}
              onChange={(value) =>
                saveChannel(
                  typeof value === "string" ? value : (value[0] ?? ""),
                )
              }
              disabled={saving || !channels || channels.length === 0}
              options={[
                { value: "", label: "Pick a channel" },
                ...(channels ?? []).map((c) => ({
                  value: c.id,
                  label: `#${c.name}`,
                })),
              ]}
            />
            <p
              style={{
                marginTop: "var(--spacing-6)",
                fontSize: "var(--font-size-12)",
                color: "var(--text-tertiary)",
                lineHeight: "var(--line-height-snug)",
              }}
            >
              GameShuffle will post here. You can override this per session
              from the Hub.
            </p>
            {channels && channels.length === 0 && (
              <Alert variant="warning">
                The bot can&rsquo;t see any text channels in your server.
                Make sure GameShuffle has &ldquo;View Channels&rdquo; permission
                on at least one text channel.
              </Alert>
            )}
          </label>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--spacing-12)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-8)",
              padding: "var(--spacing-16)",
              background: "var(--background-secondary)",
            }}
          >
            <div>
              <h3
                style={{
                  margin: 0,
                  fontSize: "var(--font-size-14)",
                  fontWeight: "var(--font-weight-semibold)",
                }}
              >
                What to announce
              </h3>
              <p
                style={{
                  margin: "var(--spacing-4) 0 0",
                  fontSize: "var(--font-size-12)",
                  color: "var(--text-tertiary)",
                  lineHeight: "var(--line-height-snug)",
                }}
              >
                Toggle which events the bot posts. Pings are off by default.
                We won&rsquo;t @-mention anyone unless you opt in below.
              </p>
            </div>

            {EVENT_LABELS.map(({ key, label, hint }) => {
              const subscribed = subOn(routing?.eventSubscriptions ?? null, key);
              const ping = pingOn(routing?.eventPings ?? null, key);
              return (
                <div
                  key={key}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "var(--spacing-6)",
                    paddingTop: "var(--spacing-8)",
                    borderTop: "1px solid var(--border-subtle)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "var(--spacing-12)",
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
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "var(--spacing-16)",
                      }}
                    >
                      <label
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "var(--spacing-6)",
                          fontSize: "var(--font-size-12)",
                          color: "var(--text-secondary)",
                          cursor: "pointer",
                        }}
                      >
                        <Switch
                          checked={subscribed}
                          onChange={() => toggleSubscription(key, !subscribed)}
                          disabled={saving}
                        />
                        Post
                      </label>
                      <label
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "var(--spacing-6)",
                          fontSize: "var(--font-size-12)",
                          color: subscribed
                            ? "var(--text-secondary)"
                            : "var(--text-disabled)",
                          cursor: subscribed ? "pointer" : "not-allowed",
                        }}
                        title={
                          noRolePicked
                            ? "Pick a notify role below to enable pings."
                            : undefined
                        }
                      >
                        <Switch
                          checked={ping}
                          onChange={() => togglePing(key, !ping)}
                          disabled={saving || !subscribed || noRolePicked}
                        />
                        Ping
                      </label>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <label className="account-card__label" style={{ display: "block" }}>
            Notify role (optional)
            <Select
              fullWidth
              value={routing?.notifyRoleId ?? ""}
              onChange={(value) =>
                saveRole(typeof value === "string" ? value : (value[0] ?? ""))
              }
              disabled={saving || !roles}
              options={[
                { value: "", label: "No ping role" },
                ...(roles ?? []).map((r) => ({
                  value: r.id,
                  label: `@${r.name}`,
                })),
              ]}
            />
            <p
              style={{
                marginTop: "var(--spacing-6)",
                fontSize: "var(--font-size-12)",
                color: "var(--text-tertiary)",
                lineHeight: "var(--line-height-snug)",
              }}
            >
              When set, the bot will @-mention this role on any event
              where you&rsquo;ve also turned on &ldquo;Ping&rdquo; above.
              We deliberately exclude @everyone. Pings are opt-in roles only.
            </p>
          </label>
        </div>
      )}
    </div>
  );
}
