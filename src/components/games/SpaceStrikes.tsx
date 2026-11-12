import { smashTourneyGame } from "@/lib/smash/tournament";

/**
 * A Smash space's tournament stages (Melee space picks 2026-11-11): the starters game 1 is struck from, the
 * counterpicks, and that each event sets its own list (the header's Run a bracket starts one). Server-rendered from
 * the game's data, so it says what a new tournament starts with.
 */
export function SpaceStrikes({ game }: { game: string }) {
  const g = smashTourneyGame(game);
  const starters = g.stages.filter((s) => s.status === "starter");
  const counter = g.stages.filter((s) => s.status === "counterpick").map((s) => s.name);
  return (
    <section className="room-tile" aria-labelledby="sp-strikes">
      <div className="room-tile__head"><h2 id="sp-strikes">Tournament stages</h2></div>
      <p className="room-tile__note">Stage strikes, game 1:</p>
      <ul className="space-strikes" aria-label="Starter stages">
        {starters.map((s) => (
          <li key={s.id}>
            {/* eslint-disable-next-line @next/next/no-img-element -- the stage's in-game view (credited on the randomizer) */}
            {g.artReady && <img src={`${g.assetBase}${s.img}`} alt="" loading="lazy" />}
            <span>{s.name}</span>
          </li>
        ))}
      </ul>
      <p className="room-tile__note">
        {counter.length === 1 ? `Counterpick: ${counter[0]}.` : counter.length ? `Counterpicks: ${counter.join(", ")}.` : ""} The organizer sets the stage list for the event.
      </p>
    </section>
  );
}
