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
  { label: "Self-assign roles (reactions/buttons/dropdown)", free: false, pro: true },
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
    type: string;
    options: Array<{ roleId: string; label: string; emoji: string | null }>;
  }
  const [roleMenus, setRoleMenus] = useState<RoleMenu[]>([]);
  const [guildRoles, setGuildRoles] = useState<Array<{ id: string; name: string }>>([]);
  const [guildEmojis, setGuildEmojis] = useState<GuildEmoji[]>([]);

  // Reaction messages (for the combined list + reaction-role editing).
  interface ReactionMessage {
    messageId: string;
    channelId: string;
    title: string;
    mappings: Array<{ emoji: string; roleId: string }>;
  }
  const [reactionMessages, setReactionMessages] = useState<ReactionMessage[]>([]);
  const [editingRr, setEditingRr] = useState<{
    messageId: string;
    channelId: string;
    title: string;
    mappings: Array<{ roleId: string; roleName: string; emoji: string }>;
  } | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  // Unified "Self-assign roles" create form — one builder, three styles.
  const [sarStyle, setSarStyle] = useState<"reactions" | "buttons" | "dropdown">("reactions");
  const [sarTitle, setSarTitle] = useState("");
  const [sarChannel, setSarChannel] = useState("");
  const [sarMappings, setSarMappings] = useState<Array<{ roleId: string; roleName: string; emoji: string }>>([]);
  const [sarPosting, setSarPosting] = useState(false);
  const [autoroleIds, setAutoroleIds] = useState<string[]>([]);
  const [autoroleSaving, setAutoroleSaving] = useState(false);
  const [proRoleId, setProRoleId] = useState("");
  const [proRoleSaving, setProRoleSaving] = useState(false);
  const [automodKeywords, setAutomodKeywords] = useState("");
  const [automodPresets, setAutomodPresets] = useState<number[]>([]);
  const [automodSaving, setAutomodSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const [routesRes, channelsRes, menusRes, rolesRes, emojisRes, rrRes, autoRes, proRes, amRes] = await Promise.all([
        fetch("/api/discord/bot/routes", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
        fetch("/api/discord/bot/channels", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
        fetch("/api/discord/bot/role-menus", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
        fetch("/api/discord/bot/roles", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
        fetch("/api/discord/bot/emojis", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
        fetch("/api/discord/bot/reaction-roles", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
        fetch("/api/discord/bot/autoroles", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
        fetch("/api/discord/bot/pro-role", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
        fetch("/api/discord/bot/automod", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
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
      if (proRes?.ok) setProRoleId((proRes.roleId as string | null) ?? "");
      if (amRes?.ok) {
        setAutomodKeywords(((amRes.keywords as string[]) ?? []).join(", "));
        setAutomodPresets((amRes.presets as number[]) ?? []);
      }
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

  function addSarMapping(roleId: string) {
    if (!roleId || sarMappings.some((m) => m.roleId === roleId)) return;
    const name = guildRoles.find((r) => r.id === roleId)?.name ?? "Role";
    setSarMappings((prev) => [...prev, { roleId, roleName: name, emoji: "" }]);
  }
  async function postSelfRoles() {
    const needsEmoji = sarStyle === "reactions";
    if (!sarTitle.trim() || !sarChannel || sarMappings.length === 0 || sarPosting) return;
    if (needsEmoji && sarMappings.some((m) => !m.emoji)) return;
    setSarPosting(true);
    const res =
      sarStyle === "reactions"
        ? await fetch("/api/discord/bot/reaction-roles", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              channelId: sarChannel,
              title: sarTitle,
              mappings: sarMappings.map((m) => ({ emoji: m.emoji, roleId: m.roleId })),
            }),
          })
        : await fetch("/api/discord/bot/role-menus", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              channelId: sarChannel,
              title: sarTitle,
              type: sarStyle === "dropdown" ? "select" : "button",
              options: sarMappings.map((m) => ({ roleId: m.roleId, label: m.roleName, emoji: m.emoji || null })),
            }),
          });
    setSarPosting(false);
    if (res.ok) {
      toast.success("Self-assign roles posted to Discord.");
      setSarTitle("");
      setSarChannel("");
      setSarMappings([]);
      const [rr, rm] = await Promise.all([
        fetch("/api/discord/bot/reaction-roles").then((r) => r.json()).catch(() => null),
        fetch("/api/discord/bot/role-menus").then((r) => r.json()).catch(() => null),
      ]);
      if (rr?.ok) setReactionMessages(rr.messages as ReactionMessage[]);
      if (rm?.ok) setRoleMenus(rm.menus as RoleMenu[]);
    } else {
      toast.error("Could not post. Check the bot has Manage Roles, is ranked above the roles, and (for reactions) the worker is running.");
    }
  }
  async function deleteMenu(id: string) {
    await fetch(`/api/discord/bot/role-menus?id=${id}`, { method: "DELETE" });
    setRoleMenus((prev) => prev.filter((m) => m.id !== id));
  }
  async function deleteReactionMessage(messageId: string) {
    await fetch(`/api/discord/bot/reaction-roles?messageId=${messageId}`, { method: "DELETE" });
    setReactionMessages((prev) => prev.filter((m) => m.messageId !== messageId));
  }
  function startEditRr(m: ReactionMessage) {
    setEditingRr({
      messageId: m.messageId,
      channelId: m.channelId,
      title: m.title,
      mappings: m.mappings.map((x) => ({
        roleId: x.roleId,
        roleName: guildRoles.find((r) => r.id === x.roleId)?.name ?? "Role",
        emoji: x.emoji,
      })),
    });
  }
  async function saveEditRr() {
    if (!editingRr || editSaving) return;
    if (!editingRr.title.trim() || editingRr.mappings.length === 0 || editingRr.mappings.some((m) => !m.emoji)) return;
    setEditSaving(true);
    const res = await fetch("/api/discord/bot/reaction-roles", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messageId: editingRr.messageId,
        title: editingRr.title,
        mappings: editingRr.mappings.map((m) => ({ emoji: m.emoji, roleId: m.roleId })),
      }),
    });
    setEditSaving(false);
    if (res.ok) {
      toast.success("Reaction roles updated.");
      setEditingRr(null);
      const d = await fetch("/api/discord/bot/reaction-roles").then((r) => r.json()).catch(() => null);
      if (d?.ok) setReactionMessages(d.messages as ReactionMessage[]);
    } else {
      toast.error("Could not update. Check the bot's permissions.");
    }
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

  async function saveProRole(roleId: string) {
    setProRoleSaving(true);
    const res = await fetch("/api/discord/bot/pro-role", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roleId: roleId || null }),
    });
    setProRoleSaving(false);
    if (res.ok) toast.success("GS Pro role saved.");
    else toast.error("Could not save the GS Pro role.");
  }

  function toggleAutomodPreset(n: number) {
    setAutomodPresets((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]));
  }
  async function saveAutomod() {
    setAutomodSaving(true);
    const keywords = automodKeywords.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
    const res = await fetch("/api/discord/bot/automod", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keywords, presets: automodPresets }),
    });
    setAutomodSaving(false);
    if (res.ok) toast.success("AutoMod saved.");
    else toast.error("Could not save AutoMod. The bot needs Manage Server.");
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

      {/* Self-assign roles — reactions / buttons / dropdown, one builder */}
      {canEdit && (
        <div className="account-card">
          <h3 className="account-card__title">Self-assign roles</h3>
          <p className="dbot-muted">
            Let members pick their own roles. Choose a style: <strong>Reactions</strong> (react with an emoji;
            needs the gateway worker), <strong>Buttons</strong>, or a <strong>Dropdown</strong>. The bot needs
            <strong> Manage Roles</strong> ranked <strong>above</strong> the roles.
          </p>

          {(reactionMessages.length > 0 || roleMenus.length > 0) && (
            <ul className="dbot-menus">
              {reactionMessages.map((m) => (
                <li key={`rr-${m.messageId}`} className={editingRr?.messageId === m.messageId ? "dbot-menu-edit" : "dbot-menu"}>
                  {editingRr?.messageId === m.messageId ? (
                    <div className="dbot-rm-form">
                      <Input
                        floatingLabel="Message title"
                        value={editingRr.title}
                        onChange={(e) => setEditingRr({ ...editingRr, title: e.target.value })}
                        fullWidth
                      />
                      <Select
                        floatingLabel="Add a role"
                        options={[
                          { value: "", label: "Pick a role…" },
                          ...guildRoles.filter((r) => !editingRr.mappings.some((x) => x.roleId === r.id)).map((r) => ({ value: r.id, label: r.name })),
                        ]}
                        value=""
                        onChange={(v) => {
                          if (!v) return;
                          const name = guildRoles.find((r) => r.id === v)?.name ?? "Role";
                          setEditingRr({ ...editingRr, mappings: [...editingRr.mappings, { roleId: v as string, roleName: name, emoji: "" }] });
                        }}
                        fullWidth
                      />
                      {editingRr.mappings.map((mm, i) => (
                        <div key={mm.roleId} className="dbot-rm-role">
                          <EmojiPicker
                            value={mm.emoji}
                            onChange={(val) => setEditingRr({ ...editingRr, mappings: editingRr.mappings.map((x, idx) => (idx === i ? { ...x, emoji: val } : x)) })}
                            guildEmojis={guildEmojis}
                            label={mm.roleName}
                          />
                          <span className="dbot-rm-label">{mm.roleName}</span>
                          <Button variant="ghost" size="small" onClick={() => setEditingRr({ ...editingRr, mappings: editingRr.mappings.filter((_, idx) => idx !== i) })}>
                            Remove
                          </Button>
                        </div>
                      ))}
                      <div className="dbot-announce-actions">
                        <Button variant="ghost" size="small" onClick={() => setEditingRr(null)}>Cancel</Button>
                        <Button
                          variant="primary"
                          size="small"
                          onClick={() => void saveEditRr()}
                          disabled={editSaving || !editingRr.title.trim() || editingRr.mappings.length === 0 || editingRr.mappings.some((x) => !x.emoji)}
                        >
                          Save changes
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <span>
                        <span className="dbot-tag">Reactions</span> {m.title ? <strong>{m.title}</strong> : `#${channelName(m.channelId)}`} · {m.mappings.length} role{m.mappings.length === 1 ? "" : "s"}
                      </span>
                      <span className="dbot-menu-actions">
                        <Button variant="ghost" size="small" onClick={() => startEditRr(m)}>Edit</Button>
                        <Button variant="ghost" size="small" onClick={() => void deleteReactionMessage(m.messageId)}>Delete</Button>
                      </span>
                    </>
                  )}
                </li>
              ))}
              {roleMenus.map((m) => (
                <li key={`rm-${m.id}`} className="dbot-menu">
                  <span>
                    <span className="dbot-tag">{m.type === "select" ? "Dropdown" : "Buttons"}</span> <strong>{m.title}</strong> · #{channelName(m.channel_id)} · {m.options.length} role{m.options.length === 1 ? "" : "s"}
                  </span>
                  <Button variant="ghost" size="small" onClick={() => void deleteMenu(m.id)}>Delete</Button>
                </li>
              ))}
            </ul>
          )}

          <div className="dbot-rm-form">
            <div className="dbot-mode">
              <Chip label="Reactions" variant={sarStyle === "reactions" ? "primary" : "default"} onClick={() => setSarStyle("reactions")} />
              <Chip label="Buttons" variant={sarStyle === "buttons" ? "primary" : "default"} onClick={() => setSarStyle("buttons")} />
              <Chip label="Dropdown" variant={sarStyle === "dropdown" ? "primary" : "default"} onClick={() => setSarStyle("dropdown")} />
            </div>
            <Input floatingLabel="Message title" value={sarTitle} onChange={(e) => setSarTitle(e.target.value)} fullWidth />
            <Select
              floatingLabel="Channel"
              options={[{ value: "", label: "Pick a channel…" }, ...channels.map((c) => ({ value: c.id, label: `#${c.name}` }))]}
              value={sarChannel}
              onChange={(v) => setSarChannel(v as string)}
              fullWidth
            />
            <Select
              floatingLabel="Add a role"
              options={[
                { value: "", label: "Pick a role…" },
                ...guildRoles.filter((r) => !sarMappings.some((x) => x.roleId === r.id)).map((r) => ({ value: r.id, label: r.name })),
              ]}
              value=""
              onChange={(v) => v && addSarMapping(v as string)}
              fullWidth
            />
            {sarMappings.map((m, i) => (
              <div key={m.roleId} className="dbot-rm-role">
                <EmojiPicker
                  value={m.emoji}
                  onChange={(v) => setSarMappings((prev) => prev.map((x, idx) => (idx === i ? { ...x, emoji: v } : x)))}
                  guildEmojis={guildEmojis}
                  label={m.roleName}
                />
                <span className="dbot-rm-label">
                  {m.roleName}
                  {sarStyle === "reactions" && !m.emoji && <span className="dbot-req"> · emoji required</span>}
                </span>
                <Button variant="ghost" size="small" onClick={() => setSarMappings((prev) => prev.filter((_, idx) => idx !== i))}>
                  Remove
                </Button>
              </div>
            ))}
            <div>
              <Button
                variant="primary"
                onClick={() => void postSelfRoles()}
                disabled={sarPosting || !sarTitle.trim() || !sarChannel || sarMappings.length === 0 || (sarStyle === "reactions" && sarMappings.some((m) => !m.emoji))}
              >
                {sarPosting ? "Posting…" : "Post self-assign roles"}
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

      {/* GS Pro member role (serverless sync) */}
      {canEdit && (
        <div className="account-card">
          <h3 className="account-card__title">GS Pro member role</h3>
          <p className="dbot-muted">
            Give members who support GameShuffle with <strong>GS Pro</strong> a role in your server. It syncs
            automatically for anyone who has linked their Discord to GameShuffle (granted on join, reconciled
            every ~30 min, removed on downgrade).
          </p>
          <div className="dbot-rm-form">
            <Select
              floatingLabel="GS Pro role"
              options={[{ value: "", label: "None" }, ...guildRoles.map((r) => ({ value: r.id, label: r.name }))]}
              value={proRoleId}
              onChange={(v) => setProRoleId(v as string)}
              fullWidth
            />
            <div>
              <Button variant="primary" onClick={() => void saveProRole(proRoleId)} disabled={proRoleSaving}>
                Save GS Pro role
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Native AutoMod */}
      {canEdit && (
        <div className="account-card">
          <h3 className="account-card__title">AutoMod</h3>
          <p className="dbot-muted">
            Discord blocks these automatically (no bot latency). Add words to block, and/or switch on
            Discord&apos;s built-in filters. The bot needs <strong>Manage Server</strong>.
          </p>
          <div className="dbot-rm-form">
            <Textarea
              floatingLabel="Blocked words (comma or line separated)"
              value={automodKeywords}
              onChange={(e) => setAutomodKeywords(e.target.value)}
              rows={3}
            />
            <div className="dbot-automod-presets">
              <label><input type="checkbox" checked={automodPresets.includes(1)} onChange={() => toggleAutomodPreset(1)} /> Profanity</label>
              <label><input type="checkbox" checked={automodPresets.includes(2)} onChange={() => toggleAutomodPreset(2)} /> Sexual content</label>
              <label><input type="checkbox" checked={automodPresets.includes(3)} onChange={() => toggleAutomodPreset(3)} /> Slurs</label>
            </div>
            <div>
              <Button variant="primary" onClick={() => void saveAutomod()} disabled={automodSaving}>
                Save AutoMod
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
