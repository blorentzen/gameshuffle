import "server-only";

/** Moving Discord-only time trial times onto the account that just signed in with (or connected) Discord. */

import type { User } from "@supabase/supabase-js";
import { claimDiscordTimes } from "./store";

/** The Discord user id from a Supabase user's Discord identity, or null. */
export function discordIdOf(user: Pick<User, "identities">): string | null {
  const d = (user.identities ?? []).find((i) => i.provider === "discord");
  const data = d?.identity_data as { provider_id?: string; sub?: string } | undefined;
  return data?.provider_id ?? data?.sub ?? null;
}

/** How many times moved (0 without Discord, without the tables, or on any error). */
export async function claimForUser(user: Pick<User, "id" | "identities">): Promise<number> {
  const discordId = discordIdOf(user);
  if (!discordId) return 0;
  return claimDiscordTimes(user.id, discordId).catch(() => 0);
}
