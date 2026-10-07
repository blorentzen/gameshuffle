import type { ComponentType, ReactNode } from "react";
import { Breadcrumb, Container } from "@empac/cascadeds";

type TablerIcon = ComponentType<{ size?: number | string; stroke?: number }>;

/**
 * Shared layout for the free tools (wheel, dice, coin, name picker, tier list,
 * bingo, 8-ball, timer, truth or dare, yes/no): a breadcrumb, then the same
 * compact header the game night tools use (icon tile, eyebrow, title, one
 * line), all reading left. The tool itself sits below; a toy like the coin or
 * the 8-ball centres inside its own card (`.tool-panel`).
 */
export function FreeToolShell({ icon: Icon, eyebrow = "Free tool", name, lede, crumbs, children }: {
  icon: TablerIcon;
  /** "Free tool", or the tool's name on a template page ("Bingo card"). */
  eyebrow?: string;
  name: string;
  lede: ReactNode;
  /** Breadcrumb after "Free tools"; defaults to just this tool's name. */
  crumbs?: { label: string; href?: string }[];
  children: ReactNode;
}) {
  return (
    <Container className="free-tool">
      <Breadcrumb items={[{ label: "Free tools", href: "/tools" }, ...(crumbs ?? [{ label: name }])]} />
      <div className="compact-head">
        <span className="compact-head__tile" aria-hidden><Icon size={28} stroke={1.75} /></span>
        <div className="compact-head__text">
          <p className="marketing-eyebrow">{eyebrow}</p>
          <h1 className="compact-head__title">{name}</h1>
          <p className="compact-head__lede">{lede}</p>
        </div>
      </div>
      <div className="free-tool__body">{children}</div>
    </Container>
  );
}
