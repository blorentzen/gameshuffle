"use client";

import { Alert, Badge, Button, Checkbox, Chip, IconButton, Progress, Radio, RadioGroup, Select, Switch } from "@empac/cascadeds";
import { IconCheck, IconDice5, IconRefresh } from "@tabler/icons-react";
import { cardsFor, cardText, momentsFor, timerLabel } from "@/data/party/cards";
import type { CardHands } from "./useCardHands";

/**
 * The Cards & missions tab for any game with a card meta layer: the turn (or
 * game) tracker, house rules, card moments and each person's hand, open or
 * secret. State lives in useCardHands so the page can save and summarize it.
 */
export function CardHandsPanel({ h }: { h: CardHands }) {
  const { gameSlug, rulesetId, seats, people, seatName, starterOnly, unit, length: gameTurns } = h.options;
  const {
    deck, byId, ruleCount, setRuleCount, spicy, setSpicy, rules, chanceCount, setChanceCount, chanceMix, setChanceMix, chance,
    missionsPer, setMissionsPer, missions, done, setDone, turn, setTurn, reminder, setReminder, secret, setSecret, peek, setPeek,
    moments, setMoments, drawFor, setDrawFor, drawRules, drawChance, drawForEveryone, drawOne, passCard, discardCard, drawMissions,
    moveTurn, renderParts, missionPoints,
  } = h;
  const nameOf = seatName;
  const toggleIn = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const Unit = unit === "turn" ? "Turn" : "Game";

  return (

    <div className="party-section">
      <div className="party-turns">
        {turn === null ? (
          <>
            <span><strong>Turn tracker</strong> <span className="party-muted">Counts down timed cards for you.</span></span>
            <Button variant="secondary" size="small" onClick={() => { setTurn(1); setReminder(null); }}>Start at {unit} 1</Button>
          </>
        ) : (
          <>
            <span className="party-turns__now">
              <strong>{Unit} {turn} of {gameTurns}</strong>
              {gameTurns - turn < 5 && <Badge variant="warning" size="small">Last five {unit}s</Badge>}
            </span>
            <Progress value={turn} max={gameTurns} size="small" />
            <span className="party-row">
              <Button variant="primary" size="small" onClick={() => moveTurn(turn + 1)} disabled={turn >= gameTurns}>Next {unit}</Button>
              <Button variant="ghost" size="small" onClick={() => moveTurn(turn - 1)} disabled={turn <= 1}>Back one</Button>
              <Button variant="ghost" size="small" onClick={() => { setTurn(null); setReminder(null); }}>Stop tracking</Button>
            </span>
          </>
        )}
        {reminder && (
          <Alert variant="info">
            {reminder.text}{" "}
            {reminder.drawAll && <Button variant="secondary" size="small" onClick={drawForEveryone}>Deal one to everyone</Button>}
          </Alert>
        )}
      </div>

      <h3 className="party-h3">House rules</h3>
      <div className="party-row">
        <Select floatingLabel="Rules" value={String(ruleCount)} onChange={(v) => setRuleCount(Number(v))}
          options={[1, 2, 3].map((n) => ({ value: String(n), label: `${n} ${n === 1 ? "rule" : "rules"}` }))} />
        <Switch label="Include spicy rules" helperText="They shake the game up more" checked={spicy} onChange={(e) => setSpicy(e.target.checked)} />
        <Button variant="primary" onClick={drawRules} iconBefore={IconDice5}>{rules.length ? "Draw again" : "Draw rules"}</Button>
      </div>
      {rules.length > 0 && (
        <ul className="party-cards">
          {rules.map((d) => {
            const card = byId(d.id)!;
            return (
              <li key={d.id} className="party-card">
                <span className="party-card__who">{d.seat === null ? "Everyone" : seatName(d.seat)}</span>
                <strong className="party-card__title">{card.title}</strong>
                <span>{renderParts(d)}</span>
              </li>
            );
          })}
        </ul>
      )}

      <h3 className="party-h3">Card moments</h3>
      <p className="party-muted">Moments in the game that bring a Chance card into play. Pick the ones your table likes.</p>
      <div className="party-chips">
        {momentsFor(rulesetId, deck.moments).map((m) => (
          <Chip key={m.id} clickable selected={moments.includes(m.id)} variant={moments.includes(m.id) ? "primary" : "default"} label={m.title}
            onClick={() => setMoments((l) => toggleIn(l, m.id))} />
        ))}
      </div>
      {moments.length > 0 && (
        <ul className="party-list">
          {momentsFor(rulesetId, deck.moments).filter((m) => moments.includes(m.id)).map((m) => <li key={m.id}><strong>{m.title}:</strong> {m.text}</li>)}
        </ul>
      )}

      <h3 className="party-h3">Hands</h3>
      {starterOnly && (
        <Alert variant="info">
          You&apos;re playing the starter deck: {cardsFor(gameSlug, null, "chance", 4, 20, true, deck.cards).length} Chance cards and {cardsFor(gameSlug, null, "mission", 4, 20, true, deck.cards).length} missions.{" "}
          <a href={`/signup?redirect=${encodeURIComponent(`/randomizers/${gameSlug}`)}`}>Create a free account</a> for the full deck of {cardsFor(gameSlug, null, "chance", 4, 20, false, deck.cards).length} and {cardsFor(gameSlug, null, "mission", 4, 20, false, deck.cards).length}, plus a record of your points.
        </Alert>
      )}
      <p className="party-muted">
        Chance cards are helps and crutches for one person. Missions are goals worth points.
        {seats > people && " CPUs play normally, so only the people playing get cards."}
      </p>
      <div className="party-row">
        <Select floatingLabel="Chance cards" value={String(chanceCount)} onChange={(v) => setChanceCount(Number(v))}
          options={[0, 1, 2, 3, 4].map((n) => ({ value: String(n), label: n ? `${n} to deal` : "None to start" }))} />
        <Select floatingLabel="Mix" value={chanceMix} onChange={(v) => setChanceMix(v as typeof chanceMix)}
          options={[{ value: "both", label: "Helps and crutches" }, { value: "help", label: "Helps only" }, { value: "crutch", label: "Crutches only" }]} />
        <Select floatingLabel="Missions" value={String(missionsPer)} onChange={(v) => setMissionsPer(Number(v))}
          options={[0, 1, 2, 3].map((n) => ({ value: String(n), label: n ? `${n} each` : "No missions" }))} />
        <Button variant="primary" iconBefore={IconDice5} onClick={() => { drawChance(); drawMissions(); setPeek(null); }}>
          {chance.length || missions.length ? "Deal new hands" : "Deal hands"}
        </Button>
      </div>
      <RadioGroup name="hand-visibility" orientation="horizontal" value={secret ? "secret" : "open"} onChange={(v) => { setSecret(v === "secret"); setPeek(null); }}>
        <Radio value="open" label="Everyone sees every hand" />
        <Radio value="secret" label="Secret hands (tap to peek)" />
      </RadioGroup>
      {secret && <p className="party-muted">Keep your cards to yourself until they matter, then read one out to play it.</p>}

      {(chance.length > 0 || missions.length > 0) && (
        <>
          <div className="party-row party-draw">
            <Select floatingLabel="Draw for" value={drawFor} onChange={(v) => setDrawFor(String(v))}
              options={[{ value: "any", label: "Anyone (random)" }, ...Array.from({ length: people }, (_, i) => ({ value: String(i), label: seatName(i) }))]} />
            <Button variant="secondary" onClick={() => drawOne("help", drawFor === "any" ? null : Number(drawFor))}>Draw a help</Button>
            <Button variant="secondary" onClick={() => drawOne("crutch", drawFor === "any" ? null : Number(drawFor))}>Draw a crutch</Button>
          </div>
          <div className="party-hands">
            {Array.from({ length: people }, (_, seat) => {
              const mine = chance.map((d, i) => ({ d, i })).filter(({ d }) => d.seat === seat);
              // Cards that bind this person as the rival (a Truce): they need to know too.
              const involved = chance.map((d, i) => ({ d, i })).filter(({ d }) => d.seat !== seat && d.rival === seat && byId(d.id)?.rivalObeys);
              const hand = missions[seat] ?? [];
              const hidden = secret && peek !== seat;
              return (
                <div key={seat} className="party-hand">
                  <p className="party-missions__who"><strong>{seatName(seat)}</strong> <span className="party-muted">{missionPoints(seat)} pts</span></p>
                  {hidden ? (
                    <>
                      <p className="party-muted">{mine.length + involved.length} {mine.length + involved.length === 1 ? "card" : "cards"}, {hand.length} {hand.length === 1 ? "mission" : "missions"}. Everyone else look away.</p>
                      <Button variant="secondary" size="small" onClick={() => setPeek(seat)}>Show {seatName(seat)}&apos;s hand</Button>
                    </>
                  ) : (
                    <>
                      {[...mine, ...involved].map(({ d, i }) => {
                        const card = byId(d.id)!;
                        const forMe = d.seat === seat;
                        return (
                          <div key={`${d.id}-${i}`} className={`party-card party-card--${card.effect}`}>
                            <span className="party-card__head">
                              <Badge variant={card.effect === "help" ? "success" : "warning"} size="small">{card.effect === "help" ? "Help" : "Crutch"}</Badge>
                              {!forMe && <span className="party-card__who">Involves you</span>}
                              {timerLabel(card, d, turn, unit) && <span className="party-card__timer">{timerLabel(card, d, turn, unit)}</span>}
                              {forMe && (
                                <span className="party-card__tools">
                                  {people > 1 && !secret && (
                                    <IconButton variant="tertiary" size="small" aria-label={`Give ${card.title} to someone else`} title="Give it to someone else" onClick={() => passCard(i)}>
                                      <IconRefresh size={16} />
                                    </IconButton>
                                  )}
                                  <IconButton variant="tertiary" size="small" aria-label={`Done with ${card.title}`} title="Done with this card" onClick={() => discardCard(i)}>
                                    <IconCheck size={16} />
                                  </IconButton>
                                </span>
                              )}
                            </span>
                            <strong className="party-card__title">{card.title}</strong>
                            <span>{renderParts(d)}</span>
                          </div>
                        );
                      })}
                      {hand.map((d) => {
                        const c = byId(d.id)!;
                        const key = `${seat}:${d.id}`;
                        return (
                          <Checkbox key={d.id} checked={done.has(key)} label={`${c.title} (${c.worth} pt${c.worth === 1 ? "" : "s"})`} helperText={`${cardText(c, d, nameOf)}${timerLabel(c, d, turn, unit) ? ` (${timerLabel(c, d, turn, unit)})` : ""}`}
                            onChange={(e) => setDone((cur) => { const n = new Set(cur); if (e.target.checked) n.add(key); else n.delete(key); return n; })} />
                        );
                      })}
                      {!mine.length && !involved.length && !hand.length && <p className="party-muted">Nothing in this hand yet.</p>}
                      {secret && <Button variant="ghost" size="small" onClick={() => setPeek(null)}>Hide {seatName(seat)}&apos;s hand</Button>}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
