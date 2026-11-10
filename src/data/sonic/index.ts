import { CROSSWORLDS_GAME } from "@/data/sonic/crossworlds";

export { CROSSWORLDS_GAME };

/** Label/value rows for a saved Sonic Racing: CrossWorlds setup (setup cards, profile, share page). */
export function describeSonicSetup(cfg: Record<string, unknown>): { label: string; value: string }[] {
  if (cfg.gameSlug !== CROSSWORLDS_GAME.slug) return [];
  const rows: { label: string; value: string }[] = [];
  const players = Array.isArray(cfg.players) ? (cfg.players as { name?: string; racer?: string; machine?: string; gadgets?: string[]; superSlot?: string | null }[]) : [];
  if (players.some((p) => p.racer)) {
    rows.push({ label: "Racers", value: players.map((p) => `${p.name ?? "Player"}${p.racer ? ` (${p.racer} on ${p.machine ? `the ${p.machine}` : "a machine"})` : ""}`).join(", ") });
  }
  const first = players.find((p) => p.gadgets?.length);
  if (first) rows.push({ label: `${first.name ?? "Player"}'s gadgets`, value: [...(first.gadgets ?? []), ...(first.superSlot ? [`${first.superSlot} (Super Slot)`] : [])].join(", ") });
  const races = Array.isArray(cfg.races) ? (cfg.races as { track?: string; crossWorld?: string | null }[]) : [];
  if (races.length) rows.push({ label: races.length === 1 ? "Race" : "Races", value: races.map((r) => (r.crossWorld ? `${r.track} (${r.crossWorld})` : r.track)).join(", ") });
  if (typeof cfg.grandPrix === "string" && cfg.grandPrix) rows.push({ label: "Grand Prix", value: cfg.grandPrix });
  return rows;
}
