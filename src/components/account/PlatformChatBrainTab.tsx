"use client";

/**
 * Platform admin ▸ Originals ▸ Chat Brain (staff). The question and board
 * queue, four lanes:
 *   1. Drafts: write a question, add the bank or draft some with Claude (each
 *      in a modal), then open drafts for answers.
 *   2. Collecting: open questions with answers so far against those needed.
 *   3. Review and publish: grouping (spelling, Claude, by hand) and the board
 *      preview, then publish (ChatBrainReview).
 *   4. Published: share, or run a question again for a new edition.
 * Spec: specs/gs-originals-chat-brain.md.
 */

import { useCallback, useEffect, useState } from "react";
import { Alert, Button, EmptyState, Input, Modal, Progress, Select, Switch, Tabs } from "@empac/cascadeds";
import { IconBrain, IconExternalLink, IconLibraryPlus, IconPlus, IconSparkles } from "@tabler/icons-react";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import { AdminHeader, AdminRowMenu } from "@/components/account/admin/AdminKit";
import { useToast } from "@/components/toast/ToastProvider";
import { ChatBrainReview } from "./ChatBrainReview";
import { CHAT_BRAIN_BANK } from "@/data/originals/chat-brain-questions";
import { ChatBrainShare } from "./ChatBrainShare";
import { LoadingLines } from "@/components/loading/LoadingLines";

type Status = "draft" | "collecting" | "review" | "published" | "retired";
interface Prompt { id: string; text: string; category: string; familySafe: boolean; status: Status; minAnswers: number; origin: string; opensAt: string | null; closesAt: string | null; publishedAt: string | null; createdAt: string; answers: number; edition: number }
interface Category { slug: string; name: string }

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles" }) : "not set");
/** Drafts can run to 150+; show them a page at a time. */
const DRAFTS_PAGE = 25;
const ORIGIN: Record<string, string> = { staff: "written by staff", ai: "drafted by Claude", bank: "question bank", player: "suggested by a player" };

