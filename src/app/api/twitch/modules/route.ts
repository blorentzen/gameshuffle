/**
 * GET  /api/twitch/modules   — list module rows for the streamer's active session
 * POST /api/twitch/modules   — toggle enabled / update config / advance state
 *
 * The active session is resolved server-side from the streamer's
 * twitch_connections row → most recent active|test session. If no session
 * exists, GET returns an empty list and POST returns a structured error
 * so the UI can show a "start a session first" hint.
 *
 * POST body shapes:
 *   { action: "set_enabled", moduleId, enabled }
 *   { action: "update_config", moduleId, config }
 *   { action: "set_state",   moduleId, state }
 *   { action: "set_status",  moduleId, status }   // shortcut for picks/bans flow
 *
 * All actions are idempotent. Auth is the active Supabase session — no
 * service-role key on the wire.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  ensureSessionModule,
  setModuleEnabled,
  updateModuleConfig,
  updateModuleState,
} from "@/lib/modules/store";
import { ALL_MODULE_IDS, MODULE_REGISTRY } from "@/lib/modules/registry";
import type { ModuleId } from "@/lib/modules/types";
import { findTwitchSessionForUser } from "@/lib/sessions/twitch-bridge";

export const runtime = "nodejs";

interface ActiveSession {
  sessionId: string;
  status: string;
  randomizerSlug: string | null;
}

async function resolveActiveSession(userId: string): Promise<ActiveSession | null> {
  const session = await findTwitchSessionForUser(userId, ["active", "test"]);
  if (!session) return null;
  return {
    sessionId: session.id,
    status: session.status,
    randomizerSlug: session.randomizer_slug,
  };
}

function isModuleId(id: unknown): id is ModuleId {
  return typeof id === "string" && (ALL_MODULE_IDS as string[]).includes(id);
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const session = await resolveActiveSession(user.id);
  if (!session) {
    return NextResponse.json({ session: null, modules: [] });
  }

  // Read every module row for the session, then enrich with registry
  // metadata so the client doesn't need to import the registry directly.
  const admin = createServiceClient();
  const { data: rows } = await admin
    .from("session_modules")
    .select("module_id, enabled, config, state, updated_at")
    .eq("session_id", session.sessionId);

  const modules = ALL_MODULE_IDS.map((id) => {
    const def = MODULE_REGISTRY[id];
    const row = rows?.find((r) => (r.module_id as string) === id) ?? null;
    return {
      id,
      displayName: def.displayName,
      description: def.description,
      requiredTier: def.requiredTier,
      chatCommands: def.chatCommands ?? [],
      enabled: row ? !!row.enabled : false,
      provisioned: !!row,
      config: row?.config ?? def.defaultConfig,
      state: row?.state ?? null,
      updatedAt: row?.updated_at ?? null,
    };
  });

  return NextResponse.json({
    session: {
      id: session.sessionId,
      status: session.status,
      randomizerSlug: session.randomizerSlug,
    },
    modules,
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const session = await resolveActiveSession(user.id);
  if (!session) {
    return NextResponse.json(
      { error: "no_active_session", message: "Start a live or test session before toggling modules." },
      { status: 409 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const action = typeof body.action === "string" ? body.action : "";
  const moduleId = body.moduleId;
  if (!isModuleId(moduleId)) {
    return NextResponse.json({ error: "invalid_module_id" }, { status: 400 });
  }

  // Always ensure a row exists before mutating — first-time toggles for
  // picks/bans need this since they don't auto-provision on session start.
  await ensureSessionModule({ sessionId: session.sessionId, moduleId });

  switch (action) {
    case "set_enabled": {
      if (typeof body.enabled !== "boolean") {
        return NextResponse.json({ error: "missing_enabled" }, { status: 400 });
      }
      await setModuleEnabled({
        sessionId: session.sessionId,
        moduleId,
        enabled: body.enabled,
      });
      return NextResponse.json({ success: true });
    }

    case "update_config": {
      const config = body.config as Record<string, unknown> | undefined;
      if (!config || typeof config !== "object") {
        return NextResponse.json({ error: "missing_config" }, { status: 400 });
      }
      await updateModuleConfig({
        sessionId: session.sessionId,
        moduleId,
        // Cast: each module's helper validates the shape downstream;
        // store.ts accepts the typed config and json-encodes for storage.
        config: config as never,
      });
      return NextResponse.json({ success: true });
    }

    case "set_state": {
      const state = body.state as Record<string, unknown> | undefined;
      if (!state || typeof state !== "object") {
        return NextResponse.json({ error: "missing_state" }, { status: 400 });
      }
      await updateModuleState({
        sessionId: session.sessionId,
        moduleId,
        state: state as never,
      });
      return NextResponse.json({ success: true });
    }

    case "set_status": {
      // Convenience action for picks/bans: flip the `status` field on
      // state without making the client construct the whole state object.
      // Valid only for picks + bans modules.
      const status = body.status;
      if (typeof status !== "string") {
        return NextResponse.json({ error: "missing_status" }, { status: 400 });
      }
      if (moduleId !== "picks" && moduleId !== "bans") {
        return NextResponse.json({ error: "status_unsupported_for_module" }, { status: 400 });
      }
      const validStatuses = ["collecting", "locked", "completed"];
      if (!validStatuses.includes(status)) {
        return NextResponse.json({ error: "invalid_status" }, { status: 400 });
      }
      // Read current state, mutate just the status field, write back.
      const admin = createServiceClient();
      const { data: row } = await admin
        .from("session_modules")
        .select("state")
        .eq("session_id", session.sessionId)
        .eq("module_id", moduleId)
        .maybeSingle();
      const currentState = (row?.state as Record<string, unknown> | null) ?? {};
      const nextState: Record<string, unknown> = {
        ...currentState,
        status,
        ...(status === "locked" && !currentState.locked_at
          ? { locked_at: new Date().toISOString() }
          : {}),
        // Re-opening (status flipping back to collecting) resets the
        // timer + clears the prior lock-in stamp, so the cron sweep
        // doesn't immediately re-lock based on a stale timer_started_at
        // and the streamer gets a fresh round.
        ...(status === "collecting"
          ? { timer_started_at: null, locked_at: null }
          : {}),
      };
      await updateModuleState({
        sessionId: session.sessionId,
        moduleId,
        state: nextState as never,
      });
      return NextResponse.json({ success: true });
    }

    default:
      return NextResponse.json({ error: "unknown_action" }, { status: 400 });
  }
}
