/**
 * /c/<slug>/commands: a streamer's chat commands for viewers (2026-10-10).
 * Only what's switched on and works on their stream, in plain words, with
 * mod commands in a closed section. Prints as a one-sheet and copies as a
 * pinned Discord message. `!commands` in chat links here ({commands_link}).
 * Same list as Streaming ▸ Chat ▸ Commands (src/lib/commands/catalog.ts).
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@empac/cascadeds";
import { getCommunityBySlug } from "@/lib/communities/membership";
import { commandCatalog, type CatalogCommand } from "@/lib/commands/catalog";
import { COMMAND_GROUPS } from "@/lib/twitch/commands/guide";
import { getOwnerThemeVars } from "@/lib/theme/owner-theme";
import { CommandSheetActions } from "@/components/commands/CommandSheetActions";
import "@/styles/commands-sheet.css";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

const nameOf = (c: { displayName: string | null; slug: string }) => c.displayName || c.slug;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const community = await getCommunityBySlug(slug);
  if (!community) return { title: "Commands not found" };
  const name = nameOf(community);
  return {
    title: `${name}'s chat commands`,
    description: `Every command you can type in ${name}'s chat, what it does and how to use it.`,
    robots: { index: false, follow: true },
  };
}

function Group({ label, rows }: { label: string; rows: CatalogCommand[] }) {
  return (
    <section className="cmd-sheet__group">
      <h2 className="cmd-sheet__group-title">{label}</h2>
      <ul className="cmd-sheet__list">
        {rows.map((c) => (
          <li key={c.key} className="cmd-sheet__item">
            <code className="cmd-sheet__typed">{c.typed}</code>
            <span className="cmd-sheet__what">{c.summary}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default async function CommandsSheetPage({ params }: Props) {
  const { slug } = await params;
  const community = await getCommunityBySlug(slug);
  if (!community || !community.ownerUserId || community.kind !== "channel") notFound();

  const [{ commands }, themeVars] = await Promise.all([
    commandCatalog(community.ownerUserId, community.id),
    getOwnerThemeVars(community.ownerUserId),
  ]);
  const live = commands.filter((c) => c.on && c.works && !c.shadowedBy);
  const groupsFor = (who: CatalogCommand["who"]) =>
    COMMAND_GROUPS.map((g) => ({ ...g, rows: live.filter((c) => c.group === g.id && c.who === who) })).filter((g) => g.rows.length);
  const everyone = groupsFor("everyone");
  const mods = groupsFor("mods");
  const name = nameOf(community);

  const discordText = [
    `**${name}'s chat commands**`,
    ...everyone.map((g) => `\n**${g.label}**\n${g.rows.map((c) => `\`${c.typed}\` ${c.summary}`).join("\n")}`),
    `\nThe full list: https://www.gameshuffle.co/c/${community.slug}/commands`,
  ].join("\n");

  return (
    <main className="cmd-sheet" style={themeVars}>
      <Container>
        <header className="cmd-sheet__head">
          <div>
            <p className="cmd-sheet__eyebrow">Chat commands</p>
            <h1 className="cmd-sheet__title">{name}&rsquo;s chat commands</h1>
            <p className="cmd-sheet__intro">
              Type these in {name}&rsquo;s chat. Most work any time {name} is live with GameShuffle; a few only during certain games.
            </p>
          </div>
          <div className="cmd-sheet__side">
            <CommandSheetActions discordText={discordText} />
            <p className="cmd-sheet__links">
              <Link href={`/live/${encodeURIComponent(community.slug)}`}>Play along live</Link>
              {" · "}
              <Link href={`/c/${encodeURIComponent(community.slug)}`}>{name}&rsquo;s community</Link>
            </p>
          </div>
        </header>

        {everyone.length === 0 ? (
          <p className="cmd-sheet__empty">{name} hasn&rsquo;t switched any commands on yet.</p>
        ) : (
          <div className="cmd-sheet__grid">
            {everyone.map((g) => <Group key={g.id} label={g.label} rows={g.rows} />)}
          </div>
        )}

        {mods.length > 0 && (
          <details className="cmd-sheet__mods">
            <summary>For {name}&rsquo;s mods</summary>
            <div className="cmd-sheet__grid">
              {mods.map((g) => <Group key={g.id} label={g.label} rows={g.rows} />)}
            </div>
          </details>
        )}

        <p className="cmd-sheet__foot">
          Runs on <Link href="/">GameShuffle</Link>.
        </p>
      </Container>
    </main>
  );
}