export function PlatformChatBrainTab() {
  const toast = useToast();
  const confirm = useConfirm();
  const [adding, setAdding] = useState<"question" | "claude" | null>(null);
  const [draftsShown, setDraftsShown] = useState(DRAFTS_PAGE);
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
      toast.error(j?.error === "blocked" ? "That question has blocked language." : j?.error === "bad_length" ? "Questions are 8 to 140 characters." : "That didn't save.");
      return false;
    } finally { setBusy(false); }
  };

  const create = async () => {
    if (await post({ action: "create", text, category, familySafe, opensAt: opensAt ? new Date(opensAt).toISOString() : null }, "Question added to the drafts")) { setText(""); setOpensAt(""); setAdding(null); }
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
      setAdding(null);
      await load();
    } finally { setDrafting(false); }
  };
  const addBank = async () => {
    const ok = await confirm({ title: "Add the question bank?", body: `${CHAT_BRAIN_BANK.length} reviewed, family-safe questions ship with the site. Adding skips any already in Chat Brain and updates drafts still using an older wording. They land as drafts.`, confirmLabel: "Add the question bank" });
    if (!ok) return;
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

  const header = (
    <AdminHeader
      title="Chat Brain"
      intro="Write and schedule survey questions, watch answers come in, then group them into boards."
      actions={<Button variant="secondary" size="small" iconBefore={IconExternalLink} onClick={() => window.open("/chat-brain", "_blank", "noopener")}>Open the answer page</Button>}
    />
  );
  if (!data) return <div className="account-card admin-screen">{header}<LoadingLines label="Loading" /></div>;
  const catName = (slug: string) => data.categories.find((c) => c.slug === slug)?.name ?? slug;
  const by = (s: Status) => data.prompts.filter((p) => p.status === s);

  const row = (p: Prompt, actions: React.ReactNode, extra?: React.ReactNode) => (
    <li key={p.id} className="brain-admin__row">
      <div className="brain-admin__main">
        <strong>{p.text}</strong>
        <span className="brain-admin__meta">
          {catName(p.category)} · {ORIGIN[p.origin] ?? p.origin}{p.familySafe ? " · family-safe" : ""} · opens {fmt(p.opensAt)}{p.closesAt ? ` · closes ${fmt(p.closesAt)}` : ""}{p.publishedAt ? ` · published ${fmt(p.publishedAt)}` : ""}
        </span>
        {extra}
      </div>
      <div className="brain-admin__actions">{actions}</div>
    </li>
  );

  const queue = (
    <div className="brain-admin__lane">
      <div className="brain-admin__tools">
        <Button variant="primary" size="small" iconBefore={IconPlus} onClick={() => setAdding("question")}>New question</Button>
        <Button variant="secondary" size="small" iconBefore={IconSparkles} onClick={() => setAdding("claude")}>Draft with Claude</Button>
        <Button variant="secondary" size="small" iconBefore={IconLibraryPlus} disabled={busy} onClick={() => void addBank()}>Add the question bank</Button>
      </div>
      {by("draft").length === 0 ? (
        <EmptyState variant="bordered" icon={<IconBrain size={28} />} title="No drafts" description="Write a question, draft some with Claude, or add the question bank. Launch needs about five questions per board." />
      ) : (
        <ul className="brain-admin__list">
          {by("draft").slice(0, draftsShown).map((p) => editing?.id === p.id ? (
            <li key={p.id} className="brain-admin__row">
              <div className="brain-admin__main"><Input fullWidth value={editing.text} maxLength={140} floatingLabel="Question" onChange={(e) => setEditing({ id: p.id, text: e.target.value })} /></div>
              <div className="brain-admin__actions">
                <Button size="small" variant="primary" disabled={busy || editing.text.trim().length < 8} onClick={() => void saveEdit()}>Save</Button>
                <Button size="small" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
              </div>
            </li>
          ) : row(p, <>
            <Button size="small" variant="secondary" disabled={busy} onClick={() => status(p, "collecting", "Open for answers")}>Open for answers</Button>
            <Button size="small" variant="ghost" disabled={busy} onClick={() => setEditing({ id: p.id, text: p.text })}>Edit</Button>
            <AdminRowMenu label={`More for: ${p.text}`} items={[{ label: "Retire", onClick: () => status(p, "retired", "Retired") }]} />
          </>))}
        </ul>
      )}
      {by("draft").length > draftsShown && (
        <div><Button variant="ghost" size="small" onClick={() => setDraftsShown((n) => n + DRAFTS_PAGE)}>Show {Math.min(DRAFTS_PAGE, by("draft").length - draftsShown)} more of {by("draft").length}</Button></div>
      )}
    </div>
  );

  const collecting = (
    <div className="brain-admin__lane">
      {by("collecting").length === 0 ? <EmptyState variant="bordered" icon={<IconBrain size={28} />} title="Nothing collecting answers" description="Open a draft for answers and it shows here with its progress." /> : (
        <ul className="brain-admin__list">
          {by("collecting").sort((a, b) => b.answers / b.minAnswers - a.answers / a.minAnswers).map((p) => row(p, <>
            <Button size="small" variant={p.answers >= p.minAnswers ? "primary" : "secondary"} disabled={busy} onClick={() => status(p, "review", "Sent to review")}>Send to review</Button>
            <Button size="small" variant="ghost" onClick={() => setSharing({ id: p.id, text: p.text })}>Share</Button>
            <AdminRowMenu label={`More for: ${p.text}`} items={[{ label: "Pause (back to drafts)", onClick: () => status(p, "draft", "Back to drafts") }]} />
          </>, (
            <div className="brain-admin__progress">
              <Progress value={Math.min(100, Math.round((p.answers / p.minAnswers) * 100))} size="small" label={`${p.answers} of ${p.minAnswers} answers`} className="admin-progress-quiet" />
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
      {by("published").length === 0 ? <EmptyState variant="bordered" icon={<IconBrain size={28} />} title="No published boards yet" description="Boards land here once you publish them from Review." /> : (
        <ul className="brain-admin__list">
          {by("published").map((p) => row(p, <>
            <Button size="small" variant="secondary" onClick={() => setSharing({ id: p.id, text: p.text })}>Share</Button>
            <Button size="small" variant="ghost" disabled={busy} onClick={() => void post({ action: "edition", id: p.id }, `Edition ${(p.edition ?? 1) + 1} is open for answers`)}>Run it again</Button>
          </>, <span className="brain-admin__meta">Edition {p.edition ?? 1}. Running it again opens a fresh round of answers for a new board; this board stays playable.</span>))}
        </ul>
      )}
    </div>
  );

  const catOptions = data.categories.map((c) => ({ value: c.slug, label: c.name }));
  return (
    <div className="account-card admin-screen">
      {header}
      <ChatBrainShare prompt={sharing} onClose={() => setSharing(null)} />
      {!data.ready && <Alert variant="warning" title="Not set up yet">Chat Brain&apos;s tables aren&apos;t on this database yet.</Alert>}
      {data.ready && (
        <Tabs variant="underline" activeTab={lane} onChange={(id) => setLane(id as typeof lane)} tabs={[
          { id: "queue", label: "Drafts", badge: by("draft").length || undefined, content: lane === "queue" ? queue : null },
          { id: "collecting", label: "Collecting", badge: by("collecting").length || undefined, content: lane === "collecting" ? collecting : null },
          { id: "review", label: "Review and publish", badge: by("review").length || undefined, content: lane === "review" ? review : null },
          { id: "published", label: "Published", badge: by("published").length || undefined, content: lane === "published" ? published : null },
        ]} />
      )}

      <Modal isOpen={adding === "question"} onClose={() => setAdding(null)} title="New question" size="medium"
        footer={<><Button variant="ghost" onClick={() => setAdding(null)}>Cancel</Button><Button variant="primary" disabled={busy || text.trim().length < 8} onClick={() => void create()}>Add to drafts</Button></>}>
        <div className="poll-form">
          <Input fullWidth floatingLabel="Question" value={text} maxLength={140} onChange={(e) => setText(e.target.value)} placeholder="Name something you bring to a game night" />
          <Select floatingLabel="Category" value={category} onChange={(v) => setCategory(String(v))} options={catOptions} />
          <Input fullWidth floatingLabel="Opens (optional, your time)" type="datetime-local" value={opensAt} onChange={(e) => setOpensAt(e.target.value)} />
          <Switch label="Family-safe" checked={familySafe} onChange={(e) => setFamilySafe(e.target.checked)} />
        </div>
      </Modal>

      <Modal isOpen={adding === "claude"} onClose={() => setAdding(null)} title="Draft with Claude" size="medium"
        footer={<><Button variant="ghost" onClick={() => setAdding(null)}>Cancel</Button><Button variant="primary" loading={drafting} disabled={drafting} onClick={() => void draftWithClaude()}>{drafting ? "Claude is writing" : "Draft questions"}</Button></>}>
        <div className="poll-form">
          <p className="dbot-muted">Claude writes questions for a category and skips anything close to a question already in Chat Brain. They land as drafts for you to open, edit or retire.</p>
          <Select floatingLabel="Category" value={aiCat} onChange={(v) => setAiCat(String(v))} options={catOptions} />
          <Select floatingLabel="How many" value={aiCount} onChange={(v) => setAiCount(String(v))} options={["5", "10", "20"].map((n) => ({ value: n, label: `${n} questions` }))} />
          <Input fullWidth floatingLabel="Direction (optional)" value={aiGuide} maxLength={300} onChange={(e) => setAiGuide(e.target.value)} placeholder="Holiday themed, or about Mario Kart items" />
        </div>
      </Modal>
    </div>
  );
}
