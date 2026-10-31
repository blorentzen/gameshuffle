/**
 * A division's emblem (picks 2026-10-20, medals 2026-10-30): MKCentral's division medal
 * (`medalSrc`), as the card's Medal choice (also what older cards saved as tile, crest or
 * coin show), name only, off, or the player's own picture with the medal at its corner
 * (GS Pro). MK8DX's numbered divisions add a small 1 or 2. Placement has no medal: it keeps
 * our drawn tile with a question mark, and so would any division MKCentral adds before we
 * have its medal (the drawn marks: chevrons, a star, gems, a crown).
 */

import { useId } from "react";
import { shade, type DivisionLook, type MmrFrame } from "@/lib/mmr/look";
import { medalSrc } from "@/lib/mmr/medals";
import { GLYPHS } from "./glyphs";


const paths = (list: string[]) => list.map((d, i) => <path key={i} d={d} />);

/** The division's mark in a 100 box. */
function Mark({ d, col }: { d: DivisionLook; col: string }) {
  if (d.kind === "placement") {
    return <text x="50" y="66" textAnchor="middle" fontFamily="Gabarito, Outfit, sans-serif" fontWeight={800} fontSize="46" fill={col}>?</text>;
  }
  if (d.kind === "metal") {
    if (d.mark >= 4) return <g transform="translate(30 30) scale(1.67)" fill={col}>{paths(GLYPHS.StarFilled)}</g>;
    return (
      <g fill="none" stroke={col} strokeWidth={6.5} strokeLinecap="round" strokeLinejoin="round">
        {Array.from({ length: d.mark }, (_, i) => {
          const y = 62 - i * 11 + (d.mark - 1) * 5.5;
          return <path key={i} d={`M34 ${y} L50 ${y - 10} L66 ${y}`} />;
        })}
      </g>
    );
  }
  if (d.kind === "gem") {
    return (
      <g>
        {d.mark >= 3 && <circle cx="50" cy="50" r="28" fill="none" stroke={col} strokeWidth={3.2} opacity={0.9} />}
        {d.mark >= 2
          ? <g transform="translate(28 28) scale(1.83)" fill={col}>{paths(GLYPHS.DiamondFilled)}</g>
          : <g transform="translate(26 26) scale(2)" fill="none" stroke={col} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">{paths(GLYPHS.Diamond)}</g>}
        {d.mark >= 4 && (
          <g fill={col}>
            <path d="M76 18 l2.2 5.8 5.8 2.2 -5.8 2.2 -2.2 5.8 -2.2 -5.8 -5.8 -2.2 5.8 -2.2z" />
            <path d="M23 70 l1.6 4.2 4.2 1.6 -4.2 1.6 -1.6 4.2 -1.6 -4.2 -4.2 -1.6 4.2 -1.6z" />
          </g>
        )}
      </g>
    );
  }
  return d.laurel ? (
    <g>
      <g transform="translate(17 21) scale(2.75)" fill="none" stroke={col} strokeWidth={1.15} strokeLinecap="round" strokeLinejoin="round">{paths(GLYPHS.Laurel)}</g>
      <g transform="translate(36 31) scale(1.17)" fill={col}>{paths(GLYPHS.CrownFilled)}</g>
    </g>
  ) : (
    <g transform="translate(28 27) scale(1.83)" fill={col}>{paths(GLYPHS.CrownFilled)}</g>
  );
}

/** The mark with a soft drop shade under it, scaled about the centre. */
function MarkPair({ d, k = 0.84 }: { d: DivisionLook; k?: number }) {
  return (
    <>
      <g transform={`translate(50 52.5) scale(${k}) translate(-50 -50)`} opacity={0.3}><Mark d={d} col="#0b0f2b" /></g>
      <g transform={`translate(50 50) scale(${k}) translate(-50 -50)`}><Mark d={d} col="#fff" /></g>
    </>
  );
}

function Level({ level }: { level: number | null }) {
  if (!level) return null;
  return (
    <g>
      <circle cx="80" cy="80" r="15" fill="#11162e" stroke="#fff" strokeWidth={3} />
      <text x="80" y="86.5" textAnchor="middle" fontFamily="Gabarito, Outfit, sans-serif" fontWeight={800} fontSize="19" fill="#fff">{String(level)}</text>
    </g>
  );
}

export function MmrEmblem({ d, frame, avatar }: { d: DivisionLook; frame: MmrFrame; avatar?: string | null }) {
  const raw = useId().replace(/[^a-zA-Z0-9]/g, "");
  const id = `mmr${raw}`;
  if (frame === "off") return null;
  if (frame === "name") {
    return <span className="mmr-divchip" style={{ "--mmr-dc": d.c, "--mmr-dc2": d.c2 } as React.CSSProperties}>{d.level ? `${d.base} ${d.level}` : d.base}</span>;
  }
  const medal = medalSrc(d.base);
  const grad = (
    <>
      <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor={d.c} /><stop offset=".55" stopColor={d.c2} /><stop offset="1" stopColor={shade(d.c2, -0.3)} />
      </linearGradient>
      <linearGradient id={`${id}s`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#fff" stopOpacity={0.5} /><stop offset="1" stopColor="#fff" stopOpacity={0} />
      </linearGradient>
    </>
  );
  // Our drawn tile: Placement, or a division without a medal yet.
  const tile = (
    <>
      <rect x="3" y="3" width="94" height="94" rx="24" fill={`url(#${id})`} />
      <rect x="3" y="3" width="94" height="50" rx="24" fill={`url(#${id}s)`} opacity={0.55} />
      <rect x="4.5" y="4.5" width="91" height="91" rx="22.5" fill="none" stroke="#fff" strokeOpacity={0.4} strokeWidth={3} />
      <MarkPair d={d} />
    </>
  );
  if (frame === "picture") {
    return (
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <defs>
          {grad}
          <clipPath id={`${id}c`}><circle cx="46" cy="46" r="40" /></clipPath>
          <linearGradient id={`${id}p`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#7a5cff" /><stop offset="1" stopColor="#2766ec" /></linearGradient>
        </defs>
        <circle cx="46" cy="46" r="40" fill={`url(#${id}p)`} />
        {avatar
          ? <image href={avatar} x="6" y="6" width="80" height="80" clipPath={`url(#${id}c)`} preserveAspectRatio="xMidYMid slice" />
          : <g fill="#fff" opacity={0.9}><circle cx="46" cy="38" r="13" /><path d="M22 72 a24 20 0 0 1 48 0" /></g>}
        <circle cx="46" cy="46" r="41.5" fill="none" stroke={d.c} strokeWidth={5} />
        {medal
          ? <image href={medal} x="62" y="62" width="36" height="36" />
          : (
            <g transform="translate(66 66) scale(.32)">
              <rect x="3" y="3" width="94" height="94" rx="26" fill={`url(#${id})`} stroke="#fff" strokeWidth={8} />
              <MarkPair d={d} k={0.8} />
            </g>
          )}
      </svg>
    );
  }
  // The Medal choice (saved as "tile"; older "crest" and "coin" cards are read as it too).
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      {medal ? <image href={medal} x="0" y="0" width="100" height="100" /> : <><defs>{grad}</defs>{tile}</>}
      <Level level={d.level} />
    </svg>
  );
}
