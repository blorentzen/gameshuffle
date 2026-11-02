import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Container } from "@empac/cascadeds";
import { IconBroadcast, IconChartLine, IconChecklist, IconGavel, IconLayoutDashboard, IconUsersGroup } from "@tabler/icons-react";
import { BrowseHero } from "@/components/events/BrowseHero";
import { RowPanel } from "@/components/marketing/RowPanel";
import { FaqList } from "@/components/marketing/FaqList";
import { ArrowLink } from "@/components/ui/ArrowLink";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { roleInLounge } from "@/lib/ladders/access";
import { laddersForDiscord, laddersOpen, laddersReady } from "@/lib/ladders/store";
import { ladderPath, ladderStaffPath, RANKED } from "@/lib/ladders/types";
import { RANKED_HELP_PUBLIC } from "@/lib/help/ranked";
import "@/styles/lounge.css";
import "@/styles/ladders.css";

/**
 * GS Ranked's own page (name, web and docs pick 10A): what it gives a lounge, for staff thinking of moving, with the
 * help links and Talk to us; signed-in players get their lounges. Behind the ladders switch like the lounge pages, and
 * noindex until GS Ranked is announced.
 */

export const dynamic = "force-dynamic";

const CONTACT = "/contact-us?topic=lounge";

export const metadata: Metadata = {
  title: "GS Ranked: run your lounge on GameShuffle",
  description: "Tables, MMR and standings for a Mario Kart lounge, run from its Discord and the web. Free for lounges and their players.",
  robots: { index: RANKED_HELP_PUBLIC, follow: RANKED_HELP_PUBLIC },
};

async function yourLounges() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await createServiceClient().from("users").select("discord_id").eq("id", user.id).maybeSingle();
  const discordId = (data as { discord_id: string | null } | null)?.discord_id;
  if (!discordId) return [];
  const mine = await laddersForDiscord(discordId);
  return Promise.all(mine.map(async ({ ladder, player }) => ({ ladder, player, staff: ["admin", "updater"].includes((await roleInLounge(ladder, discordId).catch(() => ({ role: "outside" }))).role) })));
}

export default async function RankedPage() {
  if (!(await laddersReady()) || !(await laddersOpen())) notFound();
  const mine = await yourLounges();

  return (
    <main className="ladder-page">
      <BrowseHero
        eyebrow={RANKED.name}
        title="Run your lounge on GameShuffle"
        sub="Tables, MMR and standings for your lounge, run from your Discord and the web. Free for lounges and their players."
        accent="blue"
        field="compete"
        primary={{ href: CONTACT, label: "Talk to us" }}
        secondary={{ href: "/help/ranked/moving", label: "How moving works" }}
      />
      <Container className="lounge-body">
        {mine && mine.length > 0 && (
          <section className="lounge-sec lounge-sec--flat" aria-labelledby="ranked-yours">
            <h2 id="ranked-yours">Your lounges</h2>
            <ul className="ranked-staff__list">
              {mine.map(({ ladder, player, staff }) => (
                <li key={ladder.id} className="ranked-staff__row">
                  <div className="ranked-staff__row-main">
                    <Link className="ranked-staff__row-title" href={ladderPath(ladder.slug)}>{ladder.name}</Link>
                    <span className="ladder-muted">You play as {player.name}</span>
                  </div>
                  {staff && <ArrowLink href={ladderStaffPath(ladder.slug)}>Staff page</ArrowLink>}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="lounge-sec lounge-sec--flat" aria-labelledby="ranked-gets">
          <h2 id="ranked-gets">What your lounge gets</h2>
          <RowPanel across={false} rows={[
            { key: "tables", Icon: IconChecklist, tone: "blue", title: "Tables that check themselves", text: "Tables come in from Discord or the web with the screenshot read. Clean ones verify on their own; the rest wait for your updaters with the reason." },
            { key: "mmr", Icon: IconChartLine, tone: "violet", title: "MMR on your rules", text: "MKCentral's model or the 200 Lounge's rules, your divisions, and a page for every player and every table." },
            { key: "staff", Icon: IconLayoutDashboard, tone: "teal", title: "A staff page", text: "Tables, players, penalties, seasons and settings, with a log of every action. Your Discord roles decide who gets in." },
            { key: "queue", Icon: IconUsersGroup, tone: "green", title: "A queue, if you want one", text: "Always open or rush hour, a format vote, teams drawn by MMR, hosts and subs." },
            { key: "rules", Icon: IconGavel, tone: "orange", title: "Penalties and seasons", text: "Penalties, strikes and breaks, appeals and name changes, and seasons with a soft or full reset." },
            { key: "stream", Icon: IconBroadcast, tone: "magenta", title: "Your players on stream", text: "Every player's MMR card, live after each table." },
          ]} />
        </section>

        <section className="lounge-sec" aria-labelledby="ranked-steps">
          <h2 id="ranked-steps">How moving works</h2>
          <ol className="ranked-steps">
            <li>Talk to us about your lounge.</li>
            <li>Add GameShuffle Competitive to your server and run <code>/ranked setup</code>.</li>
            <li>We bring in your earlier seasons from your old bot.</li>
            <li>Your players tie their Discord to their names with <code>/ranked join</code>.</li>
          </ol>
          <ArrowLink href="/help/ranked/moving">Every step</ArrowLink>
        </section>

        <section className="lounge-sec" aria-labelledby="ranked-help">
          <h2 id="ranked-help">Help</h2>
          <div className="ranked-gate__links">
            <ArrowLink href="/help/ranked#ranked-players">For players</ArrowLink>
            <ArrowLink href="/help/ranked#ranked-staff">For lounge staff</ArrowLink>
            <ArrowLink href="/help/ranked#ranked-reference">Reference</ArrowLink>
            <ArrowLink href="/help/ranked/ja">日本語</ArrowLink>
          </div>
        </section>

        <section className="lounge-sec" aria-labelledby="ranked-faq">
          <h2 id="ranked-faq">Questions</h2>
          <FaqList items={[
            { q: "Is it free?", a: "Yes, for lounges and their players." },
            { q: "Can we keep our history?", a: "Yes. We import your earlier seasons from your old bot, and they stay on your lounge's page under the Season menu." },
            { q: "What about players coming from MKCentral?", a: <>We find their MKCentral lounge record by their Discord and start them from it, with nothing to type. <Link href="/help/ranked/from-mkcentral">How the start is worked out</Link>.</> },
            { q: "Is anything public before we're ready?", a: "No. Your lounge isn't announced until you say so." },
          ]} />
          <p className="ladder-note">Something else? <Link href={CONTACT}>Talk to us</Link>.</p>
        </section>
      </Container>
    </main>
  );
}
