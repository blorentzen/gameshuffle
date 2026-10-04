import type { ReactNode } from "react";
import { Breadcrumb, Container } from "@empac/cascadeds";
import { getCompanionTool } from "@/lib/game-nights/companion/tools";
import { RosterBar } from "@/components/game-nights/companion/RosterBar";
import { ToolExplainer } from "@/components/game-nights/companion/ToolExplainer";

/**
 * Shared layout for every companion-tool page: a consistent breadcrumb, title,
 * one-line intro (the compact header: icon tile, eyebrow, title), the shared roster bar (for player-based tools), the tool
 * itself, and a "How it works" explainer. Keeps every tool visually and
 * navigationally consistent, driven by the tools registry.
 */
export function ToolPageShell({ toolId, children }: { toolId: string; children: ReactNode }) {
  const tool = getCompanionTool(toolId);
  if (!tool) return <Container>{children}</Container>;

  return (
    <Container>
      <section style={{ margin: "var(--spacing-32) 0 var(--spacing-64)" }}>
        <Breadcrumb
          items={[
            { label: "Game nights", href: "/game-nights" },
            { label: "Tools", href: "/game-nights/tools" },
            { label: tool.name },
          ]}
        />
        <div className="compact-head compact-head--gold">
          <span className="compact-head__tile" aria-hidden><tool.icon size={28} stroke={1.75} /></span>
          <div className="compact-head__text">
            <p className="marketing-eyebrow">Game night tool</p>
            <h1 className="compact-head__title">{tool.name}</h1>
            <p className="compact-head__lede">{tool.tagline}</p>
          </div>
        </div>

        {tool.usesRoster && <RosterBar />}

        {children}

        <div className="bgn-explainer">
          <h2 className="bgn-explainer__title">How it works</h2>
          <ToolExplainer about={tool.about} howToPlay={tool.howToPlay} />
        </div>
      </section>
    </Container>
  );
}
