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

export type DiscordMockVariant = "card" | "summary" | "poll" | "golive" | "roles";

const LABELS: Record<DiscordMockVariant, string> = {
  card: `Example Discord channel: Riley used /gs-daily, then the GameShuffle bot posted today's results card. ${PLAYERS.map((p) => `${p.name} ${p.said}`).join(", ")}. Squares only, no answer.`,
  summary: "Example Discord message: the GameShuffle bot's morning summary. Sam solved yesterday's Daily in 3, Riley in 4, Jordan in 5, Alex ran out of guesses, and the channel has solved it 6 days running.",
  poll: "Example Discord message: a live poll, Which cup next?, with a vote button per cup and 214 votes counted from Discord, Twitch chat and the live page.",
  golive: "Example Discord message: the GameShuffle bot announces that a streamer is live on Twitch playing Mario Kart World, with the game's cover art and a link to their live page.",
  roles: "Example Discord message: a role menu where members tap buttons to pick their games and game night pings. A reply only the member sees confirms the role was added.",
};

const CHANNEL: Record<DiscordMockVariant, string> = { card: "game-night", summary: "game-night", poll: "stream-chat", golive: "going-live", roles: "pick-your-roles" };

const POLL = [
  { name: "Mushroom Cup", pct: 18 },
  { name: "Flower Cup", pct: 24 },
  { name: "Star Cup", pct: 41 },
  { name: "Special Cup", pct: 17 },
];

export function DiscordMock({ variant }: { variant: DiscordMockVariant }) {
  return (
    <figure className="dmock" role="img" aria-label={LABELS[variant]}>
      <div className="dmock__bar" aria-hidden>
        <span className="dmock__hash">#</span> {CHANNEL[variant]}
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
        ) : variant === "poll" ? (
          <div className="dmock__msg">
            {/* eslint-disable-next-line @next/next/no-img-element -- decorative avatar in an illustration */}
            <img className="dmock__av" src="/images/fg/logos/gs-monogram.png" alt="" width={40} height={40} />
            <div className="dmock__content">
              <BotHead time="Today at 8:12 PM" />
              <p className="dmock__text"><b>📊 Which cup next?</b> Tap to vote, or type !vote in Twitch chat.</p>
              <ul className="dmock__poll">
                {POLL.map((o, i) => (
                  <li key={o.name} className={o.pct === 41 ? "is-top" : undefined}>
                    <span className="dmock__poll-fill" style={{ width: `${o.pct * 2}%` }} />
                    <span className="dmock__poll-label">{i + 1}. {o.name}</span>
                    <b>{o.pct}%</b>
                  </li>
                ))}
              </ul>
              <span className="dmock__btns">
                {POLL.map((o, i) => <span key={o.name} className="dmock__btn dmock__btn--blurple">{i + 1}</span>)}
              </span>
              <p className="dmock__foot">214 votes from Discord, Twitch chat and the live page</p>
            </div>
          </div>
        ) : variant === "golive" ? (
          <div className="dmock__msg">
            {/* eslint-disable-next-line @next/next/no-img-element -- decorative avatar in an illustration */}
            <img className="dmock__av" src="/images/fg/logos/gs-monogram.png" alt="" width={40} height={40} />
            <div className="dmock__content">
              <BotHead time="Today at 7:00 PM" />
              <div className="dmock__embed dmock__embed--live">
                <div className="dmock__live">
                  <div className="dmock__live-copy">
                    <p className="dmock__author"><span className="dmock__av dmock__av--tiny">K</span> Kaz</p>
                    <p className="dmock__title">🔴 Kaz is live on Twitch</p>
                    <p className="dmock__desc">Watch on Twitch: twitch.tv/kaz</p>
                    <div className="dmock__pairs">
                      <span><b>Now playing</b>Mario Kart World</span>
                      <span><b>Live page</b>gameshuffle.co/live/kaz</span>
                    </div>
                  </div>
                  {/* eslint-disable-next-line @next/next/no-img-element -- local box art in an illustration */}
                  <img className="dmock__thumb" src="/images/box-art/mario-kart-world.webp" alt="" width={300} height={400} />
                </div>
                <p className="dmock__foot">GameShuffle · Today at 7:00 PM</p>
              </div>
            </div>
          </div>
        ) : variant === "roles" ? (
          <>
            <div className="dmock__msg">
              {/* eslint-disable-next-line @next/next/no-img-element -- decorative avatar in an illustration */}
              <img className="dmock__av" src="/images/fg/logos/gs-monogram.png" alt="" width={40} height={40} />
              <div className="dmock__content">
                <BotHead time="Pinned" />
                <div className="dmock__embed">
                  <p className="dmock__title">Pick your games</p>
                  <p className="dmock__desc">Tap a game to get its role and its pings. Tap again to drop it.</p>
                </div>
                <span className="dmock__btns">
                  <span className="dmock__btn">🏎️ Mario Kart</span>
                  <span className="dmock__btn dmock__btn--on">🥊 Smash</span>
                  <span className="dmock__btn">🎲 Mario Party</span>
                  <span className="dmock__btn">🔔 Game night pings</span>
                </span>
              </div>
            </div>
            <p className="dmock__ephemeral">Only you can see this · You now have the <b>Smash</b> role.</p>
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
