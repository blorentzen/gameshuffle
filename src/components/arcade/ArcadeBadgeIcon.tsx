import { IconCrown, IconDice5, IconFlame, IconStar, IconTrophy } from "@tabler/icons-react";
import type { ArcadeBadgeIconName } from "@/data/arcade-items";

const ICONS = { star: IconStar, dice: IconDice5, trophy: IconTrophy, flame: IconFlame, crown: IconCrown } as const;

/**
 * An Arcade badge's Tabler icon. The catalog stores a name rather than the component so the items can be
 * passed from a server page to the client shop. Decorative: the badge's name sits beside it or on its wrapper.
 */
export function ArcadeBadgeIcon({ name, size = 18, className }: { name: ArcadeBadgeIconName; size?: number; className?: string }) {
  const Icon = ICONS[name];
  return <Icon size={size} stroke={2} className={className} aria-hidden />;
}
