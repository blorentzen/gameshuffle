import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Button, Container } from "@empac/cascadeds";
import { createClient } from "@/lib/supabase/server";
import { SITE_URL } from "@/lib/seo";
import { getOwnerThemeVars } from "@/lib/theme/owner-theme";
import { leagueBySlug, leagueUrl, leagueView, viewerOnLeague, type LeagueView } from "@/lib/trivia/leagues";
import { scoringLine } from "@/lib/trivia/leagueRules";
import { triviaMetadata } from "@/lib/trivia/seoMeta";
import { LeagueEnter, LeagueShare, LeagueTeamActions } from "@/components/trivia/leagues/LeagueClient";
import "@/styles/trivia.css";
import "@/styles/trivia-seo.css";

export const dynamic = "force-dynamic";

const placeWord = (n: number) => {
  const r10 = n % 10, r100 = n % 100;
  if (r10 === 1 && r100 !== 11) return `${n}st`;
  if (r10 === 2 && r100 !== 12) return `${n}nd`;
  if (r10 === 3 && r100 !== 13) return `${n}rd`;
  return `${n}th`;
};

function when(iso: string, tz: string | null, opts: Intl.DateTimeFormatOptions): string {
  try { return new Intl.DateTimeFormat("en-US", { timeZone: tz ?? "America/Los_Angeles", ...opts }).format(new Date(iso)); }
  catch { return new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", ...opts }).format(new Date(iso)); }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const league = await leagueBySlug((await params).slug);
  if (!league) return {};
  const description = league.settings.description?.slice(0, 150) || `${league.title}: a weekly trivia league on GameShuffle. Standings, the next night and how to enter a team.`;
  return triviaMetadata({ title: league.title, description, path: leagueUrl(league.slug), noindex: league.status === "archived" });
}

function jsonLd(v: LeagueView) {
  const url = `${SITE_URL}${leagueUrl(v.slug)}`;
  const graph: Record<string, unknown>[] = [{
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Trivia nights", item: `${SITE_URL}/trivia` },
      { "@type": "ListItem", position: 2, name: v.title, item: url },
    ],
  }];
  if (v.next) {
    graph.push({
      "@type": "Event",
      name: `${v.title} · Week ${Math.min(v.weeksPlayed + 1, v.settings.weeks)}`,
      description: v.description || `A weekly trivia night, part of ${v.title}. Teams of up to ${v.settings.teamSize}.`,
      startDate: v.next.startsAt,
      eventStatus: "https://schema.org/EventScheduled",
      eventAttendanceMode: v.next.online ? "https://schema.org/OnlineEventAttendanceMode" : "https://schema.org/OfflineEventAttendanceMode",
      location: v.next.online || !v.next.place
        ? { "@type": "VirtualLocation", url }
        : { "@type": "Place", name: v.next.place.split(",")[0], address: v.next.place },
      organizer: { "@type": "Person", name: v.owner.name, url },
      isAccessibleForFree: true,
      url,
    });
  }
  return { "@context": "https://schema.org", "@graph": graph };
}

