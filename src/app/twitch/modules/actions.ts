"use server";

/**
 * Server action for /twitch/modules toggles. Auth-gates to the
 * streamer owning the community (resolved via Supabase auth →
 * gs_identities → gs_communities.owner_identity_id) and writes the
 * toggle via setModuleEnabled.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  setModuleEnabled,
  type ModuleKey,
} from "@/lib/economy/modules/registry";

export async function toggleModuleAction(args: {
  communityId: string;
  moduleKey: ModuleKey;
  enabled: boolean;
}): Promise<{ ok: boolean; reason?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "unauthenticated" };

  // Verify the caller actually owns the community before mutating.
  const admin = createServiceClient();
  const { data: identityRow } = await admin
    .from("gs_identities")
    .select("id")
    .eq("gs_account_id", user.id)
    .eq("platform", "twitch")
    .maybeSingle();
  if (!identityRow) return { ok: false, reason: "no_identity" };

  const { data: communityRow } = await admin
    .from("gs_communities")
    .select("id, owner_identity_id")
    .eq("id", args.communityId)
    .maybeSingle();
  if (!communityRow) return { ok: false, reason: "community_not_found" };
  if (
    (communityRow as { owner_identity_id: string }).owner_identity_id !==
    (identityRow as { id: string }).id
  ) {
    return { ok: false, reason: "not_owner" };
  }

  const result = await setModuleEnabled({
    communityId: args.communityId,
    moduleKey: args.moduleKey,
    enabled: args.enabled,
    byIdentityId: (identityRow as { id: string }).id,
  });
  if (result.ok) {
    revalidatePath("/twitch/modules");
  }
  return result;
}
