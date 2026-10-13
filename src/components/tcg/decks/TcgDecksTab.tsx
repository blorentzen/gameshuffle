"use client";

/**
 * My Stuff ▸ My Collection ▸ Deck lists: your own Pokémon TCG deck lists.
 * Paste a list from Pokémon TCG Live or Limitless (or copy one of our deck
 * guides from its page), see whether it's Standard legal and how much of it
 * you own (My Cards), copy it back out, and play it in the companion. Free
 * accounts keep FREE_DECK_LIMIT decks; GS Pro as many as they like.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Alert, Badge, Button, EmptyState, Input, List, ListItem, Modal, Progress, Textarea,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@empac/cascadeds";
import { IconCards, IconClipboardText, IconCopy, IconPlayerPlay, IconTrash } from "@tabler/icons-react";
import { AdminScreen, AdminTable } from "@/components/account/admin/AdminKit";
import { useToast } from "@/components/toast/ToastProvider";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import { LoadingLines } from "@/components/loading/LoadingLines";
import { ProTrialPrompt } from "@/components/billing/ProTrialPrompt";
import { TCG_SHOP_URL } from "@/data/shop";
import { FREE_DECK_LIMIT, SECTION_LABEL, exportDeckText, type DeckCheck, type DeckSection } from "@/lib/tcg/deckList";
import type { DeckSummary, DeckView } from "@/lib/tcg/decks";

const SECTIONS: DeckSection[] = ["pokemon", "trainer", "energy"];

/** A list's state in one badge. `okLabel` names what passed ("Standard legal", or a tournament's format). */
export function statusBadge(d: { legal: boolean; problems?: number; unchecked: number; checks?: DeckCheck[] }, okLabel = "Standard legal") {
  const problems = d.problems ?? d.checks?.filter((c) => c.level === "bad").length ?? 0;
  if (problems > 0) return <Badge variant="error" size="small">{problems === 1 ? "1 problem" : `${problems} problems`}</Badge>;
  if (d.unchecked > 0 || d.checks?.some((c) => c.level === "warn")) return <Badge variant="warning" size="small">Check by hand</Badge>;
  return <Badge variant="success" size="small">{okLabel}</Badge>;
}

async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

type DeckListData = { ready: boolean; decks: DeckSummary[]; limit: number | null };

async function fetchDecks(): Promise<DeckListData> {
  try {
    const res = await fetch("/api/tcg/decks", { cache: "no-store" });
    const body = await res.json().catch(() => null);
    return res.ok && body ? body : { ready: false, decks: [], limit: null };
  } catch {
    return { ready: false, decks: [], limit: null };
  }
}

export function TcgDecksTab({ isPro }: { isPro: boolean }) {
  const [data, setData] = useState<DeckListData | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => setData(await fetchDecks()), []);
  const closeDeck = useCallback(() => setOpenId(null), []);
  useEffect(() => {
    let live = true;
    fetchDecks().then((d) => { if (live) setData(d); });
    return () => { live = false; };
  }, []);

  const atLimit = !!data && data.limit != null && data.decks.length >= data.limit;

  return (
    <AdminScreen
      title="Deck lists"
      intro="Paste a list from Pokémon TCG Live or Limitless, or copy one of our deck guides. See whether it's Standard legal and how much of it you own, then play it in the companion."
      actions={data?.ready ? (
        <>
          <Button variant="primary" size="small" iconBefore={IconClipboardText} onClick={() => setPasteOpen(true)} disabled={atLimit}>Paste a deck list</Button>
          <Link href="/pokemon-tcg/decks" className="tcg-decks__guides"><Button variant="secondary" size="small" iconBefore={IconCards}>Start from a guide</Button></Link>
        </>
      ) : undefined}
    >
      {data === null ? <LoadingLines label="Loading your decks" /> : !data.ready ? (
        <EmptyState icon={<IconCards size={32} />} title="Deck lists are coming soon" description="Save your Pokémon TCG decks here, check them against Standard and play them in the companion." />
      ) : (
        <>
          {data.decks.length === 0 ? (
            <EmptyState
              icon={<IconCards size={32} />}
              title="No deck lists yet"
              description="Paste one from Pokémon TCG Live or Limitless, or open a deck guide and copy it here."
              action={<Button variant="primary" onClick={() => setPasteOpen(true)}>Paste a deck list</Button>}
            />
          ) : (
            <List divided className="tcg-decks__list">
              {data.decks.map((d) => (
                <ListItem
                  key={d.id}
                  className="tcg-decks__row"
                  icon={d.cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={d.cover} alt="" className="tcg-decks__cover" loading="lazy" />
                  ) : <span className="tcg-decks__cover tcg-decks__cover--none" aria-hidden="true" />}
                  suffix={<Button size="small" variant="secondary" onClick={() => setOpenId(d.id)} aria-label={`Open ${d.name}`}>Open</Button>}
                >
                  <button type="button" className="tcg-decks__name" onClick={() => setOpenId(d.id)}>{d.name}</button>
                  <span className="tcg-decks__meta">
                    {statusBadge(d)}
                    <span>{d.total} cards</span>
                    <span>You own {d.owned} of {d.total}</span>
                  </span>
                  <Progress value={d.total ? Math.round((d.owned / d.total) * 100) : 0} size="small" label={`You own ${d.owned} of ${d.total}`} className="admin-progress-quiet tcg-decks__progress" />
                </ListItem>
              ))}
            </List>
          )}
          {data.limit != null && (
            <p className="tcg-decks__limit">{data.decks.length} of {data.limit} decks on a free account. GS Pro keeps as many as you like.</p>
          )}
          {atLimit && !isPro && (
            <ProTrialPrompt title="Keep more than 3 deck lists with GS Pro" from="tcg-decks">
              Free accounts keep {FREE_DECK_LIMIT}. GS Pro keeps as many as you like.
            </ProTrialPrompt>
          )}
        </>
      )}
      {pasteOpen && <PasteDeckModal onClose={() => setPasteOpen(false)} onSaved={(id) => { setPasteOpen(false); void load(); setOpenId(id); }} />}
      {openId && <DeckModal id={openId} onClose={closeDeck} onChanged={() => void load()} />}
    </AdminScreen>
  );
}

