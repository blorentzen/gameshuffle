import { NextResponse } from "next/server";
import { isMmrGame, type MmrGame } from "@/lib/mmr/rules";
import { loungeGames } from "@/lib/mmr/mkcentral";
import { parseFriendCode, suggestionHref } from "@/lib/lounge/lookup";
import { playersByFriendCode } from "@/lib/lounge/lookupServer";

/** GET /lounge/find?name=&game=[&vs=] : the search box's target, sent on to the player's page (or a head-to-head).
 *  A friend code goes to the player who has it. With no game picked, a player who only plays MK8DX opens there. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const name = (url.searchParams.get("name") ?? "").trim().slice(0, 40);
  const g = url.searchParams.get("game");
  if (!name) return NextResponse.redirect(new URL("/lounge", url), 303);
  // ?vs= : head-to-head with a second player.
  const vs = (url.searchParams.get("vs") ?? "").trim().slice(0, 40);
  if (vs) {
    const to = new URL(`/lounge/compare/${encodeURIComponent(name)}/${encodeURIComponent(vs)}`, url);
    if (isMmrGame(g) && g !== "mkworld12p") to.searchParams.set("game", g);
    return NextResponse.redirect(to, 303);
  }
  const fc = parseFriendCode(name);
  if (fc) {
    const found = (await playersByFriendCode(fc, isMmrGame(g) ? [g] : undefined).catch(() => []))[0];
    if (found) return NextResponse.redirect(new URL(suggestionHref(found), url), 303);
  }
  let game: MmrGame | null = isMmrGame(g) ? g : null;
  if (!game && !fc) {
    const reg = await loungeGames(name).catch(() => null);
    if (reg?.length && !reg.includes("mkworld12p")) game = reg[0];
  }
  const to = new URL(`/lounge/${encodeURIComponent(name)}`, url);
  if (game && game !== "mkworld12p") to.searchParams.set("game", game);
  return NextResponse.redirect(to, 303);
}
