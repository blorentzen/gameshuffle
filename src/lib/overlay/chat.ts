import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";

/**
 * Chat Timeline Overlay data layer. Capture is gated upstream by
 * `twitch_connections.chat_overlay_enabled` (checked in the webhook) so this
 * only runs for streamers who turned the overlay on. Reads are service-role
 * (the tokenized overlay endpoint); the owner can also read their own rows via
 * RLS. See supabase/chat-overlay-m1.sql.
 */

export type ChatOverlayTheme = "default" | "midnight" | "mint" | "sunset" | "mono";
export type ChatOverlayAnimation = "slide" | "fade" | "none";

export interface ChatOverlaySettings {
  theme: ChatOverlayTheme;
  animation: ChatOverlayAnimation;
  showRoles: string[];
  hideCommands: boolean;
  showGsBadge: boolean;
  maxMessages: number;
}

export interface ChatOverlayMessage {
  id: string;
  senderDisplay: string;
  senderColor: string | null;
  roles: string[];
  isGsUser: boolean;
  gsUsername: string | null;
  text: string;
  createdAt: string;
}

export const DEFAULT_CHAT_OVERLAY_SETTINGS: ChatOverlaySettings = {
  theme: "default",
  animation: "slide",
  showRoles: ["broadcaster", "moderator", "vip", "subscriber", "viewer"],
  hideCommands: true,
  showGsBadge: true,
  maxMessages: 12,
};

const KNOWN_ROLES = new Set(["broadcaster", "moderator", "vip", "subscriber"]);

/** Record one chat message for the timeline. Best-effort; prunes opportunistically. */
export async function recordChatMessage(msg: {
  ownerUserId: string;
  senderLogin: string | null;
  senderDisplay: string | null;
  senderColor: string | null;
  roles: string[];
  isGsUser: boolean;
  gsUsername: string | null;
  text: string;
}): Promise<void> {
  const admin = createServiceClient();
  // Keep only the roles the overlay styles; drop the long tail of badge ids.
  const roles = msg.roles.filter((r) => KNOWN_ROLES.has(r));
  await admin.from("gs_chat_overlay_messages").insert({
    owner_user_id: msg.ownerUserId,
    sender_login: msg.senderLogin,
    sender_display: msg.senderDisplay,
    sender_color: msg.senderColor,
    roles,
    is_gs_user: msg.isGsUser,
    gs_username: msg.gsUsername,
    text: msg.text.slice(0, 500),
  });
  // ~1-in-25 inserts, sweep this owner's messages older than 2 hours so the
  // ring buffer never grows unbounded (no cron needed for v1).
  if (Math.random() < 0.04) {
    const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    await admin
      .from("gs_chat_overlay_messages")
      .delete()
      .eq("owner_user_id", msg.ownerUserId)
      .lt("created_at", cutoff);
  }
}

/** Recent messages for the overlay, oldest→newest, filtered per settings. */
export async function getRecentChatMessages(
  ownerUserId: string,
  settings: ChatOverlaySettings,
  since?: string | null,
): Promise<ChatOverlayMessage[]> {
  const admin = createServiceClient();
  let q = admin
    .from("gs_chat_overlay_messages")
    .select("id, sender_display, sender_color, roles, is_gs_user, gs_username, text, created_at")
    .eq("owner_user_id", ownerUserId)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(settings.maxMessages, 1), 50) * 2); // headroom for filters
  if (since) q = q.gt("created_at", since);
  const { data } = await q;
  const rows = (data ?? []) as Array<{
    id: string;
    sender_display: string | null;
    sender_color: string | null;
    roles: string[] | null;
    is_gs_user: boolean | null;
    gs_username: string | null;
    text: string;
    created_at: string;
  }>;

  const allowViewer = settings.showRoles.includes("viewer");
  const filtered = rows.filter((r) => {
    if (settings.hideCommands && r.text.trim().startsWith("!")) return false;
    const roles = r.roles ?? [];
    if (roles.length === 0) return allowViewer; // plain chatter
    return roles.some((role) => settings.showRoles.includes(role));
  });

  return filtered
    .slice(0, settings.maxMessages)
    .reverse() // oldest → newest for display
    .map((r) => ({
      id: r.id,
      senderDisplay: r.sender_display || "viewer",
      senderColor: r.sender_color,
      roles: r.roles ?? [],
      isGsUser: !!r.is_gs_user,
      gsUsername: r.gs_username,
      text: r.text,
      createdAt: r.created_at,
    }));
}

/** Read a streamer's overlay settings (defaults when no row). */
export async function getChatOverlaySettings(ownerUserId: string): Promise<ChatOverlaySettings> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("gs_chat_overlay_settings")
    .select("theme, animation, show_roles, hide_commands, show_gs_badge, max_messages")
    .eq("owner_user_id", ownerUserId)
    .maybeSingle();
  if (!data) return DEFAULT_CHAT_OVERLAY_SETTINGS;
  return {
    theme: (data.theme as ChatOverlayTheme) ?? "default",
    animation: (data.animation as ChatOverlayAnimation) ?? "slide",
    showRoles: (data.show_roles as string[] | null) ?? DEFAULT_CHAT_OVERLAY_SETTINGS.showRoles,
    hideCommands: data.hide_commands ?? true,
    showGsBadge: data.show_gs_badge ?? true,
    maxMessages: (data.max_messages as number | null) ?? 12,
  };
}

/** Upsert settings + mirror the enabled flag onto the connection (the capture
 *  gate). `enabled` is stored on twitch_connections, not the settings row. */
export async function saveChatOverlaySettings(
  ownerUserId: string,
  patch: Partial<ChatOverlaySettings> & { enabled?: boolean },
): Promise<void> {
  const admin = createServiceClient();
  const { enabled, ...settings } = patch;

  if (Object.keys(settings).length > 0) {
    const row: Record<string, unknown> = { owner_user_id: ownerUserId, updated_at: new Date().toISOString() };
    if (settings.theme !== undefined) row.theme = settings.theme;
    if (settings.animation !== undefined) row.animation = settings.animation;
    if (settings.showRoles !== undefined) row.show_roles = settings.showRoles;
    if (settings.hideCommands !== undefined) row.hide_commands = settings.hideCommands;
    if (settings.showGsBadge !== undefined) row.show_gs_badge = settings.showGsBadge;
    if (settings.maxMessages !== undefined) row.max_messages = settings.maxMessages;
    await admin.from("gs_chat_overlay_settings").upsert(row, { onConflict: "owner_user_id" });
  }

  if (enabled !== undefined) {
    await admin
      .from("twitch_connections")
      .update({ chat_overlay_enabled: enabled })
      .eq("user_id", ownerUserId);
  }
}

/** Whether the chat overlay is enabled (the connection flag). */
export async function isChatOverlayEnabled(ownerUserId: string): Promise<boolean> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("twitch_connections")
    .select("chat_overlay_enabled")
    .eq("user_id", ownerUserId)
    .maybeSingle();
  return !!(data as { chat_overlay_enabled?: boolean } | null)?.chat_overlay_enabled;
}
