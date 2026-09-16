import type { GeneratedRound, LivePointer } from "@/lib/tournaments/randomizer";
import { getImagePath } from "@/lib/images";

/**
 * Live "Now racing" board for randomized rounds — the current round/race the
 * organizer has advanced to, with its track + combo + items. Resolves the
 * pointer inline (type-only import) so the game-data JSON never ships to the
 * public bundle. Updates live via the tournament page's realtime sub.
 */
export function RandomizerNowRacing({ rounds, live }: { rounds: GeneratedRound[]; live: LivePointer | null }) {
  if (!live) return null;
  const round = rounds.find((r) => r.n === live.round && r.revealed);
  if (!round) return null;
  const total = Math.max(1, round.directive.tracks?.length ?? 1);
  const i = Math.max(0, Math.min(live.race - 1, total - 1));
  const track = round.directive.tracks?.[i] ?? null;
  const combo = round.directive.raceCombos?.[i] ?? round.directive.combo ?? null;
  const items = round.directive.items ?? null;

  const parts = combo
    ? [combo.character, combo.vehicle, combo.wheels, combo.glider].filter((p) => p && p.name && p.name !== "N/A")
    : [];

  return (
    <div className="tournament-nowracing" style={{ alignItems: "flex-start", flexWrap: "wrap" }}>
      {track?.course?.img ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={getImagePath(track.course.img)} alt="" className="tournament-nowracing__img" />
      ) : null}
      <div className="tournament-nowracing__body" style={{ flex: "1 1 12rem" }}>
        <span className="tournament-nowracing__eyebrow">🏁 Now racing · Round {round.n}{total > 1 ? ` · Race ${i + 1} of ${total}` : ""}</span>
        <span className="tournament-nowracing__name">{track ? track.course.name : `Round ${round.n}`}</span>
        {parts.length > 0 && (
          <div className="tr-round__combo" style={{ marginTop: "0.5rem" }}>
            {parts.map((p, idx) => (
              <div key={idx} className="tr-round__part" style={{ width: 64 }}>
                {p.img ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={getImagePath(p.img)} alt="" className="tr-round__part-img" style={{ width: 42, height: 42 }} />
                ) : <span className="tr-round__part-img tr-round__part-img--blank" style={{ width: 42, height: 42 }} />}
                <span className="tr-round__part-name" style={{ fontSize: 11 }}>{p.name}</span>
              </div>
            ))}
          </div>
        )}
        {items && items.length > 0 && (
          <div className="tr-round__items-chips" style={{ marginTop: "0.5rem" }}>
            {items.map((name) => <span key={name} className="config-tag">{name}</span>)}
          </div>
        )}
      </div>
      <span className="tournament-nowracing__live">● LIVE</span>
    </div>
  );
}
