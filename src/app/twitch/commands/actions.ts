"use server";

/**
 * Server actions for /twitch/commands. All gated to the community
 * owner — non-owners get a clean error rejection.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  deleteCustomCommandById,
  upsertCustomCommand,
  updateCustomCommandById,
} from "@/lib/twitch/commands/customCommands";
import type { ActorTier } from "@/lib/twitch/commands/registry";

async function resolveOwnerContext(): Promise<
  | { ok: true; communityId: string; identityId: string }
  | { ok: false; reason: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "unauthenticated" };

  const admin = createServiceClient();
  const { data: identityRow } = await admin
    .from("gs_identities")
    .select("id")
    .eq("gs_account_id", user.id)
    .eq("platform", "twitch")
    .maybeSingle();
  if (!identityRow) return { ok: false, reason: "no_identity" };
  const identityId = (identityRow as { id: string }).id;

  const { data: communityRow } = await admin
    .from("gs_communities")
    .select("id")
    .eq("owner_identity_id", identityId)
    .maybeSingle();
  if (!communityRow) return { ok: false, reason: "no_community" };
  return {
    ok: true,
    communityId: (communityRow as { id: string }).id,
    identityId,
  };
}

export async function createCustomCommandAction(args: {
  trigger: string;
  responseTmpl: string;
  actor: ActorTier;
  cooldownSeconds: number;
}): Promise<{ ok: boolean; reason?: string }> {
  const ctx = await resolveOwnerContext();
  if (!ctx.ok) return { ok: false, reason: ctx.reason };

  const result = await upsertCustomCommand({
    communityId: ctx.communityId,
    trigger: args.trigger,
    responseTmpl: args.responseTmpl,
    actor: args.actor,
    cooldownSeconds: args.cooldownSeconds,
    createdByIdentityId: ctx.identityId,
  });
  if (result.ok) revalidatePath("/twitch/commands");
  return { ok: result.ok, reason: result.reason };
}

export async function updateCustomCommandAction(args: {
  id: string;
  trigger?: string;
  responseTmpl?: string;
  actor?: ActorTier;
  cooldownSeconds?: number;
  enabled?: boolean;
}): Promise<{ ok: boolean; reason?: string }> {
  const ctx = await resolveOwnerContext();
  if (!ctx.ok) return { ok: false, reason: ctx.reason };

  const result = await updateCustomCommandById({
    communityId: ctx.communityId,
    id: args.id,
    trigger: args.trigger,
    responseTmpl: args.responseTmpl,
    actor: args.actor,
    cooldownSeconds: args.cooldownSeconds,
    enabled: args.enabled,
  });
  if (result.ok) revalidatePath("/twitch/commands");
  return { ok: result.ok, reason: result.reason };
}

export async function deleteCustomCommandAction(args: {
  id: string;
}): Promise<{ ok: boolean; reason?: string }> {
  const ctx = await resolveOwnerContext();
  if (!ctx.ok) return { ok: false, reason: ctx.reason };

  const result = await deleteCustomCommandById({
    communityId: ctx.communityId,
    id: args.id,
  });
  if (result.ok) revalidatePath("/twitch/commands");
  return result;
}
