/**
 * Wheel storage — definitions (`gs_wheels`) + spin log (`gs_wheel_spins`).
 *
 * All operations use the service-role admin client and are server-only.
 * Auth/ownership is enforced at the call site (API route / server action /
 * command handler) — never trust the client to pass `ownerUserId`.
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { getFillStyle } from "@/lib/wheel/themes";
import type {
  ContributionMode,
  PoolItem,
  ResetMode,
  Wheel,
  WheelContribution,
  WheelEntry,
  WheelSegment,
  WheelSpin,
} from "./types";

const WHEEL_COLS =
  "id, name, segments, is_default, contribution_mode, contribution_max, per_viewer_limit, allowlist, reset_mode, consumed_labels, theme, fill_style";

interface WheelRow {
  id: string;
  name: string;
  segments: WheelSegment[] | null;
  is_default: boolean;
  contribution_mode: string | null;
  contribution_max: number | null;
  per_viewer_limit: number | null;
  allowlist: string[] | null;
  reset_mode: string | null;
  consumed_labels: string[] | null;
  theme: string | null;
  fill_style: string | null;
}

function rowToWheel(r: WheelRow): Wheel {
  return {
    id: r.id,
    name: r.name,
    segments: Array.isArray(r.segments) ? r.segments : [],
    isDefault: !!r.is_default,
    contribution: {
      mode: (r.contribution_mode as ContributionMode) ?? "off",
      max: typeof r.contribution_max === "number" ? r.contribution_max : 5,
      perViewerLimit:
        typeof r.per_viewer_limit === "number" ? r.per_viewer_limit : 1,
      allowlist: Array.isArray(r.allowlist) ? r.allowlist : [],
      resetMode: (r.reset_mode as ResetMode) ?? "manual",
    },
    consumedLabels: Array.isArray(r.consumed_labels) ? r.consumed_labels : [],
    themeId: r.theme ?? "classic",
    fillStyle: getFillStyle(r.fill_style),
  };
}

/** Every wheel for a streamer, default first then alphabetical. */
export async function listWheels(ownerUserId: string): Promise<Wheel[]> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("gs_wheels")
    .select(WHEEL_COLS)
    .eq("owner_user_id", ownerUserId)
    .order("is_default", { ascending: false })
    .order("name", { ascending: true });
  return ((data as WheelRow[] | null) ?? []).map(rowToWheel);
}

export async function getWheel(
  ownerUserId: string,
  wheelId: string,
): Promise<Wheel | null> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("gs_wheels")
    .select(WHEEL_COLS)
    .eq("owner_user_id", ownerUserId)
    .eq("id", wheelId)
    .maybeSingle();
  return data ? rowToWheel(data as WheelRow) : null;
}

