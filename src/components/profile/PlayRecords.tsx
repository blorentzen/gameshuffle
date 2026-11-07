/**
 * The player card's Plays (game spaces picks 2026-11-05, 6A, step 4): one record per game, built by playRecords in
 * src/lib/profile/playRecords.ts. A record is the game's cover, its name, this person's facts in it (each linking to
 * the details) and, once the game's space is open, a link to it. Their MMR card lives in the side column's Rank block.
 * Games with nothing to show yet sit underneath as covers.
 */

import Link from "next/link";
import { IconCalendarStats } from "@tabler/icons-react";
import { GameCover } from "@/components/games/GameCover";
import { IconTile } from "@/components/ui/IconTile";
import { ArrowLink } from "@/components/ui/ArrowLink";
import { MedalCredit } from "@/components/mmr/MedalCredit";
import type { PlayRecord } from "@/lib/profile/playRecords";

export function PlayRecords({ records, also, creditMedal = false, title = "Plays" }: {
  records: PlayRecord[];
  also: string[];
  /** A record shows MKCentral's division medal: credit it here. */
  creditMedal?: boolean;
  title?: string;
}) {
  if (!records.length && !also.length) return null;
  return (
    <section className="pf-plays2" aria-labelledby="pf-plays-title">
      <h2 id="pf-plays-title" className="pf-section-title">{title}</h2>
      {records.length > 0 && (
        <ul className="pf-rec-list">
          {records.map((r) => (
            <li key={r.key} className="pf-rec">
              <span className="pf-rec__cover" aria-hidden="true">
                {r.cover.kind === "game" ? <GameCover name={r.cover.name} className="pf-rec__art" />
                  : r.cover.kind === "image" ? (
                    // eslint-disable-next-line @next/next/no-img-element -- our box art
                    <img src={r.cover.src} alt="" className="pf-rec__art" />
                  ) : <IconTile icon={IconCalendarStats} tone="violet" />}
              </span>
              <div className="pf-rec__body">
                <h3 className="pf-rec__name">{r.name}</h3>
                <ul className="pf-rec__facts">
                  {r.facts.map((f) => (
                    <li key={f.text}>
                      {f.medal && (
                        // eslint-disable-next-line @next/next/no-img-element -- MKCentral's division medal (credited on the lounge pages)
                        <img src={f.medal} alt="" className="pf-rec__medal" />
                      )}
                      {f.href ? <Link href={f.href}>{f.text}</Link> : f.text}
                    </li>
                  ))}
                </ul>
                {r.space && <ArrowLink href={r.space.href} className="pf-rec__space">{r.space.label}</ArrowLink>}
              </div>
            </li>
          ))}
        </ul>
      )}
      {also.length > 0 && (
        <div className="pf-also">
          <h3 className="pf-also__title">{records.length ? "Also plays" : "Games"}</h3>
          <ol className="pf-plays__grid">
            {also.map((g) => (
              <li key={g} title={g}>
                <GameCover name={g} className="pf-plays__cover" />
                <span className="pf-plays__name">{g}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
      {creditMedal && <MedalCredit className="pf-rec__credit" />}
    </section>
  );
}
