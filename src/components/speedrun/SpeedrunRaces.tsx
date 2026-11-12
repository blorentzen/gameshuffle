"use client";

/**
 * Races on the speedrun setup page (speedrun races picks 2026-11-10): your latest races and Make a race. A race takes
 * the game, category and splits from the run on stream; the host picks how many runners (2-8, pick 7A), who can join
 * (anyone with the link, or only people they invite, pick 1A) and whether each runner's chat gets "Who wins?" bets
 * (GS Pro, pick 8A). GameShuffle starts every timer after a 10 second countdown (pick 2A). Hidden until the database
 * has races (versus-m1).
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Chip, Input, Modal, Switch } from "@empac/cascadeds";
import { IconFlag } from "@tabler/icons-react";
import { Select } from "@/components/ui/Select";
import { ArrowLink } from "@/components/ui/ArrowLink";
import { useToast } from "@/components/toast/ToastProvider";
import { EVENTS, track } from "@/lib/analytics/events";
import { COUNTDOWN_S, SEED_GAMES, cleanSeed } from "@/lib/versus/rules";
import { gameKey } from "@/lib/games/key";
import type { MyRace } from "@/lib/versus/types";
import type { SpeedrunSetupView } from "@/lib/speedrun/types";
import { TeamOptions, type TeamChoice } from "@/components/races/TeamOptions";

const ERRORS: Record<string, string> = {
  setup: "Set up your timer first.",
  no_splits: "Add your splits first: every runner in a race needs the same splits.",
  not_ready: "Races need a quick update on our side first.",
  slow_down: "That's a lot of races. Try again in a minute.",
};
const STATUS: Record<MyRace["status"], string> = { open: "Open", countdown: "Starting", running: "Live", finished: "Finished", cancelled: "Called off" };
const ORD = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th"];
const SIZES = [2, 3, 4, 5, 6, 7, 8].map((n) => ({ value: String(n), label: `Up to ${n}` }));

export function SpeedrunRaces({ view }: { view: SpeedrunSetupView }) {
  const router = useRouter();
  const toast = useToast();
  const [data, setData] = useState<{ ready: boolean; races: MyRace[] } | null>(null);
  const [open, setOpen] = useState(false);
  const [max, setMax] = useState("4");
  const [join, setJoin] = useState<"link" | "invite">("link");
  const [bets, setBets] = useState(false);
  const [teams, setTeams] = useState<TeamChoice>({ count: 0, score: "total" });
  const [busy, setBusy] = useState(false);
  // Minecraft (roster pick 11): each runner's own world, or one seed for everyone, picked by GameShuffle or typed.
  const [seedMode, setSeedMode] = useState<"own" | "pick" | "typed">("own");
  const [seed, setSeed] = useState("");
  const seedGame = SEED_GAMES.has(gameKey(view.game) ?? "");

  useEffect(() => {
    let alive = true;
    fetch("/api/races", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d) setData(d); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  if (!data?.ready) return null;
  const live = data.races.find((r) => r.status === "open" || r.status === "countdown" || r.status === "running");

  async function make() {
    setBusy(true);
    if (seedGame && seedMode === "typed" && !cleanSeed(seed)) { toast.error("A seed is a number, or up to 32 letters and digits."); return; }
    const seedBody = seedGame && seedMode !== "own" ? { seedMode, seed: seedMode === "typed" ? seed : undefined } : {};
    const res = await fetch("/api/races", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ max: Number(max), join, bets, ...seedBody, ...(teams.count && Number(max) >= 4 ? { teams } : {}) }) }).catch(() => null);
    const d = (await res?.json().catch(() => null)) as { ok?: boolean; code?: string; error?: string; detail?: string } | null;
    setBusy(false);
    if (!res?.ok || !d?.code) {
      toast.error(d?.error === "elsewhere" ? `You're in race ${d.detail}. Finish or leave it first.` : ERRORS[d?.error ?? ""] ?? "Couldn't make the race. Try again.");
      return;
    }
    track(EVENTS.raceMade, { size: Number(max), join, bets, teams: teams.count });
    router.push(`/races/${d.code}`);
  }

  const what = [view.game, view.category].filter(Boolean).join(" · ") || "Your run";
  return (
    <section className="sr-sec" aria-labelledby="sr-races-h">
      <div className="sr-sec__h"><h2 id="sr-races-h">Races</h2></div>
      <p className="sr-sub">Race other runners live, each on your own timer and stream. GameShuffle starts every timer at once and shows who{"'"}s ahead at every split.</p>
      {data.races.length > 0 && (
        <ul className="sr-races">
          {data.races.map((r) => (
            <li key={r.code} className="sr-race">
              <div className="sr-race__txt">
                <ArrowLink href={`/races/${r.code}`}>{r.title}</ArrowLink>
                <span>{STATUS[r.status]} · {r.runners} runner{r.runners === 1 ? "" : "s"}{r.place ? ` · you were ${ORD[r.place - 1]}` : ""}{r.host ? " · your race" : ""}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="sr-tpl-acts">
        <Button variant="secondary" iconBefore={IconFlag} disabled={!view.splits.length || !!live} onClick={() => setOpen(true)}>Make a race</Button>
      </div>
      {!view.splits.length && <p className="sr-sub">Races need your splits: add them above.</p>}
      {live && <p className="sr-sub">{"You're"} in a race now. Finish or leave it to make another.</p>}
      <Modal isOpen={open} onClose={() => setOpen(false)} title="Make a race" size="medium"
        footer={<div className="sr-modal-acts"><Button variant="ghost" onClick={() => setOpen(false)}>Not now</Button><Button variant="primary" disabled={busy} onClick={() => void make()}>Make the race</Button></div>}>
        <div className="sr-racemk">
          <dl className="sr-racemk__facts">
            <div><dt>Race</dt><dd>{what}</dd></div>
            <div><dt>Splits</dt><dd>{view.splits.length} (every runner{"'"}s must match)</dd></div>
          </dl>
          <Select id="sr-race-size" floatingLabel="Runners" fullWidth value={max} onChange={(v) => setMax(String(v))} options={SIZES} />
          {Number(max) >= 4 && <TeamOptions id="sr-race" value={teams} onChange={setTeams} max={Number(max)} unit="time" />}
          <div className="sr-racemk__row" role="group" aria-labelledby="sr-race-join">
            <span id="sr-race-join" className="sr-racemk__label">Who can join</span>
            <div className="sr-chips">
              <Chip clickable selected={join === "link"} onClick={() => setJoin("link")} label="Anyone with the link" />
              <Chip clickable selected={join === "invite"} onClick={() => setJoin("invite")} label="Only people I invite" />
            </div>
          </div>
          {seedGame && (
            <div className="sr-racemk__row" role="group" aria-labelledby="sr-race-seed">
              <span id="sr-race-seed" className="sr-racemk__label">World</span>
              <div className="sr-chips">
                <Chip clickable selected={seedMode === "own"} onClick={() => setSeedMode("own")} label="Each runner's own world" />
                <Chip clickable selected={seedMode === "pick"} onClick={() => setSeedMode("pick")} label="One seed, GameShuffle picks it" />
                <Chip clickable selected={seedMode === "typed"} onClick={() => setSeedMode("typed")} label="One seed I type" />
              </div>
              {seedMode === "typed" && <Input id="sr-race-seed-in" floatingLabel="Seed" value={seed} onChange={(e) => setSeed(e.target.value)} fullWidth />}
              {seedMode !== "own" && <p className="sr-sub">Everyone sees the seed when the countdown starts, so nobody scouts the world first.</p>}
            </div>
          )}
          <p className="sr-sub">GameShuffle starts every runner{"'"}s timer at the end of a {COUNTDOWN_S} second countdown, so timers stay at 0:00 until then.</p>
          <Switch label={`"Who wins?" bets in each runner's chat`} checked={bets} disabled={!view.isPro} onChange={(e) => setBets(e.target.checked)} />
          <p className="sr-sub">{view.isPro ? "Each runner with GS Pro who is live on Twitch gets the bet in their chat. Bets lock a quarter of the way in." : "Chat bets on races come with GS Pro."}</p>
        </div>
      </Modal>
    </section>
  );
}
