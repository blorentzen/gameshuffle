import { Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@empac/cascadeds";
import { characterArt, type PartyGame } from "@/lib/party/types";

/**
 * Reference sections under a Mario Party randomizer: boards, minigames, rules
 * and the roster, rendered on the server from the same game data the
 * randomizer rolls from (so there's no second list to keep in sync).
 *
 * Lists stay expanded rather than collapsing into an Accordion: CDS Accordion
 * doesn't mount closed items, so collapsed lists would be missing from the
 * server HTML. Dense columns keep them short instead.
 */

export interface PartyReferenceHeadings {
  boards: string;
  minigames: string;
  roster: string;
  /** Only for games with more than one ruleset worth comparing. */
  rules?: string;
  /** Replaces the counted intro under the minigame heading, when the game's own count differs. */
  minigamesIntro?: string;
}

export function PartyReference({ game, headings }: { game: PartyGame; headings: PartyReferenceHeadings }) {
  const art = (path: string) => `${game.assetBase}${path}`;
  const editionLabel = game.editions?.find((e) => e.id === "switch2")?.label ?? "Switch 2 Edition";
  const groups = game.minigameCategories
    .map((c) => ({ cat: c, games: game.minigames.filter((m) => m.category === c.id) }))
    .filter((g) => g.games.length);
  const base = game.minigames.filter((m) => !m.edition && game.minigameCategories.find((c) => c.id === m.category)?.edition !== "switch2").length;
  const party = game.rulesets.find((r) => r.id === "party");
  const pro = game.rulesets.find((r) => r.id === "pro");
  const extraRules = game.rulesets.filter((r) => r.id !== "party" && r.id !== "pro");
  const bonusLabel = (ids: string[]) => ids.map((id) => game.bonusModes.find((b) => b.id === id)?.label).filter(Boolean).join(" or ");
  const turnsLabel = (t: number[]) => (t.length === 1 ? `${t[0]}, fixed` : `${t[0]} to ${t[t.length - 1]}, in steps of ${t[1] - t[0]}`);

  return (
    <>
      <section aria-labelledby="party-boards" className="party-ref">
        <h2 id="party-boards" className="rand-landing__h2">{headings.boards}</h2>
        <ul className="party-ref__boards">
          {game.boards.map((b) => (
            <li key={b.id} className="party-ref__board">
              <div className="party-ref__board-art" style={{ background: b.color }}>
                {game.artReady ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={art(b.img)} alt="" loading="lazy" />
                ) : null}
              </div>
              <div className="party-ref__board-body">
                <h3 className="party-ref__board-name">{b.name}</h3>
                <p className="party-ref__meta">Difficulty {b.difficulty} of 5{b.unlockable && b.unlockHint ? ` · Unlocks at ${b.unlockHint}` : ""}</p>
                <p className="party-ref__blurb">{b.blurb}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {headings.rules && party && pro ? (
        <section aria-labelledby="party-rules" className="party-ref">
          <h2 id="party-rules" className="rand-landing__h2">{headings.rules}</h2>
          <div className="party-ref__table">
            <Table variant="bordered">
              <TableHeader>
                <TableRow>
                  <TableHead><span className="sr-only">Setting</span></TableHead>
                  <TableHead>{party.label}</TableHead>
                  <TableHead>{pro.label}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableHead scope="row">How it plays</TableHead>
                  <TableCell>{party.blurb}</TableCell>
                  <TableCell>{pro.blurb}</TableCell>
                </TableRow>
                <TableRow>
                  <TableHead scope="row">Turns</TableHead>
                  <TableCell>{turnsLabel(party.turns)}</TableCell>
                  <TableCell>{turnsLabel(pro.turns)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableHead scope="row">Bonus Stars</TableHead>
                  <TableCell>{bonusLabel(party.bonus)}</TableCell>
                  <TableCell>{bonusLabel(pro.bonus)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
          {extraRules.length ? (
            <p className="party-ref__note">
              The {editionLabel} adds{" "}
              {extraRules.map((r, i) => (
                <span key={r.id}>{i ? " and " : ""}<strong>{r.label}</strong> ({r.blurb.replace(/\.$/, "").toLowerCase()})</span>
              ))}
              . The randomizer only rolls them when you pick that version.
            </p>
          ) : null}
        </section>
      ) : null}

      <section aria-labelledby="party-minigames" className="party-ref">
        <h2 id="party-minigames" className="rand-landing__h2">{headings.minigames}</h2>
        <p className="party-ref__note">
          {headings.minigamesIntro ?? <>{base} minigames
          {game.minigames.length > base ? `, plus ${game.minigames.length - base} more in the ${editionLabel}` : ""}, grouped by type.</>}
          {game.minigames.some((m) => m.noPro) ? " Minigames marked Party only can't come up under Pro Rules." : ""}
        </p>
        {groups.map(({ cat, games }) => (
          <div key={cat.id} className="party-ref__group">
            <h3 className="party-ref__group-title">
              {cat.label} <span className="party-ref__count">({games.length})</span>
              {cat.edition === "switch2" ? <Badge size="small" variant="info">{editionLabel}</Badge> : null}
            </h3>
            <p className="party-ref__meta">{cat.players}{cat.board ? "" : ", outside the board game"}</p>
            <ul className="party-ref__names">
              {games.map((m) => (
                <li key={m.name}>
                  {m.name}
                  {m.noPro ? <span className="party-ref__flag">Party only</span> : null}
                  {m.edition === "switch2" && cat.edition !== "switch2" ? <span className="party-ref__flag">Switch 2</span> : null}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section aria-labelledby="party-roster" className="party-ref">
        <h2 id="party-roster" className="rand-landing__h2">{headings.roster}</h2>
        <p className="party-ref__note">
          {game.characters.length} characters
          {game.characters.some((c) => c.unlockable) ? `, ${game.characters.filter((c) => c.unlockable).length} of them unlocked by playing` : ", all playable from the start"}.
        </p>
        <ul className="party-ref__roster">
          {game.characters.map((c) => (
            <li key={c.name} className="party-ref__char">
              <span className="party-ref__char-art" style={{ background: c.color ?? "var(--surface-secondary)" }}>
                {characterArt(game, c) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={characterArt(game, c)} alt="" loading="lazy" />
                ) : null}
              </span>
              <span className="party-ref__char-name">{c.name}</span>
              {c.unlockable ? <span className="party-ref__flag">Unlockable</span> : null}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

/** Names for the ItemList JSON-LD, matching the visible board and minigame lists. */
export function partyItemLists(game: PartyGame, headings: PartyReferenceHeadings) {
  return [
    { name: headings.boards, items: game.boards.map((b) => b.name) },
    { name: headings.minigames, items: game.minigames.map((m) => m.name) },
  ];
}
