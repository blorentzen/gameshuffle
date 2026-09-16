import type { GeneratedRound, RoundDirective } from "@/lib/tournaments/randomizer";
import { getImagePath } from "@/lib/images";

/**
 * Read-only display of a tournament's randomized rounds (the shared directive
 * everyone runs each round: tracks, combo, items). Presentational — used on the
 * public tournament page (live-updates via the page's realtime sub) and in the
 * organizer's manage card. Reuses the tournament-schedule + combo visuals.
 */

function ComboView({ directive }: { directive: RoundDirective }) {
  const c = directive.combo;
  if (!c) return null;
  const parts = [
    { label: "Character", part: c.character },
    { label: "Vehicle", part: c.vehicle },
    { label: "Wheels", part: c.wheels },
    { label: "Glider", part: c.glider },
  ].filter((p) => p.part && p.part.name && p.part.name !== "N/A");
  return (
    <div className="tr-round__combo">
      {parts.map((p) => (
        <div key={p.label} className="tr-round__part">
          {p.part.img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={getImagePath(p.part.img)} alt="" className="tr-round__part-img" />
          ) : (
            <span className="tr-round__part-img tr-round__part-img--blank" />
          )}
          <span className="tr-round__part-label">{p.label}</span>
          <span className="tr-round__part-name">{p.part.name}</span>
        </div>
      ))}
    </div>
  );
}

export function RoundDirectiveView({ directive }: { directive: RoundDirective }) {
  // Per-race combos → show each race with its own combo, side by side.
  const perRace = directive.raceCombos && directive.raceCombos.length > 0;
  return (
    <>
      {directive.tracks && directive.tracks.length > 0 && !perRace && (
        <div className="tournament-schedule" style={{ marginBottom: "0.75rem" }}>
          {directive.tracks.map((t, i) => (
            <div key={i} className="tournament-schedule__item">
              <span className="tournament-schedule__num">{i + 1}</span>
              {t.course.img ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={getImagePath(t.course.img)} alt="" className="tournament-schedule__img" />
              ) : null}
              <span className="tournament-schedule__name">{t.course.name}</span>
            </div>
          ))}
        </div>
      )}
      {perRace && directive.tracks && (
        <div className="tr-round__perrace">
          {directive.tracks.map((t, i) => {
            const c = directive.raceCombos![i];
            const parts = c ? [c.character, c.vehicle, c.wheels, c.glider].filter((p) => p && p.name && p.name !== "N/A") : [];
            return (
              <div key={i} className="tr-round__race">
                <div className="tr-round__race-track">
                  <span className="tournament-schedule__num">{i + 1}</span>
                  {t.course.img ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={getImagePath(t.course.img)} alt="" className="tournament-schedule__img" />
                  ) : null}
                  <span className="tournament-schedule__name">{t.course.name}</span>
                </div>
                {parts.length > 0 && (
                  <div className="tr-round__combo">
                    {parts.map((p, idx) => (
                      <div key={idx} className="tr-round__part" style={{ width: 60 }}>
                        {p.img ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={getImagePath(p.img)} alt="" className="tr-round__part-img" style={{ width: 40, height: 40 }} />
                        ) : <span className="tr-round__part-img tr-round__part-img--blank" style={{ width: 40, height: 40 }} />}
                        <span className="tr-round__part-name" style={{ fontSize: 11 }}>{p.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {directive.playerCombos && directive.playerCombos.length > 0 && (
        <div className="tr-round__players">
          {directive.playerCombos.map((pc) => {
            const parts = [pc.combo.character, pc.combo.vehicle, pc.combo.wheels, pc.combo.glider].filter((p) => p && p.name && p.name !== "N/A");
            return (
              <div key={pc.id} className="tr-round__player">
                <span className="tr-round__player-name">{pc.name}</span>
                <div className="tr-round__combo">
                  {parts.map((p, idx) => (
                    <div key={idx} className="tr-round__part" style={{ width: 56 }}>
                      {p.img ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={getImagePath(p.img)} alt="" className="tr-round__part-img" style={{ width: 38, height: 38 }} />
                      ) : <span className="tr-round__part-img tr-round__part-img--blank" style={{ width: 38, height: 38 }} />}
                      <span className="tr-round__part-name" style={{ fontSize: 10 }}>{p.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {!perRace && !directive.playerCombos && <ComboView directive={directive} />}
      {directive.items && directive.items.length > 0 && (
        <div className="tr-round__items">
          <span className="tr-round__items-label">Items</span>
          <div className="tr-round__items-chips">
            {directive.items.map((name) => <span key={name} className="config-tag">{name}</span>)}
          </div>
        </div>
      )}
    </>
  );
}

export function TournamentRounds({ rounds, title = "Randomized rounds" }: { rounds: GeneratedRound[]; title?: string }) {
  const revealed = rounds.filter((r) => r.revealed);
  const pending = rounds.length - revealed.length;
  if (revealed.length === 0) return null;
  return (
    <div className="comp-card" style={{ marginBottom: "2rem" }}>
      <h2 style={{ fontSize: "1.2rem", marginBottom: "1.4rem" }}>{title}</h2>
      <div className="tr-rounds">
        {revealed.map((r) => (
          <div key={r.n} className="tr-round">
            <div className="tr-round__head">
              Round {r.n}
              {r.rerolls ? <span className="tr-round__rerolls">rerolled {r.rerolls}×</span> : null}
            </div>
            <RoundDirectiveView directive={r.directive} />
          </div>
        ))}
      </div>
      {pending > 0 && (
        <p style={{ marginTop: "1rem", fontSize: "13px", color: "var(--text-tertiary)" }}>
          {pending} more round{pending === 1 ? "" : "s"} to be revealed.
        </p>
      )}
    </div>
  );
}
