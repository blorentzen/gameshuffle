"use client";

/**
 * The league page's interactive bits: entering a team (screen 5), a captain's
 * team card (screen 6) and the share buttons. The page itself renders on the
 * server so the standings and event details are in the HTML.
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Input, Modal, Radio, RadioGroup } from "@empac/cascadeds";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/toast/ToastProvider";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import { EVENTS, track } from "@/lib/analytics/events";

const ERRORS: Record<string, string> = {
  captains_only: "Only the crew's captains (or the community's owner and mods) can enter it.",
  not_your_crew: "You're not on that crew.",
  league_full: "This league is full.",
  name_taken: "A team in this league already has that name.",
  season_over: "This season is over.",
  bad_name: "Team names need at least 2 characters.",
  blocked: "That name can't be used.",
  has_played: "Your team has played a night, so ask the host to remove it.",
  no_night: "Tonight's room isn't open yet. The link appears once the host opens it.",
};

export function LeagueEnter({ leagueId, slug, signedIn, crews }: { leagueId: string; slug: string; signedIn: boolean; crews: { communityId: string; name: string }[] }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"crew" | "new">(crews.length ? "crew" : "new");
  const [crew, setCrew] = useState(crews[0]?.communityId ?? "");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  if (!signedIn) {
    return <Link href={`/login?redirect=${encodeURIComponent(`/trivia/leagues/${slug}`)}`}><Button variant="primary">Join the league</Button></Link>;
  }

  const enter = async () => {
    setBusy(true);
    const d = await fetch(`/api/trivia/leagues/${leagueId}/teams`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(mode === "crew" ? { communityId: crew } : { name }) }).then((r) => r.json()).catch(() => null);
    setBusy(false);
    if (!d?.ok) { toast.error(ERRORS[d?.error] ?? "Couldn't enter the team. Try again."); return; }
    track(EVENTS.triviaLeagueTeamEntered, { crew: mode === "crew" || d.crewMade ? "yes" : "no" });
    toast.success(mode === "new" && !d.crewMade ? `${d.name} is in. (You already run five groups, so it's a league-only team.)` : `${d.name} is in the league.`);
    setOpen(false);
    router.refresh();
  };

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>Join the league</Button>
      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        title="Enter a team for the season"
        footer={(
          <div className="trivia-row league-enter__foot">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" disabled={busy || (mode === "crew" ? !crew : name.trim().length < 2)} onClick={() => void enter()}>{busy ? "Entering…" : "Enter the team"}</Button>
          </div>
        )}
      >
        <div className="league-enter">
          <RadioGroup name="league-enter-kind" value={mode} onChange={(v) => setMode(v === "crew" ? "crew" : "new")}>
            <Radio value="crew" label="One of my crews" helperText={crews.length ? "Its roster and record carry over" : "You don't captain a crew yet"} disabled={!crews.length} />
            <Radio value="new" label="A new team" helperText="It becomes a crew with you as captain, so it has a page and a roster" />
          </RadioGroup>
          {mode === "crew" && crews.length > 0 && (
            <Select floatingLabel="Crew" value={crew} onChange={(v) => setCrew(String(v))} options={crews.map((c) => ({ value: c.communityId, label: c.name }))} />
          )}
          {mode === "new" && <Input fullWidth floatingLabel="Team name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} autoComplete="off" />}
          <p className="trivia-muted">You&apos;ll be the captain. Teammates don&apos;t need accounts: they join your team at the door from your link, or with one tap if they&apos;re in the crew.</p>
        </div>
      </Modal>
    </>
  );
}

export function LeagueTeamActions({ leagueId, teamId, live, crewSlug, canLeave }: { leagueId: string; teamId: string; live: boolean; crewSlug: string | null; canLeave: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);

  const copyLink = async () => {
    setBusy(true);
    const d = await fetch(`/api/trivia/leagues/${leagueId}/teams`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "tonight", teamId }) }).then((r) => r.json()).catch(() => null);
    setBusy(false);
    if (!d?.ok) { toast.error(ERRORS[d?.error] ?? "Couldn't get the link."); return; }
    const url = `${window.location.origin}${d.link as string}`;
    try {
      if (navigator.share) await navigator.share({ title: "Join our trivia team", url });
      else { await navigator.clipboard.writeText(url); toast.success("Team link copied. Send it to your teammates."); }
    } catch { /* cancelled */ }
  };

  const leave = async () => {
    if (!(await confirm({ title: "Leave the league?", body: "Your team comes off the league. You can enter again any time before the season ends.", confirmLabel: "Leave the league" }))) return;
    const d = await fetch(`/api/trivia/leagues/${leagueId}/teams`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ teamId }) }).then((r) => r.json()).catch(() => null);
    if (!d?.ok) { toast.error(ERRORS[d?.error] ?? "Couldn't leave. Try again."); return; }
    toast.success("Your team left the league.");
    router.refresh();
  };

  return (
    <div className="trivia-row">
      {live && <Button variant="secondary" size="small" disabled={busy} onClick={() => void copyLink()}>Copy tonight&apos;s team link</Button>}
      {crewSlug && <Link href={`/c/${crewSlug}`}><Button variant="secondary" size="small">Manage the crew</Button></Link>}
      {canLeave && <Button variant="ghost" size="small" onClick={() => void leave()}>Leave the league</Button>}
    </div>
  );
}

export function LeagueShare({ title, path, nextAt }: { title: string; path: string; nextAt: string | null }) {
  const toast = useToast();
  const copy = async (discord: boolean) => {
    const url = `${window.location.origin}${path}`;
    const text = discord ? [title, nextAt ? `Next night: <t:${Math.floor(Date.parse(nextAt) / 1000)}:F>` : null, url].filter(Boolean).join("\n") : url;
    try { await navigator.clipboard.writeText(text); toast.success(discord ? "Copied. Paste it in Discord." : "Link copied."); track(EVENTS.eventShared, { type: "trivia_league", via: discord ? "discord" : "link" }); }
    catch { toast.error("Couldn't copy."); }
  };
  return (
    <div className="trivia-row">
      <Button variant="ghost" size="small" onClick={() => void copy(false)}>Copy link</Button>
      <Button variant="ghost" size="small" onClick={() => void copy(true)}>Copy for Discord</Button>
    </div>
  );
}
