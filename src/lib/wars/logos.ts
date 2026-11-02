import "server-only";

/**
 * A Discord server's own team logos (war_logos, wars-m3.sql; war tools pick 5A). One per tag per server; a team without
 * one here uses its MKCentral registry logo. An upload is squared onto a transparent 256px webp, checked
 * (src/lib/moderation/imageCheck.ts) and kept as a pending row until Save on the preview. Anyone can add a logo for a tag
 * with none; replacing or removing one takes whoever added it or someone who can manage the server.
 */

import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { createServiceClient } from "@/lib/supabase/admin";
import { isR2Configured, uploadToR2 } from "@/lib/storage/r2";
import { checkImage } from "@/lib/moderation/imageCheck";
import { registryTeam } from "./teams";
import type { WarGame } from "./rules";

export interface WarLogo { id: string; guildId: string; tag: string; name: string | null; url: string; verdict: "ok" | "unsure" | null; createdBy: string; createdByName: string | null }

type Row = { id: string; guild_id: string; tag: string; name: string | null; url: string; status: string; check_verdict: "ok" | "unsure" | null; created_by: string; created_by_name: string | null; created_at: string };
const COLS = "id, guild_id, tag, name, url, status, check_verdict, created_by, created_by_name, created_at";
const toLogo = (r: Row): WarLogo => ({ id: r.id, guildId: r.guild_id, tag: r.tag, name: r.name, url: r.url, verdict: r.check_verdict, createdBy: r.created_by, createdByName: r.created_by_name });

const PENDING_MS = 30 * 60_000;

export type PrepareResult =
  | { ok: true; logo: WarLogo; replaces: WarLogo | null; unsure: boolean }
  | { ok: false; error: "storage_off" | "bad_image" | "refused"; reason?: string };

/** Squares, checks and stores an upload as a pending logo; Save (`confirmLogo`) makes it the tag's logo. */
export async function prepareLogo(input: { guildId: string; tag: string; name: string | null; image: Uint8Array; by: { id: string; name: string }; userId: string | null; daily?: number }): Promise<PrepareResult> {
  if (!isR2Configured()) return { ok: false, error: "storage_off" };
  const webp = await sharp(input.image, { animated: false }).rotate().resize(256, 256, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).webp({ quality: 90 }).toBuffer().catch(() => null);
  if (!webp) return { ok: false, error: "bad_image" };
  const check = await checkImage(webp, { use: "team logo", userId: input.userId, capKey: input.userId ? `u:${input.userId}` : `d:${input.by.id}`, daily: input.daily });
  if (check.verdict === "refuse") return { ok: false, error: "refused", reason: check.reason };
  const url = await uploadToR2(`war-logos/${input.guildId}/${randomBytes(8).toString("hex")}.webp`, new Uint8Array(webp), "image/webp");
  const db = createServiceClient();
  await db.from("war_logos").delete().eq("status", "pending").lt("created_at", new Date(Date.now() - PENDING_MS).toISOString());
  const { data, error } = await db.from("war_logos").insert({
    guild_id: input.guildId, tag: input.tag, name: input.name, url, status: "pending", check_verdict: check.verdict === "ok" ? "ok" : "unsure",
    created_by: input.by.id, created_by_name: input.by.name,
  }).select(COLS).single();
  if (error) { console.error("[wars] logo insert failed:", error.message); return { ok: false, error: "bad_image" }; }
  return { ok: true, logo: toLogo(data as Row), replaces: await logoRow(input.guildId, input.tag), unsure: check.verdict !== "ok" };
}

