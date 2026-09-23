import { notFound } from "next/navigation";
import { Container, Icon, type IconName } from "@empac/cascadeds";
import { VideoHero } from "@/components/layout/VideoHero";
import { BetaBanner } from "@/components/BetaBanner";
import { LoungeStarter } from "@/components/competitive/LoungeStarter";
import { createPublicClient } from "@/lib/supabase/public";
import { loadCompetitiveConfig, listCompetitiveGames } from "@/lib/competitive/config";

/**
 * The competitive hub for one game.
 *
 * Everything that varies by title (scoring table, lobby size, match formats,
 * community links) comes from `game_competitive_configs`, so a new competitive
 * game is a row rather than a copy of this page. The scoring table is rendered
 * on the server because it is the page's real SEO content.
 */

export const revalidate = 3600;

export async function generateStaticParams() {
  const games = await listCompetitiveGames(createPublicClient() as never).catch(() => []);
  return games.map((g) => ({ game: g.gameSlug }));
}

export default async function CompetitiveGamePage({ params }: { params: Promise<{ game: string }> }) {
  const { game } = await params;
  const config = await loadCompetitiveConfig(createPublicClient() as never, game);
  if (!config) notFound();

  const topPoints = config.pointsTable[0]?.points ?? 1;
  const rounds = config.defaultRaceCount;

  return (
    <>
      <VideoHero backgroundImage="/images/bg/MK8DX_Background_Music.jpg" overlayOpacity={0.75} height="medium">
        <Container>
          <div style={{ maxWidth: "600px" }}>
            <h1 style={{ fontSize: "clamp(2.4rem, 4vw, 4.8rem)", fontWeight: 700, lineHeight: 1.1, marginBottom: "1rem" }}>
              Competitive {config.displayName} <span className="beta-badge">BETA</span>
            </h1>
            <p>
              {rounds} {config.roundLabel}s, standard scoring, up to {config.lobbySize} players.
              Track your scores, settle disputes, and battle other communities.
            </p>
          </div>
        </Container>
      </VideoHero>

      <main style={{ paddingTop: "3rem" }}>
        <Container>
          <BetaBanner />

          <LoungeStarter config={config} />

          <section className="comp-section">
            <h2 className="comp-section__title">How live scoring works</h2>
            <div className="comp-steps">
              {[
                { t: "Create a session", d: `Start a ${rounds}-${config.roundLabel} set on the standard scoring table.` },
                { t: "Share the link", d: "Send it to your opponents. Everyone joins on their own device." },
                { t: `Log placements`, d: `After each ${config.roundLabel}, tap your finish position. Points calculate automatically.` },
                { t: "Final standings", d: "See the result the moment the last one is in, and share it." },
              ].map((s, i) => (
                <div key={s.t} className="comp-step">
                  <div className="comp-step__number">{i + 1}</div>
                  <h3>{s.t}</h3>
                  <p>{s.d}</p>
                </div>
              ))}
            </div>
          </section>

          {config.communityLinks.length > 0 && (
            <section className="comp-section">
              <h2 className="comp-section__title">Community resources</h2>
              <div className="comp-resources">
                {config.communityLinks.map((r) => (
                  <a key={r.url} href={r.url} target="_blank" rel="noopener noreferrer" className="comp-resource">
                    <div className="comp-resource__icon"><Icon name={"trophy" as IconName} size="24" /></div>
                    <div>
                      <h3 className="comp-resource__name">{r.label}</h3>
                      {r.blurb && <p className="comp-resource__desc">{r.blurb}</p>}
                    </div>
                  </a>
                ))}
              </div>
            </section>
          )}

          <section className="comp-section" style={{ marginBottom: "5rem" }}>
            <h2 className="comp-section__title">{config.displayName} standard scoring</h2>
            <div className="comp-scoring-table">
              {config.pointsTable.map((row) => (
                <div key={row.place} className="comp-scoring-table__row">
                  <span className="comp-scoring-table__place">{row.place}</span>
                  <div className="comp-scoring-table__bar" style={{ width: `${(row.points / topPoints) * 100}%` }} />
                  <span className="comp-scoring-table__pts">{row.points} pts</span>
                </div>
              ))}
            </div>
          </section>
        </Container>
      </main>
    </>
  );
}
