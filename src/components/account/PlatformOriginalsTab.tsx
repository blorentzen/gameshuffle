"use client";

/**
 * Platform admin ▸ Originals ▸ Overview (staff/admin): one place to check our own games.
 * Chat Brain (launch progress, answers and where they come from, questions
 * furthest from a board, what needs doing), the Daily Shuffle (today, the next
 * week of answers, plays, characters missing facts or a clue) and the Weekly
 * (this week, next week, last week's top 3). Each links to its own tab for
 * changes.
 */

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button, Progress, StatCard, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@empac/cascadeds";
import {
  IconBrain, IconCalendarEvent, IconChecklist, IconMessageCircle, IconRefresh, IconTrophy, IconUsers,
} from "@tabler/icons-react";
import { CategoryIcon } from "@/components/chatbrain/brainIcons";
import type { OriginalsOverview } from "@/lib/originals/overview";
import { LoadingLines } from "@/components/loading/LoadingLines";
import { AdminHeader, AdminPanel, AdminSection, AdminStats, AdminTable } from "@/components/account/admin/AdminKit";

const SOURCE_LABELS: Record<string, string> = {
  site: "Chat Brain page", daily: "Daily end screen", weekly: "Weekly", home: "Homepage", night: "Live nights",
  discord: "Discord", twitch: "Twitch", youtube: "YouTube", mock: "Test data",
};
const sourceLabel = (s: string) => SOURCE_LABELS[s] ?? (s.startsWith("share:") ? `Share link: ${s.slice(6)}` : s);
const shortDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

const STATUS_LABELS: Record<string, string> = { draft: "Draft", collecting: "Collecting", review: "In review", published: "Published", retired: "Retired", archived: "Archived" };

