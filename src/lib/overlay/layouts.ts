/**
 * Overlay layout profiles (Streamer Tools Integration — layout editor). Per
 * (owner, format) placement overrides for the overlay tools. Absent row → the
 * built-in DEFAULT_LAYOUTS in format.ts. Read by the overlay via the service
 * client (RLS-bypassing) and by the authoring UI via an owner-scoped API.
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import type { LayoutProfile, OverlayFormat } from "./format";

const FORMATS: OverlayFormat[] = ["landscape", "portrait", "square"];

interface LayoutRow {
  format: string;
  safe_area: LayoutProfile["safeArea"] | null;
  elements: LayoutProfile["elements"] | null;
}

function mapRow(r: LayoutRow): LayoutProfile {
  return {
    safeArea: r.safe_area ?? null,
    elements: r.elements ?? {},
  };
}

/**
 * All stored layout profiles for an owner, keyed by format. Formats without a
 * row are omitted (the overlay/editor fall back to DEFAULT_LAYOUTS). Degrades
 * to {} on any read error so the overlay never breaks on layout lookup.
 */
export async function getLayoutProfiles(
  ownerUserId: string,
): Promise<Partial<Record<OverlayFormat, LayoutProfile>>> {
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("gs_overlay_layouts")
    .select("format, safe_area, elements")
    .eq("owner_user_id", ownerUserId);
  if (error || !data) {
    if (error) console.error("[overlay/layouts] read failed:", error.message);
    return {};
  }
  const out: Partial<Record<OverlayFormat, LayoutProfile>> = {};
  for (const row of data as LayoutRow[]) {
    if ((FORMATS as string[]).includes(row.format)) {
      out[row.format as OverlayFormat] = mapRow(row);
    }
  }
  return out;
}

/** Upsert one format's layout profile for an owner. */
export async function saveLayoutProfile(
  ownerUserId: string,
  format: OverlayFormat,
  profile: LayoutProfile,
): Promise<{ ok: boolean; error?: string }> {
  const admin = createServiceClient();
  const { error } = await admin.from("gs_overlay_layouts").upsert(
    {
      owner_user_id: ownerUserId,
      format,
      safe_area: profile.safeArea ?? null,
      elements: profile.elements ?? {},
      updated_at: new Date().toISOString(),
    },
    { onConflict: "owner_user_id,format" },
  );
  if (error) {
    console.error("[overlay/layouts] save failed:", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/** Reset (delete) one format's layout profile → back to DEFAULT_LAYOUTS. */
export async function resetLayoutProfile(
  ownerUserId: string,
  format: OverlayFormat,
): Promise<{ ok: boolean }> {
  const admin = createServiceClient();
  const { error } = await admin
    .from("gs_overlay_layouts")
    .delete()
    .eq("owner_user_id", ownerUserId)
    .eq("format", format);
  return { ok: !error };
}
