"use client";

/**
 * Streaming ▸ Bingo (GS Pro). Number bingo for your viewers in three steps,
 * said the same way on /live and the overlay: open the hall (viewers grab a
 * card while the doors are open), call numbers (by hand, from chat or on a
 * timer, once the doors close), first real bingo wins (checked against the
 * numbers called). Also: your own patterns, drawn on a 5×5 grid. Everything
 * here works from chat too: !bingo start / doors / call / auto / end.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge, Button, Input, Modal, Select } from "@empac/cascadeds";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { useToast } from "@/components/toast/ToastProvider";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import { FREE_INDEX, PATTERNS, letterFor } from "@/lib/originals/bingo";
import type { SavedPattern, StreamBingoView } from "@/lib/bingo/stream";
import { EVENTS, tagged } from "@/lib/analytics/events";
import { LoadingLines } from "@/components/loading/LoadingLines";
import { AdminScreen, AdminSection, AdminPanel } from "@/components/account/admin/AdminKit";
import { IconAction } from "@/components/actions/IconAction";
import { BingoShape } from "@/components/overlay/NumberBingoOverlay";

const ERRORS: Record<string, string> = {
  already_open: "A game is already running. End it first.",
  pro_required: "Stream Bingo is a GS Pro feature.",
  no_community: "Connect Twitch first so your viewers have somewhere to play.",
  bad_interval: "The timer takes 30 to 600 seconds.",
  bad_doors: "The doors stay open for 30 seconds to 10 minutes.",
  bad_pattern: "That pattern isn't there any more. Pick another.",
  all_called: "All 75 numbers are out.",
  doors_open: "The doors are still open. Close them first, or wait for the countdown.",
  doors_closed: "The doors are already closed.",
  no_name: "Give the pattern a name.",
  too_few: "Mark at least two squares besides the free centre.",
  too_many: "You can keep up to 20 patterns. Delete one first.",
  name_taken: "You already have a pattern with that name.",
};

const TIMER_OPTIONS = [
  { value: "0", label: "Off: I'll call numbers myself" },
  { value: "30", label: "Every 30 seconds" },
  { value: "60", label: "Every minute" },
  { value: "120", label: "Every 2 minutes" },
  { value: "300", label: "Every 5 minutes" },
];
const DOORS_OPTIONS = [
  { value: "120", label: "2 minutes" },
  { value: "60", label: "1 minute" },
  { value: "180", label: "3 minutes" },
  { value: "300", label: "5 minutes" },
  { value: "0", label: "No doors: cards any time" },
];

const STEPS = [
  { title: "Open the hall", text: "Viewers grab a free card on your live page, or with !bingocard, while the doors are open." },
  { title: "Call numbers", text: "By hand, from chat or on a timer, once the doors close. Calls show on your overlay and live page." },
  { title: "First real bingo wins", text: "Every claim is checked against the numbers called. The prize goes out and chat hears who won." },
];

function clock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function StreamBingoTab() {
  const toast = useToast();
  const confirm = useConfirm();
  const [loading, setLoading] = useState(true);
  const [isPro, setIsPro] = useState(false);
  const [hasCommunity, setHasCommunity] = useState(false);
  const [game, setGame] = useState<StreamBingoView | null>(null);
  const [patterns, setPatterns] = useState<SavedPattern[]>([]);
  const [pattern, setPattern] = useState("line");
  const [doors, setDoors] = useState("120");
  const [timer, setTimer] = useState("0");
  const [tokens, setTokens] = useState("0");
  const [prizeText, setPrizeText] = useState("");
  const [busy, setBusy] = useState(false);
  const [drawing, setDrawing] = useState<{ name: string; cells: number[] } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let active = true;
    const load = async () => {
      const d = await fetch("/api/bingo", { cache: "no-store" }).then((r) => r.json()).catch(() => null);
      if (!active) return;
      if (d?.ok) {
        setIsPro(!!d.isPro);
        setHasCommunity(!!d.hasCommunity);
        setGame(d.game ?? null);
        setPatterns(d.patterns ?? []);
      }
      setLoading(false);
    };
    void load();
    // Refresh so the doors, timer calls, new players and a winner show up while you watch.
    const iv = window.setInterval(load, 4000);
    return () => { active = false; window.clearInterval(iv); };
  }, []);

  const closesAt = game?.doorsCloseAt ? Date.parse(game.doorsCloseAt) : 0;
  const doorsOpen = game?.status === "open" && closesAt > now;
  useEffect(() => {
    if (!doorsOpen) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [doorsOpen]);

  async function start() {
    setBusy(true);
    const res = await fetch("/api/bingo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pattern, doorsSeconds: Number(doors), callInterval: Number(timer) || null, prizeTokens: Number(tokens) || 0, prizeText }),
    });
    const d = await res.json().catch(() => null);
    setBusy(false);
    if (d?.ok) {
      setGame(d.game);
      setNow(Date.now());
      toast.success(Number(doors) ? "The hall is open" : "Bingo started");
    } else toast.error(ERRORS[d?.error] ?? "Couldn't start the game.");
  }

  async function act(body: Record<string, unknown>, done: string) {
    if (!game) return;
    setBusy(true);
    const res = await fetch(`/api/bingo/${game.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await res.json().catch(() => null);
    setBusy(false);
    if (d?.ok) {
      setGame(d.game);
      setNow(Date.now());
      if (done) toast.success(done);
    } else toast.error(ERRORS[d?.error] ?? "Couldn't update the game.");
  }

  async function savePattern() {
    if (!drawing) return;
    setBusy(true);
    const d = await fetch("/api/bingo/patterns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(drawing) })
      .then((r) => r.json()).catch(() => null);
    setBusy(false);
    if (d?.ok) {
      setPatterns(d.patterns);
      setPattern(`custom:${d.pattern.id}`);
      setDrawing(null);
      toast.success("Pattern saved");
    } else toast.error(ERRORS[d?.error] ?? "Couldn't save the pattern.");
  }

  async function removePattern(p: SavedPattern) {
    if (!(await confirm({ title: `Delete ${p.name}?`, body: "Games you've already played with it keep their copy.", confirmLabel: "Delete pattern" }))) return;
    const d = await fetch(`/api/bingo/patterns?id=${p.id}`, { method: "DELETE" }).then((r) => r.json()).catch(() => null);
    if (d?.ok) {
      setPatterns(d.patterns);
      if (pattern === `custom:${p.id}`) setPattern("line");
      toast.success("Pattern deleted");
    } else toast.error("Couldn't delete the pattern.");
  }

  const toggleCell = (i: number) => setDrawing((dr) => dr && ({ ...dr, cells: dr.cells.includes(i) ? dr.cells.filter((c) => c !== i) : [...dr.cells, i] }));

  if (loading) return <AdminScreen title="Bingo"><LoadingLines label="Loading" /></AdminScreen>;

  const intro = "Number bingo for your viewers: cards on your live page, calls on your overlay, a prize for the first real bingo.";

  if (!isPro) {
    return (
      <AdminScreen title="Bingo" intro={intro}>
        <AdminPanel>
          <p className="dbot-muted">Stream Bingo is part of GS Pro: cards on your live page, calls on your overlay, tokens and your own prize for the winner.</p>
          <Link href="/gs-pro?from=bingo" className={tagged(EVENTS.upgradeClicked, { from: "bingo" })}><Button variant="primary" size="small">See GS Pro</Button></Link>
        </AdminPanel>
      </AdminScreen>
    );
  }

  const open = game?.status === "open";
  const prize = game ? [game.prizeTokens ? `${game.prizeTokens} tokens` : null, game.prizeText].filter(Boolean).join(" + ") : "";
  const step = !open ? 1 : doorsOpen ? 1 : 2;

  return (
    <AdminScreen title="Bingo" intro={intro} className="stream-bingo">
      <ol className="bingo-steps bingo-steps--streamer" aria-label="How Stream Bingo works">
        {STEPS.map((st, i) => (
          <li key={st.title} className={open && i + 1 === step ? "is-now" : ""} aria-current={open && i + 1 === step ? "step" : undefined}>
            <span className="bingo-steps__n" aria-hidden="true">{i + 1}</span>
            <span><strong>{st.title}.</strong> {st.text}</span>
          </li>
        ))}
      </ol>

      {!hasCommunity ? (
        <AdminPanel>
          <p className="dbot-muted">Connect Twitch on <Link href="/account/streaming?tab=integrations">Streaming ▸ Setup</Link> to run Stream Bingo.</p>
        </AdminPanel>
      ) : open && game ? (
        <AdminSection
          title={doorsOpen ? "The hall is open" : "Numbers are being called"}
          actions={<Badge variant="success" size="small">Live</Badge>}
        >
          <div className="stream-bingo__goal">
            {game.shape && <BingoShape cells={game.shape} />}
            <p className="dbot-muted">
              To win: <strong>{game.patternLabel}</strong>{game.seriesStep ? ` (series game ${game.seriesStep})` : ""} · {game.players} {game.players === 1 ? "card" : "cards"}
              {!doorsOpen && <> · {game.called.length} of 75 called</>}{prize ? ` · Prize: ${prize}` : ""}
            </p>
          </div>
          {doorsOpen ? (
            <p className="stream-bingo__last stream-bingo__last--doors">Doors close in {clock(closesAt - now)}</p>
          ) : (
            game.last !== null && <p className="stream-bingo__last">{letterFor(game.last)} {game.last}</p>
          )}
          <div className="party-row">
            {doorsOpen ? (
              <Button variant="primary" disabled={busy} onClick={() => void act({ action: "doors" }, "Doors closed")}>Close the doors now</Button>
            ) : (
              <Button variant="primary" disabled={busy} onClick={() => void act({ action: "call" }, "")}>Call the next number</Button>
            )}
            <Select floatingLabel="Timer" options={TIMER_OPTIONS} value={String(game.callInterval ?? 0)}
              onChange={(v) => void act({ action: "auto", seconds: Number(v) || null }, Number(v) ? "Timer on" : "Timer off")} />
            <Button variant="secondary" disabled={busy} onClick={() => void act({ action: "close" }, "Game ended")}>End with no winner</Button>
          </div>
          {doorsOpen && game.callInterval ? <p className="dbot-muted">The timer starts when the doors close.</p> : null}
          {game.called.length > 0 && (
            <p className="dbot-muted">Called: {[...game.called].reverse().map((n) => `${letterFor(n)}${n}`).join(", ")}</p>
          )}
        </AdminSection>
      ) : (
        <>
          {game?.status === "won" && (
            <AdminPanel>
              <p><strong>{game.winnerName ?? "Someone"}</strong> won the last game after {game.called.length} calls{prize ? ` (${prize})` : ""}.</p>
            </AdminPanel>
          )}
          <AdminSection title="Open the hall" intro="Viewers grab cards until the doors close. Then the numbers start.">
            <div className="poll-form">
              <Select floatingLabel="Pattern to win" value={pattern} onChange={(v) => setPattern(String(v))}
                groups={[
                  { label: "Patterns", options: PATTERNS.map((p) => ({ value: p.id, label: `${p.label}: ${p.blurb.toLowerCase()}` })) },
                  { label: "Series", options: [{ value: "series", label: "The next pattern each game (line, corners, X, frame, blackout)" }] },
                  ...(patterns.length ? [{ label: "Your patterns", options: patterns.map((p) => ({ value: `custom:${p.id}`, label: p.name })) }] : []),
                ]} />
              <Select floatingLabel="Doors close after" value={doors} onChange={(v) => setDoors(String(v))} options={DOORS_OPTIONS} />
              <Select floatingLabel="Calls" value={timer} onChange={(v) => setTimer(String(v))} options={TIMER_OPTIONS} />
              <Input floatingLabel="Token prize (from your award allowance)" type="number" min={0} max={100000} value={tokens} onChange={(e) => setTokens(e.target.value)} />
              <Input floatingLabel="Your own prize, e.g. picks the next track (optional)" maxLength={140} value={prizeText} onChange={(e) => setPrizeText(e.target.value)} fullWidth />
              <div>
                <Button variant="primary" disabled={busy} onClick={() => void start()}>{Number(doors) ? "Open the hall" : "Start bingo"}</Button>
              </div>
            </div>
          </AdminSection>
        </>
      )}

      <AdminSection
        title="Your patterns"
        intro="Draw your own shape on the card. Pick it like the built-in ones; claims are checked against your drawing."
        actions={<Button variant="secondary" size="small" iconBefore={IconPlus} onClick={() => setDrawing({ name: "", cells: [] })}>Draw a pattern</Button>}
      >
        {patterns.length === 0 ? (
          <p className="dbot-muted">No patterns yet. Try a big X, an L or your channel&apos;s initial.</p>
        ) : (
          <ul className="stream-bingo__patterns">
            {patterns.map((p) => (
              <li key={p.id}>
                <BingoShape cells={p.cells} />
                <span className="stream-bingo__pattern-name">{p.name}</span>
                <IconAction label={`Delete ${p.name}`} icon={IconTrash} variant="danger" onClick={() => void removePattern(p)} />
              </li>
            ))}
          </ul>
        )}
      </AdminSection>

      <AdminSection title="From chat">
        <p className="dbot-muted">
          <code>!bingo start [pattern] [tokens] [prize]</code> opens the hall (a saved pattern works by name) · <code>!bingo doors</code> closes the doors now · <code>!bingo call</code> · <code>!bingo auto 60</code> · <code>!bingo end</code> (you and your mods).
          Viewers type <code>!bingocard</code> for the link to your live page.
        </p>
      </AdminSection>

      <Modal
        isOpen={!!drawing}
        onClose={() => setDrawing(null)}
        title="Draw a pattern"
        size="small"
        primaryAction={{ label: busy ? "Saving…" : "Save pattern", onClick: () => void savePattern() }}
        secondaryAction={{ label: "Cancel", onClick: () => setDrawing(null) }}
      >
        {drawing && (
          <div className="stream-bingo__draw">
            <Input floatingLabel="Name" maxLength={40} value={drawing.name} onChange={(e) => setDrawing({ ...drawing, name: e.target.value })} fullWidth />
            <p className="dbot-muted">Tap the squares a card needs. The free centre always counts.</p>
            <div className="stream-bingo__grid" role="group" aria-label="Pattern squares">
              {Array.from({ length: 25 }, (_, i) => {
                const free = i === FREE_INDEX;
                const on = free || drawing.cells.includes(i);
                return (
                  <button key={i} type="button" disabled={free} aria-pressed={on}
                    aria-label={free ? "Free centre" : `Row ${Math.floor(i / 5) + 1}, column ${(i % 5) + 1}`}
                    className={`stream-bingo__cell${on ? " is-on" : ""}${free ? " is-free" : ""}`}
                    onClick={() => toggleCell(i)}>
                    {free ? "Free" : ""}
                  </button>
                );
              })}
            </div>
            <p className="dbot-muted">{drawing.cells.length} {drawing.cells.length === 1 ? "square" : "squares"} marked</p>
          </div>
        )}
      </Modal>
    </AdminScreen>
  );
}
