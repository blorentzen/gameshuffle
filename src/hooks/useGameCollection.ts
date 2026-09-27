"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { emptyCollection, readCollection, type GameCollection } from "@/lib/collection/core";

/**
 * A person's collection for one game (what they own or have unlocked).
 * Signed in: saved to their account (user_game_profiles). Signed out, or
 * before that migration lands: saved in this browser. The first time someone
 * signs in with a browser copy and no account copy, it moves to the account.
 */

const localKey = (slug: string) => `gs-collection:${slug}`;
function readLocal(slug: string): unknown {
  try { return JSON.parse(localStorage.getItem(localKey(slug)) ?? "null"); } catch { return null; }
}
function writeLocal(slug: string, col: GameCollection) {
  try { localStorage.setItem(localKey(slug), JSON.stringify(col)); } catch { /* private mode: it just won't stick */ }
}

export type CollectionSource = "account" | "browser";
const EMPTY = emptyCollection();

/** `defaults`: the game's starting state (items that start locked are off). */
export function useGameCollection(slug: string, defaults: GameCollection = EMPTY) {
  const { user } = useAuth();
  const [collection, setCollection] = useState<GameCollection>(defaults);
  const [source, setSource] = useState<CollectionSource>("browser");
  const [loaded, setLoaded] = useState(false);
  /** True once someone has saved a collection (so the page can say "your collection"). */
  const [customized, setCustomized] = useState(false);

  useEffect(() => {
    let live = true;
    void (async () => {
      const local = readLocal(slug);
      if (user) {
        const { data, error } = await createClient().from("user_game_profiles").select("data").eq("user_id", user.id).eq("game_slug", slug).maybeSingle();
        if (!live) return;
        if (!error) {
          if (data) { setCollection(readCollection(data.data, defaults)); setCustomized(true); }
          else if (local) {
            // First sign-in with a browser copy: move it to the account.
            const col = readCollection(local, defaults);
            setCollection(col); setCustomized(true);
            await createClient().from("user_game_profiles").upsert({ user_id: user.id, game_slug: slug, data: col, updated_at: new Date().toISOString() });
          } else setCollection(defaults);
          setSource("account"); setLoaded(true);
          return;
        }
        // Table not there yet: fall through to the browser copy.
      }
      if (!live) return;
      setCollection(local ? readCollection(local, defaults) : defaults);
      setCustomized(!!local);
      setSource("browser"); setLoaded(true);
    })();
    return () => { live = false; };
  }, [slug, user]); // eslint-disable-line react-hooks/exhaustive-deps -- defaults are static per game

  /** Save a whole collection. Resolves false if the account save failed. */
  const save = useCallback(async (next: GameCollection): Promise<boolean> => {
    setCollection(next); setCustomized(true);
    writeLocal(slug, next);
    if (user && source === "account") {
      const { error } = await createClient().from("user_game_profiles")
        .upsert({ user_id: user.id, game_slug: slug, data: next, updated_at: new Date().toISOString() });
      return !error;
    }
    return true;
  }, [slug, user, source]);

  return { collection, save, source, loaded, customized, signedIn: !!user };
}
