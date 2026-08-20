/**
 * Self-assign role menus — runtime. A role-menu message carries a button per
 * role (`custom_id = rolemenu:{roleId}`); clicking toggles that role on the
 * member. Stateless: everything needed is in the interaction (role id in the
 * custom_id, current roles in `member.roles`, guild in `guild_id`).
 */

import { addGuildMemberRole, removeGuildMemberRole } from "@/lib/adapters/discord/adapter";
import { ephemeralMessage } from "../respond";

export const ROLE_MENU_PREFIX = "rolemenu:";

interface RoleMenuOption {
  roleId: string;
  label: string;
  emoji?: string | null;
}

/** Parse a stored emoji string into a Discord button emoji object. Custom
 *  emojis are stored in Discord's `<:name:id>` / `<a:name:id>` form; anything
 *  else is treated as a unicode emoji. */
function toButtonEmoji(emoji?: string | null): Record<string, unknown> | undefined {
  if (!emoji) return undefined;
  const m = emoji.match(/^<(a)?:(\w+):(\d+)>$/);
  if (m) return { id: m[3], name: m[2], animated: !!m[1] };
  return { name: emoji };
}

/** Build Discord action rows (≤5 buttons each, ≤5 rows → 25 roles max). */
export function buildRoleMenuComponents(options: RoleMenuOption[]): unknown[] {
  const rows: unknown[] = [];
  for (let i = 0; i < options.length && rows.length < 5; i += 5) {
    const chunk = options.slice(i, i + 5);
    rows.push({
      type: 1,
      components: chunk.map((o) => {
        const emoji = toButtonEmoji(o.emoji);
        return {
          type: 2,
          style: 2, // secondary / gray
          label: o.label.slice(0, 80),
          custom_id: `${ROLE_MENU_PREFIX}${o.roleId}`,
          ...(emoji ? { emoji } : {}),
        };
      }),
    });
  }
  return rows;
}

/** Handle a role-menu button click → toggle the role. */
export async function handleRoleMenuButton(interaction: Record<string, unknown>): Promise<Response> {
  const data = interaction.data as { custom_id: string };
  const roleId = data.custom_id.slice(ROLE_MENU_PREFIX.length);
  const guildId = interaction.guild_id as string | undefined;
  const member = interaction.member as { user?: { id: string }; roles?: string[] } | undefined;
  const userId = member?.user?.id;

  if (!guildId || !userId || !roleId) {
    return ephemeralMessage("This role menu only works inside a server.");
  }

  const hasRole = Array.isArray(member?.roles) && member!.roles!.includes(roleId);
  const res = hasRole
    ? await removeGuildMemberRole(guildId, userId, roleId)
    : await addGuildMemberRole(guildId, userId, roleId);

  if (!res.ok) {
    return ephemeralMessage(
      "Couldn't update that role. The bot needs the **Manage Roles** permission and must be ranked **above** this role.",
    );
  }
  return ephemeralMessage(hasRole ? `➖ Removed <@&${roleId}>` : `✅ Added <@&${roleId}>`);
}
