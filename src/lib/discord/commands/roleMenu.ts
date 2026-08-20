/**
 * Self-assign role menus — runtime. A role-menu message carries a button per
 * role (`custom_id = rolemenu:{roleId}`); clicking toggles that role on the
 * member. Stateless: everything needed is in the interaction (role id in the
 * custom_id, current roles in `member.roles`, guild in `guild_id`).
 */

import { addGuildMemberRole, removeGuildMemberRole } from "@/lib/adapters/discord/adapter";
import { createServiceClient } from "@/lib/supabase/admin";
import { ephemeralMessage } from "../respond";

export const ROLE_MENU_PREFIX = "rolemenu:";
export const ROLE_MENU_SELECT_PREFIX = "rolemenu-select:";

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

/** Build the message components for a role menu. `button` = one toggle button
 *  per role (≤25); `select` = a single dropdown (menuId in the custom_id so the
 *  handler can look up the option set to reconcile). */
export function buildRoleMenuComponents(
  options: RoleMenuOption[],
  type: "button" | "select",
  menuId: string,
): unknown[] {
  if (type === "select") {
    return [
      {
        type: 1,
        components: [
          {
            type: 3, // string select
            custom_id: `${ROLE_MENU_SELECT_PREFIX}${menuId}`,
            min_values: 0,
            max_values: Math.min(options.length, 25),
            placeholder: "Select your roles",
            options: options.slice(0, 25).map((o) => {
              const emoji = toButtonEmoji(o.emoji);
              return { label: o.label.slice(0, 100), value: o.roleId, ...(emoji ? { emoji } : {}) };
            }),
          },
        ],
      },
    ];
  }

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

/** Handle a dropdown role-menu selection → set the member's roles to match the
 *  selected options (add selected, remove deselected among the menu's options). */
export async function handleRoleMenuSelect(interaction: Record<string, unknown>): Promise<Response> {
  const data = interaction.data as { custom_id: string; values?: string[] };
  const menuId = data.custom_id.slice(ROLE_MENU_SELECT_PREFIX.length);
  const selected = new Set(data.values ?? []);
  const guildId = interaction.guild_id as string | undefined;
  const member = interaction.member as { user?: { id: string }; roles?: string[] } | undefined;
  const userId = member?.user?.id;
  if (!guildId || !userId) return ephemeralMessage("This role menu only works inside a server.");

  const { data: opts } = await createServiceClient()
    .from("discord_role_menu_options")
    .select("role_id")
    .eq("menu_id", menuId);
  const optionRoleIds = ((opts ?? []) as Array<{ role_id: string }>).map((o) => o.role_id);
  if (!optionRoleIds.length) return ephemeralMessage("This role menu is no longer available.");

  const current = new Set(Array.isArray(member?.roles) ? member!.roles! : []);
  const added: string[] = [];
  const removed: string[] = [];
  let failed = false;
  for (const roleId of optionRoleIds) {
    const want = selected.has(roleId);
    const has = current.has(roleId);
    if (want && !has) {
      const r = await addGuildMemberRole(guildId, userId, roleId);
      if (r.ok) added.push(roleId);
      else failed = true;
    } else if (!want && has) {
      const r = await removeGuildMemberRole(guildId, userId, roleId);
      if (r.ok) removed.push(roleId);
      else failed = true;
    }
  }

  const parts: string[] = [];
  if (added.length) parts.push(`✅ Added ${added.map((id) => `<@&${id}>`).join(" ")}`);
  if (removed.length) parts.push(`➖ Removed ${removed.map((id) => `<@&${id}>`).join(" ")}`);
  if (parts.length) return ephemeralMessage(parts.join("\n"));
  return ephemeralMessage(
    failed
      ? "Couldn't update your roles. The bot needs **Manage Roles** and must be ranked **above** them."
      : "No changes.",
  );
}
