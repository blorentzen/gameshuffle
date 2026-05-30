/**
 * Cross-surface identity merge.
 *
 * Several tables hold rows keyed to a "raw" Discord or Twitch user id
 * — created before the human behind that id had a GS account, or
 * created with one identity (Discord) and only later associated with
 * the other (Twitch). When that human signs in to GS or links a new
 * provider, we want every existing row that matches their newly-known
 * identity to get rebound to their canonical `users.id`.
 *
 * Two specs depend on this primitive:
 *
 *   - `gs-discord-prequeue-identity-spec.md` — ghost prequeue rows
 *     (`session_prequeues.gs_user_id IS NULL`) get rebound to a real
 *     `gs_user_id` so their pre-stream queue spot survives signup.
 *
 *   - `gs-mod-accounts-spec.md` — pending mod rows
 *     (`streamer_mods.gs_user_id IS NULL`) get rebound and (when
 *     `status='invited'` claim flow runs) flip to `status='active'`.
 *     This file only fills in the identity backfill; the status
 *     flip is the claim route's job.
 *
 * The helper is idempotent — calling it twice in a row is a no-op.
 * That matters because we call it from EVERY OAuth callback (sign-in,
 * provider-link, signup) and don't want to gate on "is this the first
 * time we've seen this identity." Cheap unconditional run > stateful
 * "have we merged yet" tracking.
 */

import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  getIdentityByPlatform,
  upgradeIdentityToAccount,
} from "@/lib/economy/identity";

export interface MergeIdentityArgs {
  /** Canonical GS user id — the destination of the merge. */
  gsUserId: string;
  /** Twitch user id newly associated with this GS user. */
  twitchUserId?: string | null;
  /** Discord user id newly associated with this GS user. */
  discordUserId?: string | null;
}

export interface MergeIdentityResult {
  /** Rows rebound to `gs_user_id` by surface, for observability + tests. */
  rebound: {
    session_prequeues: number;
    streamer_mods: number;
    /** gs_identities rows transitioned from Tier 0 anon to Tier 1
     *  linked. Two-element shape: [twitch, discord]. Either value is
     *  0 when no row needed upgrading. */
    gs_identities_twitch: number;
    gs_identities_discord: number;
  };
}

/**
 * Rebind every cross-surface row that matches the supplied raw
 * platform user ids to the supplied canonical `gs_user_id`.
 *
 * Safe to call unconditionally on every OAuth callback. If neither
 * `twitchUserId` nor `discordUserId` is provided (or both are null),
 * the helper is a no-op and returns zero rebound counts.
 */
export async function mergeIdentityAcrossSurfaces(
  args: MergeIdentityArgs,
): Promise<MergeIdentityResult> {
  const result: MergeIdentityResult = {
    rebound: {
      session_prequeues: 0,
      streamer_mods: 0,
      gs_identities_twitch: 0,
      gs_identities_discord: 0,
    },
  };

  const { gsUserId, twitchUserId, discordUserId } = args;
  if (!twitchUserId && !discordUserId) return result;

  const admin = createServiceClient();

  // session_prequeues — Discord-only entry surface for v1, so we only
  // need the discord_user_id branch. (Twitch-side prequeues don't
  // exist yet; if they ship in a future PR, add a twitch_user_id
  // branch here mirroring this one.)
  if (discordUserId) {
    const { count } = await admin
      .from("session_prequeues")
      .update({ gs_user_id: gsUserId }, { count: "exact" })
      .eq("discord_user_id", discordUserId)
      .is("gs_user_id", null);
    result.rebound.session_prequeues = count ?? 0;
  }

  // streamer_mods — both identity branches matter. A mod row created
  // by auto-import from Twitch has only `twitch_user_id`; a row
  // created via manual-add by Discord handle has only `discord_user_id`.
  // We run the two updates serially so each one targets its branch's
  // partial index.
  if (twitchUserId) {
    const { count } = await admin
      .from("streamer_mods")
      .update({ gs_user_id: gsUserId }, { count: "exact" })
      .eq("twitch_user_id", twitchUserId)
      .is("gs_user_id", null);
    result.rebound.streamer_mods += count ?? 0;
  }
  if (discordUserId) {
    const { count } = await admin
      .from("streamer_mods")
      .update({ gs_user_id: gsUserId }, { count: "exact" })
      .eq("discord_user_id", discordUserId)
      .is("gs_user_id", null);
    result.rebound.streamer_mods += count ?? 0;
  }

  // gs_identities — Tier 0 → Tier 1 LINK. Each platform identity that
  // already exists as an anon row gets its gs_account_id stamped so
  // every prior token_event survives the merge (balance + history are
  // anchored to identity_id, not gs_account_id, so the LINK doesn't
  // touch the ledger). Missing rows aren't created here — chat or web
  // activity will lazy-create them via resolveIdentity, at which point
  // the row will already match this gs_user_id.
  if (twitchUserId) {
    const existing = await getIdentityByPlatform("twitch", twitchUserId);
    if (existing && existing.gs_account_id == null) {
      try {
        const r = await upgradeIdentityToAccount({
          identityId: existing.id,
          gsAccountId: gsUserId,
        });
        if (r.ok) result.rebound.gs_identities_twitch = 1;
      } catch (err) {
        console.error(
          "[identity/merge] gs_identities twitch upgrade failed:",
          err,
        );
      }
    }
  }
  if (discordUserId) {
    const existing = await getIdentityByPlatform("discord", discordUserId);
    if (existing && existing.gs_account_id == null) {
      try {
        const r = await upgradeIdentityToAccount({
          identityId: existing.id,
          gsAccountId: gsUserId,
        });
        if (r.ok) result.rebound.gs_identities_discord = 1;
      } catch (err) {
        console.error(
          "[identity/merge] gs_identities discord upgrade failed:",
          err,
        );
      }
    }
  }

  return result;
}
