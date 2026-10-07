/**
 * A drawing of GameShuffle posts in a Discord channel, for the /discord page.
 *
 * An illustration, not UI: it copies Discord's dark message layout (so it stays
 * dark in both site themes) and shows made-up players. The squares are CSS
 * cells instead of emoji so they look the same on every system. Mirrors the
 * real posts in src/lib/activity/channelCard.ts (the day's card and the
 * morning summary); keep the wording in step if those change.
 */

const SQUARE = { g: "match", y: "close", x: "miss" } as const;

function Squares({ rows }: { rows: string[] }) {
  return (
    <span className="dmock__squares" aria-hidden>
      {rows.map((row, r) => (
        <span key={r} className="dmock__row" style={{ "--r": r } as React.CSSProperties}>
          {[...row].map((c, i) => <span key={i} className={`dmock__sq dmock__sq--${SQUARE[c as keyof typeof SQUARE]}`} />)}
        </span>
      ))}
    </span>
  );
}

function BotHead({ time }: { time: string }) {
  return (
    <div className="dmock__meta">
      <b>GameShuffle</b>
      <span className="dmock__app">APP</span>
      <span className="dmock__time">{time}</span>
    </div>
  );
}

const PLAYERS = [
  { name: "Sam", score: "3/6", rows: ["xgxxx", "xgyxx", "ggggg"], said: "solved in 3" },
  { name: "Riley", score: "4/6", rows: ["xxxxx", "xxyxg", "ggxyg", "ggggg"], said: "solved in 4" },
  { name: "Jordan", score: "playing", rows: ["xgxxx", "xxyxx"], said: "still playing" },
];

export function DiscordMock({ variant }: { variant: "card" | "summary" }) {
  const label = variant === "card"
    ? `Example Discord channel: Riley used /gs-daily, then the GameShuffle bot posted today's results card. ${PLAYERS.map((p) => `${p.name} ${p.said}`).join(", ")}. Squares only, no answer.`
    : "Example Discord message: the GameShuffle bot's morning summary. Sam solved yesterday's Daily in 3, Riley in 4, Jordan in 5, Alex ran out of guesses, and the channel has solved it 6 days running.";
  return (
    <figure className="dmock" role="img" aria-label={label}>
      <div className="dmock__bar" aria-hidden>
        <span className="dmock__hash">#</span> game-night
      </div>
      <div className="dmock__body" aria-hidden>
        {variant === "card" ? (
          <>
            <div className="dmock__msg">
              <span className="dmock__av dmock__av--riley">R</span>
              <div className="dmock__content">
                <div className="dmock__meta"><b>Riley</b><span className="dmock__time">Today at 9:38 AM</span></div>
                <p className="dmock__used">used <span className="dmock__cmd">/gs-daily</span></p>
                <div className="dmock__activity">
                  {/* eslint-disable-next-line @next/next/no-img-element -- decorative avatar in an illustration */}
                  <img src="/images/fg/logos/gs-monogram.png" alt="" width={36} height={36} />
                  <span className="dmock__activity-text"><b>The Daily Shuffle</b><span>3 playing in GameShuffle</span></span>
                  <span className="dmock__btn dmock__btn--go">Join</span>
                </div>
              </div>
            </div>
            <div className="dmock__msg">
              {/* eslint-disable-next-line @next/next/no-img-element -- decorative avatar in an illustration */}
              <img className="dmock__av" src="/images/fg/logos/gs-monogram.png" alt="" width={40} height={40} />
              <div className="dmock__content">
                <BotHead time="Today at 9:41 AM" />
                <div className="dmock__embed">
                  <p className="dmock__title">The Daily #9 · Mario Party</p>
                  <p className="dmock__desc">3 players here today. Squares only, no spoilers.</p>
                  <div className="dmock__fields">
                    {PLAYERS.map((p) => (
                      <div key={p.name} className="dmock__field">
                        <b>{p.name} · {p.score}</b>
                        <Squares rows={p.rows} />
                      </div>
                    ))}
                  </div>
                  <p className="dmock__foot">The Daily Shuffle on GameShuffle</p>
                </div>
                <span className="dmock__btn dmock__btn--go">Play the Daily</span>
              </div>
            </div>
          </>
        ) : (
          <div className="dmock__msg">
            {/* eslint-disable-next-line @next/next/no-img-element -- decorative avatar in an illustration */}
            <img className="dmock__av" src="/images/fg/logos/gs-monogram.png" alt="" width={40} height={40} />
            <div className="dmock__content">
              <BotHead time="Today at 9:05 AM" />
              <div className="dmock__embed">
                <p className="dmock__title">Yesterday&apos;s Daily #8 · Mario Kart World</p>
                <ul className="dmock__ranks">
                  <li><span>🥇</span> Sam in 3</li>
                  <li><span>🥈</span> Riley in 4</li>
                  <li><span>🥉</span> Jordan in 5</li>
                  <li><span>•</span> Alex ran out of guesses</li>
                </ul>
                <p className="dmock__streak">This channel has solved the Daily 6 days running.</p>
                <p className="dmock__foot">Today&apos;s Daily is Mario Party</p>
              </div>
              <span className="dmock__btns">
                <span className="dmock__btn dmock__btn--go">Play today&apos;s Daily</span>
                <span className="dmock__btn">Weekly</span>
              </span>
            </div>
          </div>
        )}
      </div>
    </figure>
  );
}
