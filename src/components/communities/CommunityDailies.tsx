import Link from "next/link";
import { Card } from "@empac/cascadeds";
import { IconFlame, IconPokeball, IconPuzzle } from "@tabler/icons-react";
import { groupLine, type GroupGame, type GroupStreak } from "@/lib/daily/groupRules";
import "@/styles/dailies-together.css";

const GAMES: Record<GroupGame, { name: string; href: string; icon: typeof IconPuzzle }> = {
  shuffle: { name: "The Daily Shuffle", href: "/daily", icon: IconPuzzle },
  dex: { name: "The Daily Dex", href: "/daily-dex", icon: IconPokeball },
};

/**
 * The crew's streaks on the dailies (co-op picks 2026-11-11) on its community
 * page: how many of the crew solved today and how many days running. Shown
 * once the crew has solved something; counts only, never names.
 */
export function CommunityDailies({ rows }: { rows: { game: GroupGame; streak: GroupStreak }[] }) {
  return (
    <Card padding="large" className="dailies-groups">
      <h2 className="profile-section-heading" style={{ margin: 0 }}>Dailies together</h2>
      <ul className="dailies-groups__list">
        {rows.map(({ game, streak }) => {
          const g = GAMES[game];
          return (
            <li key={game} className="dailies-groups__row">
              <span className={`dailies-groups__mark${streak.today ? " is-on" : ""}`} aria-hidden>{streak.streak > 0 ? <IconFlame size={18} stroke={2} /> : <g.icon size={18} stroke={2} />}</span>
              <span className="dailies-groups__text">
                <strong><Link href={g.href}>{g.name}</Link></strong>
                <span>{groupLine(streak, false)}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
