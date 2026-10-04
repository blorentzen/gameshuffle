import { handleRandomize, handleRerollAll, handlePlayerReroll } from "./commands/randomize";
import { handleResult } from "./commands/result";
import { handleCoinflip } from "./commands/coinflip";
import { handleRoll } from "./commands/roll";
import { handleEightball } from "./commands/eightball";
import { handleRoleMenuButton, handleRoleMenuSelect, ROLE_MENU_PREFIX, ROLE_MENU_SELECT_PREFIX } from "./commands/roleMenu";
import { handleGsPoll, handlePollVote, POLL_VOTE_PREFIX } from "./commands/polls";
import { handleGsTag } from "./commands/tags";
import { handleGsRemind } from "./commands/remind";
import { handleGsProfile } from "./commands/profile";
import {
  BRAIN_ANSWER_PREFIX,
  BRAIN_MODAL_PREFIX,
  BRAIN_NEXT_PREFIX,
  handleBrainAnswerButton,
  handleBrainModalSubmit,
  handleBrainNext,
  handleGsBrain,
} from "./commands/chatbrain";
import { ephemeralMessage } from "./respond";

// Discord Interaction Types
const INTERACTION_TYPE = {
  PING: 1,
  APPLICATION_COMMAND: 2,
  MESSAGE_COMPONENT: 3,
  AUTOCOMPLETE: 4,
  MODAL_SUBMIT: 5,
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
      case "gs-tag":
        return handleGsTag(interaction);
      case "gs-remind":
        return handleGsRemind(interaction);
      case "gs-profile":
        return handleGsProfile(interaction);
      case "gs-brain":
        return handleGsBrain(interaction);
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

    // Chat Brain: "brainnext:{category}" checked before "brain:{promptId}".
    if (customId.startsWith(BRAIN_NEXT_PREFIX)) {
      return handleBrainNext(interaction);
    }
    if (customId.startsWith(BRAIN_ANSWER_PREFIX)) {
      return handleBrainAnswerButton(interaction);
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

  // Modal submits (forms opened by a button)
  if (type === INTERACTION_TYPE.MODAL_SUBMIT) {
    const customId = (interaction.data as { custom_id: string }).custom_id;
    if (customId.startsWith(BRAIN_MODAL_PREFIX)) {
      return handleBrainModalSubmit(interaction);
    }
    return ephemeralMessage("Unknown form.");
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
