"use client";

/**
 * Group streaks on a daily's end screen (co-op picks 2026-11-11): your crews
 * and the people you follow, each with how many solved today and how many
 * days running (src/lib/daily/groupRules.ts). Signed in only, never in the
 * Discord Activity, hidden when you have no crew and follow nobody. It sits
 * right under your own streak, where you look the moment you've finished.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { IconFlame, IconUsersGroup } from "@tabler/icons-react";
import { useDailies } from "@/components/originals/Dailies";
import { useOriginalsHost } from "@/components/originals/OriginalsHost";
import { groupLine, type GroupGame, type GroupStreak } from "@/lib/daily/groupRules";
import "@/styles/dailies-together.css";

export function DailiesGroups({ current }: { current: GroupGame }) {
  const { activity } = useOriginalsHost();
  const { signedIn, entries } = useDailies(current);
  const done = entries[current]?.state === "done";
  const [groups, setGroups] = useState<GroupStreak[] | null>(null);
  useEffect(() => {
    if (activity || !signedIn || !done) return;
    let live = true;
    fetch(`/api/dailies/groups?game=${current}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null))
      .then((j: { groups?: GroupStreak[] } | null) => { if (live) setGroups(j?.groups ?? []); }).catch(() => {});
    return () => { live = false; };
  }, [activity, signedIn, done, current]);
  if (activity || !groups?.length) return null;
  return (
    <section className="dailies-groups" aria-labelledby={`dailies-groups-${current}`}>
      <h2 id={`dailies-groups-${current}`} className="dailies-groups__title">Streaks together</h2>
      <ul className="dailies-groups__list">
        {groups.map((g) => (
          <li key={`${g.kind}:${g.name}`} className="dailies-groups__row">
            <span className={`dailies-groups__mark${g.today ? " is-on" : ""}`} aria-hidden>{g.streak > 0 ? <IconFlame size={18} stroke={2} /> : <IconUsersGroup size={18} stroke={2} />}</span>
            <span className="dailies-groups__text">
              <strong>{g.href ? <Link href={g.href}>{g.name}</Link> : g.name}</strong>
              <span>{groupLine(g)}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
