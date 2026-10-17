/**
 * A streak card per daily game, side by side (Britton's pick, 2026-10-16): on
 * each game's end screen and on the public profile. Each game keeps its own
 * streak; the Weekly shows weeks played and top 10 finishes. No hooks, so the
 * profile renders it on the server and the end screens in the browser.
 */

import { IconCalendarWeek, IconFlame, IconPokeball, IconPuzzle } from "@tabler/icons-react";
import { DAILIES, type DailiesEntries, type DailiesId, type DayMark } from "@/lib/originals/dailies";

export const DAILIES_GLYPHS: Record<DailiesId, typeof IconPuzzle> = { shuffle: IconPuzzle, dex: IconPokeball, weekly: IconCalendarWeek };

const MARK_WORD: Record<Exclude<DayMark, null>, string> = { won: "won", saved: "saved on the last chance", missed: "missed" };

function Recent({ marks }: { marks: DayMark[] }) {
  const won = marks.filter((m) => m === "won").length;
  const saved = marks.filter((m) => m === "saved").length;
  const missed = marks.filter((m) => m === "missed").length;
  const label = `Last 14 days: ${won} won${saved ? `, ${saved} saved on the last chance` : ""}${missed ? `, ${missed} missed` : ""}, ${14 - won - saved - missed} not played`;
  return (
    <div className="dailies-card__recent" role="img" aria-label={label}>
      {marks.map((m, i) => <span key={i} className={`dailies-card__day dailies-card__day--${m ?? "none"}`} title={m ? MARK_WORD[m] : "not played"} />)}
    </div>
  );
}

export function DailiesCards({ entries, shown, current, heading = "Your dailies", signedIn = true }: {
  entries: DailiesEntries;
  shown: DailiesId[];
  current?: DailiesId;
  heading?: string | null;
  /** Signed out, the Weekly card says it needs an account. */
  signedIn?: boolean;
}) {
  // A game shows once it has been played (or it's the page you're on); the Weekly once there's an account.
  const ids = shown.filter((id) => id === current || (id === "weekly" ? signedIn && !!entries.weekly?.weeks?.played : !!entries[id]?.stats?.played));
  if (!ids.length) return null;
  return (
    <section className="dailies-cards" aria-label={heading ?? "Daily streaks"}>
      {heading && <h2 className="dailies-cards__title">{heading}</h2>}
      <div className="dailies-cards__grid">
        {ids.map((id) => {
          const e = entries[id];
          const g = DAILIES[id];
          const Glyph = DAILIES_GLYPHS[id];
          return (
            <div key={id} className={`dailies-card dailies--${id}${id === current ? " dailies-card--current" : ""}`}>
              <span className="dailies-card__head">
                <span className="dailies-card__tile" aria-hidden><Glyph size={18} stroke={2} /></span>
                <span className="dailies-card__name">{g.short}</span>
              </span>
              {id === "weekly" ? (
                <dl className="dailies-card__stats">
                  <div><dt>Weeks</dt><dd>{e?.weeks?.played ?? 0}</dd></div>
                  <div><dt>Top 10</dt><dd>{e?.weeks?.topTen ?? 0}</dd></div>
                  <div><dt>This week</dt><dd>{!signedIn ? "Sign in" : e?.state === "done" ? "Answered" : "Open"}</dd></div>
                </dl>
              ) : (
                <>
                  <p className="dailies-card__streak">
                    <IconFlame size={18} stroke={2} aria-hidden />
                    <strong>{e?.stats?.streak ?? 0}</strong>
                    <span>day streak</span>
                  </p>
                  <dl className="dailies-card__stats">
                    <div><dt>Best</dt><dd>{e?.stats?.best ?? 0}</dd></div>
                    <div><dt>Won</dt><dd>{e?.stats?.played ? Math.round((e.stats.won / e.stats.played) * 100) : 0}%</dd></div>
                    <div><dt>Played</dt><dd>{e?.stats?.played ?? 0}</dd></div>
                    {(e?.stats?.saved ?? 0) > 0 && <div><dt>Saves</dt><dd>{e?.stats?.saved}</dd></div>}
                  </dl>
                  {e?.recent && <Recent marks={e.recent} />}
                </>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
