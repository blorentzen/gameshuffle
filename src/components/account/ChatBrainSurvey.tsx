"use client";

/**
 * Chat Brain ▸ Survey your chat: ask chat a question from the dashboard and
 * steer the round. Your own question shows its answers live (or keeps them
 * secret to play the board next) and becomes a board when it gets 10+ answers;
 * a GameShuffle question feeds the site-wide boards and always stays secret.
 * While a round is open: hide or merge groups (they're numbered the same as on
 * stream, for `!cb hide` / `!cb merge`), or close it early. Engine:
 * src/lib/chatbrain/survey.ts via /api/chat-brain/stream.
 */

import { useState } from "react";
import { Accordion, Badge, Button, Checkbox, Input, Select } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import type { SurveyHostView } from "@/lib/chatbrain/survey";

const SECONDS = [30, 45, 60, 90, 120, 180];

const ERRORS: Record<string, string> = {
  window_open: "A question is already open in your chat.",
  game_running: "Finish the game first.",
  no_questions: "No GameShuffle questions are open right now. Ask your own instead.",
  not_pro: "Asking your own question is part of GS Pro.",
  bad_question: "Questions need to be 8 to 140 characters.",
  blocked: "That question can't be used. Try another.",
  not_ready: "Surveys need a quick update on our side first.",
  no_survey: "No survey is open.",
  closed: "That survey has closed.",
  not_found: "That group has changed. Try again.",
  pick_two: "Pick two or more groups to merge.",
  no_twitch: "Connect Twitch first so chat can answer.",
};

const REASONS: Record<string, string> = {
  few_answers: "Not enough answers for a board this time: it takes 10.",
  few_groups: "Chat didn't agree enough for a board: it takes 3 answers that two or more people gave.",
  failed: "The board didn't save. Try the survey again.",
};

const secsUntil = (iso: string) => Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / 1000));

