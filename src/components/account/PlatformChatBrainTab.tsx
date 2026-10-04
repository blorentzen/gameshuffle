"use client";

/**
 * Platform ▸ Chat Brain (staff). The prompt and board queue, three lanes:
 *   1. Prompt queue: drafts (staff now; AI drafts and player suggestions next).
 *      Write a prompt, set its category and dates, open it for answers.
 *   2. Collecting: open prompts with answers so far against the 50 needed.
 *   3. Review and publish: grouping (spelling, Claude, by hand) and the board
 *      preview, then publish (ChatBrainReview).
 * Spec: specs/gs-originals-chat-brain.md.
 */

import { useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button, Input, Progress, Select, Switch, Tabs } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import { ChatBrainReview } from "./ChatBrainReview";

type Status = "draft" | "collecting" | "review" | "published" | "retired";
interface Prompt { id: string; text: string; category: string; familySafe: boolean; status: Status; minAnswers: number; origin: string; opensAt: string | null; closesAt: string | null; publishedAt: string | null; createdAt: string; answers: number }
interface Category { slug: string; name: string }

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "–");

export function PlatformChatBrainTab() {
  const toast = useToast();
  const [lane, setLane] = useState<"queue" | "collecting" | "review">("queue");
  const [data, setData] = useState<{ ready: boolean; prompts: Prompt[]; categories: Category[] } | null>(null);
  const [text, setText] = useState("");
  const [category, setCategory] = useState("game-night");
  const [familySafe, setFamilySafe] = useState(true);
  const [opensAt, setOpensAt] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const j = await fetch("/api/admin/chat-brain", { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    if (j?.ok) setData(j);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const post = async (body: Record<string, unknown>, okMsg: string) => {
    setBusy(true);
    try {
      const r = await fetch("/api/admin/chat-brain", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => null);
      if (j?.ok) { toast.success(okMsg); await load(); return true; }
      toast.error(j?.error === "blocked" ? "That prompt has blocked language." : j?.error === "bad_length" ? "Prompts are 8 to 140 characters." : "That didn't save.");
      return false;
    } finally { setBusy(false); }
  };

  const create = async () => {
    if (await post({ action: "create", text, category, familySafe, opensAt: opensAt ? new Date(opensAt).toISOString() : null }, "Prompt added to the queue")) setText("");
  };
  const status = (p: Prompt, s: Status, msg: string) => void post({ action: "status", id: p.id, status: s }, msg);

  if (!data) return <div className="account-card"><p>Loading…</p></div>;
  const catName = (slug: string) => data.categories.find((c) => c.slug === slug)?.name ?? slug;
  const by = (s: Status) => data.prompts.filter((p) => p.status === s);

  const row = (p: Prompt, actions: React.ReactNode, extra?: React.ReactNode) => (
    <li key={p.id} className="brain-admin__row">
      <div className="brain-admin__main">
        <strong>{p.text}</strong>
        <span className="brain-admin__meta">
          {catName(p.category)} · {p.origin}{p.familySafe ? " · family-safe" : ""} · opens {fmt(p.opensAt)}{p.closesAt ? ` · closes ${fmt(p.closesAt)}` : ""}{p.publishedAt ? ` · published ${fmt(p.publishedAt)}` : ""}
        </span>
        {extra}
      </div>
      <div className="brain-admin__actions">{actions}</div>
    </li>
  );

  const queue = (
    <div className="brain-admin__lane">
      <div className="account-card">
        <h3 className="account-card__title">New prompt</h3>
        <div className="poll-form">
          <Input floatingLabel="Prompt" value={text} maxLength={140} onChange={(e) => setText(e.target.value)} placeholder="Name something you bring to a game night" />
          <Select floatingLabel="Category" value={category} onChange={(v) => setCategory(String(v))} options={data.categories.map((c) => ({ value: c.slug, label: c.name }))} />
          <Input floatingLabel="Opens (optional)" type="datetime-local" value={opensAt} onChange={(e) => setOpensAt(e.target.value)} />
          <Switch label="Family-safe" checked={familySafe} onChange={(e) => setFamilySafe(e.target.checked)} />
          <div><Button variant="primary" disabled={busy || text.trim().length < 8} onClick={() => void create()}>Add to queue</Button></div>
        </div>
        <p className="dbot-muted">AI drafts by category land here too once the Anthropic key is set up.</p>
      </div>
      <h3 className="brain-admin__h">Drafts ({by("draft").length})</h3>
      {by("draft").length === 0 ? <p className="dbot-muted">Nothing in the queue.</p> : (
        <ul className="brain-admin__list">
          {by("draft").map((p) => row(p, <>
            <Button size="small" variant="primary" disabled={busy} onClick={() => status(p, "collecting", "Open for answers")}>Open for answers</Button>
            <Button size="small" variant="ghost" disabled={busy} onClick={() => status(p, "retired", "Retired")}>Retire</Button>
          </>))}
        </ul>
      )}
    </div>
  );

  const collecting = (
    <div className="brain-admin__lane">
      {by("collecting").length === 0 ? <p className="dbot-muted">No prompts are collecting answers.</p> : (
        <ul className="brain-admin__list">
          {by("collecting").sort((a, b) => b.answers / b.minAnswers - a.answers / a.minAnswers).map((p) => row(p, <>
            <Button size="small" variant={p.answers >= p.minAnswers ? "primary" : "secondary"} disabled={busy} onClick={() => status(p, "review", "Sent to review")}>Send to review</Button>
            <Button size="small" variant="ghost" disabled={busy} onClick={() => status(p, "draft", "Back to drafts")}>Pause</Button>
          </>, (
            <div className="brain-admin__progress">
              <Progress value={Math.min(100, Math.round((p.answers / p.minAnswers) * 100))} size="small" aria-label="Answers" />
              <span>{p.answers} of {p.minAnswers} answers</span>
            </div>
          )))}
        </ul>
      )}
    </div>
  );

  const review = (
    <div className="brain-admin__lane">
      <ChatBrainReview prompts={[...by("review"), ...by("published")]} onPublished={() => void load()} />
    </div>
  );

  return (
    <div className="account-tab">
      <h2 className="account-tab__heading">Chat Brain</h2>
      <p className="account-tab__intro">Write and schedule survey prompts, watch answers come in, then group them into boards. <a href="/chat-brain" target="_blank" rel="noreferrer">Open the answer page</a>.</p>
      {!data.ready && <Alert variant="warning" title="Not set up yet">Apply <code>chat-brain-m1.sql</code> to turn Chat Brain on.</Alert>}
      {data.ready && (
        <Tabs variant="pills" activeTab={lane} onChange={(id) => setLane(id as typeof lane)} tabs={[
          { id: "queue", label: "Prompt queue", badge: by("draft").length || undefined, content: lane === "queue" ? queue : null },
          { id: "collecting", label: "Collecting", badge: by("collecting").length || undefined, content: lane === "collecting" ? collecting : null },
          { id: "review", label: "Review and publish", badge: by("review").length || undefined, content: lane === "review" ? review : null },
        ]} />
      )}
    </div>
  );
}
