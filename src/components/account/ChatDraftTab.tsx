"use client";

/**
 * Chat Draft tab (Community & Chat, GS Pro). Two modes:
 *   * Chat votes: start a draft (a Pokémon team, a Mario Kart combo or track
 *     list), set the rules and timer, then watch chat fill it pick by pick.
 *   * Captains: captains pick players into teams (CaptainDraftPanel).
 * Also works from chat: !draft start / next / end, !draft teams / in / captains, !pick.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Badge, Button, Select, Switch, Tabs } from "@empac/cascadeds";
import { CaptainDraftPanel } from "./CaptainDraftPanel";
import { useToast } from "@/components/toast/ToastProvider";
import type { DraftPoolInfo } from "@/lib/drafts/catalog";
import type { StreamDraftView } from "@/lib/drafts/store";
import { EVENTS, tagged } from "@/lib/analytics/events";

const ERRORS: Record<string, string> = {
  already_open: "A draft is already running. End it first.",
  pro_required: "Chat drafts are a GS Pro feature.",
  no_community: "Connect Twitch first so chat can vote.",
  no_candidates: "Nothing fits those rules. Switch one off and try again.",
  not_ready: "Chat drafts need a quick update on our side first.",
};

export function ChatDraftTab() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{ ready: boolean; isPro: boolean; hasCommunity: boolean; pools: DraftPoolInfo[]; draft: StreamDraftView | null } | null>(null);
  const [poolId, setPoolId] = useState("pokemon:sv");
  const [rules, setRules] = useState<Record<string, boolean>>({});
  const [seconds, setSeconds] = useState("45");
  const [options, setOptions] = useState("4");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"vote" | "captains" | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const d = await fetch("/api/drafts", { cache: "no-store" }).then((r) => r.json()).catch(() => null);
      if (!active) return;
      if (d?.ok) setData(d);
      setLoading(false);
    };
    void load();
    const iv = window.setInterval(load, 4000);
    return () => { active = false; window.clearInterval(iv); };
  }, []);

  const pool = useMemo(() => data?.pools.find((p) => p.id === poolId) ?? null, [data, poolId]);
  const ruleValue = (id: string) => rules[`${poolId}:${id}`] ?? pool?.rules.find((r) => r.id === id)?.default ?? false;

  const start = async () => {
    if (!pool) return;
    setBusy(true);
    const res = await fetch("/api/drafts", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ poolId, rules: Object.fromEntries(pool.rules.map((r) => [r.id, ruleValue(r.id)])), pickSeconds: Number(seconds), optionsPerPick: Number(options) }),
    });
    const d = await res.json().catch(() => null);
    setBusy(false);
    if (d?.ok) { setData((cur) => (cur ? { ...cur, draft: d.draft } : cur)); toast.success("Draft started"); }
    else toast.error(ERRORS[d?.error] ?? "Couldn't start the draft.");
  };

  const act = async (action: "next" | "end") => {
    if (!data?.draft) return;
    setBusy(true);
    const res = await fetch(`/api/drafts/${data.draft.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    const d = await res.json().catch(() => null);
    setBusy(false);
    if (d?.ok) { setData((cur) => (cur ? { ...cur, draft: d.draft?.status === "cancelled" ? null : d.draft } : cur)); toast.success(action === "next" ? "Pick closed" : "Draft ended"); }
    else toast.error(ERRORS[d?.error] ?? "Couldn't update the draft.");
  };

  if (loading) return <div className="account-card"><p>Loading…</p></div>;
  if (!data?.isPro) {
    return (
      <div className="account-tab">
        <h2 className="account-tab__heading">Chat Draft</h2>
        <div className="account-card dbot-locked">
          <div className="dbot-locked__head"><h3 className="account-card__title">Chat Draft</h3><span className="dbot-lock-badge">GS Pro</span></div>
          <p className="dbot-muted">Chat drafts your Pokémon team, Mario Kart combo or track list, one vote at a time, live on your overlay.</p>
          <Link href="/gs-pro?from=draft" className={tagged(EVENTS.upgradeClicked, { from: "draft" })}><Button variant="primary" size="small">See GS Pro</Button></Link>
        </div>
      </div>
    );
  }

  const d = data.draft?.mode === "vote" ? data.draft : null;
  const running = d?.status === "open";
  const live = data.draft && (data.draft.status === "open" || data.draft.status === "signup") ? data.draft : null;
  // A running draft decides the mode; otherwise the last one shown, else chat votes.
  const shown = live?.mode ?? mode ?? data.draft?.mode ?? "vote";

  return (
    <div className="account-tab">
      <h2 className="account-tab__heading">Chat Draft</h2>
      <p className="account-tab__intro">
        Run a draft live on stream. With <strong>chat votes</strong>, chat builds something for you one pick at a time: each pick is a vote between a few random options that fit the rules.
        With <strong>captains</strong>, captains take turns picking players into teams.
        Add the Chat Draft piece in <Link href="/account/streamer?tab=overlay-layout">Overlay Layout</Link> to show either one on stream.
      </p>

      {!data.ready && <div className="account-card"><p className="dbot-muted">Chat drafts need a quick update on our side before they can run.</p></div>}
      {data.ready && !data.hasCommunity && (
        <div className="account-card"><p className="dbot-muted">Connect Twitch on the <Link href="/account/streamer?tab=integrations">Integrations tab</Link> to run chat drafts.</p></div>
      )}

      {data.ready && data.hasCommunity && (
        <Tabs variant="pills" activeTab={shown} onChange={(id) => { if (!live) setMode(id === "captains" ? "captains" : "vote"); else if (id !== live.mode) toast.error("End the running draft first."); }}
          tabs={[
            { id: "vote", label: "Chat votes", content: shown === "vote" ? voteContent() : null },
            { id: "captains", label: "Captains", content: shown === "captains" ? <CaptainDraftPanel draft={data.draft?.mode === "captains" ? data.draft : null} onDraft={(nd) => setData((cur) => (cur ? { ...cur, draft: nd } : cur))} /> : null },
          ]} />
      )}

      <div className="account-card">
        <h3 className="account-card__title">From chat</h3>
        <p className="dbot-muted">
          Chat votes: <code>!draft start pokemon</code> (or <code>champions</code>, <code>kart</code>, <code>mkw</code>, <code>tracks</code>, <code>mkwtracks</code>, <code>stage</code>, <code>stages</code>, <code>smash</code>, <code>squad</code>) · <code>!draft next</code> · <code>!draft end</code>. Chat votes with <code>!vote &lt;number&gt;</code>.
        </p>
        <p className="dbot-muted">
          Captains: <code>!draft teams</code> opens sign-ups · viewers type <code>!draft in</code> (or <code>!draft out</code>) · <code>!draft captains @name @name</code> starts it · the captain on the clock types <code>!pick name</code>.
          Starting and ending are for you and your mods; anyone can type <code>!draft</code> to see where it stands.
        </p>
      </div>
    </div>
  );

  function voteContent() {
    if (!data) return null;
    return (
      <>
      {d && (
        <div className="account-card">
          <div className="poll-head">
            <h3 className="account-card__title">{d.title}</h3>
            <Badge variant={running ? "success" : "default"} size="small">{running ? "Live" : "Complete"}</Badge>
          </div>
          <ol className="live-draft__slots">
            {d.slots.map((s, i) => {
              const p = d.picks[i];
              return (
                <li key={s.key} className={p ? "is-filled" : ""}>
                  <span className="live-draft__label">{s.label}</span>
                  <strong>{p ? p.label : i === d.picks.length && d.current ? "Voting now" : "…"}</strong>
                  {p?.detail && <span className="live-draft__detail">{p.detail}</span>}
                </li>
              );
            })}
          </ol>
          {d.current && (
            <p className="dbot-muted">{d.current.question} {d.current.options.map((o) => `${o.id}) ${o.label}: ${o.votes}`).join(" · ")} ({d.current.total} votes)</p>
          )}
          {running && (
            <div className="party-row">
              <Button variant="primary" size="small" disabled={busy} onClick={() => void act("next")}>Close this pick now</Button>
              <Button variant="secondary" size="small" disabled={busy} onClick={() => void act("end")}>End the draft</Button>
            </div>
          )}
        </div>
      )}

      {!running && (
        <div className="account-card">
          <h3 className="account-card__title">Start a draft</h3>
          <div className="poll-form">
            <Select floatingLabel="What chat drafts" value={poolId} onChange={(v) => setPoolId(String(v))}
              options={data.pools.map((p) => ({ value: p.id, label: p.label }))} />
            {pool?.rules.map((r) => (
              <Switch key={`${poolId}:${r.id}`} label={r.label} checked={ruleValue(r.id)}
                onChange={(e) => setRules((cur) => ({ ...cur, [`${poolId}:${r.id}`]: e.target.checked }))} />
            ))}
            <Select floatingLabel="Time to vote on each pick" value={seconds} onChange={(v) => setSeconds(String(v))}
              options={[{ value: "30", label: "30 seconds" }, { value: "45", label: "45 seconds" }, { value: "60", label: "1 minute" }, { value: "90", label: "90 seconds" }, { value: "120", label: "2 minutes" }]} />
            <Select floatingLabel="Options per pick" value={options} onChange={(v) => setOptions(String(v))}
              options={[2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: `${n} options` }))} />
            <div><Button variant="primary" disabled={busy} onClick={() => void start()}>Start the draft</Button></div>
          </div>
        </div>
      )}

      <p className="dbot-muted">Pokémon names only, no art: it&apos;s an unofficial fan tool.</p>
      </>
    );
  }
}
