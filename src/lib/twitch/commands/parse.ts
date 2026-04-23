/**
 * Chat command parser. All action commands use the `!gs-` prefix; the bare
 * `!gs` info command is a separate case so it doesn't match as `!gs-<empty>`.
 *
 * Case-insensitive. Strips leading whitespace. Returns null for anything
 * that isn't a GameShuffle command so the webhook can ignore non-commands
 * without an extra branch.
 */

export interface ParsedCommand {
  /** Lowercase command name, without prefix: e.g. "shuffle", "join". Empty string for bare `!gs`. */
  name: string;
  /** Remaining text after the command, trimmed. */
  args: string;
  /** Original raw message for logging. */
  raw: string;
}

export function parseCommand(message: string): ParsedCommand | null {
  const trimmed = message.trim();
  if (!trimmed.startsWith("!")) return null;

  // Bare "!gs" info command
  const bareMatch = /^!gs(?:\s+(.*))?$/i.exec(trimmed);
  if (bareMatch) {
    return { name: "", args: (bareMatch[1] ?? "").trim(), raw: message };
  }

  const match = /^!gs-([a-z]+)(?:\s+(.*))?$/i.exec(trimmed);
  if (!match) return null;

  return {
    name: match[1].toLowerCase(),
    args: (match[2] ?? "").trim(),
    raw: message,
  };
}
