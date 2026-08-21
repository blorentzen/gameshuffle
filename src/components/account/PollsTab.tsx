"use client";

/**
 * Polls tab (Community & Chat) — GS Pro streamer authoring surface for live
 * polls. Compose a question + 2–8 options, open it (a community runs one open
 * poll at a time), watch the tally, and close it. Voting surfaces (chat,
 * Discord, /live) come in later phases; this is the create/run/close home.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, Input, Select, Switch } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import { MAX_POLL_OPTIONS, MIN_POLL_OPTIONS, type Poll, type PollTally } from "@/lib/polls/types";

export function PollsTab() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [isPro, setIsPro] = useState(false);
  const [hasCommunity, setHasCommunity] = useState(false);
  const [polls, setPolls] = useState<Poll[]>([]);
  const [tallies, setTallies] = useState<Record<string, PollTally>>({});
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [openNow, setOpenNow] = useState(true);
  const [closeMins, setCloseMins] = useState("0");
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const refresh = () => setReloadKey((k) => k + 1);

  useEffect(() => {
    let active = true;
    (async () => {
      const d = await fetch("/api/polls", { cache: "no-store" }).then((r) => r.json()).catch(() => null);
      if (!active) return;
      if (!d?.ok) {
        setLoading(false);
        return;
      }
      setIsPro(!!d.isPro);
      setHasCommunity(!!d.hasCommunity);
      const list = (d.polls as Poll[]) ?? [];
      setPolls(list);
      setLoading(false);
      const entries = await Promise.all(
        list
          .filter((p) => p.status !== "draft")
          .map(async (p) => {
            const r = await fetch(`/api/polls/${p.id}`, { cache: "no-store" }).then((x) => x.json()).catch(() => null);
            return r?.ok ? ([p.id, r.tally as PollTally] as const) : null;
          }),
      );
      if (active) setTallies(Object.fromEntries(entries.filter(Boolean) as [string, PollTally][]));
    })();
    return () => {
      active = false;
    };
  }, [reloadKey]);

  const setOption = (i: number, v: string) => setOptions((o) => o.map((x, j) => (j === i ? v : x)));
  const addOption = () => setOptions((o) => (o.length < MAX_POLL_OPTIONS ? [...o, ""] : o));
  const removeOption = (i: number) => setOptions((o) => (o.length > MIN_POLL_OPTIONS ? o.filter((_, j) => j !== i) : o));

  async function create() {
    const opts = options.map((o) => o.trim()).filter(Boolean);
    if (!question.trim() || opts.length < MIN_POLL_OPTIONS) {
      toast.error("Add a question and at least two options.");
      return;
    }
    setBusy(true);
    const res = await fetch("/api/polls", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question,
        options: opts,
        open: openNow,
        closeInSeconds: Number(closeMins) * 60,
      }),
    });
    setBusy(false);
    if (res.ok) {
      toast.success(openNow ? "Poll opened." : "Poll saved as a draft.");
      setQuestion("");
      setOptions(["", ""]);
      refresh();
    } else {
      const d = await res.json().catch(() => null);
      toast.error(d?.error === "pro_required" ? "Polls are a GS Pro feature." : "Couldn't create the poll.");
    }
  }

  async function transition(id: string, action: "open" | "close") {
    setBusy(true);
    const res = await fetch(`/api/polls/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setBusy(false);
    if (res.ok) {
      toast.success(action === "open" ? "Poll opened." : "Poll closed.");
      refresh();
    } else toast.error("Couldn't update the poll.");
  }

  if (loading) return <div className="account-card"><p>Loading…</p></div>;

  if (!isPro) {
    return (
      <div className="account-tab">
        <h2 className="account-tab__heading">Polls</h2>
        <div className="account-card dbot-locked">
          <div className="dbot-locked__head">
            <h3 className="account-card__title">Polls</h3>
            <span className="dbot-lock-badge">GS Pro</span>
          </div>
          <p className="dbot-muted">
            Run live polls your viewers vote on from chat, Discord, and your stream. Creating polls is a GS Pro feature.
          </p>
          <Link href="/gs-pro"><Button variant="primary" size="small">See GS Pro</Button></Link>
        </div>
      </div>
    );
  }

  return (
    <div className="account-tab">
      <h2 className="account-tab__heading">Polls</h2>
      <p className="account-tab__intro">
        Ask your community a question and let them vote live. Your community runs one open poll at a time.
      </p>

      {!hasCommunity ? (
        <div className="account-card">
          <p className="dbot-muted">
            Connect Twitch on the <Link href="/account/streamer?tab=integrations">Integrations tab</Link> to run polls.
          </p>
        </div>
      ) : (
        <>
          {/* Compose */}
          <div className="account-card">
            <h3 className="account-card__title">New poll</h3>
            <div className="poll-form">
              <Input
                floatingLabel="Question"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                fullWidth
              />
              {options.map((opt, i) => (
                <div key={i} className="poll-optrow">
                  <Input
                    floatingLabel={`Option ${i + 1}`}
                    value={opt}
                    onChange={(e) => setOption(i, e.target.value)}
                    fullWidth
                  />
                  {options.length > MIN_POLL_OPTIONS && (
                    <Button variant="ghost" size="small" onClick={() => removeOption(i)}>Remove</Button>
                  )}
                </div>
              ))}
              {options.length < MAX_POLL_OPTIONS && (
                <Button variant="secondary" size="small" onClick={addOption}>Add option</Button>
              )}
              <Switch
                checked={openNow}
                onChange={(e) => setOpenNow(e.target.checked)}
                label="Open it right away (otherwise save as a draft)"
              />
              {openNow && (
                <Select
                  floatingLabel="Auto-close"
                  options={[
                    { value: "0", label: "Off — I'll close it myself" },
                    { value: "1", label: "After 1 minute" },
                    { value: "2", label: "After 2 minutes" },
                    { value: "5", label: "After 5 minutes" },
                    { value: "10", label: "After 10 minutes" },
                  ]}
                  value={closeMins}
                  onChange={(v) => setCloseMins(v as string)}
                />
              )}
              <div>
                <Button variant="primary" onClick={() => void create()} disabled={busy}>
                  {openNow ? "Create & open" : "Save draft"}
                </Button>
              </div>
            </div>
          </div>

          {/* Existing polls */}
          {polls.length === 0 ? (
            <div className="account-card"><p className="dbot-muted">No polls yet. Create your first one above.</p></div>
          ) : (
            polls.map((poll) => {
              const t = tallies[poll.id];
              const total = t?.total ?? 0;
              const topCount = poll.status === "closed" ? Math.max(0, ...poll.options.map((o) => t?.byOption[o.id] ?? 0)) : -1;
              return (
                <div key={poll.id} className="account-card">
                  <div className="poll-head">
                    <h3 className="account-card__title">{poll.question}</h3>
                    <span className={`poll-status poll-status--${poll.status}`}>{poll.status}</span>
                  </div>
                  {poll.status !== "draft" && (
                    <ul className="poll-results">
                      {poll.options.map((o) => {
                        const count = t?.byOption[o.id] ?? 0;
                        const pct = total ? Math.round((count / total) * 100) : 0;
                        const isWinner = poll.status === "closed" && count > 0 && count === topCount;
                        return (
                          <li key={o.id} className={`poll-result${isWinner ? " poll-result--win" : ""}`}>
                            <div className="poll-result__row">
                              <span>{o.label}</span>
                              <span className="dbot-muted">{count} · {pct}%</span>
                            </div>
                            <div className="poll-bar"><div className="poll-bar__fill" style={{ width: `${pct}%` }} /></div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {poll.status === "draft" && (
                    <ul className="poll-optlist">
                      {poll.options.map((o) => <li key={o.id}>{o.label}</li>)}
                    </ul>
                  )}
                  <div className="poll-actions">
                    {poll.status === "open" && (
                      <Button variant="secondary" size="small" onClick={() => void transition(poll.id, "close")} disabled={busy}>Close poll</Button>
                    )}
                    {poll.status !== "open" && poll.status !== "closed" && (
                      <Button variant="primary" size="small" onClick={() => void transition(poll.id, "open")} disabled={busy}>Open poll</Button>
                    )}
                    {poll.status === "closed" && <span className="dbot-muted">Closed · {total} vote{total === 1 ? "" : "s"}</span>}
                  </div>
                </div>
              );
            })
          )}
        </>
      )}
    </div>
  );
}
