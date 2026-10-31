"use client";

/**
 * How a phone joins a trivia night. Signed out: a team name (and a way to sign
 * in to play for your crew). Signed in: your crews first, then yourself, then a
 * new name; on a league night, your league team, a crew of yours to enter, a
 * new league team, or just tonight. A crew or league team already playing
 * tonight is joined with one tap (same team, same key).
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button, Input, Radio, RadioGroup } from "@empac/cascadeds";
import { LoadingLines } from "@/components/loading/LoadingLines";
import type { JoinOptions } from "@/lib/trivia/join";

export type JoinedTeam = { teamId: string; key: string; name: string };

type Option = { value: string; label: string; helper: string; playing?: boolean; needsName?: boolean; as: Record<string, unknown> };

const rankWord = (n: number) => (n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`);

export function TriviaJoinChoices({ code, errors, onJoined }: { code: string; errors: Record<string, string>; onJoined: (team: JoinedTeam) => void }) {
  const [options, setOptions] = useState<JoinOptions | null>(null);
  const [failed, setFailed] = useState(false);
  const [pick, setPick] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/trivia/room/${code}?join=1`, { cache: "no-store" }).then((r) => r.json()).then((d) => {
      if (!active) return;
      if (d?.ok) setOptions(d.options as JoinOptions);
      else setFailed(true);
    }).catch(() => active && setFailed(true));
    return () => { active = false; };
  }, [code]);

  const list = useMemo<Option[]>(() => {
    if (!options?.signedIn) return [];
    const me = options.me?.name ?? "you";
    if (options.league) {
      const l = options.league;
      return [
        ...l.teams.map((t) => ({
          value: `league:${t.id}`, label: t.name, playing: t.playing, as: { kind: "league", teamId: t.id },
          helper: t.playing ? "Already playing tonight: join the same team on this phone" : t.points > 0 ? `In the league · ${rankWord(t.rank)} with ${t.points} points` : "In the league",
        })),
        ...l.enter.map((c) => ({ value: `enter:${c.communityId}`, label: `Enter ${c.name} in the league`, helper: "Your crew · starts at 0, and only a team's best nights count", as: { kind: "enter", communityId: c.communityId } })),
        { value: "new_league", label: "A new league team", helper: "You'll be its captain, and it becomes a crew", needsName: true, as: { kind: "new_league" } },
        { value: "self", label: "Just tonight, as yourself", helper: `Shows as ${me}, no league points`, as: { kind: "self" } },
        { value: "name", label: "Just tonight, with a team name", helper: "No league points", needsName: true, as: { kind: "name" } },
      ];
    }
    return [
      ...options.crews.map((c) => ({
        value: `crew:${c.communityId}`, label: c.name, playing: c.playing, as: { kind: "crew", communityId: c.communityId },
        helper: c.playing ? "Already playing tonight: join the same team on this phone" : "Your crew",
      })),
      { value: "self", label: "Yourself", helper: `Shows as ${me}`, as: { kind: "self" } },
      { value: "name", label: "A new team", helper: "Type any team name", needsName: true, as: { kind: "name" } },
    ];
  }, [options]);

  const chosen = list.find((o) => o.value === pick) ?? list[0];

  const join = async (as: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    const d = await fetch(`/api/trivia/room/${code}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "join", as }) }).then((r) => r.json()).catch(() => null);
    setBusy(false);
    if (!d?.ok) { setError(errors[d?.error] ?? "Couldn't join. Try again."); return; }
    onJoined({ teamId: d.teamId as string, key: d.key as string, name: d.name as string });
  };

  if (failed) return <div className="trivia-card"><p>{errors.not_found}</p><Link href="/trivia"><Button variant="secondary">Enter another code</Button></Link></div>;
  if (!options) return <div className="trivia-card"><LoadingLines label="Loading" /></div>;

  if (!options.signedIn) {
    return (
      <form className="trivia-card trivia-form" onSubmit={(e) => { e.preventDefault(); void join({ kind: "name", name }); }}>
        <Input fullWidth floatingLabel="Team name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        <p className="trivia-muted">One phone per team is enough. Teammates can join from a link once you&apos;re in.</p>
        {error && <p className="trivia-error" role="alert">{error}</p>}
        <Button type="submit" variant="primary" disabled={busy || name.trim().length < 2}>Join</Button>
        <Link href={`/login?redirect=${encodeURIComponent(`/trivia/play/${code}`)}`} className="trivia-join__signin">Sign in to play for your crew</Link>
      </form>
    );
  }

  const needsName = !!chosen?.needsName;
  const label = !chosen ? "Join" : chosen.playing ? `Join ${chosen.label}` : chosen.value === "self" ? (options.league ? "Play just tonight" : `Play as ${options.me?.name ?? "yourself"}`)
    : chosen.value.startsWith("enter:") ? "Enter the crew and play" : needsName ? (chosen.value === "new_league" ? "Start the team and play" : "Join") : `Play as ${chosen.label}`;

  return (
    <form className="trivia-card trivia-form" onSubmit={(e) => { e.preventDefault(); if (chosen) void join({ ...chosen.as, ...(needsName ? { name } : {}) }); }}>
      {options.league && <p className="trivia-label">{options.league.title} · Week {options.league.week} of {options.league.weeks}</p>}
      <div className="trivia-joinas">
        <RadioGroup name="trivia-join-as" label={options.league ? "Your team tonight" : "Play as"} value={chosen?.value ?? ""} onChange={setPick}>
          {list.map((o) => <Radio key={o.value} value={o.value} label={o.label} helperText={o.helper} />)}
        </RadioGroup>
      </div>
      {needsName && <Input fullWidth floatingLabel="Team name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} autoComplete="off" />}
      {error && <p className="trivia-error" role="alert">{error}</p>}
      <Button type="submit" variant="primary" disabled={busy || !chosen || (needsName && name.trim().length < 2)}>{busy ? "Joining…" : label}</Button>
      <p className="trivia-muted">{chosen?.playing ? "Every phone on the team sees each question and the answer locked in." : "One phone per team is enough. Teammates can join from a link once you're in."}</p>
    </form>
  );
}
