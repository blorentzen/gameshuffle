"use client";

/**
 * "Start from a ready-made card" above the studio (studio round 2, 2026-10-30, picks
 * https://claude.ai/artifact/LhQzo8t9w4LNPRkbHodt1s): six CDS cards, each a picture of the layout with
 * its title and one line. Picking one sets the layout and what's on the card (starts.ts); colors,
 * background, emblem and font stay. The pictures are made-up cards (public/images/mmr/starts, rendered
 * from the studio's demo night by scripts/.tmp/rec/mmr-starts.cjs). Phones scroll the row sideways.
 */

import { Card } from "@empac/cascadeds";
import { STARTS, startOf, type MmrStartId } from "@/lib/mmr/starts";
import type { MmrLook } from "@/lib/mmr/look";

export function MmrStarts({ look, onPick }: { look: MmrLook; onPick: (id: MmrStartId) => void }) {
  const at = startOf(look);
  return (
    <section className="mmr-starts" aria-labelledby="mmr-starts">
      <h2 id="mmr-starts">Start from a ready-made card</h2>
      <div className="mmr-starts__row" role="group" aria-label="Ready-made cards">
        {STARTS.map((s) => (
          <Card key={s.id} variant="outlined" padding="small" interactive selected={at === s.id} onClick={() => onPick(s.id)} className="mmr-start">
            <span className="mmr-start__pic" aria-hidden="true">
              {/* eslint-disable-next-line @next/next/no-img-element -- small same-origin pictures */}
              <img src={`/images/mmr/starts/${s.id}.webp`} alt="" loading="lazy" />
            </span>
            <span className="mmr-start__name">{s.label}</span>
            <span className="mmr-start__note">{s.note}</span>
          </Card>
        ))}
      </div>
      <p className="mmr-studio__note">Sets the layout and what&apos;s on it. Your colors, background, emblem and font stay as they are.</p>
    </section>
  );
}
