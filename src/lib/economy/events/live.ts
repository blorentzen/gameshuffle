/**
 * Viewer-facing read of in-flight event state for a session: active modifiers
 * + open PUBLIC challenges. Secret missions (visibility='secret') are
 * deliberately excluded — they stay hidden until they resolve. Both tables key
 * on session_id, so this is read-only (no stream creation).
 *
 * Powers the /live Events tab + the overlay event banner.
 */

import { createServiceClient } from "@/lib/supabase/admin";

export interface LiveModifier {
  id: string;
  effect: string;
  scope: string;
  expiresAt: string;
}

export interface LiveChallenge {
  id: string;
  variableType: string;
  condition: Record<string, unknown> | null;
  reward: number | null;
  penalty: number | null;
  /** Display name when the challenge targets one viewer; null = everyone. */
  targetName: string | null;
}

export interface LiveEvents {
  modifiers: LiveModifier[];
  challenges: LiveChallenge[];
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function listLiveSessionEvents(sessionId: string): Promise<LiveEvents> {
  const admin = createServiceClient();
  const nowIso = new Date().toISOString();

  const [{ data: modRows }, { data: chRows }] = await Promise.all([
    admin
      .from("gs_event_modifiers")
      .select("id, effect, scope, expires_at")
      .eq("session_id", sessionId)
      .gt("expires_at", nowIso)
      .order("expires_at", { ascending: true }),
    admin
      .from("gs_event_challenges")
      .select("id, variable_type, condition, reward, penalty, target_identity_id")
      .eq("session_id", sessionId)
      .eq("status", "open")
      .eq("visibility", "public"),
  ]);

  const modifiers: LiveModifier[] = ((modRows as any[]) ?? []).map((r) => ({
    id: r.id,
    effect: r.effect,
    scope: r.scope,
    expiresAt: r.expires_at,
  }));

  const challenges = (chRows as any[]) ?? [];

  // Resolve target display names in one batch.
  const targetIds = [
    ...new Set(challenges.map((c) => c.target_identity_id).filter(Boolean) as string[]),
  ];
  let nameById: Record<string, string> = {};
  if (targetIds.length > 0) {
    const { data: idRows } = await admin
      .from("gs_identities")
      .select("id, display_name")
      .in("id", targetIds);
    nameById = Object.fromEntries(
      ((idRows as any[]) ?? []).map((r) => [r.id, r.display_name as string]),
    );
  }

  return {
    modifiers,
    challenges: challenges.map((c) => ({
      id: c.id,
      variableType: c.variable_type,
      condition: (c.condition as Record<string, unknown> | null) ?? null,
      reward: c.reward ?? null,
      penalty: c.penalty ?? null,
      targetName: c.target_identity_id ? (nameById[c.target_identity_id] ?? null) : null,
    })),
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */
