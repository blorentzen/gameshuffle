import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { Container, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@empac/cascadeds";
import { BrowseHero } from "@/components/events/BrowseHero";
import { TableScroll } from "@/components/ui/TableScroll";
import { ArrowLink } from "@/components/ui/ArrowLink";
import { WarLeadChart } from "@/components/wars/WarLeadChart";
import { WarCopyLink, WarLiveRefresh, WarTeamMark } from "@/components/wars/WarPageBits";
import { compAppLive } from "@/lib/discord/appIds";
import { shareMeta, previewText } from "@/lib/og/meta";
import { SITE_URL } from "@/lib/seo";
import { readWarSlug } from "@/lib/wars/page";
import { warByShort, warsReady } from "@/lib/wars/store";
import { warPageTitle, warPageView, warSentence, type WarPageRace, type WarPageView } from "@/lib/wars/pageView";
import { placesOf, teamTotal, type TableModel } from "@/lib/wars/table";
import "@/styles/war-page.css";

/**
 * A war's page (war tools walkthrough https://claude.ai/artifact/TGuceXNmWkKrh5BVpgJNBT, picked 2026-10-31):
 * linked from the war's final card in Discord, for sharing outside it. The score, the lead after each race, every
 * race and the table the team posted. Public by link, never indexed; a live war reads itself again every 15 seconds.
 */

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

const load = cache(async (slug: string): Promise<WarPageView | null> => {
  const short = readWarSlug(slug);
  if (!short || !(await warsReady())) return null;
  const war = await warByShort(short);
  return war ? warPageView(war) : null;
});

const title = warPageTitle;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const v = await load((await params).slug);
  if (!v) return { title: "War", robots: { index: false } };
  const t = title(v);
  const d = previewText(`${warSentence(v)} ${v.gameLabel}, ${v.date}.`);
  return { title: t, description: d, robots: { index: false, follow: true }, ...shareMeta({ title: t, description: d, path: v.path }) };
}

const leadText = (v: WarPageView, n: number) => (n === 0 ? "Level" : `${n > 0 ? v.us.tag : v.them.tag} by ${Math.abs(n)}`);
const raceText = (v: WarPageView, d: number) => (d === 0 ? "Even" : `${d > 0 ? v.us.tag : v.them.tag} +${Math.abs(d)}`);

