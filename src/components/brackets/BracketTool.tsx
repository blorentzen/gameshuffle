"use client";

/**
 * The free bracket tools (search pages round, picks 2026-10-20): one component
 * for /bracket-generator (single or double elimination), /round-robin-generator
 * and /swiss-pairing-generator. Paste names, choose the options, make it; then
 * tap winners through, copy a link that rebuilds it with every result, print
 * it, or "Run it as a live tournament", which hands the names to the create
 * form (a real event, with GS Circuit's field sizes, is where it goes live).
 *
 * Kept in this browser (localStorage per tool); nothing is sent anywhere.
 * Rules in src/lib/brackets/.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Switch, Tabs, Textarea } from "@empac/cascadeds";
import { IconArrowsShuffle, IconEdit, IconLink, IconPrinter, IconTrophy } from "@tabler/icons-react";
import { Select } from "@/components/ui/Select";
import { useAuth } from "@/components/auth/AuthProvider";
import { useConfirm } from "@/components/confirm/ConfirmProvider";
import { useToast } from "@/components/toast/ToastProvider";
import { EVENTS, track } from "@/lib/analytics/events";
import {
  decodeLink, encodeLink, FORMAT_WORDS, HANDOFF_KEY, liveFormatFor, MIN_PLAYERS, parseNames, roundRobinAsSwiss, shuffled,
  type Handoff, type LinkPayload, type ToolFormat,
} from "@/lib/brackets/tool";
import { buildElim, decodePicks, eliminationChampion, eliminationPlaces, encodePicks, pickWinner, playableMatches, type ElimKind, type Picks } from "@/lib/brackets/elim";
import { decodeRR, encodeRR, roundRobinSchedule, type RRResult } from "@/lib/brackets/roundRobin";
import { decodeSwiss, encodeSwiss, startSwiss, swissPlan, type SwissTool } from "@/lib/brackets/swissTool";
import type { TopCut } from "@/lib/tournaments/swiss";
import { BracketTree } from "./BracketTree";
import { RoundRobinBoard } from "./RoundRobinBoard";
import { SwissPairingBoard } from "./SwissPairingBoard";

export type ToolPage = "elim" | "roundrobin" | "swiss";

interface Setup {
  text: string;
  title: string;
  kind: ElimKind;
  legs: 1 | 2;
  ties: boolean;
  rounds: "auto" | number;
  topCut: "auto" | TopCut;
}

type Board =
  | { f: "single" | "double"; names: string[]; title: string; picks: Picks }
  | { f: "roundrobin"; names: string[]; title: string; legs: 1 | 2; ties: boolean; results: (RRResult | null)[] }
  | { f: "swiss"; names: string[]; title: string; ties: boolean; tool: SwissTool };

const DEFAULT_SETUP: Setup = { text: "", title: "", kind: "single", legs: 1, ties: false, rounds: "auto", topCut: "auto" };
const SAMPLE = ["Sam", "Riley", "Alex", "Jordan", "Casey", "Morgan", "Taylor", "Jamie"];
const storeKey = (page: ToolPage) => `gs-bracket-${page}`;
const formatsOf: Record<ToolPage, ToolFormat[]> = { elim: ["single", "double"], roundrobin: ["roundrobin"], swiss: ["swiss"] };

function toLink(b: Board): LinkPayload {
  if (b.f === "roundrobin") return { f: b.f, names: b.names, title: b.title, options: { l: b.legs, t: b.ties ? 1 : 0 }, results: encodeRR(b.results) };
  if (b.f === "swiss") return { f: b.f, names: b.names, title: b.title, options: { t: b.ties ? 1 : 0 }, results: encodeSwiss(b.tool) };
  return { f: b.f, names: b.names, title: b.title, options: {}, results: encodePicks(b.f, b.names.length, b.picks) };
}

function fromLink(p: LinkPayload): Board | null {
  const n = p.names.length;
  if (p.f === "roundrobin") {
    const legs = p.options.l === 2 ? 2 : 1;
    const ties = p.options.t === 1;
    const schedule = roundRobinSchedule(n, legs);
    return { f: "roundrobin", names: p.names, title: p.title, legs, ties, results: decodeRR(p.results, schedule.matches.length, ties) };
  }
  if (p.f === "swiss") {
    const tool = decodeSwiss(n, p.results);
    return tool ? { f: "swiss", names: p.names, title: p.title, ties: p.options.t === 1, tool } : null;
  }
  return { f: p.f, names: p.names, title: p.title, picks: buildElim(p.f, n, decodePicks(p.f, n, p.results)).picks };
}

const boardHasResults = (b: Board) =>
  b.f === "roundrobin" ? b.results.some(Boolean) : b.f === "swiss" ? b.tool.swiss.list.length > 1 || Object.keys(b.tool.swiss.list[0]?.results ?? {}).length > 0 : Object.keys(b.picks).length > 0;

export function BracketTool({ page }: { page: ToolPage }) {
  const router = useRouter();
  const { user } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const [setup, setSetup] = useState<Setup>(DEFAULT_SETUP);
  const [board, setBoard] = useState<Board | null>(null);
  const [loaded, setLoaded] = useState(false);
  const boardRef = useRef<HTMLDivElement>(null);

  // A shared link (?b=…) wins; otherwise what this browser had last time.
  useEffect(() => {
    let next: { setup: Setup; board: Board | null } | null = null;
    const link = decodeLink(new URLSearchParams(window.location.search).get("b"));
    if (link && formatsOf[page].includes(link.f)) {
      const b = fromLink(link);
      if (b) {
        next = { setup: { ...DEFAULT_SETUP, text: b.names.join("\n"), title: b.title, kind: b.f === "double" ? "double" : "single", legs: b.f === "roundrobin" ? b.legs : 1, ties: b.f === "roundrobin" || b.f === "swiss" ? b.ties : false }, board: b };
        // The link has done its job; from here this browser keeps the bracket.
        window.history.replaceState(null, "", window.location.pathname);
      }
    }
    if (!next) {
      try {
        const raw = localStorage.getItem(storeKey(page));
        if (raw) {
          const saved = JSON.parse(raw) as { setup?: Partial<Setup>; b?: string };
          const decoded = saved.b ? decodeLink(saved.b) : null;
          next = { setup: { ...DEFAULT_SETUP, ...(saved.setup ?? {}) }, board: decoded ? fromLink(decoded) : null };
        }
      } catch { /* private window or bad data: start fresh */ }
    }
    /* eslint-disable react-hooks/set-state-in-effect -- read once from the address and this browser */
    if (next) { setSetup(next.setup); setBoard(next.board); }
    setLoaded(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [page]);

  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem(storeKey(page), JSON.stringify({ setup, b: board ? encodeLink(toLink(board)) : undefined })); } catch { /* storage full or blocked */ }
  }, [loaded, page, setup, board]);

  const parsed = useMemo(() => parseNames(setup.text), [setup.text]);
  const format: ToolFormat = page === "elim" ? setup.kind : page;
  const min = MIN_PLAYERS[format];
  const set = (patch: Partial<Setup>) => setSetup((s) => ({ ...s, ...patch }));

  const make = () => {
    const names = parsed.names;
    if (names.length < min) { toast.error(`Add at least ${min} players for ${FORMAT_WORDS[format]}.`); return; }
    const title = setup.title.trim();
    let next: Board;
    if (format === "roundrobin") next = { f: "roundrobin", names, title, legs: setup.legs, ties: setup.ties, results: roundRobinSchedule(names.length, setup.legs).matches.map(() => null) };
    else if (format === "swiss") next = { f: "swiss", names, title, ties: setup.ties, tool: startSwiss(names.length, { rounds: setup.rounds, topCut: setup.topCut }) };
    else next = { f: format, names, title, picks: {} };
    setBoard(next);
    track(EVENTS.bracketMade, { format, players: names.length });
    requestAnimationFrame(() => boardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const edit = async () => {
    if (board && boardHasResults(board) && !(await confirm({ title: "Change the players?", body: "Making it again clears the results so far.", confirmLabel: "Change the players" }))) return;
    setBoard(null);
  };

  const copyLink = async () => {
    if (!board) return;
    const url = `${window.location.origin}${window.location.pathname}?b=${encodeLink(toLink(board))}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied. It opens this bracket with every result so far.");
      track(EVENTS.bracketLinkCopied, { format: board.f });
    } catch { toast.error("Couldn't copy the link. Try again."); }
  };

  const print = () => {
    if (!board) return;
    // Fit the widest part of the board to a landscape page.
    const area = boardRef.current?.querySelector<HTMLElement>(".bt-print-area");
    const wide = area ? Math.max(...[...area.querySelectorAll<HTMLElement>(".bt-tree, .bt-sections")].map((el) => el.scrollWidth), area.scrollWidth) : 0;
    document.documentElement.style.setProperty("--bt-print-zoom", String(wide > 1000 ? 1000 / wide : 1));
    track(EVENTS.bracketPrinted, { format: board.f });
    window.print();
  };

  const runLive = () => {
    if (!board) return;
    const h: Handoff = {
      format: liveFormatFor(board.f),
      names: board.names,
      title: board.title,
      swissRounds: board.f === "roundrobin" ? roundRobinAsSwiss(board.names.length) : board.f === "swiss" ? board.tool.swiss.rounds : undefined,
      from: board.f,
      at: Date.now(),
    };
    try { localStorage.setItem(HANDOFF_KEY, JSON.stringify(h)); } catch { /* the create form just won't be filled in */ }
    track(EVENTS.bracketRunLive, { format: board.f, players: board.names.length });
    const dest = "/tournament/create?from=bracket";
    router.push(user ? dest : `/login?redirect=${encodeURIComponent(dest)}`);
  };

  if (!loaded) return <div className="tool-panel bt-tool" aria-busy="true" />;

  return (
    <div className="bt-tool">
      {!board ? (
        <SetupPanel page={page} setup={setup} set={set} parsed={parsed} min={min} format={format} onMake={make} />
      ) : (
        <div ref={boardRef} className="tool-panel bt-board">
          <div className="bt-print-area">
            <div className="bt-board__head">
              <div className="bt-board__titles">
                <h2 className="bt-board__title">{board.title || DEFAULT_TITLE[board.f]}</h2>
                <p className="bt-muted">{board.names.length} players · {FORMAT_WORDS[board.f]}</p>
              </div>
              <div className="bt-board__actions bt-no-print">
                <Button variant="secondary" size="small" iconBefore={IconEdit} onClick={() => void edit()}>Change players</Button>
                <Button variant="secondary" size="small" iconBefore={IconLink} onClick={() => void copyLink()}>Copy link</Button>
                <Button variant="secondary" size="small" iconBefore={IconPrinter} onClick={print}>Print</Button>
              </div>
            </div>
            <BoardBody board={board} setBoard={setBoard} />
            <p className="bt-print-only bt-print-foot">Made with the free bracket tools at gameshuffle.co</p>
          </div>
          <div className="bt-live bt-no-print">
            <div>
              <h3 className="bt-sub">Run it as a live tournament</h3>
              <p className="bt-muted">
                {board.f === "roundrobin"
                  ? "Players join from their phones and report their own results, and standings update for everyone. It runs as Swiss with everyone meeting once."
                  : board.f === "swiss"
                    ? "Players join from their phones, see their table and report their own results, with a round clock and standings that update for everyone."
                    : "Players join from their phones and report their own results, the bracket updates for everyone, and there's a TV display for the room."}{" "}
                Your {board.names.length} players come along as guests.
              </p>
            </div>
            <Button variant="primary" onClick={runLive}>Run it live</Button>
          </div>
        </div>
      )}
    </div>
  );
}

const DEFAULT_TITLE: Record<ToolFormat, string> = { single: "Your bracket", double: "Your bracket", roundrobin: "Your round robin", swiss: "Your Swiss event" };

function SetupPanel({ page, setup, set, parsed, min, format, onMake }: {
  page: ToolPage;
  setup: Setup;
  set: (p: Partial<Setup>) => void;
  parsed: ReturnType<typeof parseNames>;
  min: number;
  format: ToolFormat;
  onMake: () => void;
}) {
  const n = parsed.names.length;
  const plan = page === "swiss" && n >= min ? swissPlan(n, { rounds: setup.rounds, topCut: setup.topCut }) : null;
  const suggested = page === "swiss" && n >= min ? swissPlan(n, { rounds: "auto", topCut: "auto" }) : null;
  const makeLabel = page === "roundrobin" ? "Make the schedule" : page === "swiss" ? "Pair round 1" : "Make the bracket";
  return (
    <div className="tool-panel bt-setup">
      <div className="bt-setup__grid">
        <div className="bt-setup__names">
          <Textarea
            floatingLabel="Players or teams, one per line"
            value={setup.text}
            onChange={(e) => set({ text: e.target.value })}
            rows={10}
            fullWidth
          />
          <p className="bt-muted" aria-live="polite">
            {n ? `${n} ${n === 1 ? "player" : "players"}` : "No players yet"}
            {n > 0 && n < min ? `. ${FORMAT_WORDS[format][0].toUpperCase()}${FORMAT_WORDS[format].slice(1)} needs at least ${min}.` : ""}
            {parsed.repeats.length ? `. Typed twice: ${parsed.repeats.slice(0, 3).join(", ")} (numbered so each is a player).` : ""}
            {parsed.over ? `. Up to 64 players; ${parsed.over} left out.` : ""}
          </p>
          <div className="bt-setup__row">
            {n > 1 && <Button variant="ghost" size="small" iconBefore={IconArrowsShuffle} onClick={() => set({ text: shuffled(parsed.names).join("\n") })}>Shuffle the order</Button>}
            {!n && <Button variant="ghost" size="small" onClick={() => set({ text: SAMPLE.join("\n") })}>Try it with 8 sample names</Button>}
          </div>
        </div>
        <div className="bt-setup__options">
          <Input floatingLabel="Name (optional)" value={setup.title} maxLength={60} onChange={(e) => set({ title: e.target.value })} fullWidth />
          {page === "elim" && (
            <>
              <Tabs
                variant="pills"
                size="small"
                fullWidth
                activeTab={setup.kind}
                onChange={(id) => set({ kind: id as ElimKind })}
                tabs={[{ id: "single", label: "Single elimination", content: null }, { id: "double", label: "Double elimination", content: null }]}
                className="bt-kind"
              />
              <p className="bt-muted">
                {setup.kind === "single" ? "Lose once and you're out." : "Lose once and you drop to the losers bracket; lose twice and you're out."}{" "}
                The first name is the top seed, so seeds 1 and 2 can only meet in the final. Byes go to the top seeds.
              </p>
            </>
          )}
          {page === "roundrobin" && (
            <>
              <Switch label="Everyone plays twice" checked={setup.legs === 2} onChange={(e) => set({ legs: e.target.checked ? 2 : 1 })} />
              <Switch label="Ties count" checked={setup.ties} onChange={(e) => set({ ties: e.target.checked })} />
              <p className="bt-muted">Everyone plays everyone{setup.legs === 2 ? " twice" : ""}, a round at a time.{n % 2 && n >= min ? " With an odd number, one player sits out each round." : ""}</p>
            </>
          )}
          {page === "swiss" && (
            <>
              <Select
                floatingLabel="Rounds"
                value={String(setup.rounds)}
                onChange={(v) => set({ rounds: v === "auto" ? "auto" : Number(v) })}
                options={[{ value: "auto", label: suggested ? `Suggested: ${suggested.rounds} rounds` : "Suggested for the field" }, ...Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: `${i + 1} ${i ? "rounds" : "round"}` }))]}
              />
              <Select
                floatingLabel="Top cut"
                value={String(setup.topCut)}
                onChange={(v) => set({ topCut: v === "auto" ? "auto" : (Number(v) as TopCut) })}
                options={[
                  { value: "auto", label: suggested ? `Suggested: ${suggested.topCut ? `Top ${suggested.topCut}` : "none"}` : "Suggested for the field" },
                  { value: "0", label: "No top cut" },
                  { value: "4", label: "Top 4" },
                  { value: "8", label: "Top 8" },
                ]}
              />
              <Switch label="Ties count" checked={setup.ties} onChange={(e) => set({ ties: e.target.checked })} />
              <p className="bt-muted">
                {plan ? `${plan.rounds} rounds of Swiss${plan.topCut ? `, then a Top ${plan.topCut} bracket` : ", no top cut"}. ` : ""}
                Everyone plays every round against someone on the same record, and nobody plays the same person twice.
              </p>
            </>
          )}
        </div>
      </div>
      <div className="bt-setup__go">
        <Button variant="primary" onClick={onMake} disabled={n < min}>{makeLabel}</Button>
      </div>
    </div>
  );
}

function BoardBody({ board, setBoard }: { board: Board; setBoard: (b: Board) => void }) {
  if (board.f === "roundrobin") {
    const schedule = roundRobinSchedule(board.names.length, board.legs);
    return (
      <RoundRobinBoard
        names={board.names}
        schedule={schedule}
        results={board.results}
        ties={board.ties}
        onResult={(i, r) => { const results = [...board.results]; results[i] = r; setBoard({ ...board, results }); }}
      />
    );
  }
  if (board.f === "swiss") {
    return <SwissPairingBoard names={board.names} tool={board.tool} ties={board.ties} onChange={(tool) => setBoard({ ...board, tool })} />;
  }
  return <ElimBody board={board} setBoard={setBoard} />;
}

function ElimBody({ board, setBoard }: { board: Extract<Board, { f: "single" | "double" }>; setBoard: (b: Board) => void }) {
  const n = board.names.length;
  const view = useMemo(() => buildElim(board.f, n, board.picks), [board.f, n, board.picks]);
  const champ = eliminationChampion(view.bracket);
  const total = playableMatches(view.bracket).length;
  const done = playableMatches(view.bracket).filter((m) => m.winner).length;
  const places = champ != null ? eliminationPlaces(view.bracket) : [];
  return (
    <>
      {champ != null ? (
        <p className="bt-winner" role="status"><IconTrophy size={22} stroke={1.75} aria-hidden /> {board.names[champ]} wins</p>
      ) : (
        <p className="bt-muted bt-no-print">Tap a player to send them through. Tap them again to take it back. {done} of {total} matches decided.</p>
      )}
      <div className="bt-frame" tabIndex={0} role="region" aria-label="Bracket">
        <BracketTree
          bracket={view.bracket}
          nameOf={(id) => board.names[Number(id)] ?? ""}
          seedOf={(id) => (/^\d+$/.test(id) ? Number(id) + 1 : null)}
          onPick={(matchId, w) => setBoard({ ...board, picks: pickWinner(board.f, n, board.picks, matchId, w == null ? null : Number(w)).picks })}
        />
      </div>
      {places.length > 0 && (
        <section className="bt-places" aria-labelledby="bt-places-title">
          <h3 id="bt-places-title" className="bt-sub">Final places</h3>
          <ol className="bt-places__list">
            {places.map((p) => (
              <li key={p.player}><span className="bt-places__place">{ordinal(p.place)}</span> {board.names[p.player]}</li>
            ))}
          </ol>
        </section>
      )}
    </>
  );
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}
