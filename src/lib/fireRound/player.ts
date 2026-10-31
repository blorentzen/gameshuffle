import "server-only";

/**
 * Who is playing a Fire Round: the signed-in account, else the guest this
 * browser plays the dailies as (its random id comes in x-daily-guest, as on
 * the daily leaderboards, and only its hash reaches the database).
 */

import { createClient } from "@/lib/supabase/server";
import { guestKey, validGuestSecret } from "@/lib/daily/guests";
import type { FirePlayer } from "./store";

export async function firePlayer(req: Request): Promise<FirePlayer | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) return { kind: "u", id: user.id };
  const secret = req.headers.get("x-daily-guest");
  return validGuestSecret(secret) ? { kind: "g", id: guestKey(secret) } : null;
}

export const ipOf = (req: Request) => req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
