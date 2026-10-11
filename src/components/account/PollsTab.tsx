"use client";

/**
 * Streaming ▸ Live games ▸ Polls (GS Pro): start a poll (a question and 2 to 8
 * options), watch the running one, close it; past polls in a short table, ten
 * at a time, with Run again. One poll runs per community at a time, voted on
 * from Twitch, Discord, the live page and the overlay.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Alert, Badge, Button, EmptyState, Input, Select, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import { MAX_POLL_OPTIONS, MIN_POLL_OPTIONS, type Poll, type PollTally } from "@/lib/polls/types";
import { EVENTS, tagged } from "@/lib/analytics/events";
import { IconAction } from "@/components/actions/IconAction";
import { IconChartBar, IconX } from "@tabler/icons-react";
import { AdminPanel, AdminScreen, AdminSection, AdminTable } from "@/components/account/admin/AdminKit";

const PAGE = 10;
const STATUS_BADGE: Record<string, { label: string; variant: "success" | "warning" | "default" }> = {
  open: { label: "Running", variant: "success" },
  draft: { label: "Saved", variant: "warning" },
  closed: { label: "Closed", variant: "default" },
};
import { LoadingLines } from "@/components/loading/LoadingLines";

export function PollsTab() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [isPro, setIsPro] = useState(false);
  const [hasCommunity, setHasCommunity] = useState(false);
  const [polls, setPolls] = useState<Poll[]>([]);
  const [tallies, setTallies] = useState<Record<string, PollTally>>({});
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [shown, setShown] = useState(PAGE);
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
          .filter((p, i) => p.status === "open" || (p.status !== "draft" && i < PAGE))
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

  // Tallies for polls revealed by "Show more" (the first load only covers the first page).
  useEffect(() => {
    if (shown <= PAGE) return;
    const need = polls.filter((p, i) => p.status !== "draft" && i < shown + 1 && !(p.id in tallies)).slice(0, PAGE);
    if (!need.length) return;
    let active = true;
    void Promise.all(need.map(async (p) => {
      const r = await fetch(`/api/polls/${p.id}`, { cache: "no-store" }).then((x) => x.json()).catch(() => null);
      return r?.ok ? ([p.id, r.tally as PollTally] as const) : ([p.id, { total: 0, byOption: {} } as unknown as PollTally] as const);
    })).then((got) => { if (active) setTallies((t) => ({ ...t, ...Object.fromEntries(got) })); });
    return () => { active = false; };
  }, [shown, polls, tallies]);

  const setOption = (i: number, v: string) => setOptions((o) => o.map((x, j) => (j === i ? v : x)));
  const addOption = () => setOptions((o) => (o.length < MAX_POLL_OPTIONS ? [...o, ""] : o));
  const removeOption = (i: number) => setOptions((o) => (o.length > MIN_POLL_OPTIONS ? o.filter((_, j) => j !== i) : o));

  async function create(openNow: boolean, again?: Poll) {
    const opts = again ? again.options.map((o) => o.label) : options.map((o) => o.trim()).filter(Boolean);
    const q = again ? again.question : question;
    if (!q.trim() || opts.length < MIN_POLL_OPTIONS) {
      toast.error("Add a question and at least two options.");
      return;
    }
    setBusy(true);
    const res = await fetch("/api/polls", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: q,
        options: opts,
        open: openNow,
        closeInSeconds: openNow ? Number(closeMins) * 60 : 0,
      }),
    });
    setBusy(false);
    if (res.ok) {
      toast.success(openNow ? "Poll started" : "Poll saved for later");
      if (!again) { setQuestion(""); setOptions(["", ""]); }
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

  const intro = "One question, voted on from Twitch, Discord, your live page and the overlay at once. One poll runs at a time.";
  if (loading) return <AdminScreen title="Polls" intro={intro}><LoadingLines label="Loading" /></AdminScreen>;

  if (!isPro) {
    return (
      <AdminScreen title="Polls" intro={intro}>
        <Alert variant="info" title="Polls are part of GS Pro">
          Run live polls your viewers vote on from chat, Discord and your stream.{" "}
          <Link href="/gs-pro?from=polls" className={tagged(EVENTS.upgradeClicked, { from: "polls" })}>See GS Pro</Link>
        </Alert>
      </AdminScreen>
    );
  }

  if (!hasCommunity) {
    return (
      <AdminScreen title="Polls" intro={intro}>
        <Alert variant="info">Connect Twitch on <Link href="/account/streaming?tab=integrations">Streaming ▸ Setup</Link> to run polls.</Alert>
      </AdminScreen>
    );
  }

  const running = polls.find((p) => p.status === "open") ?? null;
  const past = polls.filter((p) => p !== running);
  const topOf = (poll: Poll) => {
    const t = tallies[poll.id];
    if (!t || !t.total) return null;
    const best = poll.options.reduce((a, o) => ((t.byOption[o.id] ?? 0) > (t.byOption[a.id] ?? 0) ? o : a), poll.options[0]);
    return best?.label ?? null;
  };

  return (
    <AdminScreen title="Polls" intro={intro}>
      {running && (
        <AdminPanel title="Running now" className="poll-running">
          <p className="poll-running__q">{running.question}</p>
          <ul className="poll-results">
            {running.options.map((o) => {
              const t = tallies[running.id];
              const count = t?.byOption[o.id] ?? 0;
              const pct = t?.total ? Math.round((count / t.total) * 100) : 0;
              return (
                <li key={o.id} className="poll-result">
                  <div className="poll-result__row"><span>{o.label}</span><span className="dbot-muted">{count} · {pct}%</span></div>
                  <div className="poll-bar"><div className="poll-bar__fill" style={{ width: `${pct}%` }} /></div>
                </li>
              );
            })}
          </ul>
          <div><Button variant="secondary" size="small" onClick={() => void transition(running.id, "close")} disabled={busy}>Close the poll</Button></div>
        </AdminPanel>
      )}

      <AdminSection title="Start a poll" intro={running ? "Starting a new poll closes the one that's running." : undefined}>
        <div className="poll-form">
          <Input floatingLabel="Question" value={question} onChange={(e) => setQuestion(e.target.value)} fullWidth />
          <div className="admin-form-grid">
            {options.map((opt, i) => (
              <div key={i} className="poll-optrow">
                <Input floatingLabel={`Option ${i + 1}`} value={opt} onChange={(e) => setOption(i, e.target.value)} fullWidth />
                {options.length > MIN_POLL_OPTIONS && <IconAction label={`Remove option ${i + 1}`} icon={IconX} onClick={() => removeOption(i)} />}
              </div>
            ))}
          </div>
          <div className="admin-form-grid">
            <Select
              floatingLabel="Close it"
              options={[
                { value: "0", label: "When I close it" },
                { value: "1", label: "After 1 minute" },
                { value: "2", label: "After 2 minutes" },
                { value: "5", label: "After 5 minutes" },
                { value: "10", label: "After 10 minutes" },
              ]}
              value={closeMins}
              onChange={(v) => setCloseMins(v as string)}
            />
          </div>
          <div className="admin-row-actions poll-form__actions">
            {options.length < MAX_POLL_OPTIONS && <Button variant="ghost" size="small" onClick={addOption}>Add an option</Button>}
            <Button variant="primary" onClick={() => void create(true)} disabled={busy}>Start the poll</Button>
            <Button variant="secondary" onClick={() => void create(false)} disabled={busy}>Save for later</Button>
          </div>
        </div>
      </AdminSection>

      <AdminSection title="Recent polls">
        {past.length === 0 ? (
          <EmptyState variant="bordered" icon={<IconChartBar size={28} />} title="No polls yet" description="Polls you run or save show here." />
        ) : (
          <>
            <AdminTable label="Recent polls">
              <Table variant="striped" dense>
                <TableHeader>
                  <TableRow>
                    <TableHead>Question</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead align="right">Votes</TableHead>
                    <TableHead>Top answer</TableHead>
                    <TableHead align="right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {past.slice(0, shown).map((poll) => {
                    const t = tallies[poll.id];
                    const badge = STATUS_BADGE[poll.status] ?? STATUS_BADGE.closed;
                    const top = topOf(poll);
                    return (
                      <TableRow key={poll.id}>
                        <TableCell>{poll.question}<span className="admin-table__sub">{poll.options.length} options</span></TableCell>
                        <TableCell><Badge variant={badge.variant} size="small">{badge.label}</Badge></TableCell>
                        <TableCell align="right" className="admin-num">{poll.status === "draft" ? "-" : t ? t.total : "…"}</TableCell>
                        <TableCell>{poll.status === "draft" ? <span className="dbot-muted">Not run yet</span> : top ?? <span className="dbot-muted">{t ? "No votes" : "-"}</span>}</TableCell>
                        <TableCell align="right">
                          {poll.status === "draft"
                            ? <Button variant="ghost" size="small" onClick={() => void transition(poll.id, "open")} disabled={busy}>Start</Button>
                            : <Button variant="ghost" size="small" onClick={() => void create(true, poll)} disabled={busy}>Run again</Button>}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </AdminTable>
            {past.length > shown && (
              <div><Button variant="ghost" size="small" onClick={() => setShown((n) => n + PAGE)}>Show {Math.min(PAGE, past.length - shown)} more of {past.length}</Button></div>
            )}
          </>
        )}
      </AdminSection>
    </AdminScreen>
  );
}
