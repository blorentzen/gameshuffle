/**
 * The compact header's mark: a colored icon tile plus the eyebrow, sitting
 * above a task page's title (free tools, game-night tools). Part of the header
 * system (Oct 2026): pages you came to do something on get a light header, but
 * never a bare line of text. The icon says what the tool is at a glance, from
 * the same Tabler set as the rest of the UI.
 */
import type { ComponentType } from "react";

type TablerIcon = ComponentType<{ size?: number | string; stroke?: number; "aria-hidden"?: boolean }>;

export function HeaderMark({ icon: Icon, eyebrow, tone = "blue" }: { icon: TablerIcon; eyebrow: string; tone?: "blue" | "violet" | "gold" | "cyan" }) {
  return (
    <div className={`header-mark header-mark--${tone}`}>
      <span className="header-mark__tile" aria-hidden><Icon size={28} stroke={1.75} aria-hidden /></span>
      <p className="marketing-eyebrow header-mark__eyebrow">{eyebrow}</p>
    </div>
  );
}
