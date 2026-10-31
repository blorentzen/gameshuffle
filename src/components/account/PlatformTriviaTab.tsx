"use client";

/**
 * Platform admin ▸ Originals ▸ Trivia (staff): the GameShuffle question pack hosts fill their
 * nights from. Questions arrive as drafts (the starter pack in
 * src/data/originals/trivia-pack.ts) and reach hosts only once approved, so
 * every answer is checked against its source first. Fix a wording or an
 * answer line in place; retire anything wrong or dated.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, EmptyState, Input, Modal, Select, StatCard, Tabs, Textarea } from "@empac/cascadeds";
import { IconArchive, IconBulb, IconChecklist, IconCircleCheck, IconDeviceGamepad2, IconLibraryPlus, IconSparkles } from "@tabler/icons-react";
import { AdminHeader, AdminRowMenu, AdminStats } from "@/components/account/admin/AdminKit";
import { useToast } from "@/components/toast/ToastProvider";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import { LoadingLines } from "@/components/loading/LoadingLines";
import { AnswerLine } from "@/components/trivia/TriviaStudio";
import type { LibraryQuestion, PackCounts } from "@/lib/trivia/store";
import type { ChoicesAdmin } from "@/lib/fireRound/choices";
import { DraftCategory, FireChoicesPanel } from "@/components/account/FireChoicesPanel";
import "@/styles/trivia.css";

type Status = "draft" | "approved" | "retired";
/** The question lanes, plus Fire Round's four choices. */
type Lane = Status | "choices";
interface Games { ready: boolean; list: { slug: string; title: string }[]; tags: Record<string, string> }
interface Data { ready: boolean; questions: LibraryQuestion[]; counts: PackCounts; bank: { total: number; missing: number }; games: Games; choices: ChoicesAdmin | null }
const NO_GAMES: Games = { ready: false, list: [], tags: {} };

const LANES: { id: Lane; label: string }[] = [
  { id: "draft", label: "To check" },
  { id: "approved", label: "Approved" },
  { id: "retired", label: "Retired" },
  { id: "choices", label: "Four choices" },
];
/** The pack runs to hundreds of questions; show them a page at a time. */
const PAGE = 25;
const splitList = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

