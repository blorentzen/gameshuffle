"use client";

/**
 * Captains mode of the Chat Draft tab. Open sign-ups (the session lobby comes
 * in on its own, chat types !draft in, and you can add names), tap players to
 * make them captains or roll captains at random, then start. While it runs you
 * see the board and can pick for whoever's on the clock.
 */

import { useState } from "react";
import { Badge, Button, Chip, Input, Select } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import { CaptainBoard } from "@/components/drafts/CaptainBoard";
import { TEAM_NAMES } from "@/lib/drafts/captains";
import type { StreamDraftView } from "@/lib/drafts/store";

const ERRORS: Record<string, string> = {
  already_open: "A draft is already running. End it first.",
  bad_captains: "Pick a different player for each captain.",
  no_players: "Everyone's a captain. Add more players first.",
  not_signup: "Sign-ups have closed.",
  not_available: "That player was just picked.",
  too_late: "That turn just moved on. Try again.",
  busy: "Lots of sign-ups at once. Try again.",
  not_ready: "Team drafts need a quick update on our side first.",
};

export function CaptainDraftPanel({ draft, onDraft }: { draft: StreamDraftView | null; onDraft: (d: StreamDraftView | null) => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [teamCount, setTeamCount] = useState(2);
  const [captains, setCaptains] = useState<string[]>([]);
  const [names, setNames] = useState<string[]>([...TEAM_NAMES]);
  const [order, setOrder] = useState<"snake" | "alternate">("snake");
  const [timer, setTimer] = useState("30");

  const call = async (url: string, method: string, body: object, okMsg?: string) => {
    setBusy(true);
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await res.json().catch(() => null);
    setBusy(false);
    if (d?.ok) { onDraft(d.draft?.status === "cancelled" ? null : d.draft); if (okMsg) toast.success(okMsg); return true; }
    toast.error(ERRORS[d?.error] ?? "Couldn't update the draft.");
    return false;
  };
  const act = (action: string, extra: object = {}, okMsg?: string) => draft ? call(`/api/drafts/${draft.id}`, "PATCH", { action, ...extra }, okMsg) : Promise.resolve(false);

  const c = draft?.captains;

  if (!draft || draft.mode !== "captains" || !c) {
    return (
      <div className="account-card">
        <h3 className="account-card__title">Team draft</h3>
        <p className="dbot-muted">
          Captains take turns picking players into teams. Everyone in your session lobby is signed up automatically,
          chat can join with <code>!draft in</code>, and you can add names yourself. Then pick the captains and start.
        </p>
        <div><Button variant="primary" disabled={busy} onClick={() => void call("/api/drafts", "POST", { mode: "captains" }, "Sign-ups are open")}>Open sign-ups</Button></div>
      </div>
    );
  }

  if (draft.status === "signup") {
    const entrants = c.pool;
    const valid = captains.filter((k) => entrants.some((e) => e.key === k)).slice(0, teamCount);
    const toggle = (key: string) => setCaptains((cur) => cur.includes(key) ? cur.filter((k) => k !== key) : cur.length >= teamCount ? cur : [...cur, key]);
    const roll = () => {
      const pool = [...entrants].sort(() => Math.random() - 0.5);
      setCaptains(pool.slice(0, teamCount).map((e) => e.key));
    };
    const add = async () => {
      const n = name.trim();
      if (!n) return;
      if (await act("add", { name: n })) setName("");
    };
    const start = () => act("start", {
      teams: valid.map((captainKey, i) => ({ captainKey, name: names[i] })),
      order, pickSeconds: timer === "off" ? null : Number(timer),
    }, "Team draft started");
    const nameOf = (key: string) => entrants.find((e) => e.key === key)?.name ?? "";

    return (
      <>
        <div className="account-card">
          <div className="poll-head">
            <h3 className="account-card__title">Sign-ups</h3>
            <Badge variant="success" size="small">{entrants.length} in</Badge>
          </div>
          <p className="dbot-muted">Tap a player to make them a captain ({valid.length} of {teamCount}). Tap the x to take someone out. Chat joins with <code>!draft in</code>.</p>
          <div className="cap-setup__chips">
            {entrants.length === 0 && <span className="dbot-muted">Nobody yet. Add names below or have chat type !draft in.</span>}
            {entrants.map((e) => {
              const ci = valid.indexOf(e.key);
              return (
                <Chip key={e.key} size="large" clickable selected={ci >= 0} removable
                  label={ci >= 0 ? `${e.name} · ${names[ci] || TEAM_NAMES[ci]} captain` : e.name}
                  onClick={() => toggle(e.key)} onRemove={() => { setCaptains((cur) => cur.filter((k) => k !== e.key)); void act("remove", { key: e.key }); }} />
              );
            })}
          </div>
          <div className="cap-setup__add">
            <Input floatingLabel="Add a name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void add(); } }} />
            <Button variant="secondary" disabled={busy || !name.trim()} onClick={() => void add()}>Add</Button>
            <Button variant="ghost" disabled={busy} onClick={() => void act("lobby", {}, "Lobby pulled in")}>Pull in the lobby</Button>
          </div>
        </div>

        <div className="account-card">
          <h3 className="account-card__title">Teams</h3>
          <div className="poll-form">
            <Select floatingLabel="How many teams" value={String(teamCount)} onChange={(v) => { const n = Number(v); setTeamCount(n); setCaptains((cur) => cur.slice(0, n)); }}
              options={[2, 3, 4].map((n) => ({ value: String(n), label: `${n} teams` }))} />
            <div className="cap-setup__teams">
              {Array.from({ length: teamCount }, (_, i) => (
                <div key={i} className={`cap-setup__team cap-team--${i}`}>
                  <Input floatingLabel={`Team ${i + 1} name`} value={names[i]} maxLength={24} onChange={(e) => setNames((cur) => cur.map((n, j) => (j === i ? e.target.value : n)))} />
                  <small>{valid[i] ? `Captain: ${nameOf(valid[i])}` : "No captain yet"}</small>
                </div>
              ))}
            </div>
            <Select floatingLabel="Pick order" value={order} onChange={(v) => setOrder(v === "alternate" ? "alternate" : "snake")}
              options={[{ value: "snake", label: "Snake (1-2-2-1), fairest" }, { value: "alternate", label: "Alternating (1-2-1-2)" }]} />
            <Select floatingLabel="Time per pick" value={timer} onChange={(v) => setTimer(String(v))}
              options={[{ value: "30", label: "30 seconds, then a random pick" }, { value: "45", label: "45 seconds, then a random pick" }, { value: "60", label: "1 minute, then a random pick" }, { value: "off", label: "No timer" }]} />
            <div className="party-row">
              <Button variant="primary" disabled={busy || valid.length !== teamCount || entrants.length <= teamCount} onClick={() => void start()}>Start the draft</Button>
              <Button variant="secondary" disabled={busy || entrants.length < teamCount} onClick={roll}>Roll captains at random</Button>
              <Button variant="ghost" disabled={busy} onClick={() => void act("end", {}, "Sign-ups closed")}>Cancel</Button>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="account-card">
      <div className="poll-head">
        <h3 className="account-card__title">{draft.title}</h3>
        <Badge variant={draft.status === "open" ? "success" : "default"} size="small">{draft.status === "open" ? "Live" : "Complete"}</Badge>
      </div>
      <p className="dbot-muted">Captains pick on your /live page or with <code>!pick name</code>. You can pick for whoever is on the clock here.</p>
      <CaptainBoard c={c} status={draft.status} onPick={draft.status === "open" ? async (key) => { await act("pick", { key }); } : undefined} />
      {draft.status === "open" && (
        <div className="party-row" style={{ marginTop: "var(--spacing-12, 12px)" }}>
          <Button variant="secondary" size="small" disabled={busy} onClick={() => void act("end", {}, "Draft ended")}>End the draft</Button>
        </div>
      )}
      {draft.status === "done" && (
        <div className="party-row" style={{ marginTop: "var(--spacing-12, 12px)" }}>
          <Button variant="secondary" size="small" disabled={busy} onClick={() => void call("/api/drafts", "POST", { mode: "captains" }, "Sign-ups are open")}>Start another team draft</Button>
        </div>
      )}
    </div>
  );
}
