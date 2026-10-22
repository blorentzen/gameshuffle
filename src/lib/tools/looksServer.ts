/**
 * Server side of tool looks (see looks.ts): read and save an account's looks
 * in `streamer_module_defaults` (game_slug "*"), and work out what a surface
 * draws (GS Pro choices only while the owner has GS Pro, the brand theme, the
 * profile picture). Server only.
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { isProUser } from "@/lib/subscription-server";
import { getBrandThemeForOwner } from "@/lib/theme/brand-server";
import { DEFAULT_BRAND_THEME_ID } from "@/lib/theme/brand";
import { accountAvatar, type AccountRow } from "@/lib/discord/faces";
import { resolveAccent } from "@/lib/profile/accents";
import {
  TOOL_LOOK_IDS,
  coinPaint,
  diceDrawn,
  freeLook,
  isHex,
  mergeForSave,
  normalizeLook,
  type CoinLook,
  type CoinPaint,
  type DiceLook,
  type LookBrand,
  type LookFor,
  type ToolLookId,
  type ToolLooks,
} from "./looks";

const TABLE = "streamer_module_defaults";
const GAME = "*";

/** Every saved look for an account, normalized, plus which tools have a saved row. */
export async function readSavedLooks(ownerUserId: string): Promise<{ looks: ToolLooks; saved: Record<ToolLookId, boolean>; raw: Partial<Record<ToolLookId, Record<string, unknown>>> }> {
  const { data } = await createServiceClient()
    .from(TABLE)
    .select("module_id, config")
    .eq("owner_user_id", ownerUserId)
    .eq("game_slug", GAME)
    .in("module_id", TOOL_LOOK_IDS);
  const rows = new Map(((data ?? []) as { module_id: string; config: Record<string, unknown> | null }[]).map((r) => [r.module_id, r.config ?? {}]));
  const looks = {} as ToolLooks;
  const saved = {} as Record<ToolLookId, boolean>;
  const raw: Partial<Record<ToolLookId, Record<string, unknown>>> = {};
  for (const id of TOOL_LOOK_IDS) {
    (looks as Record<ToolLookId, unknown>)[id] = normalizeLook(id, rows.get(id));
    saved[id] = rows.has(id);
    if (rows.has(id)) raw[id] = rows.get(id)!;
  }
  return { looks, saved, raw };
}

/** One saved look, normalized (defaults when nothing is saved). */
export async function readLook<T extends ToolLookId>(ownerUserId: string, tool: T): Promise<LookFor<T>> {
  const { data } = await createServiceClient()
    .from(TABLE)
    .select("config")
    .eq("owner_user_id", ownerUserId)
    .eq("module_id", tool)
    .eq("game_slug", GAME)
    .maybeSingle();
  return normalizeLook(tool, (data as { config?: unknown } | null)?.config ?? null);
}

/**
 * Save a look. The stored row keeps any other keys already in it (older
 * config fields the overlay still reads, e.g. a dice `pipColor`), and GS Pro
 * choices from an account without GS Pro keep their stored value.
 */
export async function saveLook<T extends ToolLookId>(ownerUserId: string, tool: T, incoming: unknown, pro?: boolean): Promise<LookFor<T>> {
  const admin = createServiceClient();
  const { data } = await admin
    .from(TABLE)
    .select("config")
    .eq("owner_user_id", ownerUserId)
    .eq("module_id", tool)
    .eq("game_slug", GAME)
    .maybeSingle();
  const storedRaw = ((data as { config?: Record<string, unknown> } | null)?.config ?? null);
  const stored = storedRaw ? normalizeLook(tool, storedRaw) : null;
  const hasPro = pro ?? (await isProUser(ownerUserId));
  const next = mergeForSave(tool, normalizeLook(tool, incoming), stored, hasPro);
  const config = { ...(storedRaw ?? {}), ...(next as unknown as Record<string, unknown>) };
  const { error } = await admin
    .from(TABLE)
    .upsert(
      { owner_user_id: ownerUserId, module_id: tool, game_slug: GAME, config, updated_at: new Date().toISOString() },
      { onConflict: "owner_user_id,module_id,game_slug" },
    );
  if (error) throw error;
  return next;
}

/** The owner's brand colors for looks (the site brand without GS Pro). */
export async function lookBrand(ownerUserId: string): Promise<LookBrand> {
  const theme = await getBrandThemeForOwner(ownerUserId);
  return { primary: theme.primary, accent: theme.accent, name: theme.name, isDefault: theme.id === DEFAULT_BRAND_THEME_ID };
}

/** The account's profile picture, as the rest of the site draws it. */
export async function accountPicture(ownerUserId: string): Promise<string | null> {
  const { data } = await createServiceClient()
    .from("users")
    .select("id, avatar_source, avatar_seed, avatar_options, discord_avatar, twitch_avatar")
    .eq("id", ownerUserId)
    .maybeSingle();
  return data ? accountAvatar(data as AccountRow) : null;
}

/** The account's personal color (Theming ▸ Colors), when it has one. */
export async function accountColor(ownerUserId: string): Promise<string | null> {
  try {
    const { data, error } = await createServiceClient().from("users").select("profile_accent").eq("id", ownerUserId).maybeSingle();
    if (error) return null;
    const stored = (data as { profile_accent?: string | null } | null)?.profile_accent ?? null;
    return isHex(stored) ? stored : resolveAccent(stored);
  } catch {
    return null;
  }
}

/** A look as the owner's surfaces draw it right now. */
export function drawnLook<T extends ToolLookId>(tool: T, look: LookFor<T>, pro: boolean): LookFor<T> {
  return pro ? look : freeLook(tool, look);
}

/** Dice colors and table for an overlay event. */
export async function diceForOverlay(ownerUserId: string): Promise<{ look: DiceLook; dieColor: string; pipColor: string; table: DiceLook["table"] | null }> {
  const [look, pro] = await Promise.all([readLook(ownerUserId, "dice"), isProUser(ownerUserId)]);
  const brand = pro && look.matchBrand ? await lookBrand(ownerUserId) : null;
  const drawn = diceDrawn(look, { pro, brand });
  return { look, dieColor: drawn.dieColor, pipColor: drawn.pipColor, table: look.showTable ? look.table : null };
}

/** The coin as drawn for an overlay event. */
export async function coinForOverlay(ownerUserId: string): Promise<{ look: CoinLook; paint: CoinPaint }> {
  const [look, pro] = await Promise.all([readLook(ownerUserId, "coin"), isProUser(ownerUserId)]);
  const [brand, avatarUrl] = await Promise.all([
    pro && look.matchBrand ? lookBrand(ownerUserId) : Promise.resolve(null),
    pro && look.picture ? accountPicture(ownerUserId) : Promise.resolve(null),
  ]);
  return { look, paint: coinPaint(look, { pro, brand, avatarUrl }) };
}
