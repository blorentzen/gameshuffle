"use client";

/**
 * "Duel a friend" on a Trainer Road team (duels picks 2026-11-11): two ways to play with friends, picked first (battle
 * pick 10A): race the trainer (a duel room for this team: the host picks Easy, Normal or Hard for everyone and how many
 * players, 2 by default, up to 8), or battle each other (a trainer battle, one against one: teams from this trainer's
 * group, the host starting with this team). Either way: who can join, and whether each player's chat gets "Who wins?"
 * bets (GS Pro). No professor and no tools.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Chip, Modal, Switch } from "@empac/cascadeds";
import { IconUsers } from "@tabler/icons-react";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/toast/ToastProvider";
import { EVENTS, track } from "@/lib/analytics/events";
import { TeamOptions, type TeamChoice } from "./TeamOptions";

type Level = "easy" | "normal" | "hard";
const SIZES = [2, 3, 4, 5, 6, 7, 8].map((n) => ({ value: String(n), label: n === 2 ? "2 (a duel)" : `Up to ${n}` }));
const ERRORS: Record<string, string> = {
  elsewhere: "You're in another race or duel. Finish or leave it first.",
  not_ready: "Duels need a quick update on our side first.",
  slow_down: "That's a lot of duels. Try again in a minute.",
};

/** Trainer battles' groups (versus/rules.ts BATTLE_GROUPS), by tier. */
const GROUP_LABEL: Record<string, string> = { gym: "Gym Leaders", elite: "Elite Four", rival: "rivals", boss: "bosses", champion: "Champions" };

export function DuelFriendButton({ trainerId, trainerName, level, easy, hard, signedIn, tier, cards }: {
  trainerId: string; trainerName: string; level: Level; easy: boolean; hard: boolean; signedIn: boolean;
  /** The trainer's tier and team size: a trainer battle needs one of the five groups and at least 3 cards. */
  tier?: string; cards?: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState<Level>(level);
  const [max, setMax] = useState("2");
  const [join, setJoin] = useState<"link" | "invite">("link");
  const [bets, setBets] = useState(false);
  const [busy, setBusy] = useState(false);
  const [teams, setTeams] = useState<TeamChoice>({ count: 0, score: "total" });
  const canBattle = !!tier && tier in GROUP_LABEL && (cards ?? 0) >= 3;
  const [mode, setMode] = useState<"race" | "battle" | "tag">("race");
  const battle = canBattle && mode === "battle";
  const tag = mode === "tag";

  const levels = [
    { value: "easy", label: easy ? "Easy" : "Easy (not open for this duel)", disabled: !easy },
    { value: "normal", label: "Normal" },
    { value: "hard", label: hard ? "Hard" : "Hard (not open for this duel)", disabled: !hard },
  ];

  async function make() {
    setBusy(true);
    const body = battle ? { kind: "battle", trainerId, group: tier, join, bets } : tag ? { kind: "tag", trainerId, join, bets } : { kind: "duel", trainerId, level: pick, max: Number(max), join, bets, ...(teams.count && Number(max) >= 4 ? { teams } : {}) };
    const res = await fetch("/api/races", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const d = (await res?.json().catch(() => null)) as { code?: string; error?: string; detail?: string } | null;
    setBusy(false);
    if (!res?.ok || !d?.code) {
      const why = d?.detail === "hard_off" ? "Hard isn't open for this duel." : d?.detail === "easy_off" ? "Easy isn't open for this duel." : d?.detail === "not_ready" ? "This duel isn't ready yet. Try again in a moment." : null;
      toast.error(why ?? ERRORS[d?.error ?? ""] ?? "Couldn't make the duel. Try again.");
      return;
    }
    track(EVENTS.raceMade, battle ? { kind: "battle", size: 2, join, bets, group: tier ?? "" } : tag ? { kind: "tag", size: 2, join, bets } : { kind: "duel", size: Number(max), join, bets, level: pick });
    router.push(`/races/${d.code}`);
  }

  if (!signedIn) {
    return <Button variant="secondary" size="large" iconBefore={IconUsers} onClick={() => router.push(`/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`)}>Duel a friend</Button>;
  }
  return (
    <>
      <Button variant="secondary" size="large" iconBefore={IconUsers} onClick={() => { setPick(level); setOpen(true); }}>Duel a friend</Button>
      <Modal isOpen={open} onClose={() => setOpen(false)} title="Duel a friend" size="medium"
        footer={<div className="duel-friend__acts"><Button variant="ghost" onClick={() => setOpen(false)}>Not now</Button><Button variant="primary" disabled={busy} onClick={() => void make()}>{battle ? "Make the battle" : tag ? "Make the tag team" : "Make the duel"}</Button></div>}>
        <div className="duel-friend">
          <div className="duel-friend__row" role="group" aria-labelledby="duel-friend-mode">
            <span id="duel-friend-mode" className="duel-friend__label">How you play</span>
            <div className="duel-friend__chips">
              <Chip clickable selected={mode === "race"} onClick={() => setMode("race")} label={`Race ${trainerName}`} />
              <Chip clickable selected={mode === "tag"} onClick={() => setMode("tag")} label="Team up" />
              {canBattle && <Chip clickable selected={mode === "battle"} onClick={() => setMode("battle")} label="Battle each other" />}
            </div>
          </div>
          {tag ? (
            <p>The two of you share one side against {trainerName}{"'"}s team, on Normal. You take turns picking from the duel{"'"}s six, and whoever owns the card on the field plays the turn. A coin flip decides who picks first. No professor or tools.</p>
          ) : battle ? (
            <p>One against one. You each pick a team from the {GROUP_LABEL[tier!]} (you start with {trainerName}{"'"}s), bring 3 of its cards, and take turns. A coin flip decides who goes first. No professor or tools.</p>
          ) : (
            <>
              <p>Everyone duels {trainerName}{"'"}s team at the same time, with the same cards, Energy and events, and no professor or tools. A win counts first, then fewer turns, then less time. It counts on Trainer Road like any duel.</p>
              <Select id="duel-friend-level" floatingLabel="Mode for everyone" fullWidth value={pick} onChange={(v) => setPick(v as Level)} options={levels} />
              <Select id="duel-friend-size" floatingLabel="Players" fullWidth value={max} onChange={(v) => setMax(String(v))} options={SIZES} />
              {Number(max) >= 4 && <TeamOptions id="duel-friend" value={teams} onChange={setTeams} max={Number(max)} unit="turns" />}
            </>
          )}
          <div className="duel-friend__row" role="group" aria-labelledby="duel-friend-join">
            <span id="duel-friend-join" className="duel-friend__label">Who can join</span>
            <div className="duel-friend__chips">
              <Chip clickable selected={join === "link"} onClick={() => setJoin("link")} label="Anyone with the link" />
              <Chip clickable selected={join === "invite"} onClick={() => setJoin("invite")} label="Only people I invite" />
            </div>
          </div>
          <Switch label={`"Who wins?" bets in each player's chat`} checked={bets} onChange={(e) => setBets(e.target.checked)} />
          <p className="duel-friend__note">Bets come with GS Pro: each player with GS Pro who is live on Twitch gets one in their chat.</p>
        </div>
      </Modal>
    </>
  );
}
