/**
 * Profile pictures for the drawn Discord cards (server only).
 *
 * A Discord-only player's picture comes from Discord when they sign in to the
 * Activity (rememberAvatar keeps it on their gs_identities row, see
 * supabase/discord-cards-m1.sql). Someone with a GameShuffle account shows the
 * same face as the rest of the site (their Twitch or Discord picture, else
 * their generated avatar). Without either, the card draws their initial.
 *
 * Pictures are fetched only from Discord's and Twitch's CDNs and our own
 * storage, then shrunk to a small PNG (the card renderer can't draw webp or
 * every SVG), and kept in memory for a few hours.
 */

import "server-only";
import sharp from "sharp";
import { createServiceClient } from "@/lib/supabase/admin";
import { generateDicebearAvatarDataUri, type AvatarOptions } from "@/lib/avatar/dicebear";

/** A Discord user's picture, or one of Discord's default ones when they have none. */
export function discordAvatarUrl(userId: string, hash: string | null | undefined, size = 128): string {
  if (hash) return `https://cdn.discordapp.com/avatars/${userId}/${hash}.png?size=${size}`;
  let index = 0;
  try { index = Number((BigInt(userId) >> BigInt(22)) % BigInt(6)); } catch { /* not a snowflake */ }
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}

/** Keeps a chat identity's picture up to date. Quiet if the column isn't there yet. */
export async function rememberAvatar(identityId: string, url: string): Promise<void> {
  const { error } = await createServiceClient().from("gs_identities").update({ avatar_url: url }).eq("id", identityId);
  if (error && error.code !== "42703" && error.code !== "PGRST204") console.warn("[faces] avatar not saved:", error.message);
}

export interface Face { name: string; avatar: string | null }

interface AccountRow {
  id: string; avatar_source: string | null; avatar_seed: string | null; avatar_options: AvatarOptions | null;
  discord_avatar: string | null; twitch_avatar: string | null;
}

/** Same rule as the rest of the site (messaging's member profiles). */
function accountAvatar(u: AccountRow): string {
  if (u.avatar_source === "twitch" && u.twitch_avatar) return u.twitch_avatar;
  if (u.avatar_source === "discord" && u.discord_avatar) return u.discord_avatar;
  if (!u.avatar_source && (u.discord_avatar || u.twitch_avatar)) return (u.discord_avatar || u.twitch_avatar)!;
  return generateDicebearAvatarDataUri(u.avatar_seed || u.id, u.avatar_options);
}

/** Name (as Discord knows them) and picture for each chat identity. */
export async function facesFor(identityIds: string[]): Promise<Map<string, Face>> {
  const out = new Map<string, Face>();
  if (!identityIds.length) return out;
  const admin = createServiceClient();
  let rows: { id: string; display_name: string | null; gs_account_id: string | null; avatar_url?: string | null }[] = [];
  const withPic = await admin.from("gs_identities").select("id, display_name, gs_account_id, avatar_url").in("id", identityIds);
  if (withPic.error) {
    // supabase/discord-cards-m1.sql not run yet: names only.
    const plain = await admin.from("gs_identities").select("id, display_name, gs_account_id").in("id", identityIds);
    rows = (plain.data ?? []) as typeof rows;
  } else {
    rows = (withPic.data ?? []) as typeof rows;
  }
  const accountIds = [...new Set(rows.map((r) => r.gs_account_id).filter((v): v is string => !!v))];
  const accounts = new Map<string, string>();
  if (accountIds.length) {
    const { data } = await admin.from("users")
      .select("id, avatar_source, avatar_seed, avatar_options, discord_avatar, twitch_avatar").in("id", accountIds);
    for (const u of (data ?? []) as AccountRow[]) accounts.set(u.id, accountAvatar(u));
  }
  for (const r of rows) {
    out.set(r.id, {
      name: (r.display_name || "A player").slice(0, 60),
      avatar: (r.gs_account_id && accounts.get(r.gs_account_id)) || r.avatar_url || null,
    });
  }
  return out;
}

// ---------------------------------------------------------------- pictures as PNG

const HOSTS = new Set(["cdn.discordapp.com", "media.discordapp.net", "static-cdn.jtvnw.net", "gs-ugc.empac.co", "cdn.empac.co"]);
const r2 = process.env.R2_PUBLIC_BASE_URL ?? process.env.R2_PUBLIC_BASE;
if (r2) {
  try { HOSTS.add(new URL(r2).host); } catch { /* ignore a malformed env value */ }
}

const CACHE_MS = 6 * 3600_000;
const CACHE_MAX = 400;
const cache = new Map<string, { at: number; png: Promise<string | null> }>();

async function readPicture(src: string): Promise<Buffer | null> {
  if (src.startsWith("data:image/")) {
    const comma = src.indexOf(",");
    if (comma < 0) return null;
    const meta = src.slice(5, comma);
    const body = src.slice(comma + 1);
    return meta.endsWith(";base64") ? Buffer.from(body, "base64") : Buffer.from(decodeURIComponent(body));
  }
  let url: URL;
  try { url = new URL(src); } catch { return null; }
  if (url.protocol !== "https:" || !HOSTS.has(url.host)) return null;
  const res = await fetch(url, { signal: AbortSignal.timeout(3000) }).catch(() => null);
  if (!res?.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  return buf.length > 4 * 1024 * 1024 ? null : buf;
}

/** A square PNG data URI of the picture, or null if it can't be read. */
export function facePng(src: string | null | undefined, size: number): Promise<string | null> {
  if (!src) return Promise.resolve(null);
  const key = `${size}:${src}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.png;
  const png = (async () => {
    try {
      const buf = await readPicture(src);
      if (!buf) return null;
      const out = await sharp(buf, { density: 144 }).resize(size, size, { fit: "cover", position: "centre" }).png().toBuffer();
      return `data:image/png;base64,${out.toString("base64")}`;
    } catch {
      return null;
    }
  })();
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(key, { at: Date.now(), png });
  return png;
}
