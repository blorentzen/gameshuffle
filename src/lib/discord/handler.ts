import { handleRandomize, handleRerollAll, handlePlayerReroll } from "./commands/randomize";
import { handleResult } from "./commands/result";
import { ephemeralMessage } from "./respond";

// Discord Interaction Types
const INTERACTION_TYPE = {
  PING: 1,
  APPLICATION_COMMAND: 2,
  MESSAGE_COMPONENT: 3,
  AUTOCOMPLETE: 4,
} as const;

export function handleInteraction(interaction: Record<string, unknown>): Response | Promise<Response> {
  const type = interaction.type as number;

  // Application commands (slash commands)
  if (type === INTERACTION_TYPE.APPLICATION_COMMAND) {
    const data = interaction.data as { name: string };
    switch (data.name) {
      case "gs-randomize":
        return handleRandomize(interaction);
      case "gs-result":
        return handleResult(interaction);
      default:
        return ephemeralMessage(`Unknown command: \`${data.name}\``);
    }
  }

  // Message component interactions (button clicks)
  if (type === INTERACTION_TYPE.MESSAGE_COMPONENT) {
    const data = interaction.data as { custom_id: string };
    const customId = data.custom_id;

    // Get the user who clicked the button
    const interactionUser = interaction.member
      ? ((interaction.member as Record<string, unknown>).user as { id: string })
      : (interaction.user as { id: string });

    // Re-roll all: "ra:{sessionId}"
    if (customId.startsWith("ra:")) {
      return handleRerollAll(customId);
    }

    // Per-player re-roll: "pr:{sessionId}:{slotIndex}"
    if (customId.startsWith("pr:")) {
      return handlePlayerReroll(customId, interactionUser);
    }

    return ephemeralMessage("Unknown interaction.");
  }

  // Autocomplete
  if (type === INTERACTION_TYPE.AUTOCOMPLETE) {
    return Response.json({
      type: 8,
      data: {
        choices: [
          { name: "Mario Kart 8 Deluxe", value: "mario-kart-8-deluxe" },
          { name: "Mario Kart World", value: "mario-kart-world" },
        ],
      },
    });
  }

  return ephemeralMessage("Unhandled interaction type.");
}