export default async function LeaguePage({ params }: { params: Promise<{ slug: string }> }) {
  const league = await leagueBySlug((await params).slug);
  if (!league) notFound();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const [view, theme] = await Promise.all([leagueView(league), getOwnerThemeVars(league.owner_user_id)]);
  const viewer = user ? await viewerOnLeague(league, view, user.id) : null;
  const s = view.settings;
  const week = Math.min(view.weeksPlayed + (view.status === "active" ? 1 : 0), s.weeks);
  const slot = view.next ? `Every ${when(view.next.startsAt, view.next.timezone, { weekday: "long" })} · ${when(view.next.startsAt, view.next.timezone, { hour: "numeric", minute: "2-digit" })}` : null;
  const placeLine = view.next ? (view.next.online ? "Online" : view.next.place) : null;
  const myTeamIds = new Set(viewer?.cards.map((c) => c.teamId) ?? []);

  return (
    <main style={theme} className="league-public">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd(view)) }} />
      <header className="league-hero">
        <Container>
          <p className="league-hero__crumbs"><Link href="/trivia">Trivia nights</Link> › League</p>
          <Badge variant="warning" size="small">{view.status === "active" ? `Trivia league · Week ${week} of ${s.weeks}` : view.status === "archived" ? "Archived" : "Season over"}</Badge>
          <h1 className="league-hero__title">{view.title}</h1>
          <p className="league-hero__sub">{[slot, placeLine, `teams of up to ${s.teamSize}`].filter(Boolean).join(" · ")}</p>
          <p className="league-hero__sub">Hosted by {view.owner.name}</p>
        </Container>
      </header>

      <Container>
        <div className="league-body">
          {view.status === "archived" && <div className="trivia-card"><p className="trivia-muted">The host archived this league. Its standings stay here for the record.</p></div>}

          {view.champion && (
            <div className="trivia-card league-champion">
              <p className="trivia-label">Champion</p>
              <p className="league-champion__name">{view.champion}</p>
              <p className="trivia-muted">Top of the standings after {s.weeks} weeks.</p>
            </div>
          )}

          {view.status === "active" && (
            <div className="trivia-card league-next">
              <div>
                {view.live ? (
                  <>
                    <p className="trivia-label">Playing now · Week {view.live.week}</p>
                    <p className="league-next__when">Join with code <strong>{view.live.code}</strong></p>
                    <p className="trivia-muted">Open gameshuffle.co/trivia on a phone, or scan the code on the TV.</p>
                  </>
                ) : view.next ? (
                  <>
                    <p className="trivia-label">Next night</p>
                    <p className="league-next__when">{when(view.next.startsAt, view.next.timezone, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" })}</p>
                    <p className="trivia-muted">{view.next.online ? "Online" : view.next.place} · teams of up to {s.teamSize} · <Link href={`/game-nights/${view.next.id}`}>Night details</Link></p>
                  </>
                ) : <p className="trivia-muted">The next night will show here once it&apos;s scheduled.</p>}
              </div>
              <div className="trivia-row">
                {view.live && <Link href={`/trivia/play/${view.live.code}`}><Button variant="primary">Play tonight</Button></Link>}
                {!view.live && <LeagueEnter leagueId={view.id} slug={view.slug} signedIn={!!user} crews={viewer?.canEnter ?? []} />}
                {viewer?.isOwner && <Link href={`${leagueUrl(view.slug)}/manage`}><Button variant="secondary">Manage the league</Button></Link>}
              </div>
            </div>
          )}

          {viewer && viewer.cards.length > 0 && (
            <section className="league-section" aria-labelledby="league-yours">
              <h2 id="league-yours" className="trivia-h3">Your team{viewer.cards.length === 1 ? "" : "s"}</h2>
              {viewer.cards.map((c) => {
                const t = view.teams.find((x) => x.id === c.teamId);
                if (!t) return null;
                return (
                  <div key={c.teamId} className="trivia-card league-team">
                    <div className="trivia-row league-team__head">
                      <h3 className="trivia-h3">{t.name}</h3>
                      {t.nights > 0 && <Badge variant="info" size="small">{placeWord(t.rank)} · {t.points} points</Badge>}
                    </div>
                    <ul className="league-weeks" aria-label="Place each week">
                      {Array.from({ length: s.weeks }, (_, i) => i + 1).map((w) => {
                        const r = t.weeks.find((x) => x.week === w);
                        return <li key={w} className={r?.place === 1 ? "is-win" : r ? "" : "is-empty"}>W{w} {r ? placeWord(r.place) : w <= view.weeksPlayed ? "missed" : w === week && view.status === "active" ? "next" : ""}</li>;
                      })}
                    </ul>
                    {c.roster.length > 0 && (
                      <ul className="league-roster" aria-label="Crew">
                        {c.roster.map((p) => <li key={p.name}>{p.name}{p.captain ? <Badge variant="warning" size="small">Captain</Badge> : null}</li>)}
                      </ul>
                    )}
                    <LeagueTeamActions leagueId={view.id} teamId={c.teamId} live={!!view.live} crewSlug={t.crew?.slug ?? null} canLeave={c.canLeave} />
                  </div>
                );
              })}
            </section>
          )}

          <section className="league-section" aria-labelledby="league-standings">
            <h2 id="league-standings" className="trivia-h3">Standings{view.weeksPlayed ? ` after week ${view.weeksPlayed}` : ""}</h2>
            {view.teams.length === 0 ? (
              <p className="trivia-muted">No teams yet. Teams enter from this page or at the door on the night.</p>
            ) : (
              <div className="trivia-league-final__scroll" tabIndex={0} role="region" aria-label="Standings">
                <table className="trivia-league-final__table league-table">
                  <thead><tr><th scope="col">#</th><th scope="col">Team</th><th scope="col">Nights</th><th scope="col">Wins</th><th scope="col">Points</th></tr></thead>
                  <tbody>
                    {view.teams.map((t) => (
                      <tr key={t.id} className={myTeamIds.has(t.id) ? "is-you" : ""}>
                        <td>{t.nights ? t.rank : ""}{t.previousRank && t.previousRank !== t.rank ? <span className={t.rank < t.previousRank ? "league-move is-up" : "league-move is-down"} aria-label={t.rank < t.previousRank ? "up" : "down"}>{t.rank < t.previousRank ? " ▲" : " ▼"}</span> : null}</td>
                        <td>{t.crew ? <Link href={`/c/${t.crew.slug}`}>{t.name}</Link> : t.name}</td>
                        <td>{t.nights}</td>
                        <td>{t.wins}</td>
                        <td>{t.points}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="trivia-muted">{scoringLine(s)}</p>
          </section>

          {view.past.length > 0 && (
            <section className="league-section" aria-labelledby="league-past">
              <h2 id="league-past" className="trivia-h3">Past nights</h2>
              <ul className="league-past">
                {view.past.map((p) => (
                  <li key={p.gameId} className="trivia-card">
                    <span><strong>Week {p.week}</strong>{p.date ? ` · ${when(p.date, view.next?.timezone ?? null, { month: "short", day: "numeric" })}` : ""}</span>
                    <span className="trivia-muted">{p.teams} teams{p.winner ? ` · ${p.winner} won` : ""}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {view.description && (
            <section className="league-section" aria-labelledby="league-about">
              <h2 id="league-about" className="trivia-h3">About the league</h2>
              <p className="league-about">{view.description}</p>
            </section>
          )}

          <LeagueShare title={view.title} path={leagueUrl(view.slug)} nextAt={view.next?.startsAt ?? null} />
        </div>
      </Container>
    </main>
  );
}
