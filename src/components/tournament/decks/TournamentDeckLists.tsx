"use client";

/**
 * Tournament deck lists (Pokémon TCG events):
 * - MyDeckListCard: the player's own list on the tournament page (send, swap
 *   until the event starts, see its checks and whether the organizer checked it).
 * - OrganizerDeckLists: the manage page's tab (who's in, who's missing with a
 *   Remind, anything to look at; open a list and mark it checked).
 * - PublicDeckLists: after the event, the lists the organizer chose to show,
 *   with Copy for TCG Live and Save to my decks.
 */

import { useCallback, useEffect, useState } from "react";
import { Accordion, Alert, Badge, Button, Modal, StatCard, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@empac/cascadeds";
import { IconCopy, IconDeviceFloppy } from "@tabler/icons-react";
import { AdminStats, AdminTable } from "@/components/account/admin/AdminKit";
import { useToast } from "@/components/toast/ToastProvider";
import { LoadingLines } from "@/components/loading/LoadingLines";
import { ChecksList, statusBadge } from "@/components/tcg/decks/TcgDecksTab";
import { DECK_FORMATS, SECTION_LABEL, exportDeckText, type DeckSection } from "@/lib/tcg/deckList";
import type { DeckView } from "@/lib/tcg/decks";
import type { DeckListSettings } from "@/lib/tournaments/deckLists";
import type { OrganizerDeckRow, PublicDeckList } from "@/lib/tournaments/deckListStore";
import { DeckListPicker } from "./DeckListPicker";

const SECTIONS: DeckSection[] = ["pokemon", "trainer", "energy"];
const okLabel = (format: string) => (format === "standard" ? "Standard ✓" : `${DECK_FORMATS.find((f) => f.value === format)?.label ?? "Format"} ✓`);

async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

/** A list grouped like TCG Live: Pokémon, Trainer, Energy, each with its count. */
export function DeckLines({ deck }: { deck: DeckView }) {
  return (
    <div className="tdeck-lines">
      {SECTIONS.map((sec) => {
        const lines = deck.lines.filter((l) => l.section === sec);
        if (!lines.length) return null;
        return (
          <div key={sec} className="tdeck-lines__section">
            <h4 className="tdeck-lines__head">{SECTION_LABEL[sec]} ({deck.totals[sec]})</h4>
            <ul className="tdeck-lines__list">
              {lines.map((l, i) => (
                <li key={`${l.name}-${i}`} className={!l.cardId && sec !== "energy" ? "tdeck-lines__line tdeck-lines__line--unmatched" : "tdeck-lines__line"}>
                  <span className="tdeck-lines__count">{l.count}</span> {l.name}{l.set ? <span className="swiss-muted"> {l.set}{l.number ? ` ${l.number}` : ""}</span> : null}
                  {!l.cardId && sec !== "energy" && <span className="sr-only"> (we couldn&apos;t match this card)</span>}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

type Mine = { participantId: string | null; deck: (DeckView & { checkedAt: string | null }) | null; locked: boolean; settings: DeckListSettings };

export function MyDeckListCard({ tournamentId, onChanged }: { tournamentId: string; onChanged?: () => void }) {
  const toast = useToast();
  const [mine, setMine] = useState<Mine | null>(null);
  const [swapping, setSwapping] = useState(false);
  const [pick, setPick] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fetchMine = useCallback(async (): Promise<Mine | null> => {
    const res = await fetch(`/api/tournament/${tournamentId}/deck-lists?view=mine`, { cache: "no-store" }).catch(() => null);
    const j = (await res?.json().catch(() => null)) as { ok?: boolean; mine?: Mine } | null;
    return j?.ok && j.mine ? j.mine : null;
  }, [tournamentId]);
  const load = useCallback(async () => setMine(await fetchMine()), [fetchMine]);
  useEffect(() => {
    let live = true;
    fetchMine().then((m) => { if (live) setMine(m); });
    return () => { live = false; };
  }, [fetchMine]);

  if (!mine || !mine.participantId) return null;
  const send = async () => {
    if (!pick) return;
    setBusy(true);
    const res = await fetch(`/api/tournament/${tournamentId}/deck-lists`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deckId: pick }) }).catch(() => null);
    const j = (await res?.json().catch(() => null)) as { ok?: boolean; message?: string } | null;
    setBusy(false);
    if (!j?.ok) { toast.toast({ variant: "error", title: "Couldn't send your list", message: j?.message ?? "Try again." }); return; }
    toast.toast({ variant: "success", message: mine.deck ? "List swapped." : "List sent to the organizer." });
    setSwapping(false); setPick(null);
    await load(); onChanged?.();
  };
  const deck = mine.deck;
  return (
    <div className="comp-card tdeck-mine" id="deck-list">
      <div className="tdeck-mine__head">
        <h2 className="swiss-card-title">Your deck list</h2>
        {deck?.checkedAt && <Badge variant="success" size="small">Checked by the organizer</Badge>}
      </div>
      {!deck && mine.locked && <Alert variant="warning">You didn&apos;t send a list before the event started. Talk to the organizer.</Alert>}
      {deck && (
        <>
          <div className="tdeck-mine__deck">
            <strong>{deck.name}</strong>
            <span className="swiss-muted">{deck.totals.all} cards</span>
            {statusBadge(deck, okLabel(mine.settings.format))}
          </div>
          <ChecksList checks={deck.checks} />
          <Accordion variant="bordered" items={[{ id: "list", title: "See the list", content: <DeckLines deck={deck} /> }]} />
        </>
      )}
      {!mine.locked && (!deck || swapping) && (
        <div className="tdeck-mine__pick">
          <DeckListPicker format={mine.settings.format} value={pick} onChange={setPick} legend={deck ? "Swap to another list" : "Send your deck list"} />
          <div className="tdeck-mine__actions">
            {deck && <Button variant="secondary" size="small" onClick={() => setSwapping(false)}>Cancel</Button>}
            <Button variant="primary" size="small" onClick={() => void send()} loading={busy} disabled={!pick || busy}>{deck ? "Use this list" : "Send this list"}</Button>
          </div>
        </div>
      )}
      {!mine.locked && deck && !swapping && <Button variant="ghost" size="small" onClick={() => setSwapping(true)}>Swap list</Button>}
      <p className="swiss-help">
        {mine.locked ? "Lists are locked: the event has started." : "The organizer sees your list. Everyone else sees it only if the organizer shares lists after the event. You can swap it until the event starts."}
      </p>
    </div>
  );
}

type Org = { rows: OrganizerDeckRow[]; settings: DeckListSettings; locked: boolean };

export function OrganizerDeckLists({ tournamentId }: { tournamentId: string }) {
  const toast = useToast();
  const [data, setData] = useState<Org | null>(null);
  const [missing, setMissing] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<(DeckView & { checkedAt: string | null; player: string }) | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const fetchOrg = useCallback(async () => {
    const res = await fetch(`/api/tournament/${tournamentId}/deck-lists?view=organizer`, { cache: "no-store" }).catch(() => null);
    return (await res?.json().catch(() => null)) as { ok?: boolean; organizer?: Org; error?: string } | null;
  }, [tournamentId]);
  const apply = useCallback((j: Awaited<ReturnType<typeof fetchOrg>>) => {
    if (j?.error === "missing") setMissing(true);
    if (j?.ok && j.organizer) setData(j.organizer);
  }, []);
  const load = useCallback(async () => apply(await fetchOrg()), [apply, fetchOrg]);
  useEffect(() => {
    let live = true;
    fetchOrg().then((j) => { if (live) apply(j); });
    return () => { live = false; };
  }, [apply, fetchOrg]);

  const openList = async (participantId: string) => {
    setOpenId(participantId); setDetail(null);
    const res = await fetch(`/api/tournament/${tournamentId}/deck-lists?view=one&participant=${participantId}`, { cache: "no-store" }).catch(() => null);
    const j = (await res?.json().catch(() => null)) as { ok?: boolean; deck?: DeckView & { checkedAt: string | null; player: string } } | null;
    if (j?.ok && j.deck) setDetail(j.deck);
  };
  const post = async (body: Record<string, unknown>, done: string) => {
    setBusy(String(body.action));
    const res = await fetch(`/api/tournament/${tournamentId}/deck-lists`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const j = (await res?.json().catch(() => null)) as { ok?: boolean; sent?: boolean; message?: string } | null;
    setBusy(null);
    if (!j?.ok) { toast.toast({ variant: "error", title: "Couldn't do that", message: j?.message ?? "Try again." }); return false; }
    toast.toast({ variant: "success", message: body.action === "remind" && j.sent === false ? "They joined as a guest, so there's no account to remind." : done });
    await load();
    return true;
  };

  if (missing) return <Alert variant="info" title="Deck lists need a database update">Once it&apos;s applied, players&apos; lists show here.</Alert>;
  if (!data) return <LoadingLines label="Loading deck lists" />;
  const playing = data.rows.filter((r) => r.status !== "dropped");
  const inCount = playing.filter((r) => r.deck).length;
  const toLook = playing.filter((r) => r.deck && !r.deck.checkedAt && (r.deck.problems > 0 || r.deck.unchecked > 0)).length;
  return (
    <div className="tdeck-org">
      <AdminStats columns={4} label="Deck lists">
        <StatCard label="Players" stat={String(playing.length)} />
        <StatCard label="Lists in" stat={String(inCount)} />
        <StatCard label="To look at" stat={String(toLook)} />
        <StatCard label="Missing" stat={String(playing.length - inCount)} />
      </AdminStats>
      {playing.length === 0 ? <p className="swiss-help">Nobody has joined yet. Lists show here as players send them.</p> : (
      <AdminTable label="Deck lists">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Player</TableHead>
              <TableHead>Deck</TableHead>
              <TableHead>Check</TableHead>
              <TableHead>Checked by you</TableHead>
              <TableHead><span className="sr-only">Actions</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {playing.map((r) => (
              <TableRow key={r.participantId} className={r.deck && !r.deck.checkedAt && (r.deck.problems > 0 || r.deck.unchecked > 0) ? "swiss-row--flag" : undefined}>
                <TableCell>{r.player}</TableCell>
                <TableCell>{r.deck ? r.deck.name : <span className="swiss-muted">No list yet</span>}</TableCell>
                <TableCell>{r.deck ? statusBadge({ legal: r.deck.legal, problems: r.deck.problems, unchecked: r.deck.unchecked }, okLabel(data.settings.format)) : <Badge variant="error" size="small">Missing</Badge>}</TableCell>
                <TableCell>{r.deck?.checkedAt ? <Badge variant="success" size="small">Checked</Badge> : r.deck ? <span className="swiss-muted">Not yet</span> : null}</TableCell>
                <TableCell>
                  {r.deck
                    ? <Button size="small" variant="ghost" onClick={() => void openList(r.participantId)}>Open</Button>
                    : !data.locked && r.hasAccount && <Button size="small" variant="ghost" onClick={() => void post({ action: "remind", participantId: r.participantId }, `${r.player} has been reminded.`)} disabled={!!busy}>Remind</Button>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </AdminTable>
      )}
      <p className="swiss-help">{data.locked ? "Lists locked when the event started." : "Lists lock when you start the event. Players without a list can still play if you allow it."}</p>

      <Modal isOpen={!!openId} onClose={() => setOpenId(null)} title={detail ? `${detail.player} · ${detail.name}` : "Deck list"} size="large">
        {!detail ? <LoadingLines label="Loading the list" /> : (
          <div className="tdeck-detail">
            <div className="tdeck-mine__deck">
              {statusBadge(detail, okLabel(data.settings.format))}
              <span className="swiss-muted">{detail.totals.all} cards</span>
              {detail.checkedAt && <Badge variant="success" size="small">Checked</Badge>}
            </div>
            <ChecksList checks={detail.checks} />
            <DeckLines deck={detail} />
            <div className="tdeck-mine__actions">
              <Button variant="secondary" size="small" iconBefore={IconCopy} onClick={async () => { if (await copyText(exportDeckText(detail.lines))) toast.toast({ variant: "success", message: "Copied for TCG Live." }); }}>Copy for TCG Live</Button>
              <Button variant="primary" size="small" loading={busy === "check"} disabled={!!busy} onClick={async () => { if (await post({ action: "check", participantId: openId, checked: !detail.checkedAt }, detail.checkedAt ? "Marked as not checked." : "Marked checked.")) setDetail({ ...detail, checkedAt: detail.checkedAt ? null : new Date().toISOString() }); }}>
                {detail.checkedAt ? "Mark not checked" : "Mark checked"}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

export function PublicDeckLists({ tournamentId, signedIn }: { tournamentId: string; signedIn: boolean }) {
  const toast = useToast();
  const [data, setData] = useState<{ lists: PublicDeckList[]; scope: "top_cut" | "all" } | null>(null);
  const [saving, setSaving] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`/api/tournament/${tournamentId}/deck-lists?view=public`, { cache: "no-store" })
      .then((r) => r.json()).then((j) => { if (live && j?.ok) setData(j.public ?? null); }).catch(() => {});
    return () => { live = false; };
  }, [tournamentId]);
  if (!data || !data.lists.length) return null;
  const save = async (i: number, entry: PublicDeckList) => {
    setSaving(i);
    const res = await fetch("/api/tcg/decks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: `${entry.deck.name} (${entry.player})`.slice(0, 60), text: exportDeckText(entry.deck.lines) }) }).catch(() => null);
    const j = (await res?.json().catch(() => null)) as { deck?: unknown; message?: string } | null;
    setSaving(null);
    if (j?.deck) toast.toast({ variant: "success", message: "Saved to My Stuff ▸ Deck lists." });
    else toast.toast({ variant: "error", title: "Couldn't save it", message: j?.message ?? "Try again." });
  };
  const ord = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
  return (
    <div className="comp-card">
      <h2 className="swiss-card-title">Deck lists</h2>
      <p className="swiss-help">{data.scope === "top_cut" ? "The top cut's lists, shown after the event." : "Everyone's lists, shown after the event."}</p>
      <Accordion
        variant="bordered"
        allowMultiple
        items={data.lists.map((entry, i) => ({
          id: `deck-${i}`,
          title: <span className="tdeck-pub__title"><strong>{ord(entry.placement)} · {entry.player}</strong> <span className="swiss-muted">{entry.deck.name}</span></span>,
          content: (
            <div className="tdeck-pub">
              <DeckLines deck={entry.deck} />
              <div className="tdeck-mine__actions">
                <Button variant="secondary" size="small" iconBefore={IconCopy} onClick={async () => { if (await copyText(exportDeckText(entry.deck.lines))) toast.toast({ variant: "success", message: "Copied for TCG Live." }); }}>Copy for TCG Live</Button>
                {signedIn && <Button variant="secondary" size="small" iconBefore={IconDeviceFloppy} loading={saving === i} disabled={saving !== null} onClick={() => void save(i, entry)}>Save to my decks</Button>}
              </div>
            </div>
          ),
        }))}
      />
    </div>
  );
}