export function PlatformOriginalsTab() {
  const router = useRouter();
  const [data, setData] = useState<(OriginalsOverview & { ok: boolean }) | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setBusy(true);
    try {
      const j = await fetch("/api/admin/originals", { cache: "no-store" }).then((r) => r.json()).catch(() => null);
      if (j?.ok) { setData(j); setFailed(false); } else setFailed(true);
    } finally { setBusy(false); }
  }, []);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  const go = (tab: string) => router.push(`/account/platform?tab=${tab}`, { scroll: false });

  const header = (
    <AdminHeader
      title="Originals"
      intro="How our own games are doing: Chat Brain, the Daily Shuffle and the Weekly Challenge. Make changes on each game's tab."
      actions={<Button variant="secondary" size="small" iconBefore={IconRefresh} loading={busy} disabled={busy} onClick={() => void load()}>Refresh</Button>}
    />
  );
  if (!data) return <div className="account-card admin-screen">{header}{failed ? <Alert variant="error">Couldn&apos;t load the Originals numbers. Try Refresh in a moment.</Alert> : <LoadingLines label="Loading" />}</div>;
  const cb = data.chatBrain, d = data.daily, w = data.weekly;
  const maxSource = Math.max(1, ...(cb?.sources.map((s) => s.count) ?? [1]));
  const maxPlays = Math.max(1, ...(d.plays?.map((x) => x.players) ?? [1]));

  return (
    <div className="account-card admin-screen originals-admin">
      {header}

      {/* ── Chat Brain ─────────────────────────────────────────────── */}
      <AdminSection
        title="Chat Brain"
        icon={<IconBrain size={20} stroke={1.75} />}
        actions={<Button variant="ghost" size="small" onClick={() => go("platform-chat-brain")}>Open Chat Brain</Button>}
      >
        {!cb ? <p className="dbot-muted">Chat Brain isn&apos;t set up on this database yet.</p> : (
          <>
            <AdminStats label="Chat Brain">
              <StatCard label="Boards ready for launch" value={`${cb.boards} of ${cb.goal}`} icon={<IconTrophy size={20} />} variant="accent" />
              <StatCard label="Answers this week" value={cb.answers.week.toLocaleString()} source={`${cb.answers.day} in 24 hours · ${cb.answers.total.toLocaleString()} total`} icon={<IconMessageCircle size={20} />} />
              <StatCard label="Ready for review" value={cb.readyForReview} source={`${cb.statuses.collecting} collecting · ${cb.statuses.review} in review`} icon={<IconChecklist size={20} />} />
              <StatCard label="Founding Brains" value={cb.foundingBrains} source="Accounts with 10+ answers" icon={<IconUsers size={20} />} />
            </AdminStats>

            {cb.bankLeft > 0 && (
              <Alert variant="info" title={`${cb.bankLeft} question bank question${cb.bankLeft === 1 ? " isn't" : "s aren't"} in the queue yet`}>
                Add them on the Chat Brain tab with &quot;Add the question bank&quot;. They land as drafts.
              </Alert>
            )}
            {cb.statuses.draft < 10 && (
              <Alert variant="warning" title={`Only ${cb.statuses.draft} draft${cb.statuses.draft === 1 ? "" : "s"} left`}>
                The Weekly survey takes the oldest family-safe draft each Monday, and new questions open from drafts. Add more from the bank or with Claude.
              </Alert>
            )}
            {!cb.updatesConfigured && (
              <Alert variant="warning" title="The launch email list isn't connected">
                &quot;Email me when it opens&quot; stays hidden in production until a developer adds the MailerLite group.
              </Alert>
            )}

            <div className="admin-cols">
              <AdminPanel title="Questions by status">
                <ul className="originals-admin__statuses">
                  {Object.entries(cb.statuses).map(([s, n]) => <li key={s}><Badge variant={s === "published" ? "success" : s === "collecting" ? "info" : "default"} size="small">{STATUS_LABELS[s] ?? s}</Badge><strong>{n}</strong></li>)}
                </ul>
              </AdminPanel>
              <AdminPanel title="Where answers came from, 7 days">
                {cb.sources.length === 0 ? <p className="dbot-muted">No answers this week yet.</p> : (
                  <ul className="originals-admin__bars">
                    {cb.sources.map((s) => (
                      <li key={s.source}>
                        <span>{sourceLabel(s.source)}</span>
                        <span className="originals-admin__bar" aria-hidden><span style={{ width: `${Math.round((s.count / maxSource) * 100)}%` }} /></span>
                        <strong>{s.count}</strong>
                      </li>
                    ))}
                  </ul>
                )}
              </AdminPanel>
            </div>

            <AdminPanel title="Collecting: furthest from a board">
              {cb.collecting.length === 0 ? <p className="dbot-muted">No questions are collecting answers. Open some from the drafts.</p> : (
                <AdminTable label="Questions collecting answers">
                  <Table variant="striped" dense>
                    <TableHeader><TableRow><TableHead>Question</TableHead><TableHead>Answers toward a board</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {cb.collecting.map((q) => (
                        <TableRow key={q.id}>
                          <TableCell><span className="originals-admin__q"><CategoryIcon slug={q.category} size={15} />{q.text}</span></TableCell>
                          <TableCell><span className="originals-admin__progress"><Progress value={Math.min(100, Math.round((q.answers / q.min) * 100))} size="small" label={`${q.answers} of ${q.min} answers`} className="admin-progress-quiet" />{q.answers}/{q.min}</span></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </AdminTable>
              )}
            </AdminPanel>
          </>
        )}
      </AdminSection>

      {/* ── Daily Shuffle ──────────────────────────────────────────── */}
      <AdminSection
        title="The Daily Shuffle"
        icon={<IconCalendarEvent size={20} stroke={1.75} />}
        actions={<Button variant="ghost" size="small" onClick={() => window.open("/daily", "_blank", "noopener")}>Open the Daily</Button>}
      >
        <div className="admin-cols">
          <AdminPanel className="originals-admin__today">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={d.today.img} alt="" />
            <div>
              <span className="home-play__eyebrow">Today · puzzle #{d.today.number}</span>
              <h3 className="originals-admin__answer">{d.today.answer}</h3>
              <p className="dbot-muted">{d.today.game} · {d.today.clue ? "clue ready" : "no clue written"}</p>
            </div>
          </AdminPanel>
          <AdminPanel title="Plays, last 7 days (signed in)">
            {!d.plays ? <p className="dbot-muted">Daily results aren&apos;t set up on this database.</p> : (
              <ul className="originals-admin__bars">
                {d.plays.map((p) => (
                  <li key={p.day}>
                    <span>{shortDay(p.day)}</span>
                    <span className="originals-admin__bar" aria-hidden><span style={{ width: `${Math.round((p.players / maxPlays) * 100)}%` }} /></span>
                    <strong>{p.players}</strong>
                    <span className="dbot-muted">{p.players ? `${Math.round((p.solved / p.players) * 100)}% solved${p.avgGuesses ? ` · ${p.avgGuesses} guesses` : ""}` : ""}</span>
                  </li>
                ))}
              </ul>
            )}
          </AdminPanel>
        </div>
        <AdminPanel title="Coming up">
          <AdminTable label="Upcoming Daily answers">
            <Table variant="striped" dense>
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
          </AdminTable>
          {d.missing.length === 0
            ? <p className="dbot-muted">Every character in every rotation has its facts and a clue.</p>
            : <Alert variant="warning" title={`${d.missing.length} character${d.missing.length === 1 ? " needs" : "s need"} work`}>{d.missing.map((m) => `${m.name} (${m.game}, ${m.what})`).join(", ")}</Alert>}
        </AdminPanel>
      </AdminSection>

      {/* ── Weekly ─────────────────────────────────────────────────── */}
      <AdminSection
        title="The Weekly Challenge"
        icon={<IconTrophy size={20} stroke={1.75} />}
        iconTone="accent"
        actions={<Button variant="ghost" size="small" onClick={() => go("platform-weekly")}>Change the picks</Button>}
      >
        {!w ? <p className="dbot-muted">The Weekly isn&apos;t set up on this database yet.</p> : (
          <div className="originals-admin__weeks">
            {w.weeks.map((wk) => (
              <AdminPanel key={wk.label}>
                <span className="home-play__eyebrow">{wk.label} · week {wk.number}</span>
                <h3 className="originals-admin__answer">{wk.title}</h3>
                <div className="dbot-muted">
                  <Badge variant={wk.kind === "survey" ? "info" : "default"} size="small">{wk.kind === "survey" ? "Survey" : "Tier War"}</Badge>{" "}
                  {wk.players} {wk.players === 1 ? "player" : "players"}{wk.swapped ? " · picked by staff" : " · picked automatically"}
                </div>
              </AdminPanel>
            ))}
            <AdminPanel>
              <span className="home-play__eyebrow">Last week{w.last ? ` · week ${w.last.number}` : ""}</span>
              {w.last ? (
                <ol className="originals-admin__top3">{w.last.top.map((t) => <li key={t.name}><span>{t.name}</span><strong>{t.total}</strong></li>)}</ol>
              ) : <p className="dbot-muted">No revealed results yet.</p>}
            </AdminPanel>
          </div>
        )}
      </AdminSection>
    </div>
  );
}
