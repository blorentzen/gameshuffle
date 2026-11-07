import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { accountInterests } from "@/lib/interests/store";
import { nextPicks } from "@/lib/home/nextPicks";
import { pickContext } from "@/lib/home/pickContext";
import { todayLive, PULSE_GAMES, type PersonDay, type PulseGame } from "@/lib/home/dailyPulse";
import { formatTime } from "@/lib/originals/dailies";

/**
 * After the last daily (dailies picks 2026-11-05, 5A and 8A): who you beat among the people you follow and who's
 * left to beat ("You beat Sam by 0:53. Riley's 0:41 is the one to beat."), then three picks by your interests.
 * Signed out: the most played picks, nothing personal (cached a minute).
 */
export async function GET(req: NextRequest) {
  const game = req.nextUrl.searchParams.get("game") as PulseGame | null;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    const picks = await nextPicks({ interests: [], favorites: [], signedIn: false }).catch(() => []);
    return NextResponse.json({ beat: null, picks }, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } });
  }
  const [interests, favs, live] = await Promise.all([
    accountInterests(user.id).catch(() => []),
    createServiceClient().from("users").select("favorite_games").eq("id", user.id).maybeSingle().then((r) => ((r.data as { favorite_games: string[] | null } | null)?.favorite_games ?? [])),
    todayLive(user.id).catch(() => null),
  ]);
  const ctx = await pickContext(user.id, live?.friends ?? []).catch(() => undefined);
  const picks = await nextPicks({ interests, favorites: favs, signedIn: true, ctx }).catch(() => []);
  return NextResponse.json({ beat: live && game && PULSE_GAMES.includes(game) ? beatLine(game, live.people[game]) : null, picks }, { headers: { "Cache-Control": "private, no-store" } });
}

const gap = (game: PulseGame, a: PersonDay, b: PersonDay): string | null => {
  if (game === "fire") return `${Math.abs((a.score ?? 0) - (b.score ?? 0)).toLocaleString("en-US")}`;
  if (game === "duel") { const d = Math.abs(a.guesses - b.guesses); return d ? `${d} ${d === 1 ? "turn" : "turns"}` : null; }
  if (a.seconds != null && b.seconds != null && b.solved) return formatTime(Math.abs(b.seconds - a.seconds));
  return null;
};

/** One line about your people on this daily, or null when nobody you follow has played it. */
function beatLine(game: PulseGame, rows: PersonDay[]): string | null {
  const i = rows.findIndex((r) => r.you);
  if (i < 0 || rows.length < 2) return null;
  const you = rows[i];
  const behind = rows[i + 1] ?? null;
  const leader = i > 0 ? rows[0] : null;
  const parts: string[] = [];
  if (behind) {
    const by = gap(game, you, behind);
    parts.push(by ? `You beat ${behind.name} by ${by}.` : `You beat ${behind.name}.`);
  }
  if (leader) parts.push(`${leader.name}'s ${leader.value} is the one to beat.`);
  else parts.push(behind ? "Nobody you follow did better." : "You lead your people today.");
  return parts.join(" ");
}