export function PlatformTriviaTab() {
  const toast = useToast();
  const confirm = useConfirm();
  const [data, setData] = useState<Data | null>(null);
  const [lane, setLane] = useState<Lane>("draft");
  const [growing, setGrowing] = useState(false);
  const [cat, setCat] = useState("all");
  const [game, setGame] = useState("all");
  const [drafting, setDrafting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<LibraryQuestion | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const firstLoad = useRef(true);

  const load = useCallback(async () => {
    const j = await fetch("/api/admin/trivia", { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    if (j?.ok) {
      // First load with nothing to check: open on the approved list.
      if (firstLoad.current && j.counts.draft === 0 && j.counts.approved > 0) setLane("approved");
      firstLoad.current = false;
      setData({ ready: true, questions: j.questions, counts: j.counts, bank: j.bank, games: j.games ?? NO_GAMES, choices: j.choices ?? null });
    }
    else setData({ ready: j?.error !== "not_ready", questions: [], counts: { draft: 0, approved: 0, retired: 0 }, bank: { total: 0, missing: 0 }, games: NO_GAMES, choices: null });
  }, []);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const post = async (body: Record<string, unknown>): Promise<Record<string, unknown> | null> => {
    setBusy(true);
    try {
      const j = await fetch("/api/admin/trivia", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json()).catch(() => null);
      if (!j?.ok) { toast.error("That didn't save."); return null; }
      await load();
      return j;
    } finally { setBusy(false); }
  };

  const importBank = async () => {
    const j = await post({ action: "import" });
    if (!j) return;
    const invalid = (j.invalid as string[]).length;
    toast.success(`Added ${j.added} question${j.added === 1 ? "" : "s"} to check${invalid ? `. ${invalid} didn't pass validation` : ""}`);
    setLane("draft");
  };

  const setStatus = async (ids: string[], status: Status, msg: string) => {
    const j = await post({ action: "status", ids, status });
    if (j) toast.success(msg);
  };

  const inLane = useMemo(() => (data?.questions ?? []).filter((q) => q.status === lane), [data, lane]);
  const cats = useMemo(() => [...new Set(inLane.map((q) => q.category ?? "General"))].sort(), [inLane]);
  const activeCat = cats.includes(cat) ? cat : "all";
  const tags = useMemo(() => data?.games.tags ?? {}, [data]);
  const gameName = (slug: string) => data?.games.list.find((g) => g.slug === slug)?.title ?? slug;
  const laneGames = useMemo(() => [...new Set(inLane.map((q) => tags[q.id]).filter(Boolean))].sort(), [inLane, tags]);
  const activeGame = game === "none" || laneGames.includes(game) ? game : "all";
  const shown = inLane.filter((q) => (activeCat === "all" || q.category === activeCat)
    && (activeGame === "all" || (activeGame === "none" ? !tags[q.id] : tags[q.id] === activeGame)));

  const approveShown = async () => {
    const ok = await confirm({
      title: `Approve ${shown.length} question${shown.length === 1 ? "" : "s"}?`,
      body: "Hosts can add them to their nights straight away. Only approve what you've checked against the sources.",
      confirmLabel: `Approve ${shown.length}`,
    });
    if (ok) await setStatus(shown.map((q) => q.id), "approved", `Approved ${shown.length}`);
  };

  const header = (
    <AdminHeader
      title="Trivia"
      intro="The GameShuffle question pack hosts fill their nights from. Hosts only see approved questions, so check each answer against its source first, and retire anything wrong or out of date."
      actions={data?.ready ? (
        <>
          <Button variant="secondary" size="small" iconBefore={IconDeviceGamepad2} disabled={busy} onClick={() => setDrafting(true)}>Draft a game pack</Button>
          <Button variant="secondary" size="small" iconBefore={IconSparkles} disabled={busy} onClick={() => setGrowing(true)}>Draft for a category</Button>
          <Button variant="secondary" size="small" iconBefore={IconLibraryPlus} disabled={busy || data.bank.missing === 0} onClick={() => void importBank()}>
            {data.bank.missing === 0 ? "Starter pack added" : `Add the starter pack (${data.bank.missing} new)`}
          </Button>
        </>
      ) : undefined}
    />
  );
  if (!data) return <div className="account-card admin-screen">{header}<LoadingLines label="Loading" /></div>;
  if (!data.ready) return <div className="account-card admin-screen">{header}<Alert variant="warning" title="Not set up yet">Trivia&apos;s tables aren&apos;t on this database yet.</Alert></div>;

  const list = (
    <div className="trivia-admin">
      <div className="trivia-admin__bar">
        {cats.length > 1 && (
          <Select floatingLabel="Category" value={activeCat} onChange={(v) => { setCat(String(v)); setLimit(PAGE); }}
            options={[{ value: "all", label: `Every category (${inLane.length})` }, ...cats.map((c) => ({ value: c, label: `${c} (${inLane.filter((q) => q.category === c).length})` }))]} />
        )}
        {laneGames.length > 0 && (
          <Select floatingLabel="Game" value={activeGame} onChange={(v) => { setGame(String(v)); setLimit(PAGE); }}
            options={[
              { value: "all", label: "Every question" },
              ...laneGames.map((g) => ({ value: g, label: `${gameName(g)} (${inLane.filter((q) => tags[q.id] === g).length})` })),
              { value: "none", label: `Not about one game (${inLane.filter((q) => !tags[q.id]).length})` },
            ]} />
        )}
        {lane === "draft" && shown.length > 0 && <Button variant="secondary" disabled={busy} onClick={() => void approveShown()}>Approve all {shown.length} shown</Button>}
      </div>
      {shown.length === 0 ? (
        <EmptyState variant="bordered" icon={<IconBulb size={28} />}
          title={lane === "draft" ? "Nothing to check" : lane === "approved" ? "No approved questions yet" : "Nothing retired"}
          description={lane === "draft" ? "New questions land here as drafts: the starter pack, or ones hosts write." : lane === "approved" ? "Hosts see an empty pack until you approve some." : undefined} />
      ) : (
        <ul className="trivia-library">
          {shown.slice(0, limit).map((q) => (
            <li key={q.id} className={`trivia-lib-q${q.status === "draft" ? " is-draft" : ""}`}>
              <div className="trivia-lib-q__head">
                <span className="trivia-muted">{q.category} · {q.difficulty}{q.kind !== "text" ? ` · ${q.kind}` : ""}{tags[q.id] ? ` · ${gameName(tags[q.id])}` : ""}{q.origin === "ai" ? " · Written by AI" : ""}</span>
              </div>
              <p className="trivia-lib-q__prompt">{q.prompt}</p>
              {q.kind === "choice" && q.options && <p className="trivia-muted">Choices: {q.options.join(" · ")}</p>}
              {q.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- the question's picture, from our own art
                <img className="trivia-lib-q__pic" src={q.imageUrl} alt="" loading="lazy" />
              )}
              <AnswerLine q={q} />
              <div className="trivia-row">
                {q.status === "draft" && <Button variant="primary" size="small" disabled={busy} onClick={() => void setStatus([q.id], "approved", "Approved")}>Approve</Button>}
                {q.status !== "retired" && <Button variant="ghost" size="small" disabled={busy} onClick={() => setEditing(q)}>Edit</Button>}
                {q.status === "retired" && <Button variant="secondary" size="small" disabled={busy} onClick={() => void setStatus([q.id], "draft", "Back in the queue")}>Put back to check</Button>}
                {q.status !== "retired" && (
                  <AdminRowMenu
                    label={`More for: ${q.prompt.slice(0, 60)}`}
                    items={[
                      ...(q.status === "approved" ? [{ label: "Move back to check", onClick: () => void setStatus([q.id], "draft", "Moved back to check") }] : []),
                      { label: "Retire", onClick: () => void setStatus([q.id], "retired", "Retired") },
                    ]}
                  />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {shown.length > limit && (
        <div><Button variant="ghost" size="small" onClick={() => setLimit((n) => n + PAGE)}>Show {Math.min(PAGE, shown.length - limit)} more of {shown.length}</Button></div>
      )}
    </div>
  );

  return (
    <div className="account-card admin-screen trivia-admin__wrap">
      {header}
      <AdminStats label="The trivia pack" columns={3}>
        <StatCard label="Approved" value={String(data.counts.approved)} source="What hosts can use" icon={<IconCircleCheck size={20} />} variant="accent" />
        <StatCard label="To check" value={String(data.counts.draft)} source={data.bank.missing ? `${data.bank.missing} starter questions not added` : "Starter pack all added"} icon={<IconChecklist size={20} />} />
        <StatCard label="Retired" value={String(data.counts.retired)} icon={<IconArchive size={20} />} />
      </AdminStats>

      <Tabs variant="underline" activeTab={lane} onChange={(id) => { setLane(id as Lane); setLimit(PAGE); }}
        tabs={LANES.map((l) => ({
          id: l.id,
          label: l.label,
          badge: (l.id === "choices" ? data.choices?.waiting.length : data.counts[l.id]) || undefined,
          content: lane !== l.id ? null : l.id === "choices"
            ? (data.choices ? <FireChoicesPanel choices={data.choices} busy={busy} post={post} reload={load} /> : null)
            : list,
        }))} />

      {drafting && (
        <DraftGamePack games={data.games} onClose={() => setDrafting(false)}
          onDrafted={async (slug, added) => {
            setDrafting(false);
            toast.success(added ? `${added} question${added === 1 ? "" : "s"} to check` : "Nothing new this time. Try again for more.");
            await load();
            setLane("draft");
            setGame(slug);
          }} />
      )}
      {growing && (
        <DraftCategory categories={data.choices?.growable ?? []} onClose={() => setGrowing(false)}
          onDrafted={async (category, added) => {
            setGrowing(false);
            toast.success(added ? `${added} question${added === 1 ? "" : "s"} to check` : "Nothing new this time. Try again for more.");
            await load();
            setLane("draft");
            setCat(category);
          }} />
      )}
      {editing && <EditQuestion q={editing} busy={busy} onClose={() => setEditing(null)}
        onSave={async (question) => { const j = await post({ action: "update", id: editing.id, question }); if (j) { toast.success("Saved"); setEditing(null); } }} />}
    </div>
  );
}

/** Claude drafts a pack about one game; staff check each one before break mode can ask it. */
function DraftGamePack({ games, onClose, onDrafted }: { games: Games; onClose: () => void; onDrafted: (slug: string, added: number) => Promise<void> }) {
  const toast = useToast();
  const [slug, setSlug] = useState(games.list[0]?.slug ?? "");
  const [count, setCount] = useState("20");
  const [busy, setBusy] = useState(false);
  const have = Object.values(games.tags).filter((g) => g === slug).length;
  const draft = async () => {
    setBusy(true);
    try {
      const j = await fetch("/api/admin/trivia", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "draft-game", game: slug, count: Number(count) }) })
        .then((r) => r.json()).catch(() => null);
      if (!j?.ok) {
        toast.error(j?.error === "not_ready" ? "Game packs need a database update first." : j?.error === "rate_limited" ? "Claude is busy. Try again in a minute." : "That didn't draft. Try again.");
        return;
      }
      await onDrafted(slug, Number(j.added ?? 0));
    } finally { setBusy(false); }
  };
  return (
    <Modal isOpen onClose={onClose} title="Draft a game pack" size="medium">
      <div className="trivia-admin__draft">
        <p className="trivia-muted">Claude writes questions about one game for break mode&apos;s Game Trivia, using our checked facts where we have them and naming a reference for the rest. They land in To check: check each answer before you approve it.</p>
        {!games.ready && <Alert variant="warning" title="Needs a database update">Game packs can be drafted once the trivia game packs update is on this database.</Alert>}
        <Select floatingLabel="Game" value={slug} onChange={(v) => setSlug(String(v))} options={games.list.map((g) => ({ value: g.slug, label: g.title }))} />
        <Select floatingLabel="How many" value={count} onChange={(v) => setCount(String(v))} options={["10", "20", "30"].map((n) => ({ value: n, label: `${n} questions` }))} />
        {have > 0 && <p className="trivia-muted">The pack has {have} question{have === 1 ? "" : "s"} about this game already; Claude won&apos;t repeat them.</p>}
        <div className="trivia-row">
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={() => void draft()} loading={busy} disabled={busy || !slug || !games.ready}>Draft with AI</Button>
        </div>
      </div>
    </Modal>
  );
}

function EditQuestion({ q, busy, onClose, onSave }: { q: LibraryQuestion; busy: boolean; onClose: () => void; onSave: (question: Record<string, unknown>) => Promise<void> }) {
  const [prompt, setPrompt] = useState(q.prompt);
  const [answer, setAnswer] = useState(q.answer);
  const [accept, setAccept] = useState(q.accept.join(", "));
  const [askAbout, setAskAbout] = useState(q.askAbout.join(", "));
  const [reject, setReject] = useState(q.reject.join(", "));
  const [difficulty, setDifficulty] = useState<string>(q.difficulty ?? "medium");
  return (
    <Modal isOpen onClose={onClose} title="Edit question" size="medium">
      <div className="trivia-form">
        <Textarea floatingLabel="Question" value={prompt} maxLength={300} rows={2} onChange={(e) => setPrompt(e.target.value)} />
        <Input fullWidth floatingLabel="Answer" value={answer} maxLength={120} onChange={(e) => setAnswer(e.target.value)} />
        <Input fullWidth floatingLabel="Also accept (commas between)" value={accept} onChange={(e) => setAccept(e.target.value)} />
        <Input fullWidth floatingLabel="Ask the host about (commas between)" value={askAbout} onChange={(e) => setAskAbout(e.target.value)} />
        <Input fullWidth floatingLabel="Reject (commas between)" value={reject} onChange={(e) => setReject(e.target.value)} />
        <Select floatingLabel="Difficulty" value={difficulty} onChange={(v) => setDifficulty(String(v))}
          options={[{ value: "easy", label: "Easy" }, { value: "medium", label: "Medium" }, { value: "hard", label: "Hard" }]} />
        <div className="trivia-row">
          <Button variant="primary" disabled={busy} onClick={() => void onSave({ prompt, answer, accept: splitList(accept), askAbout: splitList(askAbout), reject: splitList(reject), difficulty, kind: q.kind, options: q.options, imageUrl: q.imageUrl, category: q.category ?? undefined, sources: q.sources, asOf: q.asOf, changeable: q.changeable })}>Save</Button>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </Modal>
  );
}
