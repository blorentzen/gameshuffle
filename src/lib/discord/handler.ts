import { handleRandomize, handleRerollAll, handlePlayerReroll } from "./commands/randomize";
import { handleResult } from "./commands/result";
import { handleCoinflip } from "./commands/coinflip";
import { handleRoll } from "./commands/roll";
import { handleEightball } from "./commands/eightball";
import { handleRoleMenuButton, handleRoleMenuSelect, ROLE_MENU_PREFIX, ROLE_MENU_SELECT_PREFIX } from "./commands/roleMenu";
import { handleGsPoll, handlePollVote, POLL_VOTE_PREFIX } from "./commands/polls";
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
      case "gs-flip":
        return handleCoinflip(interaction);
      case "gs-roll":
        return handleRoll(interaction);
      case "gs-8ball":
        return handleEightball(interaction);
      case "gs-poll":
        return handleGsPoll(interaction);
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

    // Poll vote: "poll:{pollId}:{optionId}"
    if (customId.startsWith(POLL_VOTE_PREFIX)) {
      return handlePollVote(interaction);
    }

    // Re-roll all: "ra:{sessionId}"
    if (customId.startsWith("ra:")) {
      return handleRerollAll(customId);
    }

    // Per-player re-roll: "pr:{sessionId}:{slotIndex}"
    if (customId.startsWith("pr:")) {
      return handlePlayerReroll(customId, interactionUser);
    }

    // Self-assign role menu: dropdown ("rolemenu-select:{menuId}") checked
    // first since "rolemenu-select:" also starts with "rolemenu".
    if (customId.startsWith(ROLE_MENU_SELECT_PREFIX)) {
      return handleRoleMenuSelect(interaction);
    }
    // Button role menu: "rolemenu:{roleId}" → toggle the role.
    if (customId.startsWith(ROLE_MENU_PREFIX)) {
      return handleRoleMenuButton(interaction);
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
