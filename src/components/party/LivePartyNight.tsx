"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import { Accordion, Alert, Badge, Button, Input, Select } from "@empac/cascadeds";
import { IconCheck, IconCopy, IconPlayCard } from "@tabler/icons-react";
import { useToast } from "@/components/toast/ToastProvider";
import { partyGame } from "@/data/party";
import { cardById, cardParts, momentsFor, type CardDraw } from "@/data/party/cards";

/**
 * A live party night on one person's phone (or the host's screen). Polls the
 * server every few seconds; the server only ever sends what this seat may see.
 */

interface Seat { index: number; name: string; isCpu: boolean; character: string | null; taken: boolean; hasAccount: boolean; points: number; handSize: number }
interface Card { id: string; cardId: string; kind: "rule" | "chance" | "mission"; seat: number | null; rival: number | null; turns: number | null; status: "held" | "played" | "pending" | "done" | "discarded"; involvesMe: boolean; mine: boolean }
interface View {
  signedIn: boolean;
  night: { code: string; gameSlug: string; config: Record<string, unknown>; visibility: "open" | "secret"; status: "open" | "ended" };
  me: { isHost: boolean; seat: number | null };
  seats: Seat[];
  cards: Card[];
}

const POLL_MS = 4000;
const ERR: Record<string, string> = {
  taken: "Someone just took that seat. Pick another.",
  already_seated: "You're already in a seat in this night.",
  deck_empty: "Every card of that kind is already in play.",
  cant_confirm_own: "Someone else has to confirm your mission.",
  stale: "That changed a moment ago. Try again.",
  ended: "This night has ended.",
};

function keyName(code: string) { return `gs-party-seat:${code}`; }
function readKey(code: string): string | null { try { return localStorage.getItem(keyName(code)); } catch { return null; } }
function writeKey(code: string, key: string) { try { localStorage.setItem(keyName(code), key); } catch { /* the seat still works this visit */ } }

