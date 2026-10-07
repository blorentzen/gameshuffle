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
import { Alert, Button, Input, Progress, Select, Switch, Tabs } from "@empac/cascadeds";
import { useToast } from "@/components/toast/ToastProvider";
import { ChatBrainReview } from "./ChatBrainReview";
import { CHAT_BRAIN_BANK } from "@/data/originals/chat-brain-questions";
import { LAUNCH_BOARDS } from "@/lib/chatbrain/rules";
import { ChatBrainShare } from "./ChatBrainShare";
import { LoadingLines } from "@/components/loading/LoadingLines";

type Status = "draft" | "collecting" | "review" | "published" | "retired";
interface Prompt { id: string; text: string; category: string; familySafe: boolean; status: Status; minAnswers: number; origin: string; opensAt: string | null; closesAt: string | null; publishedAt: string | null; createdAt: string; answers: number; edition: number }
interface Category { slug: string; name: string }

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "–");

export function PlatformChatBrainTab() {
  const toast = useToast();
  const [lane, setLane] = useState<"queue" | "collecting" | "review" | "published">("queue");
  const [data, setData] = useState<{ ready: boolean; prompts: Prompt[]; categories: Category[] } | null>(null);
  const [text, setText] = useState("");
  const [category, setCategory] = useState("game-night");
  const [familySafe, setFamilySafe] = useState(true);
  const [opensAt, setOpensAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [aiCat, setAiCat] = useState("game-night");
  const [aiCount, setAiCount] = useState("10");
  const [aiGuide, setAiGuide] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [sharing, setSharing] = useState<{ id: string; text: string } | null>(null);

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
  const draftWithClaude = async () => {
    setDrafting(true);
    try {
      const r = await fetch("/api/admin/chat-brain", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "draft", category: aiCat, count: Number(aiCount), guidance: aiGuide || undefined }) });
      const j = await r.json().catch(() => null);
      if (!j?.ok) { toast.error(j?.error === "not_configured" ? "The Anthropic key isn't set up here." : "Claude couldn't draft questions. Try again."); return; }
      const dup = (j.skipped as { reason: string }[]).filter((x) => x.reason === "duplicate").length;
      toast.success(`Added ${j.created.length} draft${j.created.length === 1 ? "" : "s"}${dup ? `, skipped ${dup} near-duplicate${dup === 1 ? "" : "s"}` : ""}`);
      await load();
    } finally { setDrafting(false); }
  };
  const addBank = async () => {
    setBusy(true);
    try {
      const j = await fetch("/api/admin/chat-brain", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "bank" }) }).then((r) => r.json()).catch(() => null);
      if (!j?.ok) { toast.error("Couldn't add the question bank."); return; }
      const parts = [j.added ? `added ${j.added}` : "", j.reworded ? `reworded ${j.reworded} drafts` : ""].filter(Boolean);
      toast.success(parts.length ? `Question bank: ${parts.join(", ")}` : "Every bank question is already in Chat Brain");
      await load();
    } finally { setBusy(false); }
  };
  const saveEdit = async () => {
    if (!editing) return;
    if (await post({ action: "edit", id: editing.id, text: editing.text }, "Question updated")) setEditing(null);
  };

  if (!data) return <div className="account-card"><LoadingLines label="Loading" /></div>;
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
      </div>
      <div className="account-card">
        <h3 className="account-card__title">Question bank</h3>
        <p className="dbot-muted">{CHAT_BRAIN_BANK.length} reviewed, family-safe questions ship with the site, written for surprising boards (opinions, confessions, stream culture). Launch needs {LAUNCH_BOARDS} boards and not every question makes one, so this is about five per board. Adding skips any already in Chat Brain and updates drafts still using an older wording.</p>
        <div><Button variant="secondary" disabled={busy} onClick={() => void addBank()}>Add the question bank</Button></div>
      </div>
      <div className="account-card">
        <h3 className="account-card__title">Draft with Claude</h3>
        <p className="dbot-muted">Claude writes questions for a category, skipping anything close to a question already in Chat Brain. They land below as drafts for you to approve, edit or retire.</p>
        <div className="poll-form">
          <Select floatingLabel="Category" value={aiCat} onChange={(v) => setAiCat(String(v))} options={data.categories.map((c) => ({ value: c.slug, label: c.name }))} />
          <Select floatingLabel="How many" value={aiCount} onChange={(v) => setAiCount(String(v))} options={["5", "10", "20"].map((n) => ({ value: n, label: `${n} questions` }))} />
          <Input floatingLabel="Direction (optional)" value={aiGuide} maxLength={300} onChange={(e) => setAiGuide(e.target.value)} placeholder="e.g. holiday themed, or about Mario Kart items" />
          <div><Button variant="primary" disabled={drafting} onClick={() => void draftWithClaude()}>{drafting ? "Claude is writing…" : "Draft questions"}</Button></div>
        </div>
      </div>
      <h3 className="brain-admin__h">Drafts ({by("draft").length})</h3>
      {by("draft").length === 0 ? <p className="dbot-muted">Nothing in the queue.</p> : (
        <ul className="brain-admin__list">
          {by("draft").map((p) => editing?.id === p.id ? (
            <li key={p.id} className="brain-admin__row">
              <div className="brain-admin__main"><Input value={editing.text} maxLength={140} aria-label="Question" onChange={(e) => setEditing({ id: p.id, text: e.target.value })} /></div>
              <div className="brain-admin__actions">
                <Button size="small" variant="primary" disabled={busy || editing.text.trim().length < 8} onClick={() => void saveEdit()}>Save</Button>
                <Button size="small" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
              </div>
            </li>
          ) : row(p, <>
            <Button size="small" variant="primary" disabled={busy} onClick={() => status(p, "collecting", "Open for answers")}>Open for answers</Button>
            <Button size="small" variant="secondary" disabled={busy} onClick={() => setEditing({ id: p.id, text: p.text })}>Edit</Button>
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
            <Button size="small" variant="secondary" onClick={() => setSharing({ id: p.id, text: p.text })}>Share</Button>
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

  const published = (
    <div className="brain-admin__lane">
      {by("published").length === 0 ? <p className="dbot-muted">No published boards yet.</p> : (
        <ul className="brain-admin__list">
          {by("published").map((p) => row(p, <>
            <Button size="small" variant="secondary" onClick={() => setSharing({ id: p.id, text: p.text })}>Share</Button>
            <Button size="small" variant="ghost" disabled={busy} onClick={() => void post({ action: "edition", id: p.id }, `Edition ${(p.edition ?? 1) + 1} is open for answers`)}>Run it again</Button>
          </>, <span className="brain-admin__meta">Edition {p.edition ?? 1}. Running it again opens a fresh round of answers for a new board; this board stays playable.</span>))}
        </ul>
      )}
    </div>
  );

  return (
    <div className="account-tab">
      <h2 className="account-tab__heading">Chat Brain</h2>
      <p className="account-tab__intro">Write and schedule survey prompts, watch answers come in, then group them into boards. <a href="/chat-brain" target="_blank" rel="noreferrer">Open the answer page</a>.</p>
      <ChatBrainShare prompt={sharing} onClose={() => setSharing(null)} />
      {!data.ready && <Alert variant="warning" title="Not set up yet">Apply <code>chat-brain-m1.sql</code> to turn Chat Brain on.</Alert>}
      {data.ready && (
        <Tabs variant="pills" activeTab={lane} onChange={(id) => setLane(id as typeof lane)} tabs={[
          { id: "queue", label: "Prompt queue", badge: by("draft").length || undefined, content: lane === "queue" ? queue : null },
          { id: "collecting", label: "Collecting", badge: by("collecting").length || undefined, content: lane === "collecting" ? collecting : null },
          { id: "review", label: "Review and publish", badge: by("review").length || undefined, content: lane === "review" ? review : null },
          { id: "published", label: "Published", badge: by("published").length || undefined, content: lane === "published" ? published : null },
        ]} />
      )}
    </div>
  );
}
