"use client";

/**
 * The review page's Team tab (picks 2026-11-05, 1A 2A 3A 5A): find anyone by name, @username or Discord name (time
 * trial players first, with how many times they've added), see who has access, and change it in one window
 * (TtAccessWindow). Staff and admins see the latest changes and who made them. Replaced the Reviewers and Updaters tabs.
 */

import { useEffect, useState } from "react";
import { Avatar, Button, FormField, Input } from "@empac/cascadeds";
import type { Granter, TeamLogEntry, TeamPerson } from "@/lib/timeTrials/team";
import type { Mode } from "@/lib/timeTrials/updaters";
import { TT_GAMES } from "@/lib/timeTrials/tracks";
import { itemsLabel } from "@/lib/timeTrials/categories";
import { TtAccessWindow } from "./TtAccessWindow";

export type TeamData = { members: TeamPerson[]; log: TeamLogEntry[] | null; granter: Granter; me: string };

const modeText = (m: Mode) => `${TT_GAMES[m.game].short} · ${itemsLabel(m.items)}`;
const when = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "America/Los_Angeles" });

function Tags({ p }: { p: TeamPerson }) {
  if (p.staff) return <span className="tt-chip tt-chip--review">Staff · everything</span>;
  return (
    <>
      {p.reviewer && <span className="tt-chip tt-chip--trust">Reviewer</span>}
      {p.modes.map((m) => <span key={`${m.game}${m.items}`} className="tt-chip">{modeText(m)}</span>)}
    </>
  );
}

function Who({ p }: { p: TeamPerson }) {
  return (
    <span className="tt-team__who">
      <Avatar size="small" src={p.avatar} initials={p.name.slice(0, 1).toUpperCase()} alt="" />
      <span className="tt-team__name">
        <b>{p.name}</b>
        <span className="tt-muted">{[p.username ? `@${p.username}` : null, p.times !== null ? `${p.times} ${p.times === 1 ? "time" : "times"}` : null].filter(Boolean).join(" · ")}</span>
      </span>
    </span>
  );
}

export function TtTeamTab({ team, onChanged }: { team: TeamData; onChanged: () => void }) {
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<{ for: string; people: TeamPerson[] } | null>(null);
  const [editing, setEditing] = useState<{ userId: string; name: string } | null>(null);
  const text = query.trim();

  // Search as they type (a short wait so each keystroke doesn't ask).
  useEffect(() => {
    if (text.length < 2) return;
    let live = true;
    const t = setTimeout(() => {
      void fetch(`/api/time-trials/review?people=${encodeURIComponent(text)}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null).then((j: { ok?: boolean; people?: TeamPerson[] } | null) => {
        if (live) setFound({ for: text, people: j?.people ?? [] });
      });
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [text]);
  const results = text.length >= 2 && found?.for === text ? found.people : null;

  const row = (p: TeamPerson, inSearch: boolean) => (
    <li key={p.userId} className="tt-queue__item tt-team__row">
      <Who p={p} />
      <span className="tt-team__tags"><Tags p={p} /></span>
      <span className="tt-team__act">
        {p.staff || p.userId === team.me ? null : (
          <Button variant={inSearch && !p.reviewer && !p.modes.length ? "secondary" : "ghost"} size="small" onClick={() => setEditing({ userId: p.userId, name: p.name })}>
            {p.reviewer || p.modes.length ? "Change" : "Give access"}
          </Button>
        )}
      </span>
    </li>
  );

  return (
    <div className="tt-reviewers tt-team">
      <p className="tt-note">
        {team.granter === "staff"
          ? "Reviewers check everything; updaters check one game and items. Reviewers can make updaters, and only staff make reviewers."
          : "You can make someone an updater for a game and items. Only staff make reviewers."}
        {" "}Anyone you add or change gets a notification and an email.
      </p>

      <div className="tt-team__search">
        <div className="tt-team__find">
          <FormField label="Find someone" htmlFor="tt-team-find" helperText="A name, @username or Discord name">
            <Input id="tt-team-find" value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" fullWidth />
          </FormField>
        </div>
        {text.length >= 2 && (
          <div aria-live="polite">
            {!results ? <p className="tt-muted" role="status">Looking…</p>
              : results.length === 0 ? <p className="tt-note">No account matches &ldquo;{text}&rdquo;. They need a GameShuffle account to get access.</p>
              : <ul className="tt-queue" aria-label="Accounts found">{results.map((p) => row(p, true))}</ul>}
          </div>
        )}
      </div>

      <h2 className="tt-queue__sub">Who has access</h2>
      <ul className="tt-queue">{team.members.map((p) => row(p, false))}</ul>

      {team.log && team.log.length > 0 && (
        <>
          <h2 className="tt-queue__sub">Recent changes</h2>
          <ul className="tt-team__log">
            {team.log.map((l, i) => (
              <li key={`${l.at}${i}`}><b>{l.who}</b>: {l.text}<span className="tt-muted"> · by {l.by}, {when.format(new Date(l.at))}</span></li>
            ))}
          </ul>
        </>
      )}

      {editing && <TtAccessWindow userId={editing.userId} name={editing.name} onClose={() => setEditing(null)} onSaved={() => { setQuery(""); onChanged(); }} />}
    </div>
  );
}
