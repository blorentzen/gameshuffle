/**
 * A drawn lounge standings card for /competitive-mario-kart's look under the
 * hero (refinement round 2): made-up teams and points, labelled as an
 * illustration, at the site's normal type sizes. Server-safe.
 */

const ROWS = [
  { team: "Team Red", players: "Kaz and Mira", score: 214, color: "#e5484d" },
  { team: "Team Blue", players: "Dex and Sol", score: 198, color: "#2f66ec" },
  { team: "Team Gold", players: "Pip and Rue", score: 171, color: "#c27c0e" },
  { team: "Team Green", players: "Ash and Ivy", score: 160, color: "#2f9e44" },
];

export function LoungeStandingsArt() {
  return (
    <figure className="lounge-art">
      <div className="lounge-art__bar">
        <span>Lounge · 2v2 · Race 7 of 12</span>
        <span className="lounge-art__live"><span className="lounge-art__dot" aria-hidden />Live</span>
      </div>
      <ol className="lounge-art__rows">
        {ROWS.map((r, i) => (
          <li key={r.team} className="lounge-art__row">
            <span className="lounge-art__place">{i + 1}</span>
            <span className="lounge-art__stripe" style={{ background: r.color }} aria-hidden />
            <span className="lounge-art__team"><strong>{r.team}</strong><span>{r.players}</span></span>
            <strong className="lounge-art__score">{r.score}</strong>
          </li>
        ))}
      </ol>
      <figcaption className="lounge-art__note">Illustration of a lounge&apos;s live standings.</figcaption>
    </figure>
  );
}
