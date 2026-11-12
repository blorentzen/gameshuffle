import { DOUBLE_DASH } from "@/data/double-dash/double-dash";

export { DOUBLE_DASH };

/** Label/value rows for a saved Mario Kart: Double Dash!! setup (setup cards, profile, share page). */
export function describeDoubleDashSetup(cfg: Record<string, unknown>): { label: string; value: string }[] {
  if (cfg.gameSlug !== DOUBLE_DASH.slug) return [];
  const rows: { label: string; value: string }[] = [];
  const karts = Array.isArray(cfg.karts) ? (cfg.karts as { people?: string[]; driver?: string; thrower?: string; kart?: string }[]) : [];
  const rolled = karts.filter((k) => k.driver && k.thrower);
  if (rolled.length) {
    rows.push({
      label: "Karts",
      value: rolled.map((k) => {
        const [a, b] = k.people ?? [];
        const who = b ? `${a} drives ${k.driver}, ${b} throws ${k.thrower}` : `${a ?? "Player"}: ${k.driver} and ${k.thrower}`;
        return `${who} (${k.kart ?? "a kart"})`;
      }).join("; "),
    });
  }
  if (cfg.duo) rows.push({ label: "Two to a kart", value: cfg.swap ? "Swap seats after each race" : "Same seats all night" });
  const races = cfg.races as { title?: string; engine?: string | null; courses?: string[] } | null;
  if (races?.courses?.length) rows.push({ label: races.engine ? `${races.title}, ${races.engine}` : races.title ?? "Races", value: races.courses.join(", ") });
  const battles = Array.isArray(cfg.battles) ? (cfg.battles as { course?: string; mode?: string }[]) : [];
  if (battles.length) rows.push({ label: battles.length === 1 ? "Battle" : "Battles", value: battles.map((b) => `${b.mode} on ${b.course}`).join(", ") });
  return rows;
}
