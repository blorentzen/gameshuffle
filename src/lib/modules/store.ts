/**
 * session_modules read/write helpers. All operations use the service-role
 * admin client because chat handlers and the (future) Hub API both need
 * to bypass RLS.
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { MODULE_REGISTRY } from "./registry";
import type {
  ConfigForModule,
  ModuleId,
  StateForModule,
} from "./types";

export interface SessionModuleRow<Id extends ModuleId = ModuleId> {
  id: string;
  session_id: string;
  module_id: Id;
  enabled: boolean;
  config: ConfigForModule<Id>;
  state: StateForModule<Id>;
  created_at: string;
  updated_at: string;
}

/**
 * Ensure a session has a row for `moduleId`. Idempotent — first call
 * inserts with the registry's defaultConfig + an empty state; subsequent
 * calls return the existing row unchanged. Used by the auto-enable path
 * on session start (kart_randomizer always auto-enables) and by the Hub
 * when a streamer flips a module on for the first time.
 */
export async function ensureSessionModule<Id extends ModuleId>(args: {
  sessionId: string;
  moduleId: Id;
  enabled?: boolean;
  initialState?: StateForModule<Id>;
}): Promise<SessionModuleRow<Id>> {
  const admin = createServiceClient();
  const def = MODULE_REGISTRY[args.moduleId];
  const enabled = args.enabled ?? true;

  const { data: existing } = await admin
    .from("session_modules")
    .select("*")
    .eq("session_id", args.sessionId)
    .eq("module_id", args.moduleId)
    .maybeSingle();
  if (existing) return existing as SessionModuleRow<Id>;

  const { data: inserted, error } = await admin
    .from("session_modules")
    .insert({
      session_id: args.sessionId,
      module_id: args.moduleId,
      enabled,
      config: def.defaultConfig as Record<string, unknown>,
      state: (args.initialState ?? {}) as Record<string, unknown>,
    })
    .select("*")
    .single();
  if (error || !inserted) {
    throw new Error(
      `[modules/store] failed to insert session_module ${args.moduleId} for session ${args.sessionId}: ${error?.message ?? "unknown"}`
    );
  }
  return inserted as SessionModuleRow<Id>;
}

/** Look up a single module row for a session. Returns null when not enabled / not present. */
export async function getSessionModule<Id extends ModuleId>(args: {
  sessionId: string;
  moduleId: Id;
  /** When true, returns the row even if `enabled = false`. Default false. */
  includeDisabled?: boolean;
}): Promise<SessionModuleRow<Id> | null> {
  const admin = createServiceClient();
  let query = admin
    .from("session_modules")
    .select("*")
    .eq("session_id", args.sessionId)
    .eq("module_id", args.moduleId);
  if (!args.includeDisabled) {
    query = query.eq("enabled", true);
  }
  const { data } = await query.maybeSingle();
  return (data as SessionModuleRow<Id> | null) ?? null;
}

/** Update the runtime state portion. Used by chat command handlers. */
export async function updateModuleState<Id extends ModuleId>(args: {
  sessionId: string;
  moduleId: Id;
  state: StateForModule<Id>;
}): Promise<void> {
  const admin = createServiceClient();
  const { error } = await admin
    .from("session_modules")
    .update({ state: args.state as Record<string, unknown> })
    .eq("session_id", args.sessionId)
    .eq("module_id", args.moduleId);
  if (error) {
    console.error(
      `[modules/store] failed to update state for ${args.moduleId} on session ${args.sessionId}:`,
      error
    );
    throw error;
  }
}

/** Update the config portion. Used by the Hub UI / future API. */
export async function updateModuleConfig<Id extends ModuleId>(args: {
  sessionId: string;
  moduleId: Id;
  config: ConfigForModule<Id>;
}): Promise<void> {
  const admin = createServiceClient();
  const { error } = await admin
    .from("session_modules")
    .update({ config: args.config as unknown as Record<string, unknown> })
    .eq("session_id", args.sessionId)
    .eq("module_id", args.moduleId);
  if (error) throw error;
}

/** Toggle the enabled flag. Used by the Hub UI. */
export async function setModuleEnabled<Id extends ModuleId>(args: {
  sessionId: string;
  moduleId: Id;
  enabled: boolean;
}): Promise<void> {
  const admin = createServiceClient();
  const { error } = await admin
    .from("session_modules")
    .update({ enabled: args.enabled })
    .eq("session_id", args.sessionId)
    .eq("module_id", args.moduleId);
  if (error) throw error;
}
