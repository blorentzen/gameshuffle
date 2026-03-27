import { handleRandomize, handleReroll } from "./commands/randomize";
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

    if (customId.startsWith("reroll:")) {
      return handleReroll(customId);
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
        ],
      },
    });
  }

  return ephemeralMessage("Unhandled interaction type.");
}
