/**
 * A game's box art (3:4), or for a game we don't have art for yet (an "Other"
 * favorite) a lettered tile in a colour picked from its name, so a shelf of
 * covers never shows a hole. Sized by the caller's box. Server or client.
 */

import { boxArt, catalogGame } from "@/data/game-catalog";

const TILE_COLORS = ["#4b3fb5", "#b5463f", "#2f7d5b", "#a3651d", "#2a6f9e", "#8a3f9e", "#3f6b2a", "#9e2a5a"];

function initials(name: string): string {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, " ").split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? "?").slice(0, 2)).toUpperCase();
}

export function GameCover({ name, className }: { name: string; className?: string }) {
  const art = boxArt(catalogGame(name));
  if (art) {
    // eslint-disable-next-line @next/next/no-img-element -- local 300x400 webp, sized by the caller
    return <img src={art} alt="" className={`game-cover${className ? ` ${className}` : ""}`} width={300} height={400} loading="lazy" />;
  }
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span className={`game-cover game-cover--blank${className ? ` ${className}` : ""}`} style={{ background: TILE_COLORS[h % TILE_COLORS.length] }} aria-hidden>
      {initials(name)}
    </span>
  );
}
