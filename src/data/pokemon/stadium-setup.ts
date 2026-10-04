import { STADIUM_GAMES } from "@/lib/pokemon/stadium";

/** Label/value rows for a saved Pokémon Stadium setup (setup cards, profile, share page). */
export function describeStadiumSetup(cfg: Record<string, unknown>): { label: string; value: string }[] {
  const game = STADIUM_GAMES.find((g) => g.slug === cfg.gameSlug);
  if (!game) return [];
  const cup = game.cups.find((c) => c.id === cfg.cup);
  const rows: { label: string; value: string }[] = [{ label: "Cup", value: `${game.label}: ${cup?.name ?? "Rental cup"}` }];
  const players = Array.isArray(cfg.players) ? (cfg.players as { name?: string; team?: string[]; pick?: number[] }[]) : [];
  for (const p of players) {
    if (!p.team?.length) continue;
    const picks = new Set(p.pick ?? []);
    rows.push({ label: p.name || "Player", value: p.team.map((n, i) => (picks.has(i) ? `${n} (pick)` : n)).join(", ") });
  }
  return rows;
}