/** The tag's saved logo in a server (not pending). */
export async function logoRow(guildId: string, tag: string): Promise<WarLogo | null> {
  const { data } = await createServiceClient().from("war_logos").select(COLS).eq("guild_id", guildId).ilike("tag", escapeLike(tag)).neq("status", "pending").maybeSingle();
  return data ? toLogo(data as Row) : null;
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export type ConfirmResult = { ok: true; logo: WarLogo } | { ok: false; error: "gone" | "taken" };

/** Save on the preview: the pending logo becomes the tag's logo (replacing one needs its maker or a manager). */
export async function confirmLogo(id: string, by: { id: string }, canManage: boolean): Promise<ConfirmResult> {
  const db = createServiceClient();
  const { data } = await db.from("war_logos").select(COLS).eq("id", id).eq("status", "pending").maybeSingle();
  const pending = data as Row | null;
  if (!pending || pending.created_by !== by.id || Date.now() - Date.parse(pending.created_at) > PENDING_MS) return { ok: false, error: "gone" };
  const old = await logoRow(pending.guild_id, pending.tag);
  if (old && old.createdBy !== by.id && !canManage) return { ok: false, error: "taken" };
  if (old) await db.from("war_logos").delete().eq("id", old.id);
  const { data: saved } = await db.from("war_logos").update({ status: "ok", updated_at: new Date().toISOString() }).eq("id", id).select(COLS).single();
  const logo = toLogo(saved as Row);
  await applyToLiveWars(logo.guildId, logo.tag, logo.url);
  return { ok: true, logo };
}

export type SaveNowResult = { ok: true; logo: WarLogo; replaced: boolean; unsure: boolean } | { ok: false; error: "storage_off" | "bad_image" | "refused" | "gone" | "taken"; reason?: string };

/**
 * The Logos page's upload (war tools pick 5A): the server's owner adds logos many at once, each checked and saved
 * without the preview step (they saw every picture in the list before pressing Add). Replaces a tag's logo.
 */
export async function saveLogoNow(input: { guildId: string; tag: string; name: string | null; image: Uint8Array; by: { id: string; name: string }; userId: string }): Promise<SaveNowResult> {
  const prep = await prepareLogo({ ...input, daily: 150 });
  if (!prep.ok) return prep;
  const done = await confirmLogo(prep.logo.id, input.by, true);
  if (!done.ok) return done;
  return { ok: true, logo: done.logo, replaced: !!prep.replaces, unsure: prep.unsure };
}

export async function cancelLogo(id: string, by: { id: string }): Promise<void> {
  await createServiceClient().from("war_logos").delete().eq("id", id).eq("status", "pending").eq("created_by", by.id);
}

export type RemoveResult = { ok: true; logo: WarLogo } | { ok: false; error: "none" | "not_yours" };
export async function removeLogo(guildId: string, tag: string, by: { id: string }, canManage: boolean): Promise<RemoveResult> {
  const logo = await logoRow(guildId, tag);
  if (!logo) return { ok: false, error: "none" };
  if (logo.createdBy !== by.id && !canManage) return { ok: false, error: "not_yours" };
  await createServiceClient().from("war_logos").delete().eq("id", logo.id);
  await applyToLiveWars(guildId, logo.tag, null);
  return { ok: true, logo };
}

/** Every saved logo in a server, by tag. */
export async function listLogos(guildId: string): Promise<WarLogo[]> {
  const { data } = await createServiceClient().from("war_logos").select(COLS).eq("guild_id", guildId).neq("status", "pending").order("tag");
  return ((data ?? []) as Row[]).map(toLogo).sort((a, b) => a.tag.localeCompare(b.tag, "en", { sensitivity: "base" }));
}

/** The server's own logo url for a tag, if any. */
export async function serverLogo(guildId: string, tag: string): Promise<string | null> {
  return (await logoRow(guildId, tag).catch(() => null))?.url ?? null;
}

const MKCENTRAL = /^https:\/\/mkcentral\.com\//;

/**
 * Which of these logo urls GameShuffle's own pages and share pictures may show: MKCentral's registry logos, and
 * uploads the image check passed. An upload the check wasn't sure about stays in its own server (the war card and
 * table in Discord) until staff look; a url with no saved logo behind it any more is left out too.
 */
export async function siteLogos(urls: readonly (string | null | undefined)[]): Promise<Set<string>> {
  const list = [...new Set(urls.filter((u): u is string => !!u))];
  const ok = new Set(list.filter((u) => MKCENTRAL.test(u)));
  const ours = list.filter((u) => !MKCENTRAL.test(u));
  if (ours.length) {
    const { data } = await createServiceClient().from("war_logos").select("url").in("url", ours).eq("status", "ok").eq("check_verdict", "ok");
    for (const r of (data ?? []) as { url: string }[]) ok.add(r.url);
  }
  return ok;
}

/** A new or removed logo shows on the server's live wars right away (removed: back to MKCentral's, if the team has one). */
async function applyToLiveWars(guildId: string, tag: string, url: string | null): Promise<string[]> {
  const db = createServiceClient();
  const { data } = await db.from("wars").select("id, game, us_tag, them_tag").eq("guild_id", guildId).eq("status", "live");
  const touched: string[] = [];
  for (const w of (data ?? []) as { id: string; game: WarGame; us_tag: string; them_tag: string }[]) {
    const mine = (t: string) => t.toLowerCase() === tag.toLowerCase();
    if (!mine(w.us_tag) && !mine(w.them_tag)) continue;
    const logo = url ?? (await registryTeam(tag, w.game).catch(() => null))?.logo ?? null;
    const patch: Record<string, string | null> = {};
    if (mine(w.us_tag)) patch.us_logo = logo;
    if (mine(w.them_tag)) patch.them_logo = logo;
    await db.from("wars").update(patch).eq("id", w.id);
    touched.push(w.id);
  }
  return touched;
}

/** Live wars in a server that show this tag (to redraw their cards after a logo change). */
export async function liveWarsWithTag(guildId: string, tag: string): Promise<string[]> {
  const { data } = await createServiceClient().from("wars").select("id, us_tag, them_tag").eq("guild_id", guildId).eq("status", "live");
  return ((data ?? []) as { id: string; us_tag: string; them_tag: string }[]).filter((w) => [w.us_tag, w.them_tag].some((t) => t.toLowerCase() === tag.toLowerCase())).map((w) => w.id);
}
