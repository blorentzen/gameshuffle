import "server-only";

/**
 * War overlay looks saved to an account (war_looks, wars-m2.sql): one per account and layout. A link with ?look=<id>
 * shows the saved look, its paid choices only while the owner has GS Pro or Supporter looks (`hasLooks`).
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { hasLooks } from "@/lib/support/looks";
import { cleanLook, freeLook, type WarLook } from "./look";

let ready: boolean | null = null;
export async function looksReady(): Promise<boolean> {
  if (ready) return true;
  const { error } = await createServiceClient().from("war_looks").select("id", { head: true, count: "exact" }).limit(1);
  ready = !error;
  return ready;
}

type Row = { id: string; owner_user_id: string; layout: string; look: unknown; updated_at: string };

/** A saved look as the overlay draws it: paid choices only while its owner has looks. */
export async function resolveLook(id: string): Promise<{ id: string; look: WarLook; paidShown: boolean; updatedAt: string } | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const { data } = await createServiceClient().from("war_looks").select("id, owner_user_id, layout, look, updated_at").eq("id", id).maybeSingle();
  const row = data as Row | null;
  if (!row) return null;
  const look = cleanLook({ ...(row.look as object), layout: row.layout });
  const paid = await hasLooks(row.owner_user_id).catch(() => false);
  return { id: row.id, look: paid ? look : freeLook(look), paidShown: paid, updatedAt: row.updated_at };
}

/** An account's saved looks, by layout. */
export async function myLooks(userId: string): Promise<{ id: string; look: WarLook }[]> {
  const { data } = await createServiceClient().from("war_looks").select("id, owner_user_id, layout, look, updated_at").eq("owner_user_id", userId);
  return ((data ?? []) as Row[]).map((r) => ({ id: r.id, look: cleanLook({ ...(r.look as object), layout: r.layout }) }));
}

/** Saves (or updates) the account's look for its layout; returns its id. Paid choices are kept even without looks. */
export async function saveLook(userId: string, raw: unknown): Promise<string | null> {
  const look = cleanLook(raw);
  const { data, error } = await createServiceClient().from("war_looks")
    .upsert({ owner_user_id: userId, layout: look.layout, look, updated_at: new Date().toISOString() }, { onConflict: "owner_user_id,layout" })
    .select("id").single();
  if (error) { console.error("[wars] save look failed:", error.message); return null; }
  return (data as { id: string }).id;
}
