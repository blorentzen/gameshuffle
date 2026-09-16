/**
 * Tournament randomizer — organizer config + round generation/reveal.
 *   PUT  { config }                    → save settings.randomizer (organizer only)
 *   POST { action, n? }                → mutate settings.rounds
 *        action: "generate_all" | "reveal_next" | "reroll" | "clear"
 *
 * Rounds live in tournaments.settings.rounds (jsonb); the public page reads
 * settings + subscribes to tournaments realtime, so reveals push live with no
 * extra plumbing. See specs/gs-tournament-randomizers.md.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { getTournamentRole } from "@/lib/tournaments/access-server";
import { canManageTournament } from "@/lib/tournaments/access";
import { tournamentHasFeature } from "@/lib/tournaments/circuit-resolve";
import {
  generateRounds,
  generateRoundDirective,
  restrictionsFromSettings,
  advanceLive,
  DEFAULT_RANDOMIZER_CONFIG,
  type TournamentRandomizerConfig,
  type GeneratedRound,
  type RandomizerCadence,
  type LivePointer,
} from "@/lib/tournaments/randomizer";

export const runtime = "nodejs";

const CADENCES: RandomizerCadence[] = ["pre_all", "reveal_live", "per_race"];

function sanitizeConfig(input: unknown): TournamentRandomizerConfig {
  const c = (input ?? {}) as Record<string, unknown>;
  const d = (c.dimensions ?? {}) as Record<string, unknown>;
  const num = (v: unknown, def: number, min: number, max: number) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : def;
  };
  const tracks = d.tracks
    ? {
        count: num((d.tracks as Record<string, unknown>).count, 4, 1, 32),
        noDups: (d.tracks as Record<string, unknown>).noDups !== false,
        tourOnly: (d.tracks as Record<string, unknown>).tourOnly === true,
      }
    : undefined;
  const items = d.items ? { count: num((d.items as Record<string, unknown>).count, 5, 1, 40) } : undefined;
  return {
    enabled: c.enabled === true,
    dimensions: {
      ...(tracks ? { tracks } : {}),
      ...(d.combo ? { combo: true, ...(d.comboPerPlayer ? { comboPerPlayer: true } : {}) } : {}),
      ...(items ? { items } : {}),
    },
    cadence: CADENCES.includes(c.cadence as RandomizerCadence) ? (c.cadence as RandomizerCadence) : "reveal_live",
    rounds: num(c.rounds, DEFAULT_RANDOMIZER_CONFIG.rounds, 1, 64),
  };
}

async function gate(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "unauthenticated" as const, status: 401 };
  const admin = createServiceClient();
  const role = await getTournamentRole(admin, id, user.id);
  if (!canManageTournament(role)) return { error: "forbidden" as const, status: 403 };
  const { data: t } = await admin.from("tournaments").select("id, organizer_id, game_slug, created_at, settings").eq("id", id).maybeSingle();
  if (!t) return { error: "not_found" as const, status: 404 };
  const row = t as { id: string; organizer_id: string; game_slug: string; created_at: string; settings: Record<string, unknown> | null };
  return { admin, slug: row.game_slug, settings: (row.settings ?? {}) as Record<string, unknown>, tournament: { id: row.id, organizer_id: row.organizer_id, game_slug: row.game_slug, created_at: row.created_at } };
}

async function saveSettings(admin: ReturnType<typeof createServiceClient>, id: string, settings: Record<string, unknown>) {
  const { error } = await admin.from("tournaments").update({ settings }).eq("id", id);
  return !error;
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await gate(id);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });

  const body = (await req.json().catch(() => ({}))) as { config?: unknown };
  const config = sanitizeConfig(body.config);
  const settings = { ...g.settings, randomizer: config };
  // Disabling clears generated rounds + the live pointer so nothing lingers.
  if (!config.enabled) { delete (settings as Record<string, unknown>).rounds; delete (settings as Record<string, unknown>).randomizerLive; }
  if (!(await saveSettings(g.admin, id, settings))) return NextResponse.json({ error: "save_failed" }, { status: 500 });
  return NextResponse.json({ ok: true, config });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await gate(id);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });

  const config = sanitizeConfig(g.settings.randomizer);
  if (!config.enabled) return NextResponse.json({ error: "randomizer_disabled" }, { status: 400 });
  const restrictions = restrictionsFromSettings(g.settings);
  // Participants (for per-player combos). Confirmed/checked-in only.
  let players: { id: string; name: string }[] = [];
  if (config.dimensions.comboPerPlayer) {
    const { data: parts } = await g.admin
      .from("tournament_participants")
      .select("id, display_name, status")
      .eq("tournament_id", id)
      .in("status", ["confirmed", "checked_in"]);
    players = (parts ?? []).map((p) => ({ id: (p as { id: string }).id, name: (p as { display_name: string }).display_name || "Player" }));
  }
  const body = (await req.json().catch(() => ({}))) as { action?: string; n?: number };
  let rounds = (Array.isArray(g.settings.rounds) ? g.settings.rounds : []) as GeneratedRound[];
  let live = (g.settings.randomizerLive ?? null) as LivePointer | null;
  const perRace = config.cadence === "per_race";
  // The live "Now racing" pointer is real-time + viewer-facing → Circuit-gated.
  const liveActions = new Set(["reveal_next", "start_live", "advance", "reset_live"]);
  if (liveActions.has(body.action ?? "") && !(await tournamentHasFeature(g.admin, g.tournament, "randomizer"))) {
    return NextResponse.json({ error: "circuit_required" }, { status: 402 });
  }

  switch (body.action) {
    case "generate_all":
      rounds = generateRounds(g.slug, config, restrictions, players);
      break;
    case "reveal_next": {
      const next = rounds.find((r) => !r.revealed);
      if (next) {
        const empty = !next.directive || Object.keys(next.directive).length === 0;
        if (empty) next.directive = generateRoundDirective(g.slug, config.dimensions, restrictions, perRace, players);
        next.revealed = true;
      } else if (rounds.length < config.rounds) {
        rounds = [...rounds, { n: rounds.length + 1, revealed: true, directive: generateRoundDirective(g.slug, config.dimensions, restrictions, perRace, players) }];
      } else {
        return NextResponse.json({ ok: true, rounds, live }); // nothing left to reveal
      }
      break;
    }
    case "reroll": {
      const target = rounds.find((r) => r.n === body.n);
      if (!target) return NextResponse.json({ error: "round_not_found" }, { status: 404 });
      if (target.revealed) return NextResponse.json({ error: "already_revealed" }, { status: 409 });
      target.directive = generateRoundDirective(g.slug, config.dimensions, restrictions, perRace, players);
      target.rerolls = (target.rerolls ?? 0) + 1;
      break;
    }
    case "clear":
      rounds = [];
      live = null;
      break;
    case "start_live":
      live = advanceLive(rounds, null); // first revealed round, race 1
      break;
    case "advance":
      live = advanceLive(rounds, live) ?? live; // stay put at the end
      break;
    case "reset_live":
      live = null;
      break;
    default:
      return NextResponse.json({ error: "bad_action" }, { status: 400 });
  }

  const settings = { ...g.settings, rounds } as Record<string, unknown>;
  if (live) settings.randomizerLive = live; else delete settings.randomizerLive;
  if (!(await saveSettings(g.admin, id, settings))) return NextResponse.json({ error: "save_failed" }, { status: 500 });
  return NextResponse.json({ ok: true, rounds, live });
}
