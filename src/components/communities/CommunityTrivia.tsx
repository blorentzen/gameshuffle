import Link from "next/link";
import { Badge, Card } from "@empac/cascadeds";
import type { CrewTriviaRecord } from "@/lib/trivia/crews";

const placeWord = (n: number) => {
  const r10 = n % 10, r100 = n % 100;
  if (r10 === 1 && r100 !== 11) return `${n}st`;
  if (r10 === 2 && r100 !== 12) return `${n}nd`;
  if (r10 === 3 && r100 !== 13) return `${n}rd`;
  return `${n}th`;
};
const day = (iso: string | null) => (iso ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "America/Los_Angeles" }).format(new Date(iso)) : "");

/** A crew's trivia record on its community page: nights played as the crew, wins, its league and recent nights. */
export function CommunityTrivia({ record }: { record: CrewTriviaRecord }) {
  return (
    <Card padding="large" className="community-trivia">
      <div className="community-trivia__head">
        <h2 className="profile-section-heading" style={{ margin: 0 }}>Trivia</h2>
        {record.league && (
          <Link href={`/trivia/leagues/${record.league.slug}`} className="community-trivia__league">
            <Badge variant="warning" size="small">{record.league.rank ? `${placeWord(record.league.rank)} · ` : ""}{record.league.title}</Badge>
          </Link>
        )}
      </div>
      <dl className="community-trivia__stats">
        <div><dt>Nights</dt><dd>{record.nights}</dd></div>
        <div><dt>Wins</dt><dd>{record.wins}</dd></div>
        <div><dt>Best</dt><dd>{record.bestPlace ? placeWord(record.bestPlace) : "None"}</dd></div>
        <div><dt>Last night</dt><dd>{day(record.lastAt) || "None"}</dd></div>
      </dl>
      <ul className="community-trivia__nights">
        {record.recent.map((n) => (
          <li key={n.gameId}>
            <span className="community-trivia__night-title">{n.title}</span>
            <span className="community-trivia__night-meta">{placeWord(n.place)} of {n.teams}{n.leaguePoints !== null ? ` · +${n.leaguePoints} league points` : ""}{n.date ? ` · ${day(n.date)}` : ""}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
