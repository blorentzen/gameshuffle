import "server-only";

/**
 * Minimal, targeted parser for BGG XML API2 responses. BGG returns a stable,
 * well-formed, controlled schema (not arbitrary user XML), and we only need a
 * handful of fields, so we extract them directly rather than pull in an XML
 * dependency. If BGG ever changes shape, this is the one file to update.
 *
 * Shapes:
 *   /search → <items><item type="boardgame" id="13">
 *               <name type="primary" value="Catan"/>
 *               <yearpublished value="1995"/></item>…</items>
 *   /thing  → <items><item id="13">
 *               <thumbnail>URL</thumbnail><image>URL</image>
 *               <name type="primary" value="Catan"/>
 *               <yearpublished value="1995"/>
 *               <minplayers value="3"/><maxplayers value="4"/>
 *               <playingtime value="120"/><minplaytime .../><maxplaytime .../>
 *               <statistics><ratings><averageweight value="2.3"/>…</statistics>
 *             </item>…</items>
 */

export interface BggSearchHit {
  id: number;
  name: string;
  year: number | null;
}

export interface BggGame {
  id: number;
  name: string;
  year: number | null;
  thumbnailUrl: string | null;
  imageUrl: string | null;
  minPlayers: number | null;
  maxPlayers: number | null;
  playingTime: number | null;
  minPlaytime: number | null;
  maxPlaytime: number | null;
  weight: number | null;
}

function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#0?39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function num(v: string | null): number | null {
  if (v == null) return null;
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

/** `<tag ... value="X"/>` → X (first match in the block). */
function attrVal(block: string, tag: string): string | null {
  const m = block.match(new RegExp(`<${tag}\\b[^>]*\\bvalue="([^"]*)"`));
  return m ? decode(m[1]) : null;
}

/** `<tag>X</tag>` element text. */
function elemText(block: string, tag: string): string | null {
  const m = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return m ? decode(m[1].trim()) : null;
}

/** Prefer the primary name; fall back to the first name value. */
function primaryName(block: string): string | null {
  const primary = block.match(/<name\b[^>]*\btype="primary"[^>]*\bvalue="([^"]*)"/);
  if (primary) return decode(primary[1]);
  const any = block.match(/<name\b[^>]*\bvalue="([^"]*)"/);
  return any ? decode(any[1]) : null;
}

/** Split `<items>` into individual `<item id="…">…</item>` blocks. Items don't
 *  nest in BGG responses, so a non-greedy match is safe. */
function* itemBlocks(xml: string): Generator<{ id: number; block: string }> {
  const re = /<item\b[^>]*\bid="(\d+)"[^>]*>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    yield { id: Number.parseInt(m[1], 10), block: m[2] };
  }
}

export function parseBggSearch(xml: string): BggSearchHit[] {
  const hits: BggSearchHit[] = [];
  for (const { id, block } of itemBlocks(xml)) {
    const name = primaryName(block);
    if (!name) continue;
    hits.push({ id, name, year: num(attrVal(block, "yearpublished")) });
  }
  return hits;
}

export function parseBggThings(xml: string): BggGame[] {
  const games: BggGame[] = [];
  for (const { id, block } of itemBlocks(xml)) {
    const name = primaryName(block);
    if (!name) continue;
    games.push({
      id,
      name,
      year: num(attrVal(block, "yearpublished")),
      thumbnailUrl: elemText(block, "thumbnail"),
      imageUrl: elemText(block, "image"),
      minPlayers: num(attrVal(block, "minplayers")),
      maxPlayers: num(attrVal(block, "maxplayers")),
      playingTime: num(attrVal(block, "playingtime")),
      minPlaytime: num(attrVal(block, "minplaytime")),
      maxPlaytime: num(attrVal(block, "maxplaytime")),
      weight: num(attrVal(block, "averageweight")),
    });
  }
  return games;
}
