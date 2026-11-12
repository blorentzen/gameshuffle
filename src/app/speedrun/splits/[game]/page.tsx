import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BrowseHero } from "@/components/events/BrowseHero";
import { FaqList } from "@/components/marketing/FaqList";
import { MarketingJsonLd } from "@/components/marketing/MarketingJsonLd";
import { LssDownload } from "@/components/speedrun/LssDownload";
import { ArrowLink } from "@/components/ui/ArrowLink";
import { boxArt } from "@/data/game-catalog";
import { ROSTER_CHECKED, SPEEDRUN_ROSTER, rosterGame, type RosterCategory, type RosterGame } from "@/data/speedrun/roster";
import { gameEntry } from "@/lib/games/key";
import { speedrunShown } from "@/lib/games-visibility";
import { groupedNames } from "@/lib/speedrun/splitGroups";
import "@/styles/speedrun-splits.css";

/**
 * /speedrun/splits/<game> (roster picks 2026-11-11, pick 12): one game's ready-made split lists, in the order runners
 * split, with a LiveSplit download and the way to use them on GameShuffle's overlay and in races. Static, one page per
 * roster game (src/data/speedrun/roster.ts).
 */

export const dynamicParams = false;
export const generateStaticParams = () => SPEEDRUN_ROSTER.map((g) => ({ game: g.key }));

const BASE = "https://www.gameshuffle.co";
const nameOf = (g: RosterGame) => gameEntry(g.key)?.name ?? g.title;
const count = (c: RosterCategory) => c.groups.reduce((a, g) => a + g.names.length, 0);
const timing = (g: RosterGame) => (g.timing === "RTA" ? "timed in real time on the boards" : "timed in-game, with loads removed");
const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };
const checked = new Date(`${ROSTER_CHECKED}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

function faqFor(g: RosterGame) {
  return [
    { q: "Where do these splits come from?", a: `From ${g.title}'s own level, chapter, star and boss names, in the order runners split them, checked against runners' route guides (each list links them). Routes change, so treat a list as a starting point.` },
    { q: "How do I open them in LiveSplit?", a: "Download a list, then right-click LiveSplit and pick Open Splits. The file has the names and groups, with no times: your PB and best segments fill in as you run." },
    { q: "Can I race someone with these splits?", a: `Yes. Set a list as your splits on GameShuffle's speedrun page, make a race there and share its link. Everyone's splits need the same count, and GameShuffle starts every timer at once.${g.key === "minecraft" ? " A Minecraft race can give everyone one seed when the countdown starts." : ""}` },
  ];
}

type Params = { params: Promise<{ game: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const g = rosterGame((await params).game);
  if (!g) return {};
  const name = nameOf(g);
  const cats = g.categories.map((c) => c.name).join(" and ");
  const title = `${name} Speedrun Splits for LiveSplit`;
  const description = `${name} split lists for ${cats}, in the order runners split them. Download for LiveSplit or use them with GameShuffle's free speedrun overlay.`;
  const url = `${BASE}/speedrun/splits/${g.key}`;
  return {
    title, description, alternates: { canonical: url },
    openGraph: { title, description, url, siteName: "GameShuffle", type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function RosterGamePage({ params }: Params) {
  if (!speedrunShown()) notFound();
  const g = rosterGame((await params).game);
  if (!g) notFound();
  const name = nameOf(g);
  const art = boxArt(gameEntry(g.key));
  const faq = faqFor(g);
  return (
    <main className="srs-page">
      <MarketingJsonLd breadcrumb={{ label: `${name} splits`, path: `/speedrun/splits/${g.key}`, parent: { label: "Speedrun splits", path: "/speedrun/splits" } }} faq={faq} />
      <BrowseHero
        eyebrow="Speedrun splits"
        title={`${name} speedrun splits`}
        sub={`Split lists for ${g.categories.map((c) => c.name).join(" and ")}, in the order runners split them. Download one for LiveSplit, or use it on GameShuffle's speedrun overlay and in races.`}
        subShort={`${g.categories.map((c) => c.name).join(" and ")}, ready for LiveSplit.`}
        accent="blue"
        field="compete"
        backdrop={art}
        compact
      />
      <div className="srs-body">
        {g.categories.map((c) => {
          const names = groupedNames(c.groups);
          let n = 0;
          return (
            <section key={c.id} className="srs-sec" aria-labelledby={`srs-${c.id}`}>
              <h2 id={`srs-${c.id}`}>{c.name}</h2>
              <p className="srs-meta">{count(c)} splits · {timing(g)}</p>
              <div className="srs-lists">
                {c.groups.map((grp, i) => {
                  const start = n + 1;
                  n += grp.names.length;
                  return (
                    <div key={i} className="srs-group">
                      {grp.group && <h3>{grp.group}</h3>}
                      <ol start={start}>{grp.names.map((s) => <li key={s}>{s}</li>)}</ol>
                    </div>
                  );
                })}
              </div>
              <div className="srs-acts">
                <LssDownload game={g.title} category={c.name} names={names} from={`splits-page:${g.key}`} />
                <ArrowLink href="/speedrun#splits">Use it on your overlay</ArrowLink>
              </div>
              <details className="srs-about">
                <summary>About this list</summary>
                <p>{c.notes}</p>
                <p className="srs-src">Checked {checked} against {c.sources.map((u, i) => (
                  <span key={u}>{i > 0 && (i === c.sources.length - 1 ? " and " : ", ")}<a href={u} target="_blank" rel="nofollow noopener noreferrer">{host(u)}</a></span>
                ))}.</p>
              </details>
            </section>
          );
        })}

        <section className="srs-sec" aria-labelledby="srs-race">
          <h2 id="srs-race">Race it</h2>
          <p>Put one of these lists on your speedrun setup, then make a race: GameShuffle starts every runner{"'"}s timer at once and shows who{"'"}s ahead at every split, on stream and on the race{"'"}s page.</p>
          <ArrowLink href="/speedrun">Your speedrun overlay and races</ArrowLink>
        </section>

        <section className="srs-sec" aria-labelledby="srs-faq">
          <h2 id="srs-faq">Questions</h2>
          <FaqList items={faq} />
        </section>

        <section className="srs-sec" aria-labelledby="srs-more">
          <h2 id="srs-more">Splits for other games</h2>
          <ul className="srs-more">
            {SPEEDRUN_ROSTER.filter((x) => x.key !== g.key).map((x) => <li key={x.key}><ArrowLink href={`/speedrun/splits/${x.key}`}>{nameOf(x)}</ArrowLink></li>)}
          </ul>
        </section>
      </div>
    </main>
  );
}
