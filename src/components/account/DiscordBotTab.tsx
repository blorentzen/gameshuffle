"use client";

/**
 * Discord Bot tab (Streamer) — manage the GameShuffle bot. Overview + Free/Pro
 * capability matrix (upsell), install status, and a drag-and-drop routing board
 * that sends each GS interaction to a specific Discord channel.
 *
 * Routing is GS Pro. Free streamers see the board locked with an upgrade CTA.
 */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Button, Select, Input, Textarea, Switch, Modal } from "@empac/cascadeds";
import {
  DndContext,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  PointerSensor,
  TouchSensor,
  type DragEndEvent,
} from "@dnd-kit/core";
import { useToast } from "@/components/toast/ToastProvider";
import { EmojiPicker, type GuildEmoji } from "@/components/account/EmojiPicker";
import { ROUTE_CATEGORIES, type RouteCategoryDef } from "@/lib/discord/routeCategories";

interface Channel {
  id: string;
  name: string;
}

interface QotdMgmt {
  commandId: string | null;
  lowThreshold: number;
  today: {
    question: string | null;
    claimed: boolean;
    remaining: number;
    total: number;
    exhausted: boolean;
    paused: boolean;
    yours: number;
  };
  questions: { id: string; response: string; enabled: boolean }[];
  settings: { allowRepeats: boolean; warnWhenLow: boolean };
}

const DEFAULT_COL = "default";

/** Greyed, inactive placeholder shown to Free accounts for a GS Pro feature. */
function LockedFeature({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="account-card dbot-locked">
      <div className="dbot-locked__head">
        <h3 className="account-card__title">{title}</h3>
        <span className="dbot-lock-badge">GS Pro</span>
      </div>
      <p className="dbot-muted">{children}</p>
    </div>
  );
}

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, h) => ({
  value: String(h),
  label: `${h % 12 || 12}:00 ${h < 12 ? "AM" : "PM"}`,
}));

