"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import { Accordion, Alert, Badge, Button, Chip, Input, Progress, Select, Switch } from "@empac/cascadeds";
import { IconCheck, IconCopy, IconDice5, IconPlayCard } from "@tabler/icons-react";
import { NIGHT_GAMES, nightGame, placePoints, unitLabel } from "@/lib/nights/games";
import { ULTIMATE } from "@/data/smash/ultimate";
import { useToast } from "@/components/toast/ToastProvider";
import { partyGame } from "@/data/party";
import { cardParts, momentsFor, timerLabel, type CardDraw, type CardMoment, type PartyCard } from "@/data/party/cards";

/**
 * A live party night on one person's phone (or the host's screen). Polls the
 * server every few seconds; the server only ever sends what this seat may see.
 */

interface Seat { index: number; name: string; isCpu: boolean; character: string | null; taken: boolean; hasAccount: boolean; points: number; placementPoints: number; missionPoints: number; extraPoints: number; handSize: number }
interface Bounty { id: string; text: string; points: number; community: boolean; status: "open" | "pending" | "claimed" | "cancelled"; postedBySeat: number | null; claimedSeat: number | null; claimedHere: boolean; expiresAt: string | null }
interface NightGameView { index: number; slug: string; status: "up" | "playing" | "done"; results: { seat: number; place: number; points: number }[] }
interface Card { id: string; cardId: string; kind: "rule" | "chance" | "mission"; seat: number | null; rival: number | null; turns: number | null; at: number | null; status: "held" | "played" | "pending" | "done" | "discarded"; involvesMe: boolean; mine: boolean; bonus?: number }
interface View {
  signedIn: boolean;
  night: {
    code: string; gameSlug: string; config: Record<string, unknown>; visibility: "open" | "secret"; status: "open" | "ended";
    currentTurn: number | null; totalTurns: number; unit: "turn" | "game" | "race"; hasCards: boolean; currentGame: number; mvpSeat: number | null;
    eventId: string | null;
  };
  games: NightGameView[];
  me: { isHost: boolean; seat: number | null };
  seats: Seat[];
  cards: Card[];
  /** Definitions for the cards in `cards` (includes the host's custom cards). */
  defs: Record<string, PartyCard>;
  moments: CardMoment[];
  recap: string | null;
  weekly: { card: PartyCard; points: number; weekStart: string } | null;
  bounties: Bounty[];
  awards: { list: { id: string; label: string }[]; closed: boolean; mine: Record<string, number>; votesCast: number; winners: Record<string, { seats: number[]; votes: number }> };
}

