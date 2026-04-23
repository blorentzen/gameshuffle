/**
 * Category → randomizer slug resolution.
 *
 * Twitch reassigns or duplicates category IDs over time (e.g. a new entry
 * for a game that had another ID during early access). Our seed in
 * `twitch_game_categories` can get out of date. To stay resilient we try
 * matching by `twitch_category_id` first (fast path, stable when seed is
 * correct) and fall back to case-insensitive name match when the ID isn't
 * found. Name is the user-visible label and rarely changes.
 *
 * When the name-fallback path hits, we opportunistically self-heal the
 * seed row's `twitch_category_id` so subsequent lookups take the fast
 * path. This keeps the data fresh without a manual migration every time
 * Twitch reshuffles IDs.
 */

import { createTwitchAdminClient } from "./admin";

interface CategoryRow {
  twitch_category_id: string;
  twitch_category_name: string;
  randomizer_slug: string;
  active: boolean;
}

export async function resolveRandomizerSlug(
  categoryId: string | null,
  categoryName: string | null
): Promise<string | null> {
  if (!categoryId && !categoryName) return null;
  const admin = createTwitchAdminClient();

  if (categoryId) {
    const { data } = await admin
      .from("twitch_game_categories")
      .select("twitch_category_id, twitch_category_name, randomizer_slug, active")
      .eq("twitch_category_id", categoryId)
      .maybeSingle();
    if (data) {
      const row = data as CategoryRow;
      return row.active ? row.randomizer_slug : null;
    }
  }

  if (categoryName) {
    const { data } = await admin
      .from("twitch_game_categories")
      .select("twitch_category_id, twitch_category_name, randomizer_slug, active")
      .ilike("twitch_category_name", categoryName)
      .maybeSingle();
    if (data) {
      const row = data as CategoryRow;
      if (!row.active) return null;

      // Self-heal the seed: update the stored ID to match what Twitch is
      // actually returning so the next lookup takes the fast path.
      if (categoryId && row.twitch_category_id !== categoryId) {
        await admin
          .from("twitch_game_categories")
          .update({ twitch_category_id: categoryId })
          .eq("randomizer_slug", row.randomizer_slug);
        console.info(
          `[twitch-categories] Updated seed: ${row.randomizer_slug} id ${row.twitch_category_id} → ${categoryId} (name: ${categoryName})`
        );
      }

      return row.randomizer_slug;
    }
  }

  return null;
}
