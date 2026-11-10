import "server-only";

/**
 * Flags on war tables (supabase/wars-m4.sql; "/flag works the same way" as /logo). A player's flag code ([us],
 * [gb_eng], [kc]) draws as this server's own flag for that code, else the country flag GameShuffle ships (flag-icons,
 * src/lib/lounge/flags.ts), else the code as text. Uploads are squared onto a 4:3 transparent webp and checked like
 * logos; anyone can add a code with none, replacing or removing one takes whoever added it or a server manager.
 */

import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { createServiceClient } from "@/lib/supabase/admin";
import { isR2Configured, uploadToR2 } from "@/lib/storage/r2";
import { checkImage } from "@/lib/moderation/imageCheck";
import { flagUrl } from "@/lib/lounge/flags";

export interface WarFlag { id: string; guildId: string; code: string; name: string | null; url: string; verdict: "ok" | "unsure" | null; createdBy: string; createdByName: string | null }
type Row = { id: string; guild_id: string; code: string; name: string | null; url: string; status: string; check_verdict: "ok" | "unsure" | null; created_by: string; created_by_name: string | null; created_at: string };
const COLS = "id, guild_id, code, name, url, status, check_verdict, created_by, created_by_name, created_at";
const toFlag = (r: Row): WarFlag => ({ id: r.id, guildId: r.guild_id, code: r.code, name: r.name, url: r.url, verdict: r.check_verdict, createdBy: r.created_by, createdByName: r.created_by_name });
const PENDING_MS = 30 * 60_000;

export { cleanFlagCode } from "./table";

let ready: boolean | null = null;
/** Whether war_flags exists (wars-m4.sql). */
export async function flagsReady(): Promise<boolean> {
  if (ready) return true;
  const { error } = await createServiceClient().from("war_flags").select("id").limit(1);
  ready = !error;
  return ready;
}

export type PrepareFlag = { ok: true; flag: WarFlag; replaces: WarFlag | null; unsure: boolean } | { ok: false; error: "storage_off" | "bad_image" | "refused" | "not_ready"; reason?: string };

export async function prepareFlag(input: { guildId: string; code: string; name: string | null; image: Uint8Array; by: { id: string; name: string }; userId: string | null }): Promise<PrepareFlag> {
  if (!(await flagsReady())) return { ok: false, error: "not_ready" };
  if (!isR2Configured()) return { ok: false, error: "storage_off" };
  const webp = await sharp(input.image, { animated: false }).rotate().resize(120, 90, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).webp({ quality: 90 }).toBuffer().catch(() => null);
  if (!webp) return { ok: false, error: "bad_image" };
  const check = await checkImage(webp, { use: "flag on a team's score table", userId: input.userId, capKey: input.userId ? `u:${input.userId}` : `d:${input.by.id}` });
  if (check.verdict === "refuse") return { ok: false, error: "refused", reason: check.reason };
  const url = await uploadToR2(`war-flags/${input.guildId}/${randomBytes(8).toString("hex")}.webp`, new Uint8Array(webp), "image/webp");
  const db = createServiceClient();
  await db.from("war_flags").delete().eq("status", "pending").lt("created_at", new Date(Date.now() - PENDING_MS).toISOString());
  const { data, error } = await db.from("war_flags").insert({
    guild_id: input.guildId, code: input.code, name: input.name, url, status: "pending", check_verdict: check.verdict === "ok" ? "ok" : "unsure",
    created_by: input.by.id, created_by_name: input.by.name,
  }).select(COLS).single();
  if (error) { console.error("[wars] flag insert failed:", error.message); return { ok: false, error: "bad_image" }; }
  return { ok: true, flag: toFlag(data as Row), replaces: await flagRow(input.guildId, input.code), unsure: check.verdict !== "ok" };
}

/** A code's saved flag in a server (not pending). */
export async function flagRow(guildId: string, code: string): Promise<WarFlag | null> {
  if (!(await flagsReady())) return null;
  const { data } = await createServiceClient().from("war_flags").select(COLS).eq("guild_id", guildId).eq("code", code).neq("status", "pending").maybeSingle();
  return data ? toFlag(data as Row) : null;
}