export function ChatBrainSurveyCard({ survey, categories, onChange }: {
  survey: SurveyHostView | null;
  categories: { slug: string; name: string }[];
  onChange: (survey: SurveyHostView | null) => void;
}) {
  const toast = useToast();
  const [kind, setKind] = useState<"own" | "gs">("own");
  const [question, setQuestion] = useState("");
  const [category, setCategory] = useState("any");
  const [seconds, setSeconds] = useState("60");
  const [style, setStyle] = useState<"live" | "hidden">("live");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const call = async (method: "POST" | "PATCH", body: unknown, ok?: string) => {
    setBusy(true);
    const res = await fetch("/api/chat-brain/stream", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await res.json().catch(() => null);
    setBusy(false);
    if (!d?.ok) { toast.error(ERRORS[d?.error] ?? "That didn't work."); return false; }
    onChange(d.survey ?? null);
    if (ok) toast.success(ok);
    return true;
  };

  const ask = async () => {
    const sent = await call("POST", { survey: kind === "own" ? { question, seconds: Number(seconds), style } : { category, seconds: Number(seconds) } }, "The question is in your chat.");
    if (sent) setQuestion("");
  };

  const toggle = (key: string) => setPicked((prev) => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  const merge = async () => {
    // The biggest picked group keeps its name.
    const keys = (survey?.all ?? []).filter((g) => picked.has(g.key)).map((g) => g.key);
    if (await call("PATCH", { action: "survey_merge", keys }, "Merged")) setPicked(new Set());
  };

  if (!survey) {
    return (
      <div className="account-card">
        <h2 className="account-card__title">Survey your chat</h2>
        <p className="dbot-muted">
          Ask chat a question and everyone answers with <code>!a</code>. Your own question becomes a board you can play right after
          (with 10 or more answers). A GameShuffle question helps build the boards everyone plays.
        </p>
        <div className="poll-form">
          <Select floatingLabel="What to ask" value={kind} onChange={(v) => setKind(String(v) === "gs" ? "gs" : "own")}
            options={[{ value: "own", label: "Your own question (makes a board)" }, { value: "gs", label: "A GameShuffle question" }]} />
          {kind === "own" ? (
            <>
              <Input id="cb-survey-q" floatingLabel="Your question" fullWidth value={question} maxLength={140} onChange={(e) => setQuestion(e.target.value)} />
              <Select floatingLabel="Chat's answers" value={style} onChange={(v) => setStyle(String(v) === "hidden" ? "hidden" : "live")}
                options={[{ value: "live", label: "Show them on stream as they come in" }, { value: "hidden", label: "Keep them secret (to play the board next)" }]} />
            </>
          ) : (
            <Select floatingLabel="Category" value={category} onChange={(v) => setCategory(String(v))}
              options={[{ value: "any", label: "Whatever needs answers most" }, ...categories.map((c) => ({ value: c.slug, label: c.name }))]} />
          )}
          <Select floatingLabel="How long chat has" value={seconds} onChange={(v) => setSeconds(String(v))}
            options={SECONDS.map((n) => ({ value: String(n), label: n < 60 ? `${n} seconds` : `${n / 60 === Math.floor(n / 60) ? n / 60 : (n / 60).toFixed(1)} minute${n === 60 ? "" : "s"}${n === 60 ? " (default)" : ""}` }))} />
          <div>
            <Button variant="secondary" disabled={busy || (kind === "own" && question.trim().length < 8)} onClick={() => void ask()}>Ask chat</Button>
          </div>
        </div>
      </div>
    );
  }

  const open = survey.status === "open";
  const groupList = (
    <>
      {survey.all.length === 0 ? (
        <p className="dbot-muted">No two people have given the same answer yet.</p>
      ) : (
        <ul className="cb-survey__groups">
          {survey.all.map((g) => (
            <li key={g.key} className={`cb-survey__group${g.hidden ? " is-hidden" : ""}`}>
              {open && <Checkbox id={`cbs-${g.key}`} aria-label={`Pick ${g.label} to merge`} checked={picked.has(g.key)} onChange={() => toggle(g.key)} className="cb-survey__pick" />}
              <span className="cb-survey__label">{g.label}</span>
              <span className="cb-survey__count">{g.count}</span>
              <span className="cb-survey__where">{g.hidden ? <Badge size="small" variant="default">Hidden</Badge> : g.shownAs && survey.style === "live" ? `#${g.shownAs} on stream` : ""}</span>
              {open && (
                <Button variant="ghost" size="small" disabled={busy} onClick={() => void call("PATCH", { action: "survey_hide", key: g.key, hide: !g.hidden }, g.hidden ? "Shown again" : "Hidden")}>
                  {g.hidden ? "Show" : "Hide"}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="dbot-muted">
        {survey.singles > 0 ? `${survey.singles} answer${survey.singles === 1 ? "" : "s"} only one person gave. ` : ""}
        {survey.aiPasses > 0 ? `AI has tidied the groups ${survey.aiPasses} time${survey.aiPasses === 1 ? "" : "s"}.` : ""}
      </p>
      {open && survey.all.length > 1 && (
        <div className="party-row">
          <Button variant="secondary" size="small" disabled={busy || picked.size < 2} onClick={() => void merge()}>Merge {picked.size > 1 ? picked.size : ""} picked</Button>
          <span className="dbot-muted">Same answer, different words? Pick them and merge.</span>
        </div>
      )}
    </>
  );
  const r = survey.result;

  return (
    <div className="account-card">
      <div className="poll-head">
        <h2 className="account-card__title">{open ? "Survey open" : r?.made ? "Your board is ready" : "Survey closed"}</h2>
        <Badge variant={open ? "success" : "default"} size="small">{open ? "Live" : "Closed"}</Badge>
      </div>
      <p className="cb-stream__q">{survey.question}</p>
      <p className="cb-stream__meta">
        <strong>{survey.answers} answer{survey.answers === 1 ? "" : "s"}</strong>
        {open ? ` · ${secsUntil(survey.closesAt)}s left` : ""}
        {survey.own ? (survey.style === "hidden" ? " · answers stay secret on stream" : " · answers show on stream as they come in") : " · a GameShuffle question, so answers stay secret"}
      </p>

      {survey.own && (survey.style === "live" ? groupList : (
        <Accordion variant="bordered" items={[{ id: "groups", title: "Show the groups (spoilers if you're playing)", content: groupList }]} />
      ))}

      {!open && survey.own && (r?.made ? (
        <>
          <p className="dbot-muted">Chat&apos;s answers made a {r.size}-answer board. Start a game below with <strong>Start with my survey board</strong> on, or type <code>!cb start survey</code>.</p>
          {r.board && survey.style === "hidden" && (
            <Accordion variant="bordered" items={[{ id: "board", title: "Show the board (spoilers if you're playing)", content: (
              <ol className="cb-stream__board">{r.board.map((b) => <li key={b.rank} className="is-found"><span className="cb-stream__rank">{b.rank}</span><span className="cb-stream__label">{b.label}</span><span className="cb-stream__pts">{b.points}</span></li>)}</ol>
            ) }]} />
          )}
        </>
      ) : <p className="dbot-muted">{REASONS[r?.reason ?? ""] ?? "The survey is closed."}</p>)}

      {open && (
        <div className="party-row cb-versus__controls">
          <Button variant="secondary" size="small" disabled={busy} onClick={() => void call("PATCH", { action: "survey_close" }, "Survey closed")}>Close it now</Button>
        </div>
      )}
    </div>
  );
}