export function ChecksList({ checks }: { checks: DeckCheck[] }) {
  return (
    <ul className="tcg-decks__checks">
      {checks.map((c) => (
        <li key={c.id} className={`tcg-decks__check tcg-decks__check--${c.level}`}>
          <span className="tcg-decks__check-mark" aria-hidden="true">{c.level === "ok" ? "✓" : c.level === "warn" ? "!" : "✕"}</span>
          <span><span className="sr-only">{c.level === "ok" ? "OK: " : c.level === "warn" ? "Check: " : "Problem: "}</span>{c.text}</span>
        </li>
      ))}
    </ul>
  );
}

export function PasteDeckModal({ onClose, onSaved }: { onClose: () => void; onSaved: (id: string) => void }) {
  const toast = useToast();
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [preview, setPreview] = useState<{ view: DeckView; skipped: string[] } | null>(null);
  const [busy, setBusy] = useState<"check" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const check = async () => {
    setBusy("check"); setError(null);
    try {
      const res = await fetch("/api/tcg/decks/check", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setError(body.message ?? "That didn't check. Try again."); return; }
      setPreview(body);
      if (!name.trim()) {
        const lead = (body.view as DeckView).lines.find((l) => l.section === "pokemon");
        if (lead) setName(`${lead.name} deck`);
      }
    } finally { setBusy(null); }
  };

  const save = async () => {
    setBusy("save"); setError(null);
    try {
      const res = await fetch("/api/tcg/decks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, name }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setError(body.message ?? "That didn't save. Try again."); return; }
      toast.toast({ variant: "success", message: "Deck saved." });
      onSaved(body.deck.id);
    } finally { setBusy(null); }
  };

  return (
    <Modal isOpen onClose={onClose} title="Paste a deck list" size="large">
      <div className="tcg-decks__paste">
        <Textarea
          floatingLabel="Deck list"
          fullWidth
          rows={10}
          value={text}
          onChange={(e) => { setText(e.target.value); setPreview(null); }}
          placeholder={"Pokémon: 12\n4 Pikachu ex ASC 57\n…\nTrainer: 36\n4 Ultra Ball ASC 213\n…\nEnergy: 12\n12 Basic {L} Energy SVE 4"}
          className="tcg-decks__textarea"
        />
        <p className="tcg-decks__hint">From Pokémon TCG Live (Export to clipboard), Limitless, or a friend&apos;s message.</p>
        {error && <Alert variant="warning">{error}</Alert>}
        {preview && (
          <>
            <ChecksList checks={preview.view.checks} />
            {preview.skipped.length > 0 && (
              <Alert variant="info" title={`${preview.skipped.length} ${preview.skipped.length === 1 ? "line" : "lines"} didn't read as a card`}>
                {preview.skipped.slice(0, 3).join(" · ")}{preview.skipped.length > 3 ? " …" : ""}
              </Alert>
            )}
            <Input floatingLabel="Deck name" fullWidth maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
          </>
        )}
        <div className="tcg-decks__paste-actions">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          {preview ? (
            <Button variant="primary" onClick={save} loading={busy === "save"} disabled={!!busy || !name.trim()}>Save this deck</Button>
          ) : (
            <Button variant="primary" onClick={check} loading={busy === "check"} disabled={!!busy || !text.trim()}>Check this list</Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

function DeckModal({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [deck, setDeck] = useState<DeckView | null>(null);
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const res = await fetch(`/api/tcg/decks/${id}`, { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!active) return;
      if (res.ok) { setDeck(body.deck); setName(body.deck.name); }
      else { toast.toast({ variant: "warning", message: body.message ?? "Couldn't open that deck." }); onClose(); }
    })();
    return () => { active = false; };
  }, [id, onClose, toast]);

  const rename = async () => {
    const res = await fetch(`/api/tcg/decks/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { toast.toast({ variant: "warning", message: body.message ?? "That didn't save." }); return; }
    setDeck(body.deck); setRenaming(false); onChanged();
    toast.toast({ variant: "success", message: "Renamed." });
  };

  const remove = async () => {
    const ok = await confirm({ title: `Delete ${deck?.name ?? "this deck"}?`, body: "The list goes for good. Your cards in My Cards stay.", confirmLabel: "Delete the deck" });
    if (!ok) return;
    const res = await fetch(`/api/tcg/decks/${id}`, { method: "DELETE" });
    if (!res.ok) { toast.toast({ variant: "warning", message: "That didn't delete. Try again." }); return; }
    toast.toast({ variant: "success", message: "Deck deleted." });
    onChanged(); onClose();
  };

  const missing = deck ? deck.totals.all - deck.owned : 0;

  return (
    <Modal isOpen onClose={onClose} title={deck?.name ?? "Deck list"} size="large">
      {!deck ? <LoadingLines label="Loading the deck" /> : (
        <div className="tcg-decks__deck">
          <div className="tcg-decks__deck-head">
            {statusBadge(deck)}
            <span>{deck.totals.all} cards · {SECTIONS.map((s) => `${deck.totals[s]} ${SECTION_LABEL[s]}`).join(" · ")}</span>
          </div>
          <div className="tcg-decks__deck-actions">
            <Link href={`/tcg-companion?deck=${deck.id}`}><Button variant="primary" size="small" iconBefore={IconPlayerPlay}>Play in the companion</Button></Link>
            <Button variant="secondary" size="small" iconBefore={IconCopy} onClick={async () => {
              const ok = await copyText(exportDeckText(deck.lines));
              toast.toast({ variant: ok ? "success" : "warning", message: ok ? "Copied. In Pokémon TCG Live, import it from the clipboard." : "Couldn't copy here. Select the list and copy it by hand." });
            }}>Copy for TCG Live</Button>
            <Button variant="ghost" size="small" onClick={() => setRenaming((r) => !r)}>Rename</Button>
            <Button variant="ghost" size="small" iconBefore={IconTrash} onClick={remove}>Delete</Button>
          </div>
          {renaming && (
            <div className="tcg-decks__rename">
              <Input floatingLabel="Deck name" fullWidth maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
              <Button variant="primary" size="small" onClick={rename} disabled={!name.trim()}>Save name</Button>
            </div>
          )}
          <ChecksList checks={deck.checks} />
          <p className="tcg-decks__owned">
            You own {deck.owned} of {deck.totals.all}.
            {missing > 0 && <> {missing === 1 ? "You need 1 more card." : `You need ${missing} more cards.`} <a href={TCG_SHOP_URL} target="_blank" rel="noopener noreferrer">Shop the singles</a></>}
          </p>
          {SECTIONS.filter((s) => deck.lines.some((l) => l.section === s)).map((s) => (
            <AdminTable key={s} label={`${SECTION_LABEL[s]}: ${deck.totals[s]}`}>
              <Table dense>
                <TableHeader>
                  <TableRow>
                    <TableHead align="right">#</TableHead>
                    <TableHead>{SECTION_LABEL[s]} ({deck.totals[s]})</TableHead>
                    <TableHead>Set</TableHead>
                    <TableHead align="right">You have</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deck.lines.filter((l) => l.section === s).map((l, i) => (
                    <TableRow key={`${l.name}-${l.set}-${l.number}-${i}`}>
                      <TableCell align="right">{l.count}</TableCell>
                      <TableCell>
                        <span className="tcg-decks__card">
                          {l.image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={l.image} alt="" className="tcg-decks__thumb" loading="lazy" />
                          ) : <span className="tcg-decks__thumb tcg-decks__thumb--none" aria-hidden="true" />}
                          {l.name}
                          {!l.cardId && !/energy$/i.test(l.name) && <span className="tcg-decks__unmatched">not matched</span>}
                        </span>
                      </TableCell>
                      <TableCell>{l.set && l.number ? `${l.set} ${l.number}` : ""}{l.mark ? <span className="tcg-decks__mark"> · {l.mark}</span> : null}</TableCell>
                      <TableCell align="right"><span className={l.owned >= l.count ? "tcg-decks__have" : "tcg-decks__need"}>{l.owned >= l.count ? `All ${l.count}` : `${l.owned} of ${l.count}`}</span></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </AdminTable>
          ))}
        </div>
      )}
    </Modal>
  );
}
