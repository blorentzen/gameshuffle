import "server-only";

/**
 * The animated profile banner (GIFs step 2 pick 8A; GS Pro or Supporter looks): one of the account's own GIFs that
 * passed the check, framed by where it sits (no crop, so it keeps moving). profile_banner_gifs (gifs-m2.sql).
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { gifsReady } from "./store";

export interface BannerGif { gifId: string; url: string; still: string; alt: string; x: number; y: number }

let ok: boolean | null = null;
export async function bannerGifReady(): Promise<boolean> {
  if (ok) return true;
  if (!(await gifsReady())) return false;
  const { error } = await createServiceClient().from("profile_banner_gifs").select("user_id").limit(1);
  ok = !error;
  return ok;
}

const clamp = (n: unknown) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));

export async function getBannerGif(userId: string): Promise<BannerGif | null> {
  if (!(await bannerGifReady())) return null;
  const { data } = await createServiceClient()
    .from("profile_banner_gifs")
    .select("gif_id, pos_x, pos_y, gifs!inner(url, still_url, alt, status)")
    .eq("user_id", userId)
    .maybeSingle();
  const row = data as { gif_id: string; pos_x: number; pos_y: number; gifs: { url: string; still_url: string; alt: string; status: string } | null } | null;
  if (!row?.gifs || row.gifs.status !== "ok") return null;
  return { gifId: row.gif_id, url: row.gifs.url, still: row.gifs.still_url, alt: row.gifs.alt, x: row.pos_x, y: row.pos_y };
}

export async function setBannerGif(userId: string, gifId: string, x: unknown, y: unknown): Promise<"ok" | "not_found" | "not_ready"> {
  if (!(await bannerGifReady())) return "not_ready";
  const db = createServiceClient();
  const { data: gif } = await db.from("gifs").select("id").eq("id", gifId).eq("owner_user_id", userId).eq("status", "ok").maybeSingle();
  if (!gif) return "not_found";
  const { error } = await db.from("profile_banner_gifs").upsert({ user_id: userId, gif_id: gifId, pos_x: clamp(x), pos_y: clamp(y), updated_at: new Date().toISOString() });
  return error ? "not_ready" : "ok";
}

export async function clearBannerGif(userId: string): Promise<void> {
  if (!(await bannerGifReady())) return;
  await createServiceClient().from("profile_banner_gifs").delete().eq("user_id", userId);
}