/** The streamer's default wheel, or the most recent one as a fallback. */
export async function getDefaultWheel(ownerUserId: string): Promise<Wheel | null> {
  const admin = createServiceClient();
  const { data: def } = await admin
    .from("gs_wheels")
    .select(WHEEL_COLS)
    .eq("owner_user_id", ownerUserId)
    .eq("is_default", true)
    .maybeSingle();
  if (def) return rowToWheel(def as WheelRow);
  const { data: any } = await admin
    .from("gs_wheels")
    .select(WHEEL_COLS)
    .eq("owner_user_id", ownerUserId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return any ? rowToWheel(any as WheelRow) : null;
}

/**
 * Create or update a wheel. When `isDefault` is true, any other default
 * for the owner is cleared first so exactly one stays default.
 */
export async function upsertWheel(args: {
  ownerUserId: string;
  id?: string;
  name: string;
  segments: WheelSegment[];
  isDefault: boolean;
  contribution?: WheelContribution;
  themeId?: string;
  fillStyle?: string;
}): Promise<Wheel> {
  const admin = createServiceClient();

  if (args.isDefault) {
    await admin
      .from("gs_wheels")
      .update({ is_default: false })
      .eq("owner_user_id", args.ownerUserId)
      .eq("is_default", true);
  }

  const c = args.contribution;
  const base = {
    owner_user_id: args.ownerUserId,
    name: args.name,
    segments: args.segments,
    is_default: args.isDefault,
    updated_at: new Date().toISOString(),
    ...(args.themeId ? { theme: args.themeId } : {}),
    ...(args.fillStyle ? { fill_style: args.fillStyle } : {}),
    ...(c
      ? {
          contribution_mode: c.mode,
          contribution_max: c.max,
          per_viewer_limit: c.perViewerLimit,
          allowlist: c.allowlist,
          reset_mode: c.resetMode,
        }
      : {}),
  };

  const query = args.id
    ? admin
        .from("gs_wheels")
        .update(base)
        .eq("id", args.id)
        .eq("owner_user_id", args.ownerUserId)
        .select(WHEEL_COLS)
        .single()
    : admin
        .from("gs_wheels")
        .insert(base)
        .select(WHEEL_COLS)
        .single();

  const { data, error } = await query;
  if (error) throw error;
  return rowToWheel(data as WheelRow);
}

export async function deleteWheel(
  ownerUserId: string,
  wheelId: string,
): Promise<void> {
  const admin = createServiceClient();
  const { error } = await admin
    .from("gs_wheels")
    .delete()
    .eq("id", wheelId)
    .eq("owner_user_id", ownerUserId);
  if (error) throw error;
}

const SPIN_COLS =
  "id, wheel_id, wheel_name, segments, winning_index, winning_label, triggered_by, trigger_type, created_at, theme, fill_style";

interface SpinRow {
  id: string;
  wheel_id: string | null;
  wheel_name: string;
  segments: WheelSegment[] | null;
  winning_index: number;
  winning_label: string;
  triggered_by: string | null;
  trigger_type: string;
  created_at: string;
  theme: string | null;
  fill_style: string | null;
}

function rowToSpin(r: SpinRow): WheelSpin {
  return {
    id: r.id,
    wheelId: r.wheel_id,
    wheelName: r.wheel_name,
    segments: Array.isArray(r.segments) ? r.segments : [],
    winningIndex: r.winning_index,
    winningLabel: r.winning_label,
    triggeredBy: r.triggered_by,
    triggerType: r.trigger_type,
    createdAt: r.created_at,
    themeId: r.theme ?? "classic",
    fillStyle: getFillStyle(r.fill_style),
  };
}

/** Append a spin to the log. Returns the persisted row. */
export async function recordSpin(args: {
  ownerUserId: string;
  wheelId: string | null;
  wheelName: string;
  segments: WheelSegment[];
  winningIndex: number;
  winningLabel: string;
  triggeredBy: string | null;
  triggerType: string;
  themeId: string;
  fillStyle: string;
}): Promise<WheelSpin> {
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("gs_wheel_spins")
    .insert({
      owner_user_id: args.ownerUserId,
      wheel_id: args.wheelId,
      wheel_name: args.wheelName,
      segments: args.segments,
      winning_index: args.winningIndex,
      winning_label: args.winningLabel,
      triggered_by: args.triggeredBy,
      trigger_type: args.triggerType,
      theme: args.themeId,
      fill_style: args.fillStyle,
    })
    .select(SPIN_COLS)
    .single();
  if (error) throw error;
  return rowToSpin(data as SpinRow);
}

/** Latest spin for an owner, optionally newer than an ISO timestamp. */
export async function getLatestSpin(
  ownerUserId: string,
  since?: string | null,
): Promise<WheelSpin | null> {
  const admin = createServiceClient();
  let query = admin
    .from("gs_wheel_spins")
    .select(SPIN_COLS)
    .eq("owner_user_id", ownerUserId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (since) query = query.gt("created_at", since);
  const { data } = await query.maybeSingle();
  return data ? rowToSpin(data as SpinRow) : null;
}

// ── Viewer-contribution entries ────────────────────────────────────

interface EntryRow {
  id: string;
  label: string;
  added_by_twitch: string | null;
  added_by_display: string | null;
}

function rowToEntry(r: EntryRow): WheelEntry {
  return {
    id: r.id,
    label: r.label,
    addedByTwitch: r.added_by_twitch,
    addedByDisplay: r.added_by_display,
  };
}

/** Active viewer entries for a wheel, oldest first. */
export async function listEntries(wheelId: string): Promise<WheelEntry[]> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("gs_wheel_entries")
    .select("id, label, added_by_twitch, added_by_display")
    .eq("wheel_id", wheelId)
    .order("created_at", { ascending: true });
  return ((data as EntryRow[] | null) ?? []).map(rowToEntry);
}

export async function countEntries(wheelId: string): Promise<number> {
  const admin = createServiceClient();
  const { count } = await admin
    .from("gs_wheel_entries")
    .select("id", { count: "exact", head: true })
    .eq("wheel_id", wheelId);
  return count ?? 0;
}

export async function countEntriesByUser(
  wheelId: string,
  login: string,
): Promise<number> {
  const admin = createServiceClient();
  const { count } = await admin
    .from("gs_wheel_entries")
    .select("id", { count: "exact", head: true })
    .eq("wheel_id", wheelId)
    .eq("added_by_twitch", login);
  return count ?? 0;
}

export async function addEntry(args: {
  ownerUserId: string;
  wheelId: string;
  label: string;
  addedByTwitch: string | null;
  addedByDisplay: string | null;
}): Promise<WheelEntry> {
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("gs_wheel_entries")
    .insert({
      owner_user_id: args.ownerUserId,
      wheel_id: args.wheelId,
      label: args.label,
      added_by_twitch: args.addedByTwitch,
      added_by_display: args.addedByDisplay,
    })
    .select("id, label, added_by_twitch, added_by_display")
    .single();
  if (error) throw error;
  return rowToEntry(data as EntryRow);
}

/**
 * Remove viewer entries matching `label` (case-insensitive) on a wheel.
 * When `byLogin` is set, only that viewer's entries are removed (viewers
 * removing their own); mods/streamer pass it undefined to remove any.
 * Returns true when something was deleted.
 */
export async function removeEntry(args: {
  wheelId: string;
  label: string;
  byLogin?: string;
}): Promise<boolean> {
  const admin = createServiceClient();
  let q = admin
    .from("gs_wheel_entries")
    .delete()
    .eq("wheel_id", args.wheelId)
    .ilike("label", args.label);
  if (args.byLogin) q = q.eq("added_by_twitch", args.byLogin);
  const { data } = await q.select("id");
  return (data?.length ?? 0) > 0;
}

/** Delete one entry by id (used to consume the winning viewer entry). */
export async function consumeEntry(entryId: string): Promise<void> {
  const admin = createServiceClient();
  await admin.from("gs_wheel_entries").delete().eq("id", entryId);
}

/** Append a fixed segment's label to the wheel's consumed set (elimination). */
export async function consumeFixedLabel(
  wheelId: string,
  label: string,
  current: string[],
): Promise<void> {
  if (current.includes(label)) return;
  const admin = createServiceClient();
  await admin
    .from("gs_wheels")
    .update({ consumed_labels: [...current, label] })
    .eq("id", wheelId);
}

/** Wipe viewer entries + reset the consumed set for a fresh round. */
export async function clearEntries(wheelId: string): Promise<void> {
  const admin = createServiceClient();
  await admin.from("gs_wheel_entries").delete().eq("wheel_id", wheelId);
  await admin
    .from("gs_wheels")
    .update({ consumed_labels: [] })
    .eq("id", wheelId);
}

/**
 * The spinnable pool: fixed segments (minus consumed labels) plus the
 * active viewer entries. Each item is tagged so the spin engine knows
 * what to consume on elimination.
 */
export async function getSpinPool(wheel: Wheel): Promise<PoolItem[]> {
  const consumed = new Set(wheel.consumedLabels);
  const fixed: PoolItem[] = wheel.segments
    .filter((s) => !consumed.has(s.label))
    .map((s) => ({
      label: s.label,
      weight: s.weight,
      color: s.color,
      source: "fixed" as const,
    }));
  const viewer: PoolItem[] = (await listEntries(wheel.id)).map((e) => ({
    label: e.label,
    source: "viewer" as const,
    entryId: e.id,
  }));
  return [...fixed, ...viewer];
}
