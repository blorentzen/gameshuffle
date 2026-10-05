"use client";

import { EVENTS, tagged } from "@/lib/analytics/events";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Alert, Badge, Button, Checkbox, Chip, Input, Modal, Radio, RadioGroup, Select, Switch, Tabs, Textarea } from "@empac/cascadeds";
import { IconPlus } from "@tabler/icons-react";
import { useToast } from "@/components/toast/ToastProvider";
import { PARTY_FAMILY } from "@/data/party";
import { DECK_FAMILIES, deckFamily } from "@/lib/cards/families";
import { cardParts } from "@/data/party/cards";
import { rowToCard, validateCard, type CardDraft, type DeckCardRow } from "@/lib/party/deck";

/**
 * Card deck editor, shared by Platform Admin -> Decks (the official deck),
 * Game Modules (a Pro+ user's own deck) and /mod/[streamer] (a streamer's deck,
 * edited by their mods). `scope` is "official", "me" or the streamer's user id.
 */

type Kind = DeckCardRow["kind"];
const KINDS: { id: Kind; label: string; one: string }[] = [
  { id: "chance", label: "Chance cards", one: "Chance card" },
  { id: "mission", label: "Missions", one: "Mission" },
  { id: "rule", label: "House rules", one: "House rule" },
  { id: "moment", label: "Card moments", one: "Card moment" },
];
const SAMPLE = ["Ana", "Ben", "Cy", "Dee"];
const TOKEN_HELP: Record<string, string> = { "{player}": "who gets the card", "{rival}": "someone else at the table", "{n}": "a number of turns" };

interface Stats { dealt: number; played: number; done: number }
interface Loaded { deck: { id: string; name: string; mixOfficial: boolean } | null; cards: DeckCardRow[]; stats: Record<string, Stats> }

const blank = (kind: Kind): CardDraft => ({
  kind, scope: kind === "rule" || kind === "moment" ? "table" : "player", title: "", text: kind === "chance" ? "{player} " : "",
  tone: kind === "rule" ? "mild" : null, worth: kind === "mission" ? 1 : null, effect: kind === "chance" ? "crutch" : null,
  turns_min: null, turns_max: null, turns_mode: "for", rival_obeys: false, starter: false, games: null, not_under: null,
});

/** One deck per game family (Mario Party, Smash), switched with the chips on top. */
export function DeckEditor({ scope, intro }: { scope: string; intro?: React.ReactNode }) {
  const [family, setFamily] = useState(PARTY_FAMILY);
  return (
    <>
      <div className="party-chips" role="group" aria-label="Which game's deck">
        {DECK_FAMILIES.map((f) => <Chip key={f.id} clickable selected={family === f.id} variant={family === f.id ? "primary" : "default"} label={f.label} onClick={() => setFamily(f.id)} />)}
      </div>
      <FamilyDeckEditor key={family} scope={scope} family={family} intro={intro} />
    </>
  );
}

