/**
 * The GameShuffle name is held for official GameShuffle events and the team
 * (supabase/official-events-m1.sql enforces it in the database). Client-safe,
 * so forms can say so before they save.
 */

/** "GameShuffle", "Game Shuffle", "game-shuffle", any case: same pattern as the database's gs_name_is_reserved. */
export function isReservedName(text: string | null | undefined): boolean {
  return /game[\s_.-]*shuffle/i.test(text ?? "");
}

export const RESERVED_TITLE_MESSAGE = "The GameShuffle name is kept for official GameShuffle events. Pick another name.";
export const RESERVED_DISPLAY_NAME_MESSAGE = "The GameShuffle name is kept for the GameShuffle team. Pick another display name.";

/** A database refusal from the official-events guard, in plain words (null when it's something else). */
export function reservedNameError(message: string | null | undefined): string | null {
  if (!message) return null;
  if (/kept for official GameShuffle events/i.test(message)) return RESERVED_TITLE_MESSAGE;
  if (/Only GameShuffle can host official events/i.test(message)) return "Only GameShuffle admins can host official events.";
  return null;
}
