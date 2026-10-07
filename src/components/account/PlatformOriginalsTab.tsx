"use client";

/**
 * Platform ▸ Originals (staff/admin): one place to check the daily games.
 * Chat Brain (launch progress, answers and where they come from, questions
 * furthest from a board, what needs doing), the Daily Shuffle (today, the next
 * week of answers, plays, characters missing facts or a clue) and the Weekly
 * (this week, next week, last week's top 3). Each links to its own tab for
 * changes.
 */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button, Progress, StatCard, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@empac/cascadeds";
import {
  IconBrain, IconCalendarEvent, IconChecklist, IconMessageCircle, IconRefresh, IconTrophy, IconUsers,
} from "@tabler/icons-react";
import { CategoryIcon } from "@/components/chatbrain/brainIcons";
import type { OriginalsOverview } from "@/lib/originals/overview";
import { LoadingLines } from "@/components/loading/LoadingLines";

const SOURCE_LABELS: Record<string, string> = {
  site: "Chat Brain page", daily: "Daily end screen", weekly: "Weekly", home: "Homepage", night: "Live nights",
  discord: "Discord", twitch: "Twitch", youtube: "YouTube", mock: "Test data",
};
const sourceLabel = (s: string) => SOURCE_LABELS[s] ?? (s.startsWith("share:") ? `Share link: ${s.slice(6)}` : s);
const shortDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

