"use client";

/**
 * Discord Bot tab (Streamer) — manage the GameShuffle bot. Overview + Free/Pro
 * capability matrix (upsell), install status, and a drag-and-drop routing board
 * that sends each GS interaction to a specific Discord channel.
 *
 * Routing is GS Pro. Free streamers see the board locked with an upgrade CTA.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button, Select, Input, Textarea, Chip } from "@empac/cascadeds";
import {
  DndContext,
  useDraggable,
  useDroppable,
  type DragEndEvent,
} from "@dnd-kit/core";
import { useToast } from "@/components/toast/ToastProvider";
import { EmojiPicker, type GuildEmoji } from "@/components/account/EmojiPicker";
import { ROUTE_CATEGORIES, type RouteCategoryDef } from "@/lib/discord/routeCategories";

interface Channel {
  id: string;
  name: string;
}

const PRO_MATRIX: Array<{ label: string; free: boolean; pro: boolean }> = [
  { label: "Bot in server + session pings", free: true, pro: true },
  { label: "Single default channel", free: true, pro: true },
  { label: "Per-interaction channel routing", free: false, pro: true },
  { label: "Scheduled / follow-up announcements", free: false, pro: true },
  { label: "Self-assign role menus", free: false, pro: true },
  { label: "Welcome + autorole", free: false, pro: true },
];

const DEFAULT_COL = "default";

function CategoryCard({ cat, draggable }: { cat: RouteCategoryDef; draggable: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: cat.key,
    disabled: !draggable,
  });
  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)`, zIndex: 20 }
    : undefined;
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`dbot-card${isDragging ? " dbot-card--dragging" : ""}${draggable ? " dbot-card--draggable" : ""}`}
      {...(draggable ? listeners : {})}
      {...(draggable ? attributes : {})}
    >
      <span className="dbot-card__glyph">{cat.glyph}</span>
      <span className="dbot-card__text">
        <span className="dbot-card__label">{cat.label}</span>
        <span className="dbot-card__desc">{cat.desc}</span>
      </span>
    </div>
  );
}

function ChannelColumn({
  id,
  title,
  subtitle,
  children,
}: {
  id: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={`dbot-col${isOver ? " dbot-col--over" : ""}`}>
      <div className="dbot-col__head">
        <span className="dbot-col__title">{title}</span>
        {subtitle && <span className="dbot-col__sub">{subtitle}</span>}
      </div>
      <div className="dbot-col__body">{children}</div>
    </div>
  );
}

export function DiscordBotTab() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [isPro, setIsPro] = useState(false);
  const [guildName, setGuildName] = useState<string | null>(null);
  const [installed, setInstalled] = useState(false);
  const [defaultChannelId, setDefaultChannelId] = useState<string | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [routes, setRoutes] = useState<Record<string, string>>({});
  const [extraColumns, setExtraColumns] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // Announcements
  const [annTitle, setAnnTitle] = useState("");
  const [annBody, setAnnBody] = useState("");
  const [annUrl, setAnnUrl] = useState("");
  const [annMode, setAnnMode] = useState<"now" | "schedule">("now");
  const [annWhen, setAnnWhen] = useState("");
  const [followUps, setFollowUps] = useState<Array<{ offset: string; body: string }>>([]);
  const [sending, setSending] = useState(false);

  // Role menus
  interface RoleMenu {
    id: string;
    title: string;
    channel_id: string;
    options: Array<{ roleId: string; label: string; emoji: string | null }>;
  }
  const [roleMenus, setRoleMenus] = useState<RoleMenu[]>([]);
  const [guildRoles, setGuildRoles] = useState<Array<{ id: string; name: string }>>([]);
  const [guildEmojis, setGuildEmojis] = useState<GuildEmoji[]>([]);
  const [rmTitle, setRmTitle] = useState("");
  const [rmChannel, setRmChannel] = useState("");
  const [rmRoles, setRmRoles] = useState<Array<{ roleId: string; label: string; emoji: string }>>([]);
  const [rmPosting, setRmPosting] = useState(false);

  // Reaction roles + autoroles (gateway worker)
  interface ReactionMessage {
    messageId: string;
    channelId: string;
    mappings: Array<{ emoji: string; roleId: string }>;
  }
  const [reactionMessages, setReactionMessages] = useState<ReactionMessage[]>([]);
  const [rrTitle, setRrTitle] = useState("");
  const [rrDesc, setRrDesc] = useState("");
  const [rrChannel, setRrChannel] = useState("");
  const [rrMappings, setRrMappings] = useState<Array<{ roleId: string; roleName: string; emoji: string }>>([]);
  const [rrPosting, setRrPosting] = useState(false);
  const [autoroleIds, setAutoroleIds] = useState<string[]>([]);
  const [autoroleSaving, setAutoroleSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const [routesRes, channelsRes, menusRes, rolesRes, emojisRes, rrRes, autoRes] = await Promise.all([
        fetch("/api/discord/bot/routes", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
        fetch("/api/discord/bot/channels", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
        fetch("/api/discord/bot/role-menus", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
        fetch("/api/discord/bot/roles", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
        fetch("/api/discord/bot/emojis", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
        fetch("/api/discord/bot/reaction-roles", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
        fetch("/api/discord/bot/autoroles", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
      ]);
      if (routesRes?.ok) {
        setIsPro(!!routesRes.isPro);
        setInstalled(!!routesRes.guildId);
        setGuildName(routesRes.guildName ?? null);
        setDefaultChannelId(routesRes.defaultChannelId ?? null);
        setRoutes((routesRes.routes as Record<string, string>) ?? {});
      }
      if (channelsRes?.ok) setChannels((channelsRes.channels as Channel[]) ?? []);
      if (menusRes?.ok) setRoleMenus((menusRes.menus as RoleMenu[]) ?? []);
      if (rolesRes?.ok) setGuildRoles((rolesRes.roles as Array<{ id: string; name: string }>) ?? []);
      if (emojisRes?.ok) setGuildEmojis((emojisRes.emojis as GuildEmoji[]) ?? []);
      if (rrRes?.ok) setReactionMessages((rrRes.messages as ReactionMessage[]) ?? []);
      if (autoRes?.ok) setAutoroleIds((autoRes.roleIds as string[]) ?? []);
      setLoading(false);
    })();
  }, []);

  const channelName = useCallback(
    (id: string | null) => (id ? channels.find((c) => c.id === id)?.name ?? "channel" : null),
    [channels],
  );

  function onDragEnd(e: DragEndEvent) {
    const cat = String(e.active.id);
    const over = e.over ? String(e.over.id) : null;
    if (!over) return;
    setRoutes((prev) => {
      const next = { ...prev };
      if (over === DEFAULT_COL) delete next[cat];
      else next[cat] = over;
      return next;
    });
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    const payload: Record<string, string | null> = {};
    for (const c of ROUTE_CATEGORIES) payload[c.key] = routes[c.key] ?? null;
    const res = await fetch("/api/discord/bot/routes", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ routes: payload }),
    });
    setSaving(false);
    if (res.ok) {
      toast.success("Channel routing saved.");
      setDirty(false);
    } else {
      toast.error("Could not save routing.");
    }
  }

  function updateFollowUp(i: number, field: "offset" | "body", value: string) {
    setFollowUps((prev) => prev.map((f, idx) => (idx === i ? { ...f, [field]: value } : f)));
  }

  async function sendAnnounce() {
    if (!annTitle.trim() || !annBody.trim() || sending) return;
    setSending(true);
    const payload = {
      title: annTitle,
      body: annBody,
      url: annUrl || null,
      mode: annMode,
      fireAt: annMode === "schedule" && annWhen ? new Date(annWhen).toISOString() : undefined,
      followUps: followUps
        .filter((f) => f.offset && f.body.trim())
        .map((f) => ({ offsetMinutes: Number(f.offset), body: f.body })),
    };
    const res = await fetch("/api/discord/bot/announce", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSending(false);
    const d = await res.json().catch(() => null);
    if (res.ok) {
      toast.success(annMode === "now" ? "Announcement posted." : "Announcement scheduled.");
      setAnnTitle("");
      setAnnBody("");
      setAnnUrl("");
      setAnnWhen("");
      setFollowUps([]);
    } else {
      const err = d?.error;
      toast.error(
        err === "no_channel" || err === "no_routing"
          ? "Set an announcements channel first (route it below or set a default channel)."
          : "Could not send the announcement.",
      );
    }
  }

  function addRmRole(roleId: string) {
    if (!roleId || rmRoles.some((r) => r.roleId === roleId)) return;
    const name = guildRoles.find((r) => r.id === roleId)?.name ?? "Role";
    setRmRoles((prev) => [...prev, { roleId, label: name, emoji: "" }]);
  }
  function updateRmRole(i: number, field: "label" | "emoji", value: string) {
    setRmRoles((prev) => prev.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  }
  async function postRoleMenu() {
    if (!rmTitle.trim() || !rmChannel || rmRoles.length === 0 || rmPosting) return;
    setRmPosting(true);
    const res = await fetch("/api/discord/bot/role-menus", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channelId: rmChannel,
        title: rmTitle,
        options: rmRoles.map((r) => ({ roleId: r.roleId, label: r.label, emoji: r.emoji || null })),
      }),
    });
    setRmPosting(false);
    const d = await res.json().catch(() => null);
    if (res.ok) {
      toast.success("Role menu posted to Discord.");
      setRmTitle("");
      setRmChannel("");
      setRmRoles([]);
      const refreshed = await fetch("/api/discord/bot/role-menus").then((r) => r.json()).catch(() => null);
      if (refreshed?.ok) setRoleMenus(refreshed.menus as RoleMenu[]);
    } else {
      toast.error(
        d?.error === "invalid_channel"
          ? "Pick a valid channel."
          : "Could not post the role menu. Check the bot has Manage Roles and is ranked above the roles.",
      );
    }
  }
  async function deleteMenu(id: string) {
    await fetch(`/api/discord/bot/role-menus?id=${id}`, { method: "DELETE" });
    setRoleMenus((prev) => prev.filter((m) => m.id !== id));
  }

  function addRrMapping(roleId: string) {
    if (!roleId || rrMappings.some((m) => m.roleId === roleId)) return;
    const name = guildRoles.find((r) => r.id === roleId)?.name ?? "Role";
    setRrMappings((prev) => [...prev, { roleId, roleName: name, emoji: "" }]);
  }
  async function postReactionRoles() {
    if (!rrTitle.trim() || !rrChannel || rrMappings.length === 0 || rrMappings.some((m) => !m.emoji) || rrPosting) return;
    setRrPosting(true);
    const res = await fetch("/api/discord/bot/reaction-roles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        channelId: rrChannel,
        title: rrTitle,
        description: rrDesc || null,
        mappings: rrMappings.map((m) => ({ emoji: m.emoji, roleId: m.roleId })),
      }),
    });
    setRrPosting(false);
    if (res.ok) {
      toast.success("Reaction role message posted.");
      setRrTitle("");
      setRrDesc("");
      setRrChannel("");
      setRrMappings([]);
      const d = await fetch("/api/discord/bot/reaction-roles").then((r) => r.json()).catch(() => null);
      if (d?.ok) setReactionMessages(d.messages as ReactionMessage[]);
    } else {
      toast.error("Could not post. Check the bot's permissions, that the worker is running, and that emojis are valid.");
    }
  }
  async function deleteReactionMessage(messageId: string) {
    await fetch(`/api/discord/bot/reaction-roles?messageId=${messageId}`, { method: "DELETE" });
    setReactionMessages((prev) => prev.filter((m) => m.messageId !== messageId));
  }

  async function saveAutoroles(ids: string[]) {
    setAutoroleSaving(true);
    const res = await fetch("/api/discord/bot/autoroles", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roleIds: ids }),
    });
    setAutoroleSaving(false);
    if (res.ok) toast.success("Auto-assign roles saved.");
    else toast.error("Could not save auto-roles.");
  }

  if (loading) return <div className="account-card"><p>Loading…</p></div>;

  const canEdit = isPro && installed;
  const routedChannelIds = [...new Set(Object.values(routes))];
  const namedColumns = [...new Set([...routedChannelIds, ...extraColumns])].filter(
    (id) => id !== defaultChannelId,
  );
  const addable = channels.filter((c) => c.id !== defaultChannelId && !namedColumns.includes(c.id));
  const catsFor = (colId: string) =>
    ROUTE_CATEGORIES.filter((c) =>
      colId === DEFAULT_COL ? !routes[c.key] : routes[c.key] === colId,
    );

  return (
    <div className="account-tab">
      <h2 className="account-tab__heading">Discord Bot</h2>
      <p className="account-tab__intro">
        Manage the GameShuffle bot in your Discord server. Route each type of post
        to the right channel, and more as we roll out the suite.
      </p>

      {/* Install status */}
      <div className="account-card">
        <h3 className="account-card__title">Connection</h3>
        {installed ? (
          <p>
            Connected to <strong>{guildName ?? "your server"}</strong>.{" "}
            {defaultChannelId ? (
              <>Default channel: <strong>#{channelName(defaultChannelId)}</strong>.</>
            ) : (
              <>No default channel set yet. Pick one on the Integrations tab.</>
            )}
          </p>
        ) : (
          <p>
            The GameShuffle bot isn&apos;t connected yet.{" "}
            <Link href="/account/streamer?tab=integrations">Connect it on the Integrations tab</Link>{" "}
            to get started.
          </p>
        )}
      </div>

      {/* Free vs Pro */}
      <div className="account-card">
        <h3 className="account-card__title">Free vs GS Pro</h3>
        <table className="dbot-matrix">
          <thead>
            <tr><th>Capability</th><th>Free</th><th>GS Pro</th></tr>
          </thead>
          <tbody>
            {PRO_MATRIX.map((row) => (
              <tr key={row.label}>
                <td>{row.label}</td>
                <td>{row.free ? "✓" : "🔒"}</td>
                <td>{row.pro ? "✓" : "·"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!isPro && (
          <div className="dbot-upsell">
            <span>Routing, scheduled announcements, and role menus are GS Pro.</span>
            <Link href="/gs-pro"><Button variant="primary" size="small">Upgrade to GS Pro</Button></Link>
          </div>
        )}
      </div>

      {/* Routing board */}
      <div className="account-card">
        <div className="dbot-routing-head">
          <h3 className="account-card__title">Channel routing</h3>
          {canEdit && (
            <Button variant="primary" size="small" onClick={() => void save()} disabled={!dirty || saving}>
              {saving ? "Saving…" : "Save routing"}
            </Button>
          )}
        </div>

        {!installed ? (
          <p className="dbot-muted">Connect the bot to configure routing.</p>
        ) : !isPro ? (
          <p className="dbot-muted">
            🔒 Per-interaction routing is a GS Pro feature. Everything posts to your default channel on Free.
          </p>
        ) : (
          <>
            <p className="dbot-muted">
              Drag each interaction onto the channel it should post to. Anything left under
              <strong> Default</strong> uses your default channel.
            </p>
            {addable.length > 0 && (
              <div className="dbot-addchannel">
                <Select
                  floatingLabel="Add a channel column"
                  options={[{ value: "", label: "Pick a channel…" }, ...addable.map((c) => ({ value: c.id, label: `#${c.name}` }))]}
                  value=""
                  onChange={(v) => v && setExtraColumns((cols) => [...cols, v as string])}
                />
              </div>
            )}
            <DndContext onDragEnd={onDragEnd}>
              <div className="dbot-board">
                <ChannelColumn
                  id={DEFAULT_COL}
                  title="Default"
                  subtitle={defaultChannelId ? `#${channelName(defaultChannelId)}` : "no default set"}
                >
                  {catsFor(DEFAULT_COL).map((c) => (
                    <CategoryCard key={c.key} cat={c} draggable />
                  ))}
                </ChannelColumn>
                {namedColumns.map((colId) => (
                  <ChannelColumn key={colId} id={colId} title={`#${channelName(colId)}`}>
                    {catsFor(colId).map((c) => (
                      <CategoryCard key={c.key} cat={c} draggable />
                    ))}
                  </ChannelColumn>
                ))}
              </div>
            </DndContext>
          </>
        )}
      </div>

      {/* Announcements */}
      {canEdit && (
        <div className="account-card">
          <h3 className="account-card__title">Announcements</h3>
          <p className="dbot-muted">
            Post a rich announcement to your announcements channel now, or schedule it,
            with optional follow-ups (e.g. &ldquo;starts in 1 hour&rdquo;).
          </p>
          <div className="dbot-announce">
            <Input floatingLabel="Title" value={annTitle} onChange={(e) => setAnnTitle(e.target.value)} fullWidth />
            <Textarea
              floatingLabel="Message"
              value={annBody}
              onChange={(e) => setAnnBody(e.target.value)}
              rows={4}
            />
            <Input floatingLabel="Link (optional)" value={annUrl} onChange={(e) => setAnnUrl(e.target.value)} fullWidth />

            <div className="dbot-mode">
              <Chip label="Send now" variant={annMode === "now" ? "primary" : "default"} onClick={() => setAnnMode("now")} />
              <Chip label="Schedule" variant={annMode === "schedule" ? "primary" : "default"} onClick={() => setAnnMode("schedule")} />
              {annMode === "schedule" && (
                <input
                  type="datetime-local"
                  className="save-setup-input"
                  value={annWhen}
                  onChange={(e) => setAnnWhen(e.target.value)}
                />
              )}
            </div>

            {followUps.map((f, i) => (
              <div key={i} className="dbot-followup">
                <input
                  type="number"
                  className="save-setup-input dbot-followup__offset"
                  placeholder="min later"
                  value={f.offset}
                  onChange={(e) => updateFollowUp(i, "offset", e.target.value)}
                />
                <Input
                  floatingLabel="Follow-up message"
                  value={f.body}
                  onChange={(e) => updateFollowUp(i, "body", e.target.value)}
                  fullWidth
                />
                <Button variant="ghost" size="small" onClick={() => setFollowUps((prev) => prev.filter((_, idx) => idx !== i))}>
                  Remove
                </Button>
              </div>
            ))}

            <div className="dbot-announce-actions">
              <Button variant="secondary" size="small" onClick={() => setFollowUps((prev) => [...prev, { offset: "", body: "" }])}>
                Add follow-up
              </Button>
              <Button
                variant="primary"
                onClick={() => void sendAnnounce()}
                disabled={sending || !annTitle.trim() || !annBody.trim() || (annMode === "schedule" && !annWhen)}
              >
                {annMode === "now" ? "Post announcement" : "Schedule announcement"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Self-assign role menus */}
      {canEdit && (
        <div className="account-card">
          <h3 className="account-card__title">Self-assign role menus</h3>
          <p className="dbot-muted">
            Post a message with a button per role. Members click to add or remove it. The bot needs
            <strong> Manage Roles</strong> and must be ranked <strong>above</strong> the roles it hands out.
          </p>

          {roleMenus.length > 0 && (
            <ul className="dbot-menus">
              {roleMenus.map((m) => (
                <li key={m.id} className="dbot-menu">
                  <span>
                    <strong>{m.title}</strong> · #{channelName(m.channel_id)} · {m.options.length} role
                    {m.options.length === 1 ? "" : "s"}
                  </span>
                  <Button variant="ghost" size="small" onClick={() => void deleteMenu(m.id)}>Delete</Button>
                </li>
              ))}
            </ul>
          )}

          <div className="dbot-rm-form">
            <Input floatingLabel="Menu title" value={rmTitle} onChange={(e) => setRmTitle(e.target.value)} fullWidth />
            <Select
              floatingLabel="Channel"
              options={[{ value: "", label: "Pick a channel…" }, ...channels.map((c) => ({ value: c.id, label: `#${c.name}` }))]}
              value={rmChannel}
              onChange={(v) => setRmChannel(v as string)}
              fullWidth
            />
            <Select
              floatingLabel="Add a role"
              options={[
                { value: "", label: "Pick a role…" },
                ...guildRoles.filter((r) => !rmRoles.some((x) => x.roleId === r.id)).map((r) => ({ value: r.id, label: r.name })),
              ]}
              value=""
              onChange={(v) => v && addRmRole(v as string)}
              fullWidth
            />
            {rmRoles.map((r, i) => (
              <div key={r.roleId} className="dbot-rm-role">
                <EmojiPicker
                  value={r.emoji}
                  onChange={(v) => updateRmRole(i, "emoji", v)}
                  guildEmojis={guildEmojis}
                  label={r.label}
                />
                <span className="dbot-rm-label">{r.label}</span>
                <Button variant="ghost" size="small" onClick={() => setRmRoles((prev) => prev.filter((_, idx) => idx !== i))}>
                  Remove
                </Button>
              </div>
            ))}
            <div>
              <Button
                variant="primary"
                onClick={() => void postRoleMenu()}
                disabled={rmPosting || !rmTitle.trim() || !rmChannel || rmRoles.length === 0}
              >
                Post role menu
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Emoji reaction roles (gateway worker) */}
      {canEdit && (
        <div className="account-card">
          <h3 className="account-card__title">Emoji reaction roles</h3>
          <p className="dbot-muted">
            Post a message where members <strong>react with an emoji</strong> to get a role. Requires the
            gateway worker running + Manage Roles ranked above the roles.
          </p>

          {reactionMessages.length > 0 && (
            <ul className="dbot-menus">
              {reactionMessages.map((m) => (
                <li key={m.messageId} className="dbot-menu">
                  <span>
                    #{channelName(m.channelId)} · {m.mappings.length} role{m.mappings.length === 1 ? "" : "s"}{" "}
                    <span className="dbot-muted">{m.mappings.map((x) => x.emoji).join(" ")}</span>
                  </span>
                  <Button variant="ghost" size="small" onClick={() => void deleteReactionMessage(m.messageId)}>Delete</Button>
                </li>
              ))}
            </ul>
          )}

          <div className="dbot-rm-form">
            <Input floatingLabel="Message title" value={rrTitle} onChange={(e) => setRrTitle(e.target.value)} fullWidth />
            <Textarea floatingLabel="Description (optional)" value={rrDesc} onChange={(e) => setRrDesc(e.target.value)} rows={2} />
            <Select
              floatingLabel="Channel"
              options={[{ value: "", label: "Pick a channel…" }, ...channels.map((c) => ({ value: c.id, label: `#${c.name}` }))]}
              value={rrChannel}
              onChange={(v) => setRrChannel(v as string)}
              fullWidth
            />
            <Select
              floatingLabel="Add a role"
              options={[
                { value: "", label: "Pick a role…" },
                ...guildRoles.filter((r) => !rrMappings.some((x) => x.roleId === r.id)).map((r) => ({ value: r.id, label: r.name })),
              ]}
              value=""
              onChange={(v) => v && addRrMapping(v as string)}
              fullWidth
            />
            {rrMappings.map((m, i) => (
              <div key={m.roleId} className="dbot-rm-role">
                <EmojiPicker
                  value={m.emoji}
                  onChange={(v) => setRrMappings((prev) => prev.map((x, idx) => (idx === i ? { ...x, emoji: v } : x)))}
                  guildEmojis={guildEmojis}
                  label={m.roleName}
                />
                <span className="dbot-rm-label">{m.roleName}</span>
                <Button variant="ghost" size="small" onClick={() => setRrMappings((prev) => prev.filter((_, idx) => idx !== i))}>
                  Remove
                </Button>
              </div>
            ))}
            <div>
              <Button
                variant="primary"
                onClick={() => void postReactionRoles()}
                disabled={rrPosting || !rrTitle.trim() || !rrChannel || rrMappings.length === 0 || rrMappings.some((m) => !m.emoji)}
              >
                Post reaction roles
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Auto-assign on join (gateway worker) */}
      {canEdit && (
        <div className="account-card">
          <h3 className="account-card__title">Auto-assign roles on join</h3>
          <p className="dbot-muted">
            New members automatically get these roles. Requires the gateway worker + the Server Members intent.
          </p>
          <div className="dbot-rm-form">
            <Select
              floatingLabel="Add a role"
              options={[
                { value: "", label: "Pick a role…" },
                ...guildRoles.filter((r) => !autoroleIds.includes(r.id)).map((r) => ({ value: r.id, label: r.name })),
              ]}
              value=""
              onChange={(v) => v && setAutoroleIds((prev) => [...prev, v as string])}
              fullWidth
            />
            {autoroleIds.length > 0 && (
              <div className="dbot-autoroles">
                {autoroleIds.map((id) => (
                  <span key={id} className="dbot-chip">
                    {guildRoles.find((r) => r.id === id)?.name ?? "role"}
                    <button type="button" onClick={() => setAutoroleIds((prev) => prev.filter((x) => x !== id))} aria-label="Remove">✕</button>
                  </span>
                ))}
              </div>
            )}
            <div>
              <Button variant="primary" onClick={() => void saveAutoroles(autoroleIds)} disabled={autoroleSaving}>
                Save auto-roles
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
