/**
 * Who Said It? rules (a GameShuffle Original, stream game). Pure.
 *
 * A quote from the channel's pool goes up with the speaker hidden, chat votes
 * on who said it (a normal poll with a right answer), then the reveal.
 */

/** Most people chat can pick from, including the right one. */
export const WHOSAID_OPTIONS = 4;

/** `Some text - Name` (or an em/en dash or ~) → the speaker. Null when there isn't a clear one. */
export function parseSpeaker(raw: string): { text: string; saidBy: string } | null {
  const m = raw.trim().replace(/\s+/g, " ").match(/^(.*\S)\s+(?:-|–|—|~)\s*([^-–—~]{1,60})$/);
  if (!m) return null;
  const saidBy = m[2].trim().replace(/^@/, "");
  const text = m[1].trim().replace(/^["“]|["”]$/g, "").trim();
  // A tail of only numbers is a score ("3 - 2"), not a person.
  if (!saidBy || !text || saidBy.split(/\s+/).length > 5 || /^[\d\s.,:]+$/.test(saidBy)) return null;
  return { text, saidBy };
}

export interface SpeakerQuote { id: string; text: string; saidBy: string }

/**
 * Pick a quote and build the options: its speaker plus up to three others from
 * the pool, shuffled. Needs at least two different speakers.
 */
export function buildRound(quotes: SpeakerQuote[], rand: () => number = Math.random): { quote: SpeakerQuote; options: string[]; answerIndex: number } | null {
  const key = (s: string) => s.trim().toLowerCase();
  const speakers = [...new Map(quotes.map((q) => [key(q.saidBy), q.saidBy.trim()])).values()];
  if (speakers.length < 2) return null;
  const quote = quotes[Math.floor(rand() * quotes.length)];
  const others = speakers.filter((s) => key(s) !== key(quote.saidBy));
  for (let i = others.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [others[i], others[j]] = [others[j], others[i]]; }
  const options = [quote.saidBy.trim(), ...others.slice(0, WHOSAID_OPTIONS - 1)];
  for (let i = options.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [options[i], options[j]] = [options[j], options[i]]; }
  return { quote, options, answerIndex: options.findIndex((o) => key(o) === key(quote.saidBy)) };
}