export type ConfirmFlag = { ok: true; flag: WarFlag } | { ok: false; error: "gone" | "taken" };
export async function confirmFlag(id: string, by: { id: string }, canManage: boolean): Promise<ConfirmFlag> {
  const db = createServiceClient();
  const { data } = await db.from("war_flags").select(COLS).eq("id", id).eq("status", "pending").maybeSingle();
  const pending = data as Row | null;
  if (!pending || pending.created_by !== by.id || Date.now() - Date.parse(pending.created_at) > PENDING_MS) return { ok: false, error: "gone" };
  const old = await flagRow(pending.guild_id, pending.code);
  if (old && old.createdBy !== by.id && !canManage) return { ok: false, error: "taken" };
  if (old) await db.from("war_flags").delete().eq("id", old.id);
  const { data: saved } = await db.from("war_flags").update({ status: "ok", updated_at: new Date().toISOString() }).eq("id", id).select(COLS).single();
  return { ok: true, flag: toFlag(saved as Row) };
}

export async function cancelFlag(id: string, by: { id: string }): Promise<void> {
  await createServiceClient().from("war_flags").delete().eq("id", id).eq("status", "pending").eq("created_by", by.id);
}

export type RemoveFlag = { ok: true; flag: WarFlag } | { ok: false; error: "none" | "not_yours" };
export async function removeFlag(guildId: string, code: string, by: { id: string }, canManage: boolean): Promise<RemoveFlag> {
  const flag = await flagRow(guildId, code);
  if (!flag) return { ok: false, error: "none" };
  if (flag.createdBy !== by.id && !canManage) return { ok: false, error: "not_yours" };
  await createServiceClient().from("war_flags").delete().eq("id", flag.id);
  return { ok: true, flag };
}

export async function listFlags(guildId: string): Promise<WarFlag[]> {
  if (!(await flagsReady())) return [];
  const { data } = await createServiceClient().from("war_flags").select(COLS).eq("guild_id", guildId).neq("status", "pending").order("code");
  return ((data ?? []) as Row[]).map(toFlag);
}

/**
 * The picture for each flag code a table uses: the server's own (`site` leaves out uploads the check wasn't sure
 * of, for GameShuffle's pages), else the country flag. Codes with neither are left out (drawn as text).
 */
export async function flagsFor(guildId: string, codes: readonly string[], opts: { site?: boolean } = {}): Promise<Record<string, string>> {
  const list = [...new Set(codes.map((c) => c.toLowerCase()))];
  const out: Record<string, string> = {};
  if (!list.length) return out;
  if (await flagsReady()) {
    const { data } = await createServiceClient().from("war_flags").select("code, url, check_verdict").eq("guild_id", guildId).eq("status", "ok").in("code", list);
    for (const r of (data ?? []) as { code: string; url: string; check_verdict: string | null }[]) if (!opts.site || r.check_verdict === "ok") out[r.code] = r.url;
  }
  for (const c of list) if (!out[c]) { const u = flagUrl(c); if (u) out[c] = u; }
  return out;
}

const pngCache = new Map<string, Promise<string | null>>();
/** A flag as a PNG data URI for a drawn picture (a site path from public/, or one of our uploads), 4:3 at `w` px wide. */
export function flagPng(url: string, w: number): Promise<string | null> {
  const key = `${url}@${w}`;
  if (!pngCache.has(key)) {
    pngCache.set(key, (async () => {
      let bytes: Buffer | null = null;
      if (url.startsWith("/images/flags/")) bytes = await readFile(join(process.cwd(), "public", url)).catch(() => null);
      else if (/^https:\/\/(gs-ugc|cdn)\.empac\.co\//.test(url)) {
        const res = await fetch(url, { signal: AbortSignal.timeout(4000) }).catch(() => null);
        bytes = res?.ok ? Buffer.from(await res.arrayBuffer()) : null;
      }
      if (!bytes) return null;
      const png = await sharp(bytes, { density: 300 }).resize(w, Math.round((w * 3) / 4), { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer().catch(() => null);
      return png ? `data:image/png;base64,${png.toString("base64")}` : null;
    })());
    if (pngCache.size > 600) pngCache.delete(pngCache.keys().next().value!);
  }
  return pngCache.get(key)!;
}
