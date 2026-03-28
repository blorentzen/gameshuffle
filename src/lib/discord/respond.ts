/**
 * Discord Interaction response helpers.
 * See: https://discord.com/developers/docs/interactions/receiving-and-responding
 */

interface Embed {
  title?: string;
  description?: string;
  color?: number;
  fields?: { name: string; value: string; inline?: boolean }[];
  thumbnail?: { url: string };
  footer?: { text: string };
}

interface ButtonComponent {
  type: 2; // Button
  style: 1 | 2 | 3 | 4 | 5; // Primary, Secondary, Success, Danger, Link
  label: string;
  custom_id?: string;
  url?: string;
  emoji?: { name: string };
}

interface ActionRow {
  type: 1; // Action Row
  components: ButtonComponent[];
}

/** Type 4: respond with a message */
export function channelMessage(
  content?: string,
  embeds?: Embed[],
  components?: ActionRow[]
): Response {
  return Response.json({
    type: 4,
    data: {
      ...(content ? { content } : {}),
      ...(embeds ? { embeds } : {}),
      ...(components ? { components } : {}),
    },
  });
}

/** Type 4 with ephemeral flag — only visible to the invoking user */
export function ephemeralMessage(content: string, components?: ActionRow[]): Response {
  return Response.json({
    type: 4,
    data: {
      content,
      flags: 64, // EPHEMERAL
      ...(components ? { components } : {}),
    },
  });
}

/** Type 5: deferred response — acknowledge now, follow up later */
export function deferredResponse(): Response {
  return Response.json({ type: 5 });
}

/** Type 6: deferred update — acknowledge component interaction */
export function deferredUpdate(): Response {
  return Response.json({ type: 6 });
}

/** Type 7: update the original message (for button interactions) */
export function updateMessage(
  content?: string,
  embeds?: Embed[],
  components?: ActionRow[]
): Response {
  return Response.json({
    type: 7,
    data: {
      ...(content ? { content } : {}),
      ...(embeds ? { embeds } : {}),
      ...(components ? { components } : {}),
    },
  });
}

/** Follow up on a deferred response — PATCH the original message */
export async function followUp(
  applicationId: string,
  interactionToken: string,
  data: { content?: string; embeds?: Embed[]; components?: ActionRow[] }
): Promise<void> {
  const res = await fetch(
    `https://discord.com/api/v10/webhooks/${applicationId}/${interactionToken}/messages/@original`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    console.error(`Discord followUp failed (${res.status}):`, err);
  }
}

/** Build a link button */
export function linkButton(label: string, url: string, emoji?: string): ButtonComponent {
  return {
    type: 2,
    style: 5, // Link
    label,
    url,
    ...(emoji ? { emoji: { name: emoji } } : {}),
  };
}

/** Build an interactive button */
export function button(
  label: string,
  customId: string,
  style: 1 | 2 | 3 | 4 = 1,
  emoji?: string
): ButtonComponent {
  return {
    type: 2,
    style,
    label,
    custom_id: customId,
    ...(emoji ? { emoji: { name: emoji } } : {}),
  };
}

/** Wrap buttons in an action row */
export function actionRow(...buttons: ButtonComponent[]): ActionRow {
  return { type: 1, components: buttons };
}

/** Discord embed color constants */
export const COLORS = {
  PRIMARY: 0x0e75c1,   // GameShuffle blue
  SUCCESS: 0x17a710,
  WARNING: 0xf59e0b,
  DANGER: 0xc11a10,
} as const;
