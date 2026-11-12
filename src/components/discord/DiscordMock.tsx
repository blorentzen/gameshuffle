/**
 * A drawing of GameShuffle posts in a Discord channel, for the /discord page.
 *
 * An illustration, not UI: it copies Discord's dark message layout (so it stays
 * dark in both site themes) and shows made-up players. Mirrors the real posts
 * in src/lib/activity/channelCard.ts (the day's card and the morning podium):
 * their pictures are drawn by the bot's own renderer
 * (scripts/render-discord-card-examples.ts), so rerun that script and keep the
 * wording here in step when the posts change.
 */

function BotHead({ time, name = "GameShuffle" }: { time: string; name?: string }) {
  return (
    <div className="dmock__meta">
      <b>{name}</b>
      <span className="dmock__app">APP</span>
      <span className="dmock__time">{time}</span>
    </div>
  );
}

// The players drawn in public/images/discord/daily-card-example.webp.
const PLAYERS = [
  { name: "Sam", said: "solved in 3" },
  { name: "Riley", said: "solved in 4" },
  { name: "Jordan", said: "is still playing" },
  { name: "Alex", said: "ran out of guesses" },
];

export type DiscordMockVariant = "card" | "summary" | "poll" | "golive" | "roles" | "ttpanel" | "mmr";

/** GameShuffle Competitive (the /mario-kart-discord-bot page). Its panel and record post mirror the time trial cards
 *  in src/lib/discord/ttCards.ts (panelCard, recordPostCard), and the MMR reply commands/mmr.ts: keep the wording in step. */
const COMP = "GameShuffle Competitive";
const COMP_ICON = "/images/discord/comp-icon.png";
const RECORDS = [
  { code: "RR", time: "2:24.418", who: "Riley", cat: "150cc, mushrooms", when: "2 hours ago" },
  { code: "TH", time: "2:05.291", who: "Quinn", cat: "150cc, no mushrooms", when: "yesterday" },
  { code: "MKS", time: "1:36.673", who: "Quinn", cat: "150cc, mushrooms", when: "Nov 8" },
];

const LABELS: Record<DiscordMockVariant, string> = {
  card: `Example Discord channel: Riley used /gs-daily, then the GameShuffle bot posted today's results card, a picture with each player's profile picture and squares. ${PLAYERS.map((p) => `${p.name} ${p.said}`).join(", ")}. Squares only, no answer.`,
  summary: "Example Discord message: the GameShuffle bot's morning podium. Sam solved yesterday's Daily in 3, Riley in 4, Jordan in 5, Alex ran out of guesses, and the channel has solved it 6 days running.",
  poll: "Example Discord message: a live poll, Which cup next?, with a vote button per cup and 214 votes counted from Discord, Twitch chat and the live page.",
  golive: "Example Discord message: the GameShuffle bot announces that a streamer is live on Twitch playing Mario Kart World, with the game's cover art and a link to their live page.",
  roles: "Example Discord message: a role menu where members tap buttons to pick their games and game night pings. A reply only the member sees confirms the role was added.",
  ttpanel: `Example Discord channel: GameShuffle Competitive's pinned time trial panel for Kart Club, Mario Kart 8 Deluxe, 17 times from 5 players this month, with the newest server records (${RECORDS.map((r) => `${r.code} ${r.time} by ${r.who}`).join(", ")}) and buttons to add a time, see a top ten, see your times or open the server board. Below it, a post: new server record on Rainbow Road, Riley 2:24.418, was 2:25.905 by Quinn, with the result screenshot as proof, Vouch, Report and the full board, and Verify for server managers.`,
  mmr: "Example Discord message: Riley used /mmr, and GameShuffle Competitive replied with Sam's Mario Kart World lounge numbers: MMR 7,912, Gold, 88 to Platinum, world rank 1,240, season peak 8,040 and the last ten events, with the Gold medal.",
};