export function LivePartyNight({ code }: { code: string }) {
  const toast = useToast();
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [names, setNames] = useState<Record<number, string>>({});
  const [qr, setQr] = useState<string | null>(null);
  const keyRef = useRef<string | null>(null);

  // Host controls
  const [chanceN, setChanceN] = useState("2");
  const [mix, setMix] = useState("both");
  const [missionN, setMissionN] = useState("2");
  const [drawFor, setDrawFor] = useState("any");

  const load = useCallback(async () => {
    const headers: Record<string, string> = {};
    if (keyRef.current) headers["x-party-seat"] = keyRef.current;
    const r = await fetch(`/api/party/${encodeURIComponent(code)}`, { headers, cache: "no-store" }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    if (!r?.ok) { setError(j.error ?? "offline"); return; }
    setError(null);
    setView(j as View);
  }, [code]);

  useEffect(() => {
    keyRef.current = readKey(code);
    void Promise.resolve().then(load);
    const t = setInterval(() => { if (document.visibilityState === "visible") void load(); }, POLL_MS);
    return () => clearInterval(t);
  }, [code, load]);

  useEffect(() => {
    const url = `${window.location.origin}/party/${code}`;
    QRCode.toString(url, { type: "svg", margin: 1, width: 180 }).then(setQr).catch(() => setQr(null));
  }, [code]);

  const post = async (path: string, body: Record<string, unknown>) => {
    setBusy(true);
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (keyRef.current) headers["x-party-seat"] = keyRef.current;
    const r = await fetch(`/api/party/${encodeURIComponent(code)}${path}`, { method: "POST", headers, body: JSON.stringify(body) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    if (!r?.ok) { toast.error(ERR[j.error as string] ?? "That didn't work. Please try again."); return null; }
    await load();
    return j;
  };
  const act = (body: Record<string, unknown>) => post("/action", body);

  const join = async (seat: number) => {
    const j = await post("/join", { seat, name: names[seat] ?? "" });
    if (j?.guestKey) { keyRef.current = j.guestKey; writeKey(code, j.guestKey); await load(); }
    if (j) toast.success("You're in");
  };

  const game = view ? partyGame(view.night.gameSlug) : null;
  const seatName = useCallback((i: number) => view?.seats.find((s) => s.index === i)?.name ?? `Seat ${i + 1}`, [view]);
  const people = useMemo(() => (view?.seats ?? []).filter((s) => !s.isCpu), [view]);
  const draw = (c: Card): CardDraw => ({ id: c.cardId, seat: c.seat, rival: c.rival, n: c.turns });
  const text = (c: Card) => {
    const card = cardById(c.cardId);
    if (!card) return null;
    return cardParts(card, draw(c)).map((p, k) => (typeof p === "string" ? <span key={k}>{p}</span> : <strong key={k}>{seatName(p.seat)}</strong>));
  };

  if (error === "unavailable") return <Alert variant="info" title="Live nights are almost here">Live nights need a database update before they can start. The randomizer works in the meantime.</Alert>;
  if (error === "not_found") return <Alert variant="error" title="No night with that code">Check the code with the host, or ask them for the link.</Alert>;
  if (!view || !game) return <p className="party-muted">{error ? "Can't reach the night. Retrying…" : "Joining the night…"}</p>;

  const { night, me } = view;
  const ended = night.status === "ended";
  const setup = night.config.setup as { boardId?: string; rulesetId?: string; turns?: number } | null;
  const board = game.boards.find((b) => b.id === setup?.boardId);
  const ruleset = game.rulesets.find((r) => r.id === setup?.rulesetId);
  const plan = (night.config.plan as { modeId: string; option: string | null; minutes: number; turns: number | null }[] | undefined) ?? [];
  const moments = momentsFor(setup?.rulesetId ?? null).filter((m) => ((night.config.moments as string[] | undefined) ?? []).includes(m.id));

  const rules = view.cards.filter((c) => c.kind === "rule");
  const myCards = view.cards.filter((c) => c.kind === "chance" && (c.mine || c.involvesMe) && c.status === "held");
  const myMissions = view.cards.filter((c) => c.kind === "mission" && c.mine);
  const toConfirm = view.cards.filter((c) => c.kind === "mission" && c.status === "pending" && !c.mine);
  const played = view.cards.filter((c) => c.kind === "chance" && c.status === "played").reverse();
  const openSeats = view.seats.filter((s) => !s.isCpu && !s.taken);
  const canConfirm = me.isHost || me.seat !== null;
  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/party/${night.code}` : `/party/${night.code}`;

  const cardBlock = (c: Card, actions?: React.ReactNode) => {
    const card = cardById(c.cardId);
    if (!card) return null;
    return (
      <div key={c.id} className={`party-card${card.effect ? ` party-card--${card.effect}` : ""}`}>
        <span className="party-card__head">
          {card.effect && <Badge variant={card.effect === "help" ? "success" : "warning"} size="small">{card.effect === "help" ? "Help" : "Crutch"}</Badge>}
          {card.kind === "mission" && <Badge variant="info" size="small">{card.worth} pt{card.worth === 1 ? "" : "s"}</Badge>}
          <span className="party-card__who">{c.involvesMe ? "Involves you" : c.seat === null ? "Everyone" : seatName(c.seat)}</span>
        </span>
        <strong className="party-card__title">{card.title}</strong>
        <span>{text(c)}</span>
        {actions && <span className="party-row">{actions}</span>}
      </div>
    );
  };

  return (
    <div className="tool-panel party party-live">
      <div className="party-live__head">
        <div>
          <p className="party-options__label">{game.label}{ended ? " · ended" : ""}</p>
          <p className="party-live__title">{board ? board.name : "Party night"}</p>
          {ruleset && setup?.turns && <p className="party-muted">{ruleset.label}, {setup.turns} turns</p>}
        </div>
        <div className="party-live__join">
          {qr && <span className="party-live__qr" aria-hidden="true" dangerouslySetInnerHTML={{ __html: qr }} />}
          <span className="party-live__code">Code <strong>{night.code}</strong></span>
          <Button variant="ghost" size="small" iconBefore={IconCopy} onClick={() => navigator.clipboard.writeText(shareUrl).then(() => toast.success("Link copied"), () => toast.error("Couldn't copy the link"))}>Copy link</Button>
        </div>
      </div>

      {ended && <Alert variant="info" title="This night has ended">Scores are final. {view.signedIn ? "Points from confirmed missions are on your account." : ""}</Alert>}

      {!ended && me.seat === null && !me.isHost && (
        <section className="party-section">
          <h3 className="party-h3">Take your seat</h3>
          {!view.signedIn && (
            <p className="party-muted">
              You&apos;re joining as a guest. <Link href={`/login?redirect=${encodeURIComponent(`/party/${night.code}`)}`}>Sign in</Link> first to keep your points.
            </p>
          )}
          {openSeats.length ? openSeats.map((s) => (
            <div key={s.index} className="party-row">
              <Input floatingLabel={`Seat ${s.index + 1} name`} value={names[s.index] ?? ""} placeholder={s.name} maxLength={24}
                onChange={(e) => setNames((n) => ({ ...n, [s.index]: e.target.value }))} />
              <Button variant="primary" onClick={() => join(s.index)} disabled={busy}>This is me</Button>
            </div>
          )) : <p className="party-muted">Every seat is taken. You can still watch the table below.</p>}
        </section>
      )}

      {me.seat !== null && (
        <section className="party-section">
          <h3 className="party-h3">Your hand, {seatName(me.seat)}</h3>
          {myCards.map((c) => cardBlock(c, c.mine && !ended ? (
            <>
              <Button variant="primary" size="small" iconBefore={IconPlayCard} onClick={() => act({ action: "play", cardRow: c.id })} disabled={busy}>Play it</Button>
              <Button variant="ghost" size="small" onClick={() => act({ action: "discard", cardRow: c.id })} disabled={busy}>Done with it</Button>
            </>
          ) : undefined))}
          {myMissions.map((c) => cardBlock(c, c.status === "held" && !ended
            ? <Button variant="secondary" size="small" iconBefore={IconCheck} onClick={() => act({ action: "claim", cardRow: c.id })} disabled={busy}>I did it</Button>
            : <span className="party-muted">{c.status === "pending" ? "Waiting for someone to confirm" : c.status === "done" ? "Confirmed" : ""}</span>))}
          {!myCards.length && !myMissions.length && <p className="party-muted">No cards yet. The host deals them.</p>}
          {!view.signedIn && <p className="party-muted">Guest points aren&apos;t saved. <Link href={`/signup?redirect=${encodeURIComponent(`/party/${night.code}`)}`}>Create a free account</Link> to keep them next time.</p>}
        </section>
      )}

      {toConfirm.length > 0 && canConfirm && (
        <section className="party-section">
          <h3 className="party-h3">Did they do it?</h3>
          {toConfirm.map((c) => cardBlock(c, !ended ? (
            <>
              <Button variant="primary" size="small" onClick={() => act({ action: "confirm", cardRow: c.id })} disabled={busy}>Confirm</Button>
              <Button variant="ghost" size="small" onClick={() => act({ action: "reject", cardRow: c.id })} disabled={busy}>Not yet</Button>
            </>
          ) : undefined))}
        </section>
      )}

      <section className="party-section">
        <h3 className="party-h3">The table</h3>
        <ul className="party-live__scores">
          {view.seats.map((s) => (
            <li key={s.index}>
              <span>{s.name}{s.isCpu ? " (CPU)" : ""}{s.character ? <span className="party-muted"> · {s.character}</span> : null}</span>
              <span className="party-muted">{s.isCpu ? "" : !s.taken ? "Open seat" : `${s.points} pts${s.handSize ? ` · ${s.handSize} in hand` : ""}`}</span>
            </li>
          ))}
        </ul>
        {rules.length > 0 && <>{rules.map((c) => cardBlock(c))}</>}
        {played.length > 0 && (
          <>
            <p className="party-options__label">Played</p>
            {played.map((c) => cardBlock(c))}
          </>
        )}
        {moments.length > 0 && (
          <ul className="party-list">{moments.map((m) => <li key={m.id}><strong>{m.title}:</strong> {m.text}</li>)}</ul>
        )}
        {plan.length > 0 && (
          <p className="party-muted">Tonight: {plan.map((sgm) => game.modes.find((m) => m.id === sgm.modeId)?.label ?? sgm.modeId).join(" → ")}</p>
        )}
      </section>

      {me.isHost && !ended && (
        <section className="party-section party-live__host">
          <h3 className="party-h3">Host controls</h3>
          <div className="party-row">
            <Select floatingLabel="Chance cards" value={chanceN} onChange={(v) => setChanceN(String(v))} options={["0", "1", "2", "3", "4"].map((n) => ({ value: n, label: n === "0" ? "None" : `${n} to deal` }))} />
            <Select floatingLabel="Mix" value={mix} onChange={(v) => setMix(String(v))} options={[{ value: "both", label: "Helps and crutches" }, { value: "help", label: "Helps only" }, { value: "crutch", label: "Crutches only" }]} />
            <Select floatingLabel="Missions" value={missionN} onChange={(v) => setMissionN(String(v))} options={["0", "1", "2", "3"].map((n) => ({ value: n, label: n === "0" ? "None" : `${n} each` }))} />
            <Button variant="primary" onClick={() => act({ action: "deal", chance: Number(chanceN), mix, missions: Number(missionN) })} disabled={busy}>Deal hands</Button>
          </div>
          <div className="party-row">
            <Select floatingLabel="Draw for" value={drawFor} onChange={(v) => setDrawFor(String(v))}
              options={[{ value: "any", label: "Anyone (random)" }, ...people.map((s) => ({ value: String(s.index), label: s.name }))]} />
            <Button variant="secondary" onClick={() => act({ action: "draw", effect: "help", seat: drawFor === "any" ? null : Number(drawFor) })} disabled={busy}>Draw a help</Button>
            <Button variant="secondary" onClick={() => act({ action: "draw", effect: "crutch", seat: drawFor === "any" ? null : Number(drawFor) })} disabled={busy}>Draw a crutch</Button>
            <Button variant="secondary" onClick={() => act({ action: "rules", count: 1, spicy: false })} disabled={busy}>New house rule</Button>
          </div>
          {night.visibility === "secret" && (
            <Accordion variant="flush" items={[{
              id: "all-hands",
              title: "Everyone's hands (host only)",
              content: (
                <div className="party-hands">
                  {people.map((s) => (
                    <div key={s.index} className="party-hand">
                      <p className="party-missions__who"><strong>{s.name}</strong> <span className="party-muted">{s.points} pts</span></p>
                      {view.cards.filter((c) => c.seat === s.index && c.kind !== "rule").map((c) => cardBlock(c))}
                    </div>
                  ))}
                </div>
              ),
            }]} />
          )}
          <div className="party-actions">
            <Button variant="danger" size="small" onClick={() => { if (window.confirm("End the night? Scores become final.")) void act({ action: "end" }); }} disabled={busy}>End the night</Button>
          </div>
        </section>
      )}
    </div>
  );
}
