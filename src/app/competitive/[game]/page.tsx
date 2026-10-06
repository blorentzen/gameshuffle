import Link from "next/link";
import { notFound } from "next/navigation";
import { Button, Container, Icon, type IconName } from "@empac/cascadeds";
import { NewBanner } from "@/components/NewBanner";
import { LoungeStarter } from "@/components/competitive/LoungeStarter";
import { DarkBand } from "@/components/marketing/DarkBand";
import { MarketingHeroCurve } from "@/components/marketing/MarketingHeroCurve";
import { createPublicClient } from "@/lib/supabase/public";
import { loadCompetitiveConfig, listCompetitiveGames } from "@/lib/competitive/config";

/**
 * The competitive hub for one game.
 *
 * Everything that varies by title (scoring table, lobby size, match formats,
 * community links) comes from `game_competitive_configs`, so a new competitive
 * game is a row rather than a copy of this page. The scoring table is rendered
 * on the server because it is the page's real SEO content.
 *
 * Rebuilt 2026-09-26 in the language of /mario-kart-tournaments and /gs-pro:
 * the dark hero with the curve, one start panel, and a closing band that butts
 * the footer. Deliberately still light-themed and still marked beta.
 */

export const revalidate = 3600;

const PAGE_BG = "color-mix(in srgb, var(--text-primary) 4%, var(--surface-default))";

/** An icon per community site, keyed on its host. The old markup cast
 *  "trophy" to IconName; CDS has no such icon, so every card showed an empty
 *  circle, and the cast hid the type error that would have said so. */
function resourceIcon(url: string): IconName {
  if (/mkcentral/i.test(url)) return "users";
  if (/lounge/i.test(url)) return "chart-bar";
  if (/mkwrs|record/i.test(url)) return "clock";
  return "compass";
}

/** Hero backdrop per game, so the World hub does not wear 8 Deluxe art. */
const HERO_ART: Record<string, string> = {
  "mario-kart-world": "/images/bg/mkw-main-image.jpg",
};
const DEFAULT_ART = "/images/bg/MK8DX_Background_Music.jpg";

export async function generateStaticParams() {
  const games = await listCompetitiveGames(createPublicClient() as never).catch(() => []);
  return games.map((g) => ({ game: g.gameSlug }));
}

export default async function CompetitiveGamePage({ params }: { params: Promise<{ game: string }> }) {
  const { game } = await params;
  const supabase = createPublicClient() as never;
  const [config, games] = await Promise.all([
    loadCompetitiveConfig(supabase, game),
    listCompetitiveGames(supabase).catch(() => []),
  ]);
  if (!config) notFound();

  const topPoints = config.pointsTable[0]?.points ?? 1;
  const rounds = config.defaultRaceCount;
  const round = config.roundLabel;

  return (
    <main className="pricing-page-main" style={{ background: PAGE_BG }}>
      <section className="pro-hero pro-hero--art">
        <div className="pro-hero__art" aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={HERO_ART[config.gameSlug] ?? DEFAULT_ART} alt="" />
        </div>
        <Container>
          <div className="pro-hero__content">
            <p className="marketing-eyebrow">
              Live lounge scoring <span className="new-badge">New</span>
            </p>
            <h1 className="pro-hero__title">Competitive {config.displayName}</h1>
            <p className="pro-hero__sub">
              Score your next set live. {rounds} {round}s on the standard table, up to {config.lobbySize} players,
              and everyone logs their own finish from their phone. No forgotten scores, no screenshot disputes.
            </p>
            <div className="pro-hero__ctas">
              <Link href="#start" style={{ textDecoration: "none" }}>
                <Button variant="primary" size="large">Start a lounge</Button>
              </Link>
              <Link href="#scoring" style={{ textDecoration: "none" }}>
                <Button variant="secondary" size="large">See the scoring</Button>
              </Link>
            </div>
          </div>
        </Container>
        <MarketingHeroCurve />
      </section>

      <Container>
        <div className="cmp-hub">
          <NewBanner />

          <LoungeStarter config={config} games={games.map((g) => ({ slug: g.gameSlug, name: g.displayName }))} />

          <section className="cmp-section">
            <h2 className="cmp-section__title">How a lounge works</h2>
            <ol className="cmp-steps">
              {[
                { t: "Start it", d: `Pick a format and open a ${rounds}-${round} set on the standard table.` },
                { t: "Share the link", d: "Everyone joins from their own phone. No account needed to watch." },
                { t: "Log your finish", d: `After each ${round}, tap where you placed. Points add up on their own.` },
                { t: "Final standings", d: "The table settles the moment the last result is in." },
              ].map((s, i) => (
                <li key={s.t} className="cmp-step">
                  <span className="cmp-step__n" aria-hidden>{i + 1}</span>
                  <h3>{s.t}</h3>
                  <p>{s.d}</p>
                </li>
              ))}
            </ol>
          </section>

          <section className="cmp-section" id="scoring">
            <div className="cmp-scoring">
              <div className="cmp-scoring__intro">
                <h2 className="cmp-section__title">{config.displayName} standard scoring</h2>
                <p>
                  Points per finishing position, every {round}. The lounge uses this table automatically, so a
                  set adds up the same way it would anywhere else in the community.
                </p>
              </div>
              <div className="cmp-scoring__table" role="table" aria-label={`${config.displayName} points by position`}>
                {config.pointsTable.map((row) => (
                  <div key={row.place} className="cmp-scoring__row" role="row">
                    <span className="cmp-scoring__place" role="cell">{row.place}</span>
                    <span className="cmp-scoring__track" role="presentation">
                      <span className="cmp-scoring__bar" style={{ width: `${(row.points / topPoints) * 100}%` }} />
                    </span>
                    <span className="cmp-scoring__pts" role="cell">{row.points}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {config.communityLinks.length > 0 && (
            <section className="cmp-section">
              <h2 className="cmp-section__title">Around the community</h2>
              <div className="cmp-resources">
                {config.communityLinks.map((r) => (
                  <a key={r.url} href={r.url} target="_blank" rel="noopener noreferrer" className="cmp-resource">
                    <span className="cmp-resource__icon" aria-hidden><Icon name={resourceIcon(r.url)} size="20" /></span>
                    <span>
                      <span className="cmp-resource__name">{r.label}</span>
                      {r.blurb && <span className="cmp-resource__desc">{r.blurb}</span>}
                    </span>
                  </a>
                ))}
              </div>
            </section>
          )}
        </div>
      </Container>

      <DarkBand premium curved curveEdges="top" curveColor={PAGE_BG}>
        <div style={{ maxWidth: "56rem", margin: "0 auto", textAlign: "center" }}>
          <h2 className="pro-band__title beta-section__title" style={{ marginBottom: "var(--spacing-16)" }}>
            Settle it on the track
          </h2>
          <p style={{ margin: "0 auto var(--spacing-24)", lineHeight: "var(--line-height-relaxed)" }}>
            A lounge is one set between friends. When you want brackets, seasons and a random draw on top, run a
            tournament instead.
          </p>
          <div className="strm-finalcta">
            <Link href="#start" style={{ textDecoration: "none" }}>
              <Button variant="primary" size="large">Start a lounge</Button>
            </Link>
            <Link href="/mario-kart-tournaments" style={{ textDecoration: "none" }}>
              <Button variant="secondary" size="large">Run a tournament</Button>
            </Link>
          </div>
        </div>
      </DarkBand>
    </main>
  );
}