const CHANNEL: Record<DiscordMockVariant, string> = { card: "game-night", summary: "game-night", poll: "stream-chat", golive: "going-live", roles: "pick-your-roles", ttpanel: "time-trials", mmr: "lounge" };

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
                <div className="dmock__container">
                  {/* eslint-disable-next-line @next/next/no-img-element -- the bot's drawn card, in an illustration */}
                  <img className="dmock__card" src="/images/discord/daily-card-example.webp" alt="" width={1120} height={556} loading="lazy" />
                  <p className="dmock__text"><b>Sam</b> leads with 3. Can anyone do it in 2?</p>
                  <span className="dmock__btns"><span className="dmock__btn dmock__btn--go">Play the Daily</span></span>
                </div>
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
        ) : variant === "ttpanel" ? (
          <>
            <div className="dmock__msg">
              {/* eslint-disable-next-line @next/next/no-img-element -- decorative avatar in an illustration */}
              <img className="dmock__av dmock__av--comp" src={COMP_ICON} alt="" width={40} height={40} />
              <div className="dmock__content">
                <BotHead name={COMP} time="Pinned" />
                <div className="dmock__container dmock__container--comp">
                  <div className="dmock__lines">
                    <p className="dmock__title dmock__title--big">Time trials in Kart Club</p>
                    <span className="dmock__sub">Mario Kart 8 Deluxe · 17 times from 5 players this month</span>
                  </div>
                  <hr className="dmock__rule" />
                  <div className="dmock__lines">
                    <b className="dmock__label">Newest server records</b>
                    {RECORDS.map((r) => (
                      <span key={r.code} className="dmock__record">
                        <span><code>{r.code}</code> <b>{r.time}</b> · {r.who}</span>
                        <span className="dmock__sub">{r.cat} · {r.when}</span>
                      </span>
                    ))}
                  </div>
                  <hr className="dmock__rule" />
                  <span className="dmock__btns">
                    <span className="dmock__btn dmock__btn--go">Add a time</span>
                    <span className="dmock__btn">Top ten</span>
                    <span className="dmock__btn">My times</span>
                    <span className="dmock__btn">Server board</span>
                  </span>
                </div>
              </div>
            </div>
            <div className="dmock__msg">
              {/* eslint-disable-next-line @next/next/no-img-element -- decorative avatar in an illustration */}
              <img className="dmock__av dmock__av--comp" src={COMP_ICON} alt="" width={40} height={40} />
              <div className="dmock__content">
                <BotHead name={COMP} time="Today at 8:41 PM" />
                <div className="dmock__container dmock__container--gold">
                  <div className="dmock__live">
                    <div className="dmock__lines">
                      <p className="dmock__title dmock__title--big">New server record</p>
                      <span>Rainbow Road (RR) · 150cc, mushrooms</span>
                    </div>
                    {/* eslint-disable-next-line @next/next/no-img-element -- course art in an illustration */}
                    <img className="dmock__thumb dmock__thumb--square" src="https://cdn.empac.co/gameshuffle/images/mk8dx/courses/special/rainbow-road.webp" alt="" width={76} height={76} loading="lazy" />
                  </div>
                  <hr className="dmock__rule" />
                  <div className="dmock__lines">
                    <p className="dmock__title">🇺🇸 Riley · 2:24.418</p>
                    <span className="dmock__sub">Was 2:25.905 by Quinn · 212th on GameShuffle</span>
                  </div>
                  <hr className="dmock__rule" />
                  <span className="dmock__sub">Proof · result screenshot</span>
                  <span className="dmock__shot" aria-hidden="true">
                    <span className="dmock__shot-card">
                      <span>Lap 1</span><span>47.802</span>
                      <span>Lap 2</span><span>48.115</span>
                      <span>Lap 3</span><span>48.501</span>
                      <b>Total</b><b>2:24.418</b>
                    </span>
                  </span>
                  <hr className="dmock__rule" />
                  <span className="dmock__btns">
                    <span className="dmock__btn">Vouch</span>
                    <span className="dmock__btn">Report</span>
                    <span className="dmock__btn">Full board</span>
                  </span>
                  <span className="dmock__mgr">
                    <span className="dmock__sub">Server managers can check this time for Kart Club.</span>
                    <span className="dmock__btn">Verify</span>
                  </span>
                </div>
              </div>
            </div>
          </>
        ) : variant === "mmr" ? (
          <div className="dmock__msg">
            {/* eslint-disable-next-line @next/next/no-img-element -- decorative avatar in an illustration */}
            <img className="dmock__av dmock__av--comp" src={COMP_ICON} alt="" width={40} height={40} />
            <div className="dmock__content">
              <p className="dmock__used"><b>Riley</b> used <span className="dmock__cmd">/mmr</span></p>
              <BotHead name={COMP} time="Today at 8:44 PM" />
              <div className="dmock__embed dmock__embed--gold">
                <div className="dmock__live">
                  <div className="dmock__live-copy">
                    <p className="dmock__title">Sam · MK World 12P</p>
                    <div className="dmock__pairs dmock__pairs--3">
                      <span><b>MMR</b>7,912</span>
                      <span><b>Division</b>Gold</span>
                      <span><b>To Platinum</b>88</span>
                      <span><b>World rank</b>#1,240</span>
                      <span><b>Season peak</b>8,040</span>
                    </div>
                    <p className="dmock__squares"><b>Last 10</b><span>🟥🟨🟥🟨🟨🟨🟥🟥🟥🟩</span></p>
                  </div>
                  {/* eslint-disable-next-line @next/next/no-img-element -- MKCentral's Gold medal (credited on the page) */}
                  <img className="dmock__medal" src="/images/comp-mario-kart/levels/gold.png" alt="" width={64} height={64} loading="lazy" />
                </div>
                <p className="dmock__foot">MMR card · gameshuffle.co/mmr-card</p>
              </div>
              <span className="dmock__btns"><span className="dmock__btn">Make your MMR card</span></span>
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
              <div className="dmock__container">
                {/* eslint-disable-next-line @next/next/no-img-element -- the bot's drawn podium, in an illustration */}
                <img className="dmock__card" src="/images/discord/daily-podium-example.webp" alt="" width={1120} height={736} loading="lazy" />
                <p className="dmock__text">Out of guesses: Alex.<br />Today it&apos;s <b>Mario Party</b>. Keep the streak going.</p>
                <span className="dmock__btns">
                  <span className="dmock__btn dmock__btn--go">Play today&apos;s Daily</span>
                  <span className="dmock__btn">Weekly</span>
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </figure>
  );
}
