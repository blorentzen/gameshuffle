/**
 * How each built-in command handler (./defaultHandlers.ts, server-only) is
 * named for staff on Platform ▸ Chat bot ▸ Commands ▸ Built-in logic.
 * Client-safe. Add an entry with every handler.
 */
export const HANDLER_INFO: Record<string, { label: string; about: string }> = {
  roll: {
    label: "Dice roller",
    about: "Reads what the viewer typed, like !roll 2d6, and puts the roll where {result} sits. {dice} and {sum} work too.",
  },
};
