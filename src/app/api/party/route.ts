import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createNight, PartyError, type NewSeat } from "@/lib/party/nights";

export const runtime = "nodejs";

/**
 * POST /api/party — start a live party night. Hosting needs a free account.
 * Body: { gameSlug, config, visibility, seats: [{ name, isCpu, character }], hostSeat, lineup? }
 * `lineup` is the games after the first, in order, for a multi-game night.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "signed_out" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as {
    gameSlug?: string; config?: Record<string, unknown>; visibility?: string; seats?: NewSeat[]; hostSeat?: number | null; lineup?: unknown;
  };
  const seats = Array.isArray(b.seats) ? b.seats.slice(0, 8).map((s) => ({
    name: String(s?.name ?? ""), isCpu: !!s?.isCpu, character: s?.character ? String(s.character).slice(0, 40) : null,
  })) : [];
  // Only the parts of the randomizer state the night needs; hands are dealt live.
  const c = b.config ?? {};
  const config = {
    edition: c.edition ?? null, setup: c.setup ?? null, plan: c.plan ?? [], moments: c.moments ?? [], teams: c.teams ?? null,
    // A named night format (The Gauntlet: a multi-game decathlon with a crowned champion).
    format: c.format === "gauntlet" || c.format === "chaoscup" ? c.format : null,
  };
  try {
    const night = await createNight({
      hostId: user.id, gameSlug: String(b.gameSlug ?? ""), config, visibility: b.visibility === "open" ? "open" : "secret",
      seats, hostSeat: typeof b.hostSeat === "number" ? b.hostSeat : null,
      lineup: Array.isArray(b.lineup) ? b.lineup.map(String) : [],
    });
    return NextResponse.json({ ok: true, ...night });
  } catch (e) {
    const err = e instanceof PartyError ? e : new PartyError("server_error", 500);
    return NextResponse.json({ error: err.code }, { status: err.status });
  }
}
