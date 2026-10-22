import type { Metadata } from "next";
import Link from "next/link";
import { IconChessKnight, IconLayoutGrid, IconTournament } from "@tabler/icons-react";
import { FreeToolShell } from "@/components/tools/FreeToolShell";
import { MarketingJsonLd } from "@/components/marketing/MarketingJsonLd";
import { FaqList } from "@/components/marketing/FaqList";
import { PlansPanel } from "@/components/marketing/PlansPanel";
import { BracketTool, type ToolPage } from "@/components/brackets/BracketTool";
import { BRACKET_TOOLS, BRACKET_TOOL_LIST } from "@/data/bracket-tools";
import "@/styles/brackets.css";

const ICONS = { elim: IconTournament, roundrobin: IconLayoutGrid, swiss: IconChessKnight } as const;
const SITE = "https://www.gameshuffle.co";

export function bracketToolMetadata(page: ToolPage): Metadata {
  const c = BRACKET_TOOLS[page];
  return {
    title: c.metaTitle,
    description: c.description,
    alternates: { canonical: `${SITE}${c.path}` },
    openGraph: { title: c.metaTitle, description: c.description, url: `${SITE}${c.path}`, siteName: "GameShuffle", type: "website" },
    twitter: { card: "summary_large_image", title: c.metaTitle, description: c.description },
  };
}

/**
 * One of the three free bracket tool pages: the tool, how it works, notes on
 * the format, a free account and GS Circuit (a live tournament is where the
 * paid field sizes live, so the tool sends people there rather than standing
 * in for it), the questions, and the other two tools.
 */
export function BracketToolPage({ page }: { page: ToolPage }) {
  const c = BRACKET_TOOLS[page];
  const others = BRACKET_TOOL_LIST.filter((t) => t.page !== page);
  return (
    <main>
      <MarketingJsonLd
        appName={c.name}
        appDescription={c.description}
        appUrl={c.path}
        appCategory="UtilitiesApplication"
        breadcrumb={{ label: c.name, path: c.path, parent: { label: "Free tools", path: "/tools" } }}
        faq={c.faq}
        howTo={{ name: `How to use the ${c.name.toLowerCase()}`, steps: c.steps }}
      />
      <FreeToolShell icon={ICONS[page]} name={c.name} lede={c.lede}>
        <BracketTool page={page} />

        <div className="bt-copy">
          <section aria-labelledby="bt-how">
            <h2 id="bt-how">How it works</h2>
            <ol className="bt-steps">
              {c.steps.map((s) => (
                <li key={s.name}><strong>{s.name}</strong><span>{s.text}</span></li>
              ))}
            </ol>
          </section>
          {c.notes.map((n) => (
            <section key={n.title}>
              <h2>{n.title}</h2>
              {n.body.map((p) => <p key={p.slice(0, 24)}>{p}</p>)}
            </section>
          ))}
        </div>

        <PlansPanel
          id="run-it-live"
          title="Take your tournaments further"
          rows={["account", "circuit"]}
          from={`bracket-tool-${page}`}
          copy={{
            account: { name: "Keep every tournament", body: "A free account gives each event its own page people can find and join, keeps the players and results, and runs it live from your phone." },
            circuit: { name: "Run bigger events", body: "Fields of 64 or 256, championship seasons, co-organizers and your branding on the tournament page." },
          }}
          cta={{ account: { label: "Start a tournament", href: "/tournament/create" } }}
        />

        <div className="bt-copy">
          <section aria-labelledby="bt-faq">
            <h2 id="bt-faq">Questions</h2>
            <FaqList items={c.faq} />
          </section>
          <section aria-labelledby="bt-more">
            <h2 id="bt-more">More free tournament tools</h2>
            <ul className="bt-related">
              {others.map((t) => <li key={t.path}><Link href={t.path}>{t.name}</Link></li>)}
              <li><Link href="/tournament">Browse tournaments</Link></li>
              <li><Link href="/tools">Every free tool</Link></li>
            </ul>
          </section>
        </div>
      </FreeToolShell>
    </main>
  );
}
