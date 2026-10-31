/**
 * Who's on the welcome page: signed out (null), or an account. A new account (made in the last
 * week) gets three first steps, each ticked once done. Sign-up sends everyone here with ?new=1, so
 * the page sends an older account that signed in through the sign-up page on to /account.
 */

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { gsDay } from "@/lib/time/gsClock";

export interface WelcomeViewer {
  name: string;
  isNew: boolean;
  steps: { games: boolean; profile: boolean; daily: boolean };
}

const WEEK = 7 * 86_400_000;

export async function welcomeViewer(): Promise<WelcomeViewer | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const svc = createServiceClient();
  const [{ data: row }, { data: played }] = await Promise.all([
    svc.from("users").select("display_name, username, favorite_games, gamertags, avatar_source, created_at").eq("id", user.id).maybeSingle(),
    svc.from("daily_scores").select("game").eq("player", `u:${user.id}`).eq("day", gsDay()).limit(1),
  ]);
  const u = (row ?? {}) as { display_name?: string | null; username?: string | null; favorite_games?: string[] | null; gamertags?: Record<string, string> | null; avatar_source?: string | null; created_at?: string | null };
  const made = Date.parse(u.created_at ?? user.created_at ?? "");
  const gamertags = Object.values(u.gamertags ?? {}).some((v) => typeof v === "string" && v.trim());
  return {
    name: u.display_name || u.username || "there",
    isNew: Number.isFinite(made) && Date.now() - made < WEEK,
    steps: {
      games: (u.favorite_games ?? []).length > 0,
      profile: gamertags || (!!u.avatar_source && u.avatar_source !== "dicebear"),
      daily: (played ?? []).length > 0,
    },
  };
}
