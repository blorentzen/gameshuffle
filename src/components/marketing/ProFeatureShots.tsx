/**
 * Hand-built "product shots" for the GS Pro marquee spotlights — stylized
 * representations of the big features (not live demos, no screenshots). Each is
 * a dark panel meant to sit in a <ProSpotlight> row on the light page.
 *
 * Coin/token surfaces use the reserved gold ramp (the one place gold belongs).
 */

/* ── One session, every platform ───────────────────────────────────── */
type Platform = {
  name: string;
  icon?: string;
  letter?: string;
  color: string;
  live: boolean;
};

const PLATFORMS: Platform[] = [
  { name: "Twitch", icon: "/images/icons/twitch.svg", color: "#a970ff", live: true },
  { name: "Discord", icon: "/images/icons/discord.svg", color: "#8b93f8", live: true },
  { name: "YouTube", icon: "/images/icons/youtube.svg", color: "#ff5c5c", live: false },
  { name: "Kick", letter: "K", color: "#53fc18", live: false },
  { name: "TikTok", icon: "/images/icons/tiktok.svg", color: "#f5f5f5", live: false },
];

export function PlatformShot() {
  return (
    <div className="pro-shot pro-shot--platforms" aria-hidden="true">
      <div className="pro-shot__session">
        <span className="pro-shot__pulse" />
        One game night, on&nbsp;air
      </div>
      <p className="pro-shot__label">Broadcasting to</p>
      <div className="pf-fan">
        {PLATFORMS.map((p) => (
          <div key={p.name} className={`pf-chip${p.live ? " pf-chip--live" : " pf-chip--soon"}`}>
            <span className="pf-chip__glyph" style={{ color: p.color }}>
              {p.icon ? (
                <span
                  className="pf-chip__mask"
                  style={{
                    WebkitMaskImage: `url(${p.icon})`,
                    maskImage: `url(${p.icon})`,
                    backgroundColor: p.color,
                  }}
                />
              ) : (
                <span className="pf-chip__letter">{p.letter}</span>
              )}
            </span>
            <span className="pf-chip__name">{p.name}</span>
            <span className="pf-chip__tag">{p.live ? "Live" : "Soon"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Stream tools on your overlay ──────────────────────────────────────
   A faithful replica of the real combo overlay card (overlay.css isn't loaded
   off the overlay route), rendered with the actual CDN art on a gameplay
   backdrop so it reads as a true OBS preview. */
const OVERLAY_COMBO = [
  { img: "https://cdn.empac.co/gameshuffle/images/mk8dx/characters/mario.png", name: "Mario" },
  { img: "https://cdn.empac.co/gameshuffle/images/mk8dx/vehicles/pipe-frame.webp", name: "Pipe Frame" },
  { img: "https://cdn.empac.co/gameshuffle/images/mk8dx/wheels/monster.webp", name: "Monster" },
  { img: "https://cdn.empac.co/gameshuffle/images/mk8dx/gliders/cloud.webp", name: "Cloud" },
];

export function OverlayShot() {
  return (
    <div className="pro-shot pro-shot--overlay" aria-hidden="true">
      <div className="ov-scene">
        <span className="ov-live">
          <span className="ov-live__dot" /> LIVE
        </span>
        <div className="ov-stage">
          {/* Cycles through overlay tools: randomizer combo → wheel → tier list. */}
          <div className="ov-cycle" style={{ animationDelay: "0s" }}>
            <div className="ov-combo">
              <div className="ov-combo__header">
                <span className="ov-combo__dice">🎲</span>
                <span className="ov-combo__name">GameShuffle</span>
                <span className="ov-combo__verb">drew</span>
              </div>
              <div className="ov-combo__slots">
                {OVERLAY_COMBO.map((s) => (
                  <div key={s.name} className="ov-combo__slot">
                    <div className="ov-combo__slot-img">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={s.img} alt="" loading="lazy" />
                    </div>
                    <span className="ov-combo__slot-name">{s.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="ov-cycle" style={{ animationDelay: "-4s" }}>
            <div className="ov-tool">
              <p className="ov-tool__label">Wheel Spinner</p>
              <div className="ov-wheelbox">
                <span className="ov-wheelbox__disc" />
                <span className="ov-wheelbox__ptr" />
              </div>
            </div>
          </div>

          <div className="ov-cycle" style={{ animationDelay: "-8s" }}>
            <div className="ov-tool">
              <p className="ov-tool__label">Tier List</p>
              <div className="ov-tier">
                <div className="ov-tier__row">
                  <span className="ov-tier__grade ov-tier__grade--s">S</span>
                  <span className="ov-tier__chip" /><span className="ov-tier__chip" />
                </div>
                <div className="ov-tier__row">
                  <span className="ov-tier__grade ov-tier__grade--a">A</span>
                  <span className="ov-tier__chip" /><span className="ov-tier__chip" /><span className="ov-tier__chip" />
                </div>
                <div className="ov-tier__row">
                  <span className="ov-tier__grade ov-tier__grade--b">B</span>
                  <span className="ov-tier__chip" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Arcade Token economy ────────────────────────────────────────────
   A live economy feed that auto-scrolls (the list is duplicated so the loop is
   seamless), under a static balance header. */
const TOKEN_FEED = [
  { who: "@rae", action: "bet 50 on Red", amount: "-50" },
  { who: "@milo", action: "won the lap-3 bounty", amount: "+200" },
  { who: "@you", action: "awarded @jess", amount: "+100" },
  { who: "@dex", action: "cashed out a market", amount: "+320" },
  { who: "@nova", action: "spun the chaos wheel", amount: "-25" },
  { who: "@sam", action: "topped the leaderboard", amount: "+150" },
  { who: "@kai", action: "claimed daily allowance", amount: "+75" },
  { who: "@ivy", action: "bet 80 on Blue", amount: "-80" },
];

export function TokenShot() {
  return (
    <div className="pro-shot pro-shot--token" aria-hidden="true">
      <div className="tk-balance">
        <span className="pro-coin pro-coin--lg" />
        <span className="tk-balance__amount">1,240</span>
        <span className="tk-balance__label">Arcade Tokens</span>
      </div>
      <div className="tk-scroll">
        <div className="tk-track">
          {[...TOKEN_FEED, ...TOKEN_FEED].map((f, i) => (
            <div key={i} className="tk-line">
              <span className="pro-coin pro-coin--sm" />
              <span className="tk-line__text">
                <b>{f.who}</b> {f.action}
              </span>
              <span className={`tk-line__amt${f.amount.startsWith("+") ? " is-plus" : ""}`}>
                {f.amount}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Prediction markets ──────────────────────────────────────────────
   A live poll in progress: the outcome bars shift as votes stream in, a live
   pulse on the status, and a periodic vote tick. */
export function MarketShot() {
  return (
    <div className="pro-shot pro-shot--market" aria-hidden="true">
      <div className="mk-card">
        <span className="mk-card__status">
          <span className="mk-card__dot" /> Live · voting open
        </span>
        <p className="mk-card__q">Who takes the next race?</p>
        <div className="mk-outcome">
          <div className="mk-outcome__top"><span>Mario</span></div>
          <div className="mk-bar"><span className="mk-fill mk-fill--a" /></div>
        </div>
        <div className="mk-outcome">
          <div className="mk-outcome__top"><span>Bowser</span></div>
          <div className="mk-bar"><span className="mk-fill mk-fill--b" /></div>
        </div>
        <div className="mk-card__foot">
          <span className="mk-pot">
            <span className="pro-coin pro-coin--sm" /> 1,850 pot
          </span>
          <span className="mk-tick">+3 bets</span>
        </div>
      </div>
    </div>
  );
}
