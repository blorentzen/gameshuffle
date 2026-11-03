import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import { notFound } from "next/navigation";
import { Container, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@empac/cascadeds";
import { BrowseHero } from "@/components/events/BrowseHero";
import { TableScroll } from "@/components/ui/TableScroll";
import { ArrowLink } from "@/components/ui/ArrowLink";
import { Delta } from "@/components/ladders/LadderBits";
import { roomPlaces, tableTitle, type Change } from "@/lib/ladders/rules";
import { getLadder, laddersOpen, laddersReady, tableByNumber, tableChanges, tableRoom, type LadderTable } from "@/lib/ladders/store";
import { ladderPath, ladderPlayerPath, ladderTablePath, type Ladder } from "@/lib/ladders/types";
import { shareMeta } from "@/lib/og/meta";
import "@/styles/lounge.css";
import "@/styles/ladders.css";

/** One table on a lounge ladder: who played, their scores or places, and what it did to their MMR once verified. */

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string; number: string }> };

const load = cache(async (slug: string, n: string): Promise<{ ladder: Ladder; table: LadderTable; changes: Change[] } | null> => {
  if (!(await laddersReady()) || !(await laddersOpen())) return null;
  const ladder = await getLadder({ slug });
  if (!ladder) return null;
  const table = await tableByNumber(ladder.id, Number(n));
  if (!table) return null;
  return { ladder, table, changes: table.status === "verified" ? await tableChanges(table) : [] };
});

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" }) : "");
const place = (p: number) => `${p}${p % 10 === 1 && p !== 11 ? "st" : p % 10 === 2 && p !== 12 ? "nd" : p % 10 === 3 && p !== 13 ? "rd" : "th"}`;

/** The lounge's own number for an imported table (its "#source" line). */
const sourceRef = (t: LadderTable) => /^#source\s+(\S+)/m.exec(t.body)?.[1] ?? null;
const imported = (t: LadderTable) => t.submittedBy === "import";

const statusLine = (t: LadderTable) => (imported(t) ? `From the lounge's own records${sourceRef(t) ? ` (its table ${sourceRef(t)})` : ""}, played ${when(t.createdAt)} Pacific.${t.note ? ` ${t.note}` : ""}` : ({
  pending: "Waiting on an updater. MMR moves once it's verified.",
  verified: `Verified by ${t.verifiedByName ?? "an updater"}, ${when(t.verifiedAt)} Pacific.`,
  denied: `Sent back by ${t.verifiedByName ?? "an updater"}.${t.note ? ` ${t.note}` : ""} It didn't count.`,
  undone: `${t.note ?? "Undone"}. It no longer counts.`,
}[t.status]));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await params;
  const got = await load(p.slug, p.number);
  if (!got) return { title: "Table", robots: { index: false } };
  const title = `${got.ladder.name} · ${tableTitle(got.table, got.ladder.kind)}`;
  const description = statusLine(got.table);
  return { title, description, robots: { index: false, follow: true }, ...shareMeta({ title, description, path: ladderTablePath(got.ladder.slug, got.table.number) }) };
}

export default async function LadderTablePage({ params }: Props) {
  const p = await params;
  const got = await load(p.slug, p.number);
  if (!got) notFound();
  const { ladder, table, changes } = got;
  const room = tableRoom(ladder, table);
  const places = roomPlaces(room);
  const byKey = new Map(changes.map((c) => [c.key, c]));
  const verified = table.status === "verified";

  const playerCell = (name: string, key: string) => (verified && byKey.has(key) ? <Link href={ladderPlayerPath(ladder.slug, byKey.get(key)!.name)}>{name}</Link> : name);
  const cols = (
    <TableRow>
      <TableHead>Player</TableHead>
      {ladder.kind === "race" && <TableHead align="right">Score</TableHead>}
      <TableHead align="right">Place</TableHead>
      {verified && <TableHead align="right">Change</TableHead>}
      {verified && <TableHead align="right">MMR</TableHead>}
    </TableRow>
  );
  const rowFor = (key: string, name: string, score: number | null, at: number) => {
    const c = byKey.get(key);
    return (
      <TableRow key={key}>
        <TableCell>{playerCell(name, key)}</TableCell>
        {ladder.kind === "race" && <TableCell align="right" className="ladder-num">{score ?? ""}</TableCell>}
        <TableCell align="right" className="ladder-num">{place(at)}</TableCell>
        {verified && <TableCell align="right" className="ladder-num">{c ? <Delta n={c.delta} /> : ""}</TableCell>}
        {verified && <TableCell align="right" className="ladder-num">{c ? c.after.toLocaleString("en-US") : ""}</TableCell>}
      </TableRow>
    );
  };

  return (
    <main className="ladder-page">
      <BrowseHero
        eyebrow={ladder.name}
        title={`Table ${table.number}`}
        sub={tableTitle(table, ladder.kind).replace(`Table ${table.number} · `, "")}
        accent="blue"
        field="compete"
        compact
        actions={<ArrowLink href={ladderPath(ladder.slug)}>{ladder.name} standings</ArrowLink>}
      />
      <Container className="lounge-body">
        <section className="lounge-sec lounge-sec--flat">
          <p className={table.status === "verified" ? "ladder-note" : "ladder-status"}>{statusLine(table)}</p>
        </section>
        <section className="lounge-sec" aria-labelledby="ladder-room">
          <h2 id="ladder-room">The room</h2>
          {ladder.kind === "race" && room.format > 1 ? (
            <div className="ladder-teams">
              {room.teams.map((t, i) => (
                <div key={i} className="ladder-team">
                  <h3 className="ladder-team__head"><span className="ladder-team__name">{t.label}</span><span className="ladder-team__total">{t.total}</span></h3>
                  <TableScroll label={`${t.label}'s players`}>
                    <Table>
                      <TableHeader>{cols}</TableHeader>
                      <TableBody>{t.players.map((pl) => rowFor(pl.key, pl.name, pl.score, places.find((x) => x.player.key === pl.key)?.place ?? 0))}</TableBody>
                    </Table>
                  </TableScroll>
                  {t.penalty > 0 && <p className="ladder-note">Penalty: {t.penalty} off.</p>}
                </div>
              ))}
            </div>
          ) : (
            <TableScroll label="Every player (scrolls sideways on small screens)">
              <Table>
                <TableHeader>{cols}</TableHeader>
                <TableBody>{[...places].sort((a, b) => a.place - b.place).map((x) => rowFor(x.player.key, x.player.name, x.player.score, x.place))}</TableBody>
              </Table>
            </TableScroll>
          )}
        </section>
        <section className="lounge-sec">
          <p className="ladder-note">{imported(table) ? "Brought in from the lounge's records." : `Submitted by ${table.submittedByName ?? "a reporter"}.`} Ranked on GameShuffle.</p>
        </section>
      </Container>
    </main>
  );
}
