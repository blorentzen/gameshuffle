"use server";

/**
 * Server actions for the Companion save-state surface.
 *
 * Auth-only — Guest users can't save. RLS is the load-bearing
 * guard; the explicit auth check here is defense-in-depth and
 * shapes the error responses.
 *
 * Capabilities: `companion.save_state` (Free+). We don't enforce
 * a per-tier save count cap in v1 — if abuse shows up we'd add a
 * quota check here (e.g. Free = 5 saves, Pro = unlimited).
 */

import { createClient } from "@/lib/supabase/server";
import { SAVE_STATE_VERSION, type SaveCompanionGameInput } from "@/lib/companion/saveStates";

export interface SaveResult {
  ok: boolean;
  id?: string;
  reason?: string;
}

export interface DeleteResult {
  ok: boolean;
  reason?: string;
}

const MAX_NAME_LENGTH = 80;

/**
 * Create a new save row, or update an existing one (when `id` is
 * provided). The reducer-shaped payload is JSON-serialized into the
 * `session_data` jsonb column verbatim.
 */
export async function saveCompanionGameAction(
  input: SaveCompanionGameInput,
): Promise<SaveResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "not_authenticated" };

  if (!input.mode || typeof input.mode !== "string") {
    return { ok: false, reason: "invalid_mode" };
  }
  if (!input.sessionData || !Array.isArray(input.sessionData.slots)) {
    return { ok: false, reason: "invalid_session_data" };
  }

  const trimmedName =
    typeof input.name === "string"
      ? input.name.trim().slice(0, MAX_NAME_LENGTH)
      : null;

  if (input.id) {
    // UPDATE existing row — the trigger keeps updated_at honest.
    const { error } = await supabase
      .from("companion_save_states")
      .update({
        name: trimmedName,
        mode: input.mode,
        game_settings: input.gameSettings,
        session_data: input.sessionData,
        state_version: SAVE_STATE_VERSION,
      })
      .eq("id", input.id)
      .eq("account_id", user.id);
    if (error) {
      console.error("[companion/save] update failed", error);
      return { ok: false, reason: "db_error" };
    }
    return { ok: true, id: input.id };
  }

  const { data, error } = await supabase
    .from("companion_save_states")
    .insert({
      account_id: user.id,
      name: trimmedName,
      mode: input.mode,
      game_settings: input.gameSettings,
      session_data: input.sessionData,
      state_version: SAVE_STATE_VERSION,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[companion/save] insert failed", error);
    return { ok: false, reason: "db_error" };
  }
  return { ok: true, id: data.id };
}

/** Delete a save row by id. RLS ensures users can only delete
 *  their own rows; this is defense-in-depth. */
export async function deleteCompanionSaveAction(
  id: string,
): Promise<DeleteResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "not_authenticated" };
  if (!id) return { ok: false, reason: "missing_id" };

  const { error } = await supabase
    .from("companion_save_states")
    .delete()
    .eq("id", id)
    .eq("account_id", user.id);
  if (error) {
    console.error("[companion/save] delete failed", error);
    return { ok: false, reason: "db_error" };
  }
  return { ok: true };
}
