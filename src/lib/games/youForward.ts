import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { joinedSpaces, visibleSpaces } from "@/lib/home/yourGames";

/**
 * Where Account ▸ Competitive and Account ▸ Pokémon go now (journeys picks 2026-11-06, step 6, 3A): the You tab of the
 * matching game space, once that space is open to the account. Mario Kart picks World only when that's the one space
 * joined. Null keeps the Account page.
 */
export async function youTabFor(userId: string, kind: "competitive" | "pokemon"): Promise<string | null> {
  const { data } = await createServiceClient().from("users").select("role, favorite_games").eq("id", userId).maybeSingle();
  const row = data as { role: string | null; favorite_games: string[] | null } | null;
  const visible = new Set(visibleSpaces(row?.role).map((s) => s.id));
  if (kind === "pokemon") return visible.has("pokemon") ? "/games/pokemon?tab=you" : null;
  const joined = joinedSpaces(row?.favorite_games ?? [], row?.role).map((s) => s.id);
  const id = joined.includes("mario-kart-world") && !joined.includes("mario-kart-8-deluxe") ? "mario-kart-world" : "mario-kart-8-deluxe";
  return visible.has(id) ? `/games/${id}?tab=you` : null;
}