/** Several teams: the standings, with each team's color and its gap to the leader. */
function Standings({ v }: { v: WarPageView }) {
  const lead = v.teams[v.order[0]]?.total ?? 0;
  return (
    <ol className="wp-standings" aria-label="Standings">
      {v.order.map((i, rank) => {
        const t = v.teams[i];
        return (
          <li key={t.tag} className={i === 0 ? "is-us" : undefined}>
            <span className="wp-standings__rank">{rank + 1}</span>
            <span className="wp-dot" style={{ background: t.color }} aria-hidden="true" />
            <WarTeamMark tag={t.tag} logo={t.logo} color={t.color} />
            <span className="wp-standings__name">{t.name}</span>
            <span className="wp-standings__total">{t.total}</span>
            <span className="wp-standings__gap">{rank === 0 ? "" : t.total - lead}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** A race's places, each in its team's color; the list in words for screen readers. */
function PlaceChips({ v, r }: { v: WarPageView; r: WarPageRace }) {
  if (!r.owner.length) return <span className="wp-muted">Points only (carried over)</span>;
  const words = v.teams.map((t, i) => `${t.tag} ${r.owner.flatMap((o, k) => (o === i ? [k + 1] : [])).join(", ")}`).join("; ");
  return (
    <>
      <span className="wp-places" style={{ "--wp-cols": String(Math.min(v.room, 12)) } as React.CSSProperties} aria-hidden="true">
        {r.owner.map((o, k) => <span key={k} className="wp-place" style={o >= 0 ? { background: v.teams[o].color, color: "#04121e" } : undefined}>{k + 1}</span>)}
      </span>
      <span className="sr-only">{words}</span>
    </>
  );
}

function Scoreboard({ v }: { v: WarPageView }) {
  if (v.teams.length > 2) return <Standings v={v} />;
  const gap = v.diff === 0 ? "Level" : `${v.diff > 0 ? v.us.tag : v.them.tag} +${Math.abs(v.diff)}`;
  return (
    <div className="wp-score" role="group" aria-label={`${v.us.name} ${v.us.total}, ${v.them.name} ${v.them.total}`}>
      <div className="wp-score__team">
        <WarTeamMark tag={v.us.tag} logo={v.us.logo} size="lg" />
        <span className="wp-score__tag">{v.us.tag}</span>
        <span className="wp-score__total">{v.us.total}</span>
      </div>
      <span className="wp-score__gap">{gap}</span>
      <div className="wp-score__team">
        <WarTeamMark tag={v.them.tag} logo={v.them.logo} size="lg" />
        <span className="wp-score__tag">{v.them.tag}</span>
        <span className="wp-score__total">{v.them.total}</span>
      </div>
    </div>
  );
}

function PostedTable({ v, model }: { v: WarPageView; model: TableModel }) {
  const places = placesOf(model);
  const logoFor = (tag: string) => v.teams.find((t) => t.tag.toLowerCase() === tag.toLowerCase())?.logo ?? null;
  return (
    <div className="wp-teams">
      {model.teams.filter((t) => t.players.length).map((t, i) => (
        <div key={`${t.tag}-${i}`} className="wp-team">
          <h3 className="wp-team__head">
            <WarTeamMark tag={t.tag} logo={logoFor(t.tag)} />
            <span className="wp-team__name">{t.name || t.tag}</span>
            <span className="wp-team__total">{teamTotal(t)}</span>
          </h3>
          <TableScroll label={`${t.name || t.tag}'s players`}>
            <Table>
              <TableHeader>
                <TableRow><TableHead>Player</TableHead><TableHead align="right">Score</TableHead><TableHead align="right">Place</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {t.players.map((p, j) => (
                  <TableRow key={j}>
                    <TableCell><span className="wp-player">{p.name}{p.flag && (v.flags[p.flag]
                      // eslint-disable-next-line @next/next/no-img-element -- a flag from public/ or the server's own upload
                      ? <img className="wp-flag-img" src={v.flags[p.flag]} alt={p.flag.toUpperCase()} title={p.flag.toUpperCase()} />
                      : <span className="wp-flag">{p.flag.toUpperCase()}</span>)}</span></TableCell>
                    <TableCell align="right" className="wp-num">{p.score}</TableCell>
                    <TableCell align="right" className="wp-num">{places.get(p)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableScroll>
          {t.penalty > 0 && <p className="wp-note">Penalty: {t.penalty} off.</p>}
        </div>
      ))}
    </div>
  );
}

export default async function WarPage({ params }: Props) {
  const v = await load((await params).slug);
  if (!v) notFound();
  const live = v.status === "live";
  const several = v.teams.length > 2;
  const best = v.races.reduce<{ n: number; diff: number } | null>((b, r) => (!b || Math.abs(r.diff) > Math.abs(b.diff) ? { n: r.n, diff: r.diff } : b), null);
  const behind = v.need ? v[v.need.side] : null;

  return (
    <main className="wp-page">
      {live && <WarLiveRefresh />}
      <BrowseHero
        eyebrow={live ? "Live war" : "War"}
        title={title(v)}
        sub={`${warSentence(v)} ${v.gameLabel}, ${v.date}.`}
        accent="blue"
        field="compete"
        compact
        aside={<Scoreboard v={v} />}
        actions={<WarCopyLink url={`${SITE_URL}${v.path}`} />}
      />
      <Container className="wp-body">
        {v.races.length === 0 ? (
          <section className="wp-sec wp-sec--flat"><p className="wp-note">No races went in{live ? " yet. This page fills in as they do." : "."}</p></section>
        ) : (
          <>
            <section className="wp-sec wp-sec--flat" aria-label="Totals">
              <dl className="wp-stats">
                <div><dt>Races</dt><dd>{v.played} of {v.racesTotal}</dd></div>
                {v.formatLabel !== "6v6" && <div><dt>Format</dt><dd>{v.formatLabel}</dd></div>}
                <div><dt>Races won</dt><dd>{several ? v.order.map((i) => `${v.teams[i].tag} ${v.teams[i].won}`).join(" · ") : `${v.us.tag} ${v.us.won} · ${v.them.tag} ${v.them.won}`}</dd></div>
                {!several && best && best.diff !== 0 && <div><dt>Biggest race</dt><dd>{raceText(v, best.diff)}<small>Race {best.n}</small></dd></div>}
                {live && behind && v.need && <div><dt>To catch up</dt><dd>{behind.tag} +{v.need.avg} a race<small>{v.left} {v.left === 1 ? "race" : "races"} left</small></dd></div>}
              </dl>
            </section>

            {!several && (
              <section className="wp-sec" aria-labelledby="wp-lead">
                <h2 id="wp-lead">The lead, race by race</h2>
                <WarLeadChart points={v.races.map((r) => ({ n: r.n, lead: r.lead, diff: r.diff, code: r.code }))} racesTotal={v.racesTotal} usTag={v.us.tag} themTag={v.them.tag} decidedAt={v.decidedAt} />
              </section>
            )}

            <section className="wp-sec" aria-labelledby="wp-races">
              <h2 id="wp-races">Races</h2>
              <TableScroll label="Every race (scrolls sideways on small screens)">
                {several ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Race</TableHead>
                        <TableHead>Track</TableHead>
                        <TableHead>Places</TableHead>
                        <TableHead>Won by</TableHead>
                        <TableHead>Points</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {v.races.map((r) => (
                        <TableRow key={r.n}>
                          <TableCell className="wp-num">{r.n}</TableCell>
                          <TableCell>{r.track ? <span className="wp-track">{r.code && <code className="wp-code">{r.code}</code>}{r.track}</span> : <span className="wp-muted">Not given</span>}</TableCell>
                          <TableCell><PlaceChips v={v} r={r} /></TableCell>
                          <TableCell>{r.winner == null ? <span className="wp-muted">A tie</span> : <span className="wp-winner"><span className="wp-dot" style={{ background: v.teams[r.winner].color }} aria-hidden="true" />{v.teams[r.winner].tag}</span>}</TableCell>
                          <TableCell className="wp-num">{v.teams.map((t, i) => `${t.tag} ${r.scores[i] ?? 0}`).join(" · ")}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Race</TableHead>
                        <TableHead>Track</TableHead>
                        <TableHead>{v.us.tag}&apos;s places</TableHead>
                        <TableHead>Points</TableHead>
                        <TableHead>Lead</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {v.races.map((r) => (
                        <TableRow key={r.n}>
                          <TableCell className="wp-num">{r.n}</TableCell>
                          <TableCell>{r.track ? <span className="wp-track">{r.code && <code className="wp-code">{r.code}</code>}{r.track}</span> : <span className="wp-muted">Not given</span>}</TableCell>
                          <TableCell className="wp-num">{r.spots.length ? r.spots.join(", ") : <span className="wp-muted">{v.us.tag} {r.scores[0]} : {r.scores[1]} {v.them.tag}</span>}</TableCell>
                          <TableCell className="wp-num">{raceText(v, r.diff)}</TableCell>
                          <TableCell className="wp-num">{leadText(v, r.lead)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </TableScroll>
              {v.penalties.length > 0 && <p className="wp-note">Penalties: {v.penalties.map((p) => `${p.points} off ${p.tag}${p.reason ? ` (${p.reason})` : ""}`).join(", ")}.</p>}
            </section>
          </>
        )}

        {v.table && (
          <section className="wp-sec" aria-labelledby="wp-table">
            <h2 id="wp-table">The table</h2>
            <PostedTable v={v} model={v.table} />
          </section>
        )}

        {compAppLive() && (
          <section className="wp-sec">
            <p className="wp-note">Scored in Discord with GameShuffle Competitive. <ArrowLink href="/mario-kart-discord-bot">Score your own wars</ArrowLink></p>
          </section>
        )}
      </Container>
    </main>
  );
}
