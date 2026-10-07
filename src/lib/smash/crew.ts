/**
 * Crew battles: two crews, each player brings the same number of stocks, and
 * stocks carry over. A game is one player from each crew; the loser is out,
 * and the winner stays in with whatever stocks they have left. The first crew
 * to run out of players loses. Pure and client-safe; stored in
 * `tournaments.settings.crewBattles`.
 */

export type CrewSide = "a" | "b";

export interface CrewGame { winner: CrewSide; stocksLeft: number; at: string }
export interface CrewBattle {
  id: string;
  crews: { a: { name: string; players: string[] }; b: { name: string; players: string[] } };
  stocks: number;
  log: CrewGame[];
  createdAt: string;
}

export interface CrewState {
  /** Who is playing now for each crew (index into players), and their stocks. */
  current: { a: { index: number; stocks: number }; b: { index: number; stocks: number } };
  /** Stocks each crew has left in total. */
  remaining: { a: number; b: number };
  winner: CrewSide | null;
}

export function newCrewBattle(a: { name: string; players: string[] }, b: { name: string; players: string[] }, stocks: number): CrewBattle {
  return {
    id: Math.random().toString(36).slice(2, 10),
    crews: { a: { name: a.name.trim() || "Crew A", players: a.players }, b: { name: b.name.trim() || "Crew B", players: b.players } },
    stocks: Math.max(1, Math.min(5, Math.floor(stocks))),
    log: [],
    createdAt: new Date().toISOString(),
  };
}

export function crewState(cb: CrewBattle): CrewState {
  const cur = { a: { index: 0, stocks: cb.stocks }, b: { index: 0, stocks: cb.stocks } };
  let winner: CrewSide | null = null;
  for (const g of cb.log) {
    if (winner) break;
    const loser: CrewSide = g.winner === "a" ? "b" : "a";
    cur[g.winner].stocks = Math.max(1, Math.min(cur[g.winner].stocks, g.stocksLeft));
    cur[loser] = { index: cur[loser].index + 1, stocks: cb.stocks };
    if (cur[loser].index >= cb.crews[loser].players.length) winner = g.winner;
  }
  const left = (side: CrewSide) => {
    const players = cb.crews[side].players.length;
    if (cur[side].index >= players) return 0;
    return cur[side].stocks + (players - cur[side].index - 1) * cb.stocks;
  };
  return { current: cur, remaining: { a: left("a"), b: left("b") }, winner };
}

/** Record a game. `stocksLeft` is what the winner has left (1 up to what they started it with). */
export function recordCrewGame(cb: CrewBattle, winner: CrewSide, stocksLeft: number): CrewBattle {
  const st = crewState(cb);
  if (st.winner) return cb;
  const max = st.current[winner].stocks;
  const left = Math.max(1, Math.min(max, Math.floor(stocksLeft)));
  return { ...cb, log: [...cb.log, { winner, stocksLeft: left, at: new Date().toISOString() }] };
}

export function undoCrewGame(cb: CrewBattle): CrewBattle {
  return { ...cb, log: cb.log.slice(0, -1) };
}