const POLL_MS = 4000;
const ERR: Record<string, string> = {
  taken: "Someone just took that seat. Pick another.",
  already_seated: "You're already in a seat in this night.",
  deck_empty: "Every card of that kind is already in play.",
  cant_confirm_own: "Someone else has to confirm your mission.",
  stale: "That changed a moment ago. Try again.",
  ended: "This night has ended.",
  no_cards: "This game has no cards. Enter the finishing order instead.",
  no_games_left: "Every game tonight is done. Add one or end the night.",
  too_many_games: "That's the most games one night can hold.",
  no_community: "Posting needs a community. Set one up from your Stream Setup first.",
  awards_closed: "Voting has closed.",
  bad_vote: "Pick someone else at the table.",
  no_bounty: "That bounty is gone.",
  rate_limited: "You've posted a lot just now. Try again in a minute.",
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
  const [carryover, setCarryover] = useState(true);
  const [bountyText, setBountyText] = useState("");
  const [bountyPts, setBountyPts] = useState("2");
  const [bountyCommunity, setBountyCommunity] = useState(false);
  // Finishing order being tapped in, and the lineup controls
  const [order, setOrder] = useState<number[]>([]);
  const [winnerPlayed, setWinnerPlayed] = useState("");
  const [nextPick, setNextPick] = useState("");
  const [addPick, setAddPick] = useState("");

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
  const act = async (body: Record<string, unknown>) => {
    const j = await post("/action", body);
    for (const n of (j?.notes as string[] | undefined) ?? []) toast.info(n);
    return j;
  };

  const join = async (seat: number) => {
    const j = await post("/join", { seat, name: names[seat] ?? "" });
    if (j?.guestKey) { keyRef.current = j.guestKey; writeKey(code, j.guestKey); await load(); }
    if (j) toast.success("You're in");
  };

  const ng = view ? nightGame(view.night.gameSlug) : null;
  const game = view ? partyGame(view.night.gameSlug) : null;
  const seatName = useCallback((i: number) => view?.seats.find((s) => s.index === i)?.name ?? `Seat ${i + 1}`, [view]);
  const people = useMemo(() => (view?.seats ?? []).filter((s) => !s.isCpu), [view]);
  const draw = (c: Card): CardDraw => ({ id: c.cardId, seat: c.seat, rival: c.rival, n: c.turns, at: c.at });
  const text = (c: Card) => {
    const card = view?.defs[c.cardId];
    if (!card) return null;
    return cardParts(card, draw(c)).map((p, k) => (typeof p === "string" ? <span key={k}>{p}</span> : <strong key={k}>{seatName(p.seat)}</strong>));
  };

  if (error === "unavailable") return <Alert variant="info" title="Live nights are almost here">Live nights need a database update before they can start. The randomizer works in the meantime.</Alert>;
  if (error === "not_found") return <Alert variant="error" title="No night with that code">Check the code with the host, or ask them for the link.</Alert>;
  if (!view || !ng) return <p className="party-muted">{error ? "Can't reach the night. Retrying…" : "Joining the night…"}</p>;

  const { night, me } = view;
  const ended = night.status === "ended";
  const setup = night.config.setup as { boardId?: string; rulesetId?: string; turns?: number } | null;
  const board = game?.boards.find((b) => b.id === setup?.boardId);
  const ruleset = game?.rulesets.find((r) => r.id === setup?.rulesetId);
  const unit = unitLabel(night.unit); const units = unitLabel(night.unit, true);
  const Unit = unit[0].toUpperCase() + unit.slice(1);
  const current = view.games.find((g) => g.index === night.currentGame);
  const upNext = view.games.filter((g) => g.status !== "done" && g.index !== night.currentGame);
  const multi = view.games.length > 1;
  const labelOf = (slug: string) => nightGame(slug)?.short ?? slug;
  // Whoever is last on the night so far (people only), for "last place picks".
  const lastPlace = [...people].sort((a, b) => a.points - b.points)[0];
  const mvp = night.mvpSeat !== null ? view.seats.find((s) => s.index === night.mvpSeat) : null;
  /** "(10 placing, 3 missions)" when a score has more than one part. */
  const breakdown = (s: Seat) => {
    const parts = [s.placementPoints && `${s.placementPoints} placing`, s.missionPoints && `${s.missionPoints} missions`, s.extraPoints && `${s.extraPoints} bounties and awards`].filter(Boolean);
    return parts.length > 1 ? ` (${parts.join(", ")})` : "";
  };
  // Fighters or characters for "the winner played" (counts toward the roster race).
  const roster = night.gameSlug === ULTIMATE.slug ? ULTIMATE.fighters.map((f) => f.name) : game ? game.characters.map((c) => c.name) : [];
  const winnerSeat = order.length ? view.seats.find((s) => s.index === order[0]) : null;
  const plan = (night.config.plan as { modeId: string; option: string | null; minutes: number; turns: number | null }[] | undefined) ?? [];
  const moments = momentsFor(setup?.rulesetId ?? null, view.moments).filter((m) => ((night.config.moments as string[] | undefined) ?? []).includes(m.id));

  const rules = view.cards.filter((c) => c.kind === "rule");
  const myCards = view.cards.filter((c) => c.kind === "chance" && (c.mine || c.involvesMe) && c.status === "held");
  const myMissions = view.cards.filter((c) => c.kind === "mission" && c.mine);
  const toConfirm = view.cards.filter((c) => c.kind === "mission" && c.status === "pending" && !c.mine);
  const played = view.cards.filter((c) => c.kind === "chance" && c.status === "played").reverse();
  const openSeats = view.seats.filter((s) => !s.isCpu && !s.taken);
  const canConfirm = me.isHost || me.seat !== null;
  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/party/${night.code}` : `/party/${night.code}`;

  const cardBlock = (c: Card, actions?: React.ReactNode) => {
    const card = view.defs[c.cardId];
    if (!card) return null;
    return (
      <div key={c.id} className={`party-card${card.effect ? ` party-card--${card.effect}` : ""}`}>
        <span className="party-card__head">
          {card.effect && <Badge variant={card.effect === "help" ? "success" : "warning"} size="small">{card.effect === "help" ? "Help" : "Crutch"}</Badge>}
          {card.kind === "mission" && <Badge variant="info" size="small">{(card.worth ?? 1) + (c.bonus ?? 0)} pt{(card.worth ?? 1) + (c.bonus ?? 0) === 1 ? "" : "s"}</Badge>}
          {(c.bonus ?? 0) > 0 && <Badge variant="warning" size="small">Rival +{c.bonus}</Badge>}
          <span className="party-card__who">{c.involvesMe ? "Involves you" : c.seat === null ? "Everyone" : seatName(c.seat)}</span>
          {timerLabel(card, draw(c), night.currentTurn) && <span className="party-card__timer">{timerLabel(card, draw(c), night.currentTurn)}</span>}
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
          {night.eventId && <p className="party-muted" style={{ margin: 0 }}><Link href={`/game-nights/${night.eventId}`}>Back to the game night</Link></p>}
          <p className="party-options__label">{ng.label}{multi ? ` · game ${night.currentGame + 1} of ${view.games.length}` : ""}{ended ? " · ended" : ""}</p>
          <p className="party-live__title">{board ? board.name : game ? "Party night" : `${ng.short} night`}</p>
          {ruleset && setup?.turns && <p className="party-muted">{ruleset.label}, {setup.turns} turns</p>}
        </div>
        <div className="party-live__join">
          {qr && <span className="party-live__qr" aria-hidden="true" dangerouslySetInnerHTML={{ __html: qr }} />}
          <span className="party-live__code">Code <strong>{night.code}</strong></span>
          <Button variant="ghost" size="small" iconBefore={IconCopy} onClick={() => navigator.clipboard.writeText(shareUrl).then(() => toast.success("Link copied"), () => toast.error("Couldn't copy the link"))}>Copy link</Button>
        </div>
      </div>

      <div className="party-turns">
        {night.currentTurn === null ? (
          <span className="party-row">
            <span className="party-muted">The {unit} counter isn&apos;t running.</span>
            {me.isHost && !ended && <Button variant="secondary" size="small" onClick={() => act({ action: "turn", to: 1 })} disabled={busy}>Start at {unit} 1</Button>}
          </span>
        ) : (
          <>
            <span className="party-turns__now">
              <strong>{Unit} {night.currentTurn} of {night.totalTurns}</strong>
              {night.totalTurns - night.currentTurn < 5 && <Badge variant="warning" size="small">Last five {units}</Badge>}
            </span>
            <Progress value={night.currentTurn} max={night.totalTurns} size="small" />
            {me.isHost && !ended && (
              <span className="party-row">
                <Button variant="primary" size="small" onClick={() => act({ action: "turn", to: night.currentTurn! + 1 })} disabled={busy || night.currentTurn >= night.totalTurns}>Next {unit}</Button>
                <Button variant="ghost" size="small" onClick={() => act({ action: "turn", to: night.currentTurn! - 1 })} disabled={busy || night.currentTurn <= 1}>Back one</Button>
              </span>
            )}
          </>
        )}
      </div>

      {ended && (
        <Alert variant="info" title={mvp ? `${mvp.name} is the night's MVP` : "This night has ended"}>
          Scores are final. {view.signedIn ? "Night points (placements and confirmed missions) are on your account." : ""}
        </Alert>
      )}

      {ended && view.recap && (
        <section className="party-section night-recap">
          <h3 className="party-h3">Night recap</h3>
          <div className="night-recap__text">{view.recap.split("\n").map((line, i) => <p key={i}>{line}</p>)}</div>
          <span className="party-row">
            <Button variant="secondary" size="small" iconBefore={IconCopy} onClick={() => navigator.clipboard.writeText(`${view.recap}\n${shareUrl}`).then(() => toast.success("Recap copied, ready for Discord"), () => toast.error("Couldn't copy the recap"))}>Copy recap</Button>
            {me.isHost && <Button variant="primary" size="small" disabled={busy} onClick={() => act({ action: "post_recap" })}>Post to my community</Button>}
          </span>
        </section>
      )}

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

      {me.seat !== null && (!ended || myCards.length > 0 || myMissions.length > 0) && (
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

      {!ended && view.weekly && (
        <div className="night-weekly">
          <Badge variant="warning" size="small">This week&apos;s challenge · +{view.weekly.points}</Badge>
          <strong>{view.weekly.card.title}</strong>
          <span>{view.weekly.card.text.replace("{player}", "you")}</span>
          <span className="party-muted">It&apos;s in everyone&apos;s hand this week, once per person.</span>
          {me.isHost && <Button variant="ghost" size="small" disabled={busy} onClick={() => act({ action: "weekly_reroll" })}>Pick a different one</Button>}
        </div>
      )}

      {!ended && (view.bounties.length > 0 || me.isHost || me.seat !== null) && (
        <section className="party-section">
          <h3 className="party-h3">Bounties</h3>
          {view.bounties.filter((b) => b.status !== "claimed" || b.claimedHere).map((b) => {
            const mineClaim = b.claimedSeat !== null && b.claimedSeat === me.seat;
            return (
              <div key={b.id} className="party-card">
                <span className="party-card__head">
                  <Badge variant="info" size="small">+{b.points}</Badge>
                  {b.community && <Badge variant="warning" size="small">Community</Badge>}
                  {b.status === "claimed" && <Badge variant="success" size="small">Claimed by {seatName(b.claimedSeat!)}</Badge>}
                </span>
                <span>{b.text}</span>
                <span className="party-row">
                  {b.status === "open" && me.seat !== null && <Button variant="secondary" size="small" iconBefore={IconCheck} disabled={busy} onClick={() => act({ action: "bounty_claim", id: b.id })}>I did it</Button>}
                  {b.status === "open" && (me.isHost || (b.postedBySeat !== null && b.postedBySeat === me.seat)) && <Button variant="ghost" size="small" disabled={busy} onClick={() => act({ action: "bounty_cancel", id: b.id })}>Cancel</Button>}
                  {b.status === "pending" && b.claimedHere && (mineClaim
                    ? <span className="party-muted">Waiting for someone to confirm</span>
                    : (me.isHost || me.seat !== null) && (
                      <>
                        <span className="party-muted">{seatName(b.claimedSeat!)} says they did it.</span>
                        <Button variant="primary" size="small" disabled={busy} onClick={() => act({ action: "bounty_confirm", id: b.id })}>Confirm</Button>
                        <Button variant="ghost" size="small" disabled={busy} onClick={() => act({ action: "bounty_reject", id: b.id })}>Not yet</Button>
                      </>
                    ))}
                </span>
              </div>
            );
          })}
          {(me.isHost || me.seat !== null) && (
            <div className="party-row">
              <Input floatingLabel="Post a bounty" placeholder="First to win on the last turn" value={bountyText} maxLength={140} onChange={(e) => setBountyText(e.target.value)} />
              <Select floatingLabel="Worth" value={bountyPts} onChange={(v) => setBountyPts(String(v))} options={["1", "2", "3", "4", "5"].map((n) => ({ value: n, label: `${n} point${n === "1" ? "" : "s"}` }))} />
              {me.isHost && <Switch label="Community bounty (open for a week, across nights)" checked={bountyCommunity} onChange={(e) => setBountyCommunity(e.target.checked)} />}
              <Button variant="secondary" size="small" disabled={busy || !bountyText.trim()} onClick={async () => {
                if (await act({ action: "bounty_post", text: bountyText, points: Number(bountyPts), community: bountyCommunity })) { setBountyText(""); setBountyCommunity(false); }
              }}>Post</Button>
            </div>
          )}
        </section>
      )}

      {ended && (me.seat !== null || me.isHost) && people.length > 1 && (
        <section className="party-section">
          <h3 className="party-h3">Awards</h3>
          {view.awards.closed ? (
            <ul className="party-live__scores">
              {view.awards.list.map((a) => (
                <li key={a.id}><span>{a.label}</span><span className="party-muted">{view.awards.winners[a.id] ? `${view.awards.winners[a.id].seats.map(seatName).join(" and ")} (+2)` : "No votes"}</span></li>
              ))}
            </ul>
          ) : (
            <>
              <p className="party-muted">Vote on your phone. Winners get 2 points each; ties all win. {view.awards.votesCast} {view.awards.votesCast === 1 ? "person has" : "people have"} voted.</p>
              {me.seat !== null && view.awards.list.map((a) => (
                <Select key={a.id} floatingLabel={a.label} placeholder="Pick someone" value={view.awards.mine[a.id] !== undefined ? String(view.awards.mine[a.id]) : ""}
                  onChange={(v) => void act({ action: "award_vote", award: a.id, nominee: Number(v) })}
                  options={people.filter((p) => p.index !== me.seat).map((p) => ({ value: String(p.index), label: p.name }))} />
              ))}
              {me.isHost && <Button variant="primary" size="small" disabled={busy} onClick={() => act({ action: "award_close" })}>Close voting and award points</Button>}
            </>
          )}
        </section>
      )}

      {(multi || me.isHost) && (
        <section className="party-section">
          <h3 className="party-h3">Tonight</h3>
          <ol className="night-games">
            {view.games.map((g) => (
              <li key={g.index} className={`night-games__game night-games__game--${g.status}`}>
                <span className="night-games__name">{labelOf(g.slug)}</span>
                <Badge variant={g.status === "done" ? "success" : g.status === "playing" ? "info" : "default"} size="small">{g.status === "done" ? "Done" : g.status === "playing" ? "Playing" : "Up next"}</Badge>
                {g.results.length > 0 && <span className="party-muted">{g.results.slice(0, 3).map((r) => `${r.place}. ${seatName(r.seat)}`).join(" · ")}</span>}
              </li>
            ))}
          </ol>

          {me.isHost && !ended && current && current.status !== "done" && (
            <div className="night-results">
              <p className="party-options__label">Who finished where in {labelOf(current.slug)}? Tap in order, first place first.</p>
              <div className="party-chips">
                {view.seats.map((s) => {
                  const at = order.indexOf(s.index);
                  return <Chip key={s.index} clickable selected={at >= 0} variant={at >= 0 ? "primary" : "default"}
                    label={at >= 0 ? `${at + 1}. ${s.name}` : s.name}
                    onClick={() => { setWinnerPlayed(""); setOrder((o) => (o.includes(s.index) ? o.filter((x) => x !== s.index) : [...o, s.index])); }} />;
                })}
              </div>
              {order.length > 0 && <p className="party-muted">{order.slice(0, 4).map((seat, i) => `${seatName(seat)} +${placePoints(i + 1)}`).join(", ")}</p>}
              {winnerSeat && roster.length > 0 && !winnerSeat.isCpu && (
                <Select floatingLabel={`${winnerSeat.name} won with`} value={winnerPlayed || winnerSeat.character || ""} onChange={(v) => setWinnerPlayed(String(v))}
                  placeholder={night.gameSlug === ULTIMATE.slug ? "Which fighter?" : "Which character?"} options={roster.map((n) => ({ value: n, label: n }))} />
              )}
              <span className="party-row">
                <Button variant="primary" size="small" disabled={busy || !order.length} onClick={async () => {
                  const characters = winnerSeat && winnerPlayed ? { [String(winnerSeat.index)]: winnerPlayed } : {};
                  if (await act({ action: "result", order, characters })) { setOrder([]); setWinnerPlayed(""); toast.success("Results saved"); }
                }}>Save results</Button>
                {order.length > 0 && <Button variant="ghost" size="small" onClick={() => setOrder([])}>Clear</Button>}
              </span>
            </div>
          )}

          {me.isHost && !ended && current?.status === "done" && (
            upNext.length ? (
              <div className="night-next">
                <p className="party-options__label">What&apos;s next?{lastPlace ? ` Last place picks: ${lastPlace.name}.` : ""}</p>
                <span className="party-row">
                  <Select floatingLabel="Next game" value={nextPick} onChange={(v) => setNextPick(String(v))}
                    options={upNext.map((g) => ({ value: String(g.index), label: labelOf(g.slug) }))} />
                  <Button variant="primary" size="small" disabled={busy || !nextPick} onClick={async () => { if (await act({ action: "next", index: Number(nextPick) })) setNextPick(""); }}>Play it</Button>
                  <Button variant="secondary" size="small" iconBefore={IconDice5} disabled={busy} onClick={() => act({ action: "next", index: null })}>Spin for it</Button>
                </span>
              </div>
            ) : <p className="party-muted">That was the last game on the list. Add another, or end the night to crown the MVP.</p>
          )}

          {me.isHost && !ended && (
            <span className="party-row">
              <Select floatingLabel="Add a game" value={addPick} onChange={(v) => setAddPick(String(v))} options={NIGHT_GAMES.map((g) => ({ value: g.slug, label: g.short }))} />
              <Button variant="secondary" size="small" disabled={busy || !addPick} onClick={async () => { if (await act({ action: "add", slug: addPick })) setAddPick(""); }}>Add</Button>
            </span>
          )}
        </section>
      )}

      <section className="party-section">
        <h3 className="party-h3">The table</h3>
        <ul className="party-live__scores">
          {view.seats.map((s) => (
            <li key={s.index}>
              <span>{s.name}{s.isCpu ? " (CPU)" : ""}{s.character ? <span className="party-muted"> · {s.character}</span> : null}</span>
              <span className="party-muted">
                {!s.taken && !s.isCpu ? "Open seat" : `${s.points} pts`}
                {breakdown(s)}
                {s.handSize ? ` · ${s.handSize} in hand` : ""}
              </span>
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
        {plan.length > 0 && game && (
          <p className="party-muted">Tonight: {plan.map((sgm) => game.modes.find((m) => m.id === sgm.modeId)?.label ?? sgm.modeId).join(" → ")}</p>
        )}
      </section>

      {me.isHost && !ended && night.hasCards && (
        <section className="party-section party-live__host">
          <h3 className="party-h3">Cards</h3>
          <div className="party-row">
            <Select floatingLabel="Chance cards" value={chanceN} onChange={(v) => setChanceN(String(v))} options={["0", "1", "2", "3", "4"].map((n) => ({ value: n, label: n === "0" ? "None" : `${n} to deal` }))} />
            <Select floatingLabel="Mix" value={mix} onChange={(v) => setMix(String(v))} options={[{ value: "both", label: "Helps and crutches" }, { value: "help", label: "Helps only" }, { value: "crutch", label: "Crutches only" }]} />
            <Select floatingLabel="Missions" value={missionN} onChange={(v) => setMissionN(String(v))} options={["0", "1", "2", "3"].map((n) => ({ value: n, label: n === "0" ? "None" : `${n} each` }))} />
            <Button variant="primary" onClick={() => act({ action: "deal", chance: Number(chanceN), mix, missions: Number(missionN), carryover })} disabled={busy}>Deal hands</Button>
          </div>
          {!view.cards.some((c) => c.kind === "chance") && (
            <Switch label="Carry over from last night (the MVP starts with a crutch, last place with a help)" checked={carryover} onChange={(e) => setCarryover(e.target.checked)} />
          )}
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
        </section>
      )}

      {me.isHost && !ended && (
        <div className="party-actions">
          <Button variant="danger" size="small" disabled={busy} onClick={async () => {
            if (!window.confirm("End the night? Scores become final and the MVP is crowned.")) return;
            const j = await act({ action: "end" });
            if (j?.paid?.tokens) toast.success(`Night over. The MVP earned ${j.paid.tokens} tokens.`);
          }}>End the night</Button>
        </div>
      )}
    </div>
  );
}
