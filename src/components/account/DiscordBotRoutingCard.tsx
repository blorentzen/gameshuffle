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
import { Alert, Badge, Button, Select, Switch } from "@empac/cascadeds";

type EventKey = "stream_live" | "round_open" | "round_close" | "recap";
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
];

// Subscriptions default ON (missing key = ON). Pings default OFF.
const subOn = (flags: EventFlags | null, key: EventKey) =>
  flags?.[key] !== false;
const pingOn = (flags: EventFlags | null, key: EventKey) =>
  flags?.[key] === true;

export function DiscordBotRoutingCard() {
  const [routing, setRouting] = useState<RoutingState | null>(null);
  const [channels, setChannels] = useState<ChannelOption[] | null>(null);
  const [roles, setRoles] = useState<RoleOption[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadRouting = useCallback(async () => {
    try {
      const res = await fetch("/api/discord/bot/routing");
      const body = await res.json();
      if (!body.ok) {
        setError(body.error ?? "Couldn't load Discord routing.");
        return;
      }
      setRouting(body.routing);
    } catch {
      setError("Network error loading Discord routing.");
    }
  }, []);

  const loadChannels = useCallback(async () => {
    try {
      const res = await fetch("/api/discord/bot/channels");
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
  }, []);

  const loadRoles = useCallback(async () => {
    try {
      const res = await fetch("/api/discord/bot/roles");
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
  }, []);

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
    if (params.get("discord_installed") === "1") {
      setSuccess("GameShuffle bot installed. Pick a channel below.");
    }
    const err = params.get("discord_install_error");
    if (err) setError(`Install failed: ${err.replace(/_/g, " ")}`);
  }, []);

  const patchRouting = async (
    body: Record<string, unknown>,
    optimistic?: (r: RoutingState) => RoutingState,
  ) => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/discord/bot/routing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Couldn't save.");
        return false;
      }
      if (optimistic) {
        setRouting((r) => (r ? optimistic(r) : r));
      }
      setSuccess("Saved.");
      return true;
    } catch {
      setError("Network error saving.");
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

  const removeBot = async () => {
    if (
      !confirm(
        "Stop GameShuffle from posting to your Discord? You'll also need to kick the bot from your server manually.",
      )
    ) {
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/discord/bot/routing", { method: "DELETE" });
      const body = await res.json();
      if (!body.ok) {
        setError(body.error ?? "Couldn't remove routing.");
        return;
      }
      setRouting({
        guildId: null,
        guildName: null,
        channelId: null,
        notifyRoleId: null,
        eventSubscriptions: null,
        eventPings: null,
      });
      setChannels(null);
      setRoles(null);
      setSuccess("Discord routing removed.");
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
              Install in your Discord →
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
            <Button
              variant="ghost"
              size="small"
              onClick={removeBot}
              disabled={saving}
            >
              Remove
            </Button>
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
                { value: "", label: "— Pick a channel —" },
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
                Toggle which events the bot posts. Pings are off by default —
                we won&rsquo;t @-mention anyone unless you opt in below.
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
                { value: "", label: "— No ping role —" },
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
              We deliberately exclude @everyone — pings are opt-in roles only.
            </p>
          </label>
        </div>
      )}
    </div>
  );
}
