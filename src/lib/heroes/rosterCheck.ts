import "server-only";

/**
 * The monthly hero roster check: read each publisher's official hero page,
 * compare names and roles with our data (src/data/heroes/*.ts) and say
 * what's new, gone or moved role. Overwatch from Blizzard's hero gallery, Marvel Rivals from the
 * hero list on marvelrivals.com. Names only; nothing is changed here. A page
 * we can't read (or that reads as zero heroes) is reported, not ignored,
 * since that usually means the page changed shape.
 */

import { OVERWATCH } from "@/data/heroes/overwatch";
import { MARVEL_RIVALS } from "@/data/heroes/marvel-rivals";
import type { HeroGame } from "@/lib/heroes/types";

export interface OfficialHero { name: string; role: string }

export interface RosterCheck {
  game: string;
  label: string;
  source: string;
  official: number;
  ours: number;
  /** On the official page, not in our data. */
  missing: OfficialHero[];
  /** In our data (and already released), not on the official page. */
  extra: string[];
  /** On both, with a different role (a hero moved, like Sombra to Support). */
  roleChanges: { name: string; ours: string; official: string }[];
  /** Ours, with a release date still ahead (not flagged). */
  upcoming: string[];
  error?: string;
}

const UA = "Mozilla/5.0 (compatible; GameShuffleRosterCheck/1.0; +https://www.gameshuffle.co)";

/** "Soldier: 76" = "soldier 76"; "Cloak & Dagger" = "Cloak and Dagger"; "Lúcio" = "Lucio". */
export function rosterKey(name: string): string {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");
}

const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ").trim();

/** Blizzard's gallery: <a class="hero-card" data-role="tank" … href="/heroes/dmon"> … <h2 slot="heading">D.Mon</h2>. */
export function parseOverwatch(html: string): OfficialHero[] {
  const out: OfficialHero[] = [];
  const re = /<a\b[^>]*class="hero-card"[^>]*>([\s\S]*?)<\/a>/g;
  for (let m; (m = re.exec(html)); ) {
    const role = /data-role="([^"]+)"/.exec(m[0])?.[1] ?? "";
    const name = /<h2[^>]*slot="heading"[^>]*>([^<]+)<\/h2>/.exec(m[1])?.[1];
    if (name) out.push({ name: decode(name), role });
  }
  return out;
}

/** marvelrivals.com: <a … data-tag="DUELIST" data-name="Gorr the God Butcher">. */
export function parseMarvelRivals(html: string): OfficialHero[] {
  const out: OfficialHero[] = [];
  const re = /data-tag="([^"]+)"\s+data-name="([^"]+)"/g;
  for (let m; (m = re.exec(html)); ) out.push({ name: decode(m[2]), role: m[1].toLowerCase() });
  return out;
}

const SOURCES: { game: HeroGame; url: string; parse: (html: string) => OfficialHero[] }[] = [
  { game: OVERWATCH, url: "https://overwatch.blizzard.com/en-us/heroes/", parse: parseOverwatch },
  { game: MARVEL_RIVALS, url: "https://www.marvelrivals.com/", parse: parseMarvelRivals },
];

/** Same role? A hero listed under every role ("vanguard duelist strategist") matches our "all" (Deadpool). */
function sameRole(ours: string, official: string): boolean {
  if (!official) return true;
  const theirs = official.toLowerCase().split(/[\s,/]+/).filter(Boolean);
  return ours === "all" ? theirs.length > 1 : theirs.length === 1 && theirs[0] === ours.toLowerCase();
}

export function compareRoster(game: HeroGame, official: OfficialHero[], today = new Date().toISOString().slice(0, 10)): Omit<RosterCheck, "source" | "error"> {
  const seen = new Set<string>();
  const unique = official.filter((h) => { const k = rosterKey(h.name); if (seen.has(k)) return false; seen.add(k); return true; });
  const ours = new Map(game.heroes.map((h) => [rosterKey(h.name), h]));
  const missing = unique.filter((h) => !ours.has(rosterKey(h.name)));
  const upcoming = game.heroes.filter((h) => h.released && h.released > today && !seen.has(rosterKey(h.name))).map((h) => h.name);
  const extra = game.heroes.filter((h) => !seen.has(rosterKey(h.name)) && !upcoming.includes(h.name)).map((h) => h.name);
  const officialRole = new Map(unique.map((h) => [rosterKey(h.name), h.role]));
  const roleChanges = game.heroes.flatMap((h) => {
    const role = officialRole.get(rosterKey(h.name));
    return role !== undefined && !sameRole(h.role, role) ? [{ name: h.name, ours: h.role, official: role }] : [];
  });
  return { game: game.slug, label: game.label, official: unique.length, ours: game.heroes.length, missing, extra, roleChanges, upcoming };
}

export async function checkHeroRosters(): Promise<RosterCheck[]> {
  return Promise.all(SOURCES.map(async ({ game, url, parse }) => {
    const base: RosterCheck = { game: game.slug, label: game.label, source: url, official: 0, ours: game.heroes.length, missing: [], extra: [], roleChanges: [], upcoming: [] };
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html" }, signal: AbortSignal.timeout(15_000), cache: "no-store" });
      if (!res.ok) return { ...base, error: `The page answered ${res.status}` };
      const heroes = parse(await res.text());
      if (heroes.length < 10) return { ...base, error: `Found only ${heroes.length} heroes on the page, so its layout has probably changed` };
      return { ...base, ...compareRoster(game, heroes) };
    } catch (e) {
      return { ...base, error: e instanceof Error ? e.message : "Couldn't fetch the page" };
    }
  }));
}

/** True when a check needs someone to look (a change or an unreadable page). */
export const needsAttention = (c: RosterCheck) => !!c.error || c.missing.length > 0 || c.extra.length > 0 || c.roleChanges.length > 0;

/** Plain-text summary for the email and notification. */
export function rosterSummary(checks: RosterCheck[]): string {
  return checks.map((c) => {
    if (c.error) return `${c.label}: couldn't check (${c.error}). Source: ${c.source}`;
    const lines = [`${c.label}: ${c.official} heroes on the official page, ${c.ours} in GameShuffle.`];
    if (c.missing.length) lines.push(`  New on the official page: ${c.missing.map((h) => `${h.name} (${h.role})`).join(", ")}`);
    if (c.extra.length) lines.push(`  Not on the official page any more: ${c.extra.join(", ")}`);
    if (c.roleChanges.length) lines.push(`  Role changed: ${c.roleChanges.map((r) => `${r.name} (${r.ours} → ${r.official})`).join(", ")}`);
    if (!c.missing.length && !c.extra.length && !c.roleChanges.length) lines.push("  Matches.");
    return lines.join("\n");
  }).join("\n\n");
}