export function PlatformOriginalsTab() {
  const [data, setData] = useState<(OriginalsOverview & { ok: boolean }) | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setBusy(true);
    try {
      const j = await fetch("/api/admin/originals", { cache: "no-store" }).then((r) => r.json()).catch(() => null);
      if (j?.ok) setData(j);
    } finally { setBusy(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (!data) return <div className="account-card"><LoadingLines label="Loading" /></div>;
  const cb = data.chatBrain, d = data.daily, w = data.weekly;
  const maxSource = Math.max(1, ...(cb?.sources.map((s) => s.count) ?? [1]));

  return (
    <div className="account-tab originals-admin">
      <div className="originals-admin__top">
        <h2 className="account-tab__heading">Originals</h2>
        <Button variant="secondary" size="small" iconBefore={IconRefresh} disabled={busy} onClick={() => void load()}>Refresh</Button>
      </div>

      {/* ── Chat Brain ─────────────────────────────────────────────── */}
      <section className="originals-admin__section">
        <div className="originals-admin__head">
          <span className="cb-tile__icon" aria-hidden><IconBrain size={22} stroke={1.75} /></span>
          <h3>Chat Brain</h3>
          <Link href="/account/platform?tab=platform-chat-brain"><Button variant="ghost" size="small">Open the queue</Button></Link>
        </div>
        {!cb ? <p className="dbot-muted">Chat Brain isn&apos;t set up on this database yet.</p> : (
          <>
            <div className="originals-admin__stats">
              <StatCard label="Boards ready for launch" value={`${cb.boards} of ${cb.goal}`} icon={<IconTrophy size={20} />} variant="accent" />
              <StatCard label="Answers this week" value={cb.answers.week.toLocaleString()} source={`${cb.answers.day} in the last 24 hours · ${cb.answers.total.toLocaleString()} total`} icon={<IconMessageCircle size={20} />} />
              <StatCard label="Ready for review" value={cb.readyForReview} source={`${cb.statuses.collecting} collecting · ${cb.statuses.review} in review`} icon={<IconChecklist size={20} />} />
              <StatCard label="Founding Brains" value={cb.foundingBrains} source="Accounts with 10+ answers" icon={<IconUsers size={20} />} />
            </div>

            {cb.bankLeft > 0 && (
              <Alert variant="info" title={`${cb.bankLeft} question bank question${cb.bankLeft === 1 ? " isn't" : "s aren't"} in the queue yet`}>
                Add them from the queue with &quot;Add the question bank&quot;. They land as drafts.
              </Alert>
            )}
            {cb.statuses.draft < 10 && (
              <Alert variant="warning" title={`Only ${cb.statuses.draft} draft${cb.statuses.draft === 1 ? "" : "s"} left`}>
                The Weekly survey takes the oldest family-safe draft each Monday, and you open new questions from drafts. Add more from the bank or with Claude.
              </Alert>
            )}
            {!cb.updatesConfigured && (
              <Alert variant="warning" title="The launch email list isn't connected">
                &quot;Email me when it opens&quot; stays hidden in production until the MailerLite group id is set in <code>src/lib/chatbrain/updates.ts</code>.
              </Alert>
            )}

            <div className="originals-admin__cols">
              <div className="account-card">
                <h4 className="originals-admin__h4">Questions by status</h4>
                <ul className="originals-admin__statuses">
                  {Object.entries(cb.statuses).map(([s, n]) => <li key={s}><Badge variant={s === "published" ? "success" : s === "collecting" ? "info" : "default"} size="small">{s}</Badge><strong>{n}</strong></li>)}
                </ul>
              </div>
              <div className="account-card">
                <h4 className="originals-admin__h4">Where answers came from (7 days)</h4>
                {cb.sources.length === 0 ? <p className="dbot-muted">No answers this week yet.</p> : (
                  <ul className="originals-admin__bars">
                    {cb.sources.map((s) => (
                      <li key={s.source}>
                        <span>{sourceLabel(s.source)}</span>
                        <span className="originals-admin__bar"><span style={{ width: `${Math.round((s.count / maxSource) * 100)}%` }} /></span>
                        <strong>{s.count}</strong>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="account-card">
              <h4 className="originals-admin__h4">Collecting: furthest from a board</h4>
              {cb.collecting.length === 0 ? <p className="dbot-muted">No questions are collecting answers. Open some from the drafts.</p> : (
                <div className="originals-admin__scroll">
                  <Table variant="default" dense>
                    <TableHeader><TableRow><TableHead>Question</TableHead><TableHead>Answers</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {cb.collecting.map((q) => (
                        <TableRow key={q.id}>
                          <TableCell><span className="originals-admin__q"><CategoryIcon slug={q.category} size={15} />{q.text}</span></TableCell>
                          <TableCell><span className="originals-admin__progress"><Progress value={Math.min(100, Math.round((q.answers / q.min) * 100))} size="small" aria-label="Answers toward a board" />{q.answers}/{q.min}</span></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </>
        )}
      </section>

      {/* ── Daily Shuffle ──────────────────────────────────────────── */}
      <section className="originals-admin__section">
        <div className="originals-admin__head">
          <span className="cb-tile__icon" aria-hidden><IconCalendarEvent size={22} stroke={1.75} /></span>
          <h3>The Daily Shuffle</h3>
          <Link href="/daily"><Button variant="ghost" size="small">Open the Daily</Button></Link>
        </div>
        <div className="originals-admin__cols">
          <div className="account-card originals-admin__today">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={d.today.img} alt="" />
            <div>
              <span className="home-play__eyebrow">Today · puzzle #{d.today.number}</span>
              <h4 className="originals-admin__answer">{d.today.answer}</h4>
              <p className="dbot-muted">{d.today.game} · {d.today.clue ? "clue ready" : "no clue written"}</p>
            </div>
          </div>
          <div className="account-card">
            <h4 className="originals-admin__h4">Plays (signed in, last 7 days)</h4>
            {!d.plays ? <p className="dbot-muted">Daily results aren&apos;t set up on this database.</p> : (
              <ul className="originals-admin__bars">
                {d.plays.map((p) => (
                  <li key={p.day}>
                    <span>{shortDay(p.day)}</span>
                    <span className="originals-admin__bar"><span style={{ width: `${Math.round((p.players / Math.max(1, ...d.plays!.map((x) => x.players))) * 100)}%` }} /></span>
                    <strong>{p.players}</strong>
                    <span className="dbot-muted">{p.players ? `${Math.round((p.solved / p.players) * 100)}% solved${p.avgGuesses ? ` · ${p.avgGuesses} guesses` : ""}` : ""}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div className="account-card">
          <h4 className="originals-admin__h4">Coming up</h4>
          <div className="originals-admin__scroll">
            <Table variant="default" dense>
              <TableHeader><TableRow><TableHead>Day</TableHead><TableHead>Game</TableHead><TableHead>Answer</TableHead><TableHead>Clue</TableHead></TableRow></TableHeader>
              <TableBody>
                {d.upcoming.map((u) => (
                  <TableRow key={u.day}>
                    <TableCell>{shortDay(u.day)} · #{u.number}</TableCell>
                    <TableCell>{u.game}</TableCell>
                    <TableCell><strong>{u.answer}</strong></TableCell>
                    <TableCell>{u.clue ? <Badge variant="success" size="small">Ready</Badge> : <Badge variant="warning" size="small">Missing</Badge>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {d.missing.length === 0
            ? <p className="dbot-muted">Every character in every rotation has its facts and a clue.</p>
            : <Alert variant="warning" title={`${d.missing.length} character${d.missing.length === 1 ? " needs" : "s need"} work`}>{d.missing.map((m) => `${m.name} (${m.game}, ${m.what})`).join(", ")}</Alert>}
        </div>
      </section>

      {/* ── Weekly ─────────────────────────────────────────────────── */}
      <section className="originals-admin__section">
        <div className="originals-admin__head">
          <span className="cb-tile__icon cb-tile__icon--accent" aria-hidden><IconTrophy size={22} stroke={1.75} /></span>
          <h3>The Weekly Challenge</h3>
          <Link href="/account/platform?tab=platform-weekly"><Button variant="ghost" size="small">Change the picks</Button></Link>
        </div>
        {!w ? <p className="dbot-muted">The Weekly isn&apos;t set up on this database yet.</p> : (
          <div className="originals-admin__cols">
            {w.weeks.map((wk) => (
              <div key={wk.label} className="account-card">
                <span className="home-play__eyebrow">{wk.label} · week {wk.number}</span>
                <h4 className="originals-admin__answer">{wk.title}</h4>
                <p className="dbot-muted">
                  <Badge variant={wk.kind === "survey" ? "info" : "default"} size="small">{wk.kind === "survey" ? "Survey" : "Tier War"}</Badge>{" "}
                  {wk.players} {wk.players === 1 ? "player" : "players"}{wk.swapped ? " · picked by staff" : " · picked automatically"}
                </p>
              </div>
            ))}
            <div className="account-card">
              <span className="home-play__eyebrow">Last week{w.last ? ` · week ${w.last.number}` : ""}</span>
              {w.last ? (
                <ol className="originals-admin__top3">{w.last.top.map((t) => <li key={t.name}><span>{t.name}</span><strong>{t.total}</strong></li>)}</ol>
              ) : <p className="dbot-muted">No revealed results yet.</p>}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