function CategoryCard({
  cat,
  draggable,
  onOpen,
}: {
  cat: RouteCategoryDef;
  draggable: boolean;
  onOpen?: (cat: RouteCategoryDef) => void;
}) {
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
      // Drag to move, or click to pick a channel in a modal (no-drag fallback).
      onClick={draggable && onOpen ? () => onOpen(cat) : undefined}
      title={draggable ? "Drag to a channel, or click to choose one" : undefined}
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
  const [sarBody, setSarBody] = useState("");
  const [sarPosting, setSarPosting] = useState(false);
  const [sarModalOpen, setSarModalOpen] = useState(false);
  const [autoroleIds, setAutoroleIds] = useState<string[]>([]);
  const [autoroleSaving, setAutoroleSaving] = useState(false);
  const [proRoleId, setProRoleId] = useState("");
  const [proRoleSaving, setProRoleSaving] = useState(false);
  const [automodKeywords, setAutomodKeywords] = useState("");
  const [automodPresets, setAutomodPresets] = useState<number[]>([]);
  const [automodSaving, setAutomodSaving] = useState(false);
  const [logChannelId, setLogChannelId] = useState("");
  const [logEvents, setLogEvents] = useState<Record<string, boolean>>({});
  const [logSaving, setLogSaving] = useState(false);
  const [eventSubs, setEventSubs] = useState<Record<string, boolean>>({});
  const [qotdSaving, setQotdSaving] = useState(false);
  const [qotdHour, setQotdHour] = useState<number | null>(null);
  const [qotdPosting, setQotdPosting] = useState(false);
  const [scheduledPosts, setScheduledPosts] = useState<Array<{ id: string; title: string; fireAt: string }>>([]);
  const [qotd, setQotd] = useState<QotdMgmt | null>(null);
  const [newQuestion, setNewQuestion] = useState("");
  const [editingQ, setEditingQ] = useState<{ id: string; text: string } | null>(null);
  const [qotdBusy, setQotdBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const [routesRes, channelsRes, menusRes, rolesRes, emojisRes, rrRes, autoRes, proRes, amRes, routingRes, schedRes, qotdRes, logRes] = await Promise.all([
        fetch("/api/discord/bot/routes", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
        fetch("/api/discord/bot/channels", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
        fetch("/api/discord/bot/role-menus", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
        fetch("/api/discord/bot/roles", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
        fetch("/api/discord/bot/emojis", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
        fetch("/api/discord/bot/reaction-roles", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
        fetch("/api/discord/bot/autoroles", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
        fetch("/api/discord/bot/pro-role", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
        fetch("/api/discord/bot/automod", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
        fetch("/api/discord/bot/routing", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
        fetch("/api/discord/bot/scheduled", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
        fetch("/api/discord/bot/qotd", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
        fetch("/api/discord/bot/logging", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
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
      if (routingRes?.ok) {
        setEventSubs((routingRes.routing?.eventSubscriptions as Record<string, boolean>) ?? {});
        setQotdHour((routingRes.routing?.qotdHour as number | null) ?? null);
      }
      if (schedRes?.ok) setScheduledPosts((schedRes.posts as Array<{ id: string; title: string; fireAt: string }>) ?? []);
      if (qotdRes?.ok && qotdRes.hasCommunity) setQotd(qotdRes as QotdMgmt);
      if (logRes?.ok) {
        setLogChannelId((logRes.channelId as string | null) ?? "");
        setLogEvents((logRes.events as Record<string, boolean> | null) ?? {});
      }
      setLoading(false);
    })();
  }, []);

  const channelName = useCallback(
    (id: string | null) => (id ? channels.find((c) => c.id === id)?.name ?? "channel" : null),
    [channels],
  );

  // Activation constraints so a click isn't captured as a drag, and touch
  // doesn't fight scroll (same fix as the Companion board).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
  );
  const [routeModalCat, setRouteModalCat] = useState<RouteCategoryDef | null>(null);

  function assignRoute(catKey: string, channelId: string | null) {
    setRoutes((prev) => {
      const next = { ...prev };
      if (!channelId) delete next[catKey];
      else next[catKey] = channelId;
      return next;
    });
    setDirty(true);
    setRouteModalCat(null);
  }

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
      const s = await fetch("/api/discord/bot/scheduled").then((r) => r.json()).catch(() => null);
      if (s?.ok) setScheduledPosts(s.posts as Array<{ id: string; title: string; fireAt: string }>);
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
              description: sarBody || null,
              mappings: sarMappings.map((m) => ({ emoji: m.emoji, roleId: m.roleId })),
            }),
          })
        : await fetch("/api/discord/bot/role-menus", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              channelId: sarChannel,
              title: sarTitle,
              description: sarBody || null,
              type: sarStyle === "dropdown" ? "select" : "button",
              options: sarMappings.map((m) => ({ roleId: m.roleId, label: m.roleName, emoji: m.emoji || null })),
            }),
          });
    setSarPosting(false);
    if (res.ok) {
      toast.success("Self-assign roles posted to Discord.");
      setSarTitle("");
      setSarBody("");
      setSarChannel("");
      setSarMappings([]);
      setSarModalOpen(false);
      const [rr, rm] = await Promise.all([
        fetch("/api/discord/bot/reaction-roles").then((r) => r.json()).catch(() => null),
        fetch("/api/discord/bot/role-menus").then((r) => r.json()).catch(() => null),
      ]);
      if (rr?.ok) setReactionMessages(rr.messages as ReactionMessage[]);
      if (rm?.ok) setRoleMenus(rm.menus as RoleMenu[]);
    } else {
      toast.error("Couldn't post. Make sure the GameShuffle bot has permission to manage roles and its role sits above the roles you're handing out.");
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

  const LOG_EVENTS: Array<{ key: string; label: string }> = [
    { key: "message_delete", label: "Message deleted" },
    { key: "message_edit", label: "Message edited" },
    { key: "member_join", label: "Member joined" },
    { key: "member_leave", label: "Member left" },
    { key: "role_change", label: "Roles changed" },
  ];
  // A missing key defaults ON (matches the worker), so treat undefined as true.
  const logOn = (key: string) => logEvents[key] !== false;
  async function saveLogging(patch: { channel_id?: string | null; events?: Record<string, boolean> }) {
    setLogSaving(true);
    const res = await fetch("/api/discord/bot/logging", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    setLogSaving(false);
    if (res.ok) toast.success("Logging saved.");
    else toast.error("Could not save logging settings.");
  }
  function setLogChannel(id: string) {
    setLogChannelId(id);
    void saveLogging({ channel_id: id || null });
  }
  function toggleLogEvent(key: string, on: boolean) {
    const next = { ...logEvents, [key]: on };
    setLogEvents(next);
    void saveLogging({ events: next });
  }

  async function saveQotd(enabled: boolean) {
    setQotdSaving(true);
    const next = { ...eventSubs, qotd: enabled };
    const res = await fetch("/api/discord/bot/routing", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_subscriptions: next }),
    });
    setQotdSaving(false);
    if (res.ok) {
      setEventSubs(next);
      toast.success(enabled ? "Question of the Day will post to Discord." : "Question of the Day posting turned off.");
    } else {
      toast.error("Could not update that setting.");
    }
  }
  async function saveQotdHour(hour: number) {
    setQotdHour(hour);
    const res = await fetch("/api/discord/bot/routing", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ qotd_hour: hour }),
    });
    if (res.ok) toast.success("Post time saved.");
    else toast.error("Could not save the post time.");
  }
  async function postQotdNow() {
    if (qotdPosting) return;
    setQotdPosting(true);
    const res = await fetch("/api/discord/bot/qotd-now", { method: "POST" });
    setQotdPosting(false);
    const d = await res.json().catch(() => null);
    if (res.ok) toast.success("Question of the Day posted to Discord.");
    else if (d?.error === "already_posted") toast.info("Today's question was already posted.");
    else if (d?.error === "no_questions") toast.error("No questions to post yet. Add some in the QOTD command first.");
    else toast.error("Could not post right now.");
  }
  async function cancelScheduled(id: string) {
    await fetch(`/api/discord/bot/scheduled?id=${id}`, { method: "DELETE" });
    setScheduledPosts((prev) => prev.filter((p) => p.id !== id));
  }

  async function reloadQotd() {
    const d = await fetch("/api/discord/bot/qotd", { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    if (d?.ok && d.hasCommunity) setQotd(d as QotdMgmt);
  }
  async function addQuestion() {
    const text = newQuestion.trim();
    if (!qotd?.commandId || !text || qotdBusy) return;
    setQotdBusy(true);
    const res = await fetch(`/api/account/command-pool/${qotd.commandId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ response: text }),
    });
    setQotdBusy(false);
    if (res.ok) {
      setNewQuestion("");
      toast.success("Question added.");
      await reloadQotd();
    } else toast.error("Could not add that question.");
  }
  async function saveEditedQuestion() {
    const text = editingQ?.text.trim() ?? "";
    if (!qotd?.commandId || !editingQ || !text || qotdBusy) return;
    setQotdBusy(true);
    const res = await fetch(`/api/account/command-pool/${qotd.commandId}/${editingQ.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ response: text }),
    });
    setQotdBusy(false);
    if (res.ok) {
      setEditingQ(null);
      toast.success("Question updated.");
      await reloadQotd();
    } else toast.error("Could not update that question.");
  }
  async function removeQuestion(id: string) {
    if (!qotd?.commandId || qotdBusy) return;
    setQotdBusy(true);
    const res = await fetch(`/api/account/command-pool/${qotd.commandId}/${id}`, { method: "DELETE" });
    setQotdBusy(false);
    if (res.ok) {
      toast.success("Question removed.");
      await reloadQotd();
    } else toast.error("Could not remove that question.");
  }
  async function saveQotdSetting(patch: { allow_repeats?: boolean; warn_when_low?: boolean }) {
    setQotd((q) =>
      q
        ? {
            ...q,
            settings: {
              allowRepeats: patch.allow_repeats ?? q.settings.allowRepeats,
              warnWhenLow: patch.warn_when_low ?? q.settings.warnWhenLow,
            },
          }
        : q,
    );
    await fetch("/api/discord/bot/qotd", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    await reloadQotd();
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

      {/* Free accounts: one clear indicator + CTA (full comparison lives on /gs-pro). */}
      {!isPro && (
        <div className="dbot-pro-banner">
          <span>
            The sections below are GS Pro. On Free, the bot posts to your single default channel.
          </span>
          <Link href="/gs-pro"><Button variant="primary" size="small">See GS Pro</Button></Link>
        </div>
      )}

      {/* Routing board */}
      {!isPro ? (
        <LockedFeature title="Channel routing">
          Send each type of post to its own channel. On Free, everything posts to your default channel.
        </LockedFeature>
      ) : (
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
          ) : (
            <>
              <p className="dbot-muted">
                Drag each post type onto the channel it should go to. Anything left under
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
              <p className="dbot-muted">Tip: drag a post type onto a channel, or click it to pick one.</p>
              <DndContext sensors={sensors} onDragEnd={onDragEnd}>
                <div className="dbot-board">
                  <ChannelColumn
                    id={DEFAULT_COL}
                    title="Default"
                    subtitle={defaultChannelId ? `#${channelName(defaultChannelId)}` : "no default set"}
                  >
                    {catsFor(DEFAULT_COL).map((c) => (
                      <CategoryCard key={c.key} cat={c} draggable onOpen={setRouteModalCat} />
                    ))}
                  </ChannelColumn>
                  {namedColumns.map((colId) => (
                    <ChannelColumn key={colId} id={colId} title={`#${channelName(colId)}`}>
                      {catsFor(colId).map((c) => (
                        <CategoryCard key={c.key} cat={c} draggable onOpen={setRouteModalCat} />
                      ))}
                    </ChannelColumn>
                  ))}
                </div>
              </DndContext>

              {routeModalCat && (
                <Modal
                  isOpen
                  onClose={() => setRouteModalCat(null)}
                  title={`Route “${routeModalCat.label}”`}
                  size="small"
                  secondaryAction={{ label: "Cancel", onClick: () => setRouteModalCat(null) }}
                >
                  <p className="dbot-muted">{routeModalCat.desc}</p>
                  <Select
                    floatingLabel="Send to channel"
                    options={[
                      { value: DEFAULT_COL, label: `Default${defaultChannelId ? ` (#${channelName(defaultChannelId)})` : ""}` },
                      ...channels.map((c) => ({ value: c.id, label: `#${c.name}` })),
                    ]}
                    value={routes[routeModalCat.key] ?? DEFAULT_COL}
                    onChange={(v) =>
                      assignRoute(routeModalCat.key, v === DEFAULT_COL ? null : (v as string))
                    }
                    fullWidth
                  />
                </Modal>
              )}
            </>
          )}
        </div>
      )}

      {/* Free accounts see the rest of the suite as greyed, inactive spaces. */}
      {!isPro && (
        <>
          <LockedFeature title="Announcements">
            Post rich announcements now or on a schedule, with optional follow-up reminders.
          </LockedFeature>
          <LockedFeature title="Self-assign roles">
            Let members pick their own roles with reactions, buttons, or a dropdown menu.
          </LockedFeature>
          <LockedFeature title="Roles for new members">
            Automatically give people a role the moment they join your server.
          </LockedFeature>
          <LockedFeature title="GS Pro member role">
            Automatically give your linked GS Pro members a role you choose.
          </LockedFeature>
          <LockedFeature title="AutoMod">
            Block unwanted words and content using Discord&apos;s built-in AutoMod.
          </LockedFeature>
          <LockedFeature title="Server logging">
            Log message edits/deletes, joins/leaves, and role changes to a channel.
          </LockedFeature>
          <LockedFeature title="Question of the Day">
            Post a daily question to spark conversation, on the schedule you set.
          </LockedFeature>
        </>
      )}

      {/* Announcements */}
      {canEdit && (
        <div className="account-card">
          <h3 className="account-card__title">Announcements</h3>
          <p className="dbot-muted">
            Post a rich announcement to your announcements channel now, or schedule it,
            with optional follow-ups (e.g. &ldquo;starts in 1 hour&rdquo;).
          </p>

          {scheduledPosts.length > 0 && (
            <>
              <p className="dbot-subhead">Scheduled</p>
              <ul className="dbot-menus">
                {scheduledPosts.map((s) => (
                  <li key={s.id} className="dbot-menu">
                    <span>
                      <strong>{s.title}</strong> · {new Date(s.fireAt).toLocaleString()}
                    </span>
                    <Button variant="ghost" size="small" onClick={() => void cancelScheduled(s.id)}>Cancel</Button>
                  </li>
                ))}
              </ul>
            </>
          )}

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
              <Button size="small" variant={annMode === "now" ? "primary" : "secondary"} onClick={() => setAnnMode("now")}>Send now</Button>
              <Button size="small" variant={annMode === "schedule" ? "primary" : "secondary"} onClick={() => setAnnMode("schedule")}>Schedule</Button>
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
            Let members pick their own roles. Choose how they do it: react with an emoji, click a button, or
            use a dropdown menu. One heads-up: in your server&apos;s role settings, the GameShuffle bot&apos;s
            role has to sit <strong>above</strong> any role it hands out, or Discord won&apos;t let it.
          </p>

          {(reactionMessages.length > 0 || roleMenus.length > 0) && (
            <ul className="dbot-menus">
              {reactionMessages.map((m) => (
                <li key={`rr-${m.messageId}`} className="dbot-menu">
                  <span>
                    <span className="dbot-tag">Reactions</span> {m.title ? <strong>{m.title}</strong> : `#${channelName(m.channelId)}`} · {m.mappings.length} role{m.mappings.length === 1 ? "" : "s"}
                  </span>
                  <span className="dbot-menu-actions">
                    <Button variant="ghost" size="small" onClick={() => startEditRr(m)}>Edit</Button>
                    <Button variant="ghost" size="small" onClick={() => void deleteReactionMessage(m.messageId)}>Delete</Button>
                  </span>
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

          <Button variant="secondary" size="small" onClick={() => setSarModalOpen(true)}>
            Add self-assign roles
          </Button>

          {sarModalOpen && (
            <Modal
              isOpen
              onClose={() => setSarModalOpen(false)}
              title="Add self-assign roles"
              size="medium"
              primaryAction={{ label: sarPosting ? "Posting…" : "Post to Discord", onClick: () => void postSelfRoles() }}
              secondaryAction={{ label: "Cancel", onClick: () => setSarModalOpen(false) }}
            >
              <div className="dbot-rm-form">
                <div className="dbot-mode">
                  <Button size="small" variant={sarStyle === "reactions" ? "primary" : "secondary"} onClick={() => setSarStyle("reactions")}>React with emoji</Button>
                  <Button size="small" variant={sarStyle === "buttons" ? "primary" : "secondary"} onClick={() => setSarStyle("buttons")}>Buttons</Button>
                  <Button size="small" variant={sarStyle === "dropdown" ? "primary" : "secondary"} onClick={() => setSarStyle("dropdown")}>Dropdown</Button>
                </div>
                <Input floatingLabel="Message title" value={sarTitle} onChange={(e) => setSarTitle(e.target.value)} fullWidth />
                <Textarea floatingLabel="Message text (optional)" value={sarBody} onChange={(e) => setSarBody(e.target.value)} rows={2} />
                <Select
                  floatingLabel="Channel to post in"
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
                    <Button variant="ghost" size="small" onClick={() => setSarMappings((prev) => prev.filter((_, idx) => idx !== i))}>Remove</Button>
                  </div>
                ))}
              </div>
            </Modal>
          )}

          {editingRr && (
            <Modal
              isOpen
              onClose={() => setEditingRr(null)}
              title="Edit self-assign roles"
              size="medium"
              primaryAction={{ label: editSaving ? "Saving…" : "Save changes", onClick: () => void saveEditRr() }}
              secondaryAction={{ label: "Cancel", onClick: () => setEditingRr(null) }}
            >
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
                    <Button variant="ghost" size="small" onClick={() => setEditingRr({ ...editingRr, mappings: editingRr.mappings.filter((_, idx) => idx !== i) })}>Remove</Button>
                  </div>
                ))}
              </div>
            </Modal>
          )}
        </div>
      )}

      {/* Auto-assign on join (gateway worker) */}
      {canEdit && (
        <div className="account-card">
          <h3 className="account-card__title">Roles for new members</h3>
          <p className="dbot-muted">
            Pick roles that everyone gets automatically the moment they join your server.
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
            Give members who support GameShuffle with <strong>GS Pro</strong> a special role in your server.
            Anyone who has connected their Discord to GameShuffle gets it automatically (when they join, or
            within about 30 minutes), and loses it if they cancel Pro.
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
            Automatically block messages in your server. Add your own words to block, and/or switch on
            Discord&apos;s built-in filters. Discord enforces this for you.
          </p>
          <div className="dbot-rm-form">
            <Textarea
              floatingLabel="Blocked words"
              value={automodKeywords}
              onChange={(e) => setAutomodKeywords(e.target.value)}
              rows={3}
            />
            <p className="dbot-muted">Separate words with commas or new lines.</p>
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

      {/* Server logging */}
      {canEdit && (
        <div className="account-card">
          <h3 className="account-card__title">Server logging</h3>
          <p className="dbot-muted">
            Keep a record of what happens in your server — message edits and deletes, members joining and
            leaving, and role changes — posted to a channel you choose. Pick a channel below and choose
            which events to log.
          </p>
          <div className="dbot-rm-form">
            <Select
              floatingLabel="Log channel"
              options={[
                { value: "", label: "Off — don't log" },
                ...channels.map((c) => ({ value: c.id, label: `#${c.name}` })),
              ]}
              value={logChannelId}
              onChange={(v) => setLogChannel(v as string)}
              disabled={logSaving}
              fullWidth
            />
            {logChannelId && (
              <div className="dbot-log-events">
                {LOG_EVENTS.map((e) => (
                  <Switch
                    key={e.key}
                    checked={logOn(e.key)}
                    disabled={logSaving}
                    onChange={(ev) => toggleLogEvent(e.key, ev.target.checked)}
                    label={e.label}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Question of the Day */}
      {canEdit && (
        <div className="account-card">
          <h3 className="account-card__title">Question of the Day</h3>
          <p className="dbot-muted">
            Post GameShuffle&apos;s daily Question of the Day to your server to spark conversation. It goes to
            the channel you set for &ldquo;Question of the Day&rdquo; in the routing above (or your default channel).
          </p>
          <Switch
            checked={!!eventSubs.qotd}
            disabled={qotdSaving}
            onChange={(e) => void saveQotd(e.target.checked)}
            label="Post the Question of the Day to Discord each day"
          />
          {eventSubs.qotd && (
            <div className="dbot-qotd-time">
              <Select
                floatingLabel="Post time (your local time)"
                options={HOUR_OPTIONS}
                value={String(qotdHour ?? 12)}
                onChange={(v) => void saveQotdHour(Number(v))}
                fullWidth
              />
            </div>
          )}
          <div className="dbot-qotd-now">
            <Button variant="secondary" size="small" onClick={() => void postQotdNow()} disabled={qotdPosting}>
              {qotdPosting ? "Posting…" : "Post today's question now"}
            </Button>
            <span className="dbot-muted">Posts immediately; the scheduled post won&apos;t repeat it today.</span>
          </div>

          {qotd && (
            <div className="dbot-qotd-manage">
              <p className="dbot-subhead">Today&apos;s question</p>
              {qotd.today.paused ? (
                <p className="dbot-muted">
                  You&apos;ve used all your questions — nothing will post until you add more below or allow repeats.
                </p>
              ) : qotd.today.question ? (
                <p className="dbot-qotd-preview">&ldquo;{qotd.today.question}&rdquo;</p>
              ) : (
                <p className="dbot-muted">
                  No questions yet. Add your first below — GameShuffle&apos;s default questions are included too.
                </p>
              )}
              {qotd.today.total > 0 && (
                <p className="dbot-muted">
                  {qotd.today.remaining} of {qotd.today.total} questions unused
                  {qotd.today.yours > 0 ? ` · ${qotd.today.yours} of them yours` : ""}
                  {qotd.today.claimed ? " · locked in for today" : ""}
                </p>
              )}

              <p className="dbot-subhead">Your questions</p>
              {qotd.questions.length === 0 ? (
                <p className="dbot-muted">None yet. GameShuffle&apos;s defaults still post; add your own to make it yours.</p>
              ) : (
                <ul className="dbot-menus">
                  {qotd.questions.map((q) => (
                    <li key={q.id} className="dbot-menu">
                      {editingQ?.id === q.id ? (
                        <div className="dbot-qotd-editrow">
                          <Input
                            value={editingQ.text}
                            onChange={(e) => setEditingQ({ id: q.id, text: e.target.value })}
                            fullWidth
                          />
                          <Button variant="primary" size="small" onClick={() => void saveEditedQuestion()} disabled={qotdBusy}>Save</Button>
                          <Button variant="ghost" size="small" onClick={() => setEditingQ(null)}>Cancel</Button>
                        </div>
                      ) : (
                        <>
                          <span>{q.response}</span>
                          <span className="dbot-menu-actions">
                            <Button variant="ghost" size="small" onClick={() => setEditingQ({ id: q.id, text: q.response })}>Edit</Button>
                            <Button variant="ghost" size="small" onClick={() => void removeQuestion(q.id)} disabled={qotdBusy}>Remove</Button>
                          </span>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <div className="dbot-qotd-editrow dbot-qotd-add">
                <Input
                  floatingLabel="Add a question"
                  value={newQuestion}
                  onChange={(e) => setNewQuestion(e.target.value)}
                  fullWidth
                />
                <Button variant="secondary" size="small" onClick={() => void addQuestion()} disabled={qotdBusy || !newQuestion.trim()}>Add</Button>
              </div>

              <div className="dbot-qotd-switches">
                <Switch
                  checked={qotd.settings.warnWhenLow}
                  onChange={(e) => void saveQotdSetting({ warn_when_low: e.target.checked })}
                  label={`Warn me when I'm running low (${qotd.lowThreshold} or fewer unused)`}
                />
                <Switch
                  checked={qotd.settings.allowRepeats}
                  onChange={(e) => void saveQotdSetting({ allow_repeats: e.target.checked })}
                  label="Allow repeats once I've used them all (otherwise posting pauses)"
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