function FamilyDeckEditor({ scope, family, intro }: { scope: string; family: string; intro?: React.ReactNode }) {
  const fam = deckFamily(family)!;
  const toast = useToast();
  const official = scope === "official";
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<Kind>("chance");
  const [status, setStatus] = useState("all");
  const [editing, setEditing] = useState<{ id: string | null; draft: CardDraft } | null>(null);
  const [publishing, setPublishing] = useState<DeckCardRow | null>(null);
  const [familySafe, setFamilySafe] = useState(false);
  const [busy, setBusy] = useState(false);

  const base = `/api/decks/${encodeURIComponent(scope)}`;
  const load = useCallback(async () => {
    const r = await fetch(`${base}?family=${family}`, { cache: "no-store" }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    if (!r?.ok) { setError(j.error ?? "offline"); return; }
    setError(null); setData(j as Loaded);
  }, [base, family]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const { rulesets, games } = fam;

  const send = async (url: string, method: "POST" | "PATCH", body: Record<string, unknown>) => {
    setBusy(true);
    const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ family, ...body }) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    if (!r?.ok) { toast.error(j.details?.[0] ?? "Couldn't save that. Please try again."); return false; }
    await load();
    return true;
  };

  if (error === "unavailable") return <Alert variant="info" title="Decks need a database update">Once it&apos;s applied, every card can be written and changed here. Until then the built-in deck is used.</Alert>;
  if (error === "pro_only") return <Alert variant="info" title="Your own cards are part of GS Pro">Write house rules, Chance cards and missions for your community. <Link href="/gs-pro?from=decks" className={tagged(EVENTS.upgradeClicked, { from: "decks" })}>See GS Pro</Link></Alert>;
  if (error === "staff_only") return <Alert variant="warning">Only staff can edit the official deck.</Alert>;
  if (!data) return <p className="party-muted">{error ? "Couldn't load the deck." : "Loading the deck…"}</p>;

  const list = data.cards.filter((c) => c.kind === kind && (status === "all" || c.status === status));
  const counts = (k: Kind) => data.cards.filter((c) => c.kind === k && c.status === "live").length;
  const d = editing?.draft;
  const errs = d ? validateCard(d) : [];
  const set = (patch: Partial<CardDraft>) => setEditing((e) => (e ? { ...e, draft: { ...e.draft, ...patch } } : e));
  const insert = (token: string) => set({ text: `${d?.text ?? ""}${d?.text && !d.text.endsWith(" ") ? " " : ""}${token}` });
  const preview = () => {
    if (!d || !d.text) return null;
    const card = rowToCard({ ...(d as DeckCardRow), card_key: "preview", status: "draft" });
    return cardParts(card, { id: "preview", seat: 0, rival: 1, n: d.turns_min ?? 3 }).map((p, k) =>
      typeof p === "string" ? <span key={k}>{p}</span> : <strong key={k}>{SAMPLE[p.seat] ?? "Someone"}</strong>);
  };

  const save = async () => {
    if (!editing || errs.length) return;
    const ok = editing.id
      ? await send(`${base}/cards/${editing.id}`, "PATCH", { action: "update", card: editing.draft })
      : await send(base, "POST", { action: "create", card: editing.draft });
    if (ok) { toast.success(editing.id ? "Card saved" : "Card added as a draft"); setEditing(null); }
  };
  const publish = async () => {
    if (!publishing) return;
    if (await send(`${base}/cards/${publishing.id}`, "PATCH", { action: "publish", familySafe })) {
      toast.success("Card is live"); setPublishing(null); setFamilySafe(false);
    }
  };
  const retire = async (c: DeckCardRow, restore = false) => {
    if (await send(`${base}/cards/${c.id}`, "PATCH", { action: restore ? "restore" : "retire" })) toast.success(restore ? "Card is live again" : "Card retired");
  };

  return (
    <div className="deck-editor">
      {intro}
      {!official && data.deck !== undefined && (
        <Switch
          label="Deal the official cards too"
          helperText="Off: your cards replace the official ones of the same kind."
          checked={data.deck?.mixOfficial ?? true}
          onChange={(e) => void send(base, "POST", { action: "settings", mixOfficial: e.target.checked }).then((ok) => ok && toast.success("Deck setting saved"))}
        />
      )}
      <Tabs
        variant="pills"
        activeTab={kind}
        onChange={(id) => setKind(id as Kind)}
        tabs={KINDS.map((k) => ({ id: k.id, label: k.label, badge: counts(k.id) || undefined, content: null }))}
      />
      <div className="party-row">
        <Select floatingLabel="Show" value={status} onChange={(v) => setStatus(String(v))}
          options={[{ value: "all", label: "Everything" }, { value: "live", label: "Live" }, { value: "draft", label: "Drafts" }, { value: "retired", label: "Retired" }]} />
        <Button variant="primary" iconBefore={IconPlus} onClick={() => setEditing({ id: null, draft: blank(kind) })}>New {KINDS.find((k) => k.id === kind)!.one.toLowerCase()}</Button>
      </div>

      {list.length === 0 ? <p className="party-muted">No {KINDS.find((k) => k.id === kind)!.label.toLowerCase()} here yet.</p> : (
        <ul className="deck-editor__list">
          {list.map((c) => {
            const st = data.stats[c.card_key];
            return (
              <li key={c.id} className={`party-card${c.effect ? ` party-card--${c.effect}` : ""}${c.status !== "live" ? " deck-editor__card--muted" : ""}`}>
                <span className="party-card__head">
                  <Badge variant={c.status === "live" ? "success" : c.status === "draft" ? "info" : "default"} size="small">{c.status === "live" ? "Live" : c.status === "draft" ? "Draft" : "Retired"}</Badge>
                  {c.effect && <Badge variant={c.effect === "help" ? "success" : "warning"} size="small">{c.effect === "help" ? "Help" : "Crutch"}</Badge>}
                  {c.worth && <Badge variant="outline" size="small">{c.worth} pt{c.worth === 1 ? "" : "s"}</Badge>}
                  {c.tone && <Badge variant="outline" size="small">{c.tone === "mild" ? "Mild" : "Spicy"}</Badge>}
                  {c.starter && official && <Badge variant="outline" size="small">Starter</Badge>}
                  {st && <span className="party-muted deck-editor__stats">Dealt {st.dealt} · played {st.played} · done {st.done}</span>}
                </span>
                <strong className="party-card__title">{c.title}</strong>
                <span>{c.text}</span>
                <span className="party-row">
                  <Button variant="ghost" size="small" onClick={() => setEditing({ id: c.id, draft: { ...c } })}>Edit</Button>
                  {c.status === "draft" && <Button variant="secondary" size="small" onClick={() => { setPublishing(c); setFamilySafe(false); }}>Publish</Button>}
                  {c.status === "live" && <Button variant="ghost" size="small" onClick={() => void retire(c)}>Retire</Button>}
                  {c.status === "retired" && <Button variant="ghost" size="small" onClick={() => void retire(c, true)}>Bring back</Button>}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <Modal
        isOpen={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? "Edit card" : `New ${KINDS.find((k) => k.id === d?.kind)?.one.toLowerCase() ?? "card"}`}
        size="medium"
        primaryAction={{ label: busy ? "Saving…" : editing?.id ? "Save" : "Save as draft", onClick: save }}
        secondaryAction={{ label: "Cancel", onClick: () => setEditing(null) }}
      >
        {d && (
          <div className="deck-editor__form">
            <Input floatingLabel="Title" value={d.title} maxLength={60} onChange={(e) => set({ title: e.target.value })} />
            <Textarea floatingLabel="What the card says" value={d.text} maxLength={280} rows={3} onChange={(e) => set({ text: e.target.value })} />
            {d.kind !== "moment" && (
              <div className="party-chips" aria-label="Insert a placeholder">
                {Object.entries(TOKEN_HELP).map(([t, help]) => (
                  <Chip key={t} clickable size="small" label={`${t} ${help}`} onClick={() => insert(t)} />
                ))}
              </div>
            )}
            {d.kind === "chance" && (
              <RadioGroup name="effect" orientation="horizontal" label="Works for or against the player?" value={d.effect ?? ""} onChange={(v) => set({ effect: v as "help" | "crutch" })}>
                <Radio value="help" label="Help" />
                <Radio value="crutch" label="Crutch" />
              </RadioGroup>
            )}
            {d.kind === "mission" && (
              <Select floatingLabel="Worth" value={String(d.worth ?? 1)} onChange={(v) => set({ worth: Number(v) })}
                options={[1, 2, 3].map((n) => ({ value: String(n), label: `${n} point${n === 1 ? "" : "s"}${n === 1 ? " (easy)" : n === 3 ? " (hard)" : ""}` }))} />
            )}
            {d.kind === "rule" && (
              <>
                <RadioGroup name="tone" orientation="horizontal" label="How disruptive?" value={d.tone ?? "mild"} onChange={(v) => set({ tone: v as "mild" | "spicy" })}>
                  <Radio value="mild" label="Mild" />
                  <Radio value="spicy" label="Spicy" />
                </RadioGroup>
                <RadioGroup name="scope" orientation="horizontal" label="Who does it apply to?" value={d.scope} onChange={(v) => set({ scope: v as "table" | "player" })}>
                  <Radio value="table" label="Everyone" />
                  <Radio value="player" label="One player" />
                </RadioGroup>
              </>
            )}
            {d.text.includes("{n}") && (
              <RadioGroup name="turns-mode" orientation="horizontal" label="{n} means" value={d.turns_mode ?? "for"} onChange={(v) => set({ turns_mode: v as "for" | "until" })}>
                <Radio value="for" label="For the next n turns" />
                <Radio value="until" label="Until turn n" />
              </RadioGroup>
            )}
            {d.text.includes("{n}") && (
              <div className="party-row">
                <Input floatingLabel="Fewest turns" type="number" min={1} max={30} value={d.turns_min ?? ""} onChange={(e) => set({ turns_min: e.target.value ? Number(e.target.value) : null })} />
                <Input floatingLabel="Most turns" type="number" min={1} max={30} value={d.turns_max ?? ""} onChange={(e) => set({ turns_max: e.target.value ? Number(e.target.value) : null })} />
              </div>
            )}
            {d.text.includes("{rival}") && (
              <Checkbox checked={!!d.rival_obeys} onChange={(e) => set({ rival_obeys: e.target.checked })}
                label="The rival has to follow it too"
                helperText="Tick this when the card holds the rival back (like a Truce). The rival will always be a person, never a CPU, and they'll see the card." />
            )}
            <Select floatingLabel="Games (none = every Mario Party)" multiple value={d.games ?? []} onChange={(v) => set({ games: (v as string[]).length ? (v as string[]) : null })} options={games} />
            <Select floatingLabel="Leave out under these rules" multiple value={d.not_under ?? []} onChange={(v) => set({ not_under: (v as string[]).length ? (v as string[]) : null })} options={rulesets} />
            {official && d.kind !== "rule" && d.kind !== "moment" && (
              <Switch label="In the starter deck" helperText="Dealt to people without an account." checked={!!d.starter} onChange={(e) => set({ starter: e.target.checked })} />
            )}
            {d.text && (
              <div className={`party-card${d.effect ? ` party-card--${d.effect}` : ""}`}>
                <span className="party-card__who">Preview</span>
                <strong className="party-card__title">{d.title || "Untitled"}</strong>
                <span>{preview()}</span>
              </div>
            )}
            {errs.length > 0 && <Alert variant="warning"><ul className="party-list">{errs.map((e) => <li key={e}>{e}</li>)}</ul></Alert>}
          </div>
        )}
      </Modal>

      <Modal
        isOpen={!!publishing}
        onClose={() => setPublishing(null)}
        title="Publish this card?"
        size="small"
        primaryAction={{ label: busy ? "Publishing…" : "Publish", onClick: publish }}
        secondaryAction={{ label: "Cancel", onClick: () => setPublishing(null) }}
      >
        <p className="party-muted">Once it&apos;s live it can be dealt in {official ? "anyone's" : "your"} games right away.</p>
        {publishing && <p><strong>{publishing.title}:</strong> {publishing.text}</p>}
        <Checkbox checked={familySafe} onChange={(e) => setFamilySafe(e.target.checked)} label="This card is family-safe" helperText="Kids play these games, and cards can show on stream." />
      </Modal>
    </div>
  );
}
