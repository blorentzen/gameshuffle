/**
 * One person, the same everywhere (game spaces picks 2026-11-05, 1A: one component per thing). Their picture with a
 * red ring when live or a green dot when online, their name (to their profile), a Friend mark when you follow each
 * other, what they're up to, and at most one way to join them (Watch, Join). Used by the room's people rail and a
 * game space's people; the other person rows move here as they're touched.
 */

import Link from "next/link";
import { UserAvatar } from "@/components/UserAvatar";
import type { Person } from "@/lib/home/people";
import "@/styles/people.css";

export function PersonRow({ p, size = 40 }: { p: Person; size?: number }) {
  return (
    <li className="person-row">
      <span className={`person-row__face${p.live ? " person-row__face--live" : ""}`}>
        <UserAvatar user={p.avatar} size={size} />
        {p.online && !p.live && <span className="person-row__online"><span className="sr-only">Online</span></span>}
      </span>
      <span className="person-row__text">
        <span className="person-row__name">
          <Link href={`/u/${p.username}`}>{p.name}</Link>
          {p.friend && <span className="person-row__friend">Friend</span>}
        </span>
        <span>{p.live ? <><span className="person-row__live">Live</span> now</> : p.status}</span>
      </span>
      {p.action.label !== "Profile" && (
        <Link href={p.action.href} className="person-row__act" aria-label={`${p.action.label}: ${p.name}`}>{p.action.label}</Link>
      )}
    </li>
  );
}

/** A list of people (a plain list: rows split by thin lines). */
export function PeopleList({ people, size, className }: { people: Person[]; size?: number; className?: string }) {
  return <ul className={`people-list${className ? ` ${className}` : ""}`}>{people.map((p) => <PersonRow key={p.id} p={p} size={size} />)}</ul>;
}
