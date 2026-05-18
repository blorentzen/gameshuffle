/**
 * Discord outbound adapter — posts embeds + edits in place via the
 * Discord REST API using the GameShuffle bot token. Authenticates as
 * the bot user (NOT as the streamer), since the bot is installed in
 * the streamer's guild via the OAuth flow at
 * `/api/discord/bot/install/*`.
 *
 * Sibling to `src/lib/adapters/twitch/adapter.ts`. Used by the
 * cross-platform event dispatcher (`src/lib/adapters/dispatch.ts`)
 * when GameShuffle session events should fan out to a Discord channel.
 *
 * Per `specs/gs-pro-updates/gs-discord-cross-platform-spec.md`.
 */

import "server-only";

const DISCORD_API_BASE = "https://discord.com/api/v10";

export interface DiscordEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface DiscordEmbed {
  title?: string;
  description?: string;
  url?: string;
  color?: number;
  fields?: DiscordEmbedField[];
  footer?: { text: string };
  timestamp?: string;
  thumbnail?: { url: string };
}

export type DiscordAdapterResult =
  | { ok: true; messageId: string }
  | { ok: false; error: string; retryable: boolean };

function botToken(): string | null {
  return process.env.DISCORD_BOT_TOKEN ?? null;
}

async function request<T>(
  method: "POST" | "PATCH" | "GET",
  path: string,
  body?: Record<string, unknown>,
): Promise<{ ok: true; data: T } | { ok: false; error: string; retryable: boolean }> {
  const token = botToken();
  if (!token) {
    return { ok: false, error: "discord_bot_token_unset", retryable: false };
  }
  let res: Response;
  try {
    res = await fetch(`${DISCORD_API_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bot ${token}`,
        "Content-Type": "application/json",
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `network: ${msg}`, retryable: true };
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    // 429 (rate limit), 5xx → retryable. 4xx (auth, missing perms, bad
    // channel id) → not retryable; the streamer has to fix config.
    const retryable = res.status === 429 || res.status >= 500;
    return {
      ok: false,
      error: `${res.status}: ${text.slice(0, 200)}`,
      retryable,
    };
  }
  const data = (await res.json().catch(() => ({}))) as T;
  return { ok: true, data };
}

// ---------------------------------------------------------------------------
// Channel messages — post + edit
// ---------------------------------------------------------------------------

interface DiscordMessage {
  id: string;
}

/** Post a new embed to a channel. Returns the message id so future
 *  events (game pivot, session end) can EDIT it in place. */
export async function postEmbed(args: {
  channelId: string;
  embed: DiscordEmbed;
  /** Optional content body — `<@&ROLE_ID>` here pings the role. Embeds
   *  alone don't trigger notifications; the content string does. */
  content?: string;
  /** When set, restricts which mentions Discord actually rings. We
   *  default to roles-only so embeds can't @everyone the channel. */
  allowedMentions?: {
    roles?: string[];
    parse?: Array<"roles" | "users" | "everyone">;
  };
}): Promise<DiscordAdapterResult> {
  const result = await request<DiscordMessage>(
    "POST",
    `/channels/${args.channelId}/messages`,
    {
      embeds: [args.embed],
      content: args.content,
      allowed_mentions: args.allowedMentions ?? { parse: [] },
    },
  );
  if (!result.ok) return result;
  return { ok: true, messageId: result.data.id };
}

/** Edit an existing message's embed. Used to update the "Live on
 *  Twitch" announcement when the streamer pivots categories, or to
 *  mark it as wrapped on session end. */
export async function editEmbed(args: {
  channelId: string;
  messageId: string;
  embed: DiscordEmbed;
  content?: string;
}): Promise<DiscordAdapterResult> {
  const result = await request<DiscordMessage>(
    "PATCH",
    `/channels/${args.channelId}/messages/${args.messageId}`,
    {
      embeds: [args.embed],
      content: args.content,
    },
  );
  if (!result.ok) return result;
  return { ok: true, messageId: result.data.id };
}

// ---------------------------------------------------------------------------
// Threads — used in Phase 1.2 for round-anchored discussion. Defined
// here so the adapter is feature-complete; not yet called.
// ---------------------------------------------------------------------------

interface DiscordChannel {
  id: string;
  name: string;
  type: number;
}

export async function createThreadFromMessage(args: {
  channelId: string;
  messageId: string;
  name: string;
  /** Auto-archive after N minutes of inactivity. Defaults to 1440 (24h). */
  autoArchiveDurationMinutes?: number;
}): Promise<
  { ok: true; threadId: string } | { ok: false; error: string; retryable: boolean }
> {
  const result = await request<DiscordChannel>(
    "POST",
    `/channels/${args.channelId}/messages/${args.messageId}/threads`,
    {
      name: args.name.slice(0, 100),
      auto_archive_duration: args.autoArchiveDurationMinutes ?? 1440,
    },
  );
  if (!result.ok) return result;
  return { ok: true, threadId: result.data.id };
}

// ---------------------------------------------------------------------------
// Channel list — used by the Account UI's channel picker (Phase 1.2).
// ---------------------------------------------------------------------------

export interface DiscordGuildChannel {
  id: string;
  name: string;
  type: number;
  parent_id: string | null;
}

const TEXT_CHANNEL_TYPES = new Set([0, 5]); // GUILD_TEXT, GUILD_ANNOUNCEMENT

export async function listTextChannels(
  guildId: string,
): Promise<
  | { ok: true; channels: DiscordGuildChannel[] }
  | { ok: false; error: string; retryable: boolean }
> {
  const result = await request<DiscordGuildChannel[]>(
    "GET",
    `/guilds/${guildId}/channels`,
  );
  if (!result.ok) return result;
  return {
    ok: true,
    channels: result.data.filter((c) => TEXT_CHANNEL_TYPES.has(c.type)),
  };
}

// ---------------------------------------------------------------------------
// Role list — used by the Account UI's role picker so the streamer can
// pick which role gets pinged (e.g. "Stream Squad", "@everyone-lite").
// ---------------------------------------------------------------------------

export interface DiscordGuildRole {
  id: string;
  name: string;
  /** Position in the role hierarchy — higher = nearer the top of the
   *  role list in Discord's UI. We sort descending so the streamer's
   *  custom roles surface above the noise. */
  position: number;
  /** True when this is the guild's auto-assigned @everyone role —
   *  we filter it out client-side; mentioning @everyone via the bot
   *  is the exact failure mode we want to avoid. */
  managed: boolean;
}

export async function listGuildRoles(
  guildId: string,
): Promise<
  | { ok: true; roles: DiscordGuildRole[] }
  | { ok: false; error: string; retryable: boolean }
> {
  const result = await request<
    Array<{ id: string; name: string; position: number; managed?: boolean }>
  >("GET", `/guilds/${guildId}/roles`);
  if (!result.ok) return result;
  // Discord returns the guild's @everyone role with id === guildId.
  // Strip it here so the picker doesn't tempt anyone into accidentally
  // mass-pinging the server. Managed roles (bot-integration roles) are
  // also filtered — they can't be mentioned by other bots anyway.
  const roles = result.data
    .filter((r) => r.id !== guildId && !r.managed)
    .map((r) => ({
      id: r.id,
      name: r.name,
      position: r.position,
      managed: Boolean(r.managed),
    }))
    .sort((a, b) => b.position - a.position);
  return { ok: true, roles };
}
