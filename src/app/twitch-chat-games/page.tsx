import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumb, Container } from "@empac/cascadeds";
import { AuthAwareCTA } from "@/components/marketing/AuthAwareCTA";
import { FaqList } from "@/components/marketing/FaqList";
import { CHAT_GAMES_CHECKED, CHAT_GAMES_FAQ, CHAT_GAMES_GUIDE } from "@/data/chat-games";
import { SITE_URL } from "@/lib/seo";
import "@/styles/chat-games.css";

const PATH = "/twitch-chat-games";
const TITLE = `Twitch Chat Games: ${CHAT_GAMES_GUIDE.length} Games Your Chat Can Play`;
const DESCRIPTION = "Games your Twitch chat can play while you stream: survey boards, trivia, bingo, polls, drafts, viewer battles and games that run while you're on a break. What chat does and the command that starts each one.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}${PATH}` },
  openGraph: { title: TITLE, description: DESCRIPTION, url: `${SITE_URL}${PATH}`, siteName: "GameShuffle", type: "article" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

/**
 * /twitch-chat-games: the chat games guide (search pages round, picks
 * 2026-10-20): only games GameShuffle runs, each with what chat does, the
 * command that starts it and a picture of it on stream; ends on GS Pro.
 * Copy in src/data/chat-games.ts.
 */
export default function TwitchChatGamesPage() {
  const url = `${SITE_URL}${PATH}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        headline: TITLE,
        description: DESCRIPTION,
        mainEntityOfPage: url,
        dateModified: CHAT_GAMES_CHECKED,
        author: { "@type": "Organization", name: "GameShuffle", url: SITE_URL },
        publisher: { "@type": "Organization", name: "GameShuffle", url: SITE_URL },
      },
      {
        "@type": "ItemList",
        itemListElement: CHAT_GAMES_GUIDE.map((g, i) => ({ "@type": "ListItem", position: i + 1, name: g.name, url: `${url}#${g.id}` })),
      },
      {
        "@type": "FAQPage",
        mainEntity: CHAT_GAMES_FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
          { "@type": "ListItem", position: 2, name: "For streamers", item: `${SITE_URL}/for-streamers` },
          { "@type": "ListItem", position: 3, name: "Twitch chat games", item: url },
        ],
      },
    ],
  };

  return (
    <main className="cg-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Container>
        <article className="cg">
          <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "For streamers", href: "/for-streamers" }, { label: "Twitch chat games" }]} />
          <header className="cg__head">
            <p className="marketing-eyebrow">For streamers</p>
            <h1 className="cg__title">{TITLE}</h1>
            <p className="cg__lede">
              The best streams turn watchers into players. These are games your viewers play from chat while you stream, what chat does in each one, and the command that starts it. Every one runs on GameShuffle, with a piece for your OBS overlay.
            </p>
          </header>

          <nav className="cg__toc" aria-labelledby="cg-toc">
            <h2 id="cg-toc" className="cg__toc-title">The games</h2>
            <ol>
              {CHAT_GAMES_GUIDE.map((g) => <li key={g.id}><a href={`#${g.id}`}>{g.name}</a></li>)}
            </ol>
          </nav>

          {CHAT_GAMES_GUIDE.map((g, i) => (
            <section key={g.id} id={g.id} className="cg-game" aria-labelledby={`${g.id}-title`}>
              <h2 id={`${g.id}-title`} className="cg-game__title"><span className="cg-game__num" aria-hidden>{i + 1}</span>{g.name}</h2>
              {g.shot && (
                <figure className="cg-game__shot">
                  {/* eslint-disable-next-line @next/next/no-img-element -- a static screenshot, sized by CSS */}
                  <img src={`/images/guides/chat-games/${g.shot}`} alt={g.shotAlt ?? `${g.name} on a stream overlay`} width={g.shotSize?.[0] ?? 1280} height={g.shotSize?.[1] ?? 720} loading={i > 1 ? "lazy" : undefined} />
                </figure>
              )}
              <p>{g.does}</p>
              <dl className="cg-game__facts">
                <div><dt>Start it</dt><dd>{g.start.startsWith("!") ? <code>{g.start}</code> : g.start}</dd></div>
                <div><dt>Chat types</dt><dd>{g.chat.startsWith("!") ? <code>{g.chat}</code> : g.chat}{g.chatNote ? <span className="cg-game__note"> {g.chatNote}</span> : null}</dd></div>
                <div><dt>Good for</dt><dd>{g.fits}</dd></div>
              </dl>
              {g.help && <p className="cg-game__more"><Link href={g.help.href}>{g.help.label}</Link></p>}
            </section>
          ))}

          <section className="cg-cta" aria-labelledby="cg-cta">
            <h2 id="cg-cta">Play them on your stream</h2>
            <p>
              Connect Twitch in GameShuffle and the games are ready: the bot joins your chat, one browser source adds the overlay to OBS or Streamlabs, and your live page lets viewers play along from their phones. The streaming tools are part of GS Pro.
            </p>
            <div className="cg-cta__actions">
              <AuthAwareCTA variant="primary" trackFrom="chat-games-guide" overrides={{
                anon: { label: "Try GS Pro free", href: "/gs-pro" },
                free: { label: "Try GS Pro free", href: "/gs-pro" },
                pro: { label: "Open your stream settings", href: "/account/streaming" },
              }} />
              <Link href="/for-streamers" className="cg-cta__more">How GameShuffle works for streamers</Link>
            </div>
          </section>

          <section className="cg-faq" aria-labelledby="cg-faq">
            <h2 id="cg-faq">Questions streamers ask</h2>
            <FaqList items={CHAT_GAMES_FAQ} />
          </section>
        </article>
      </Container>
    </main>
  );
}
