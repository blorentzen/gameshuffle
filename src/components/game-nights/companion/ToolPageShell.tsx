import type { ReactNode } from "react";
import { Breadcrumb, Container } from "@empac/cascadeds";
import { getCompanionTool } from "@/lib/game-nights/companion/tools";
import { RosterBar } from "@/components/game-nights/companion/RosterBar";
import { ToolExplainer } from "@/components/game-nights/companion/ToolExplainer";

/**
 * Shared layout for every companion-tool page: a consistent breadcrumb, title,
 * one-line intro, the shared roster bar (for player-based tools), the tool
 * itself, and a "How it works" explainer. Keeps all 13 tools visually and
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
        <h1
          style={{
            fontSize: "var(--font-size-fluid-h2)",
            fontWeight: "var(--font-weight-bold)",
            lineHeight: "var(--line-height-tight)",
            margin: "var(--spacing-16) 0 var(--spacing-8)",
          }}
        >
          <span aria-hidden style={{ marginRight: "var(--spacing-8)" }}>{tool.emoji}</span>{tool.name}
        </h1>
        <p style={{ fontSize: "var(--font-size-18)", color: "var(--text-secondary)", lineHeight: "var(--line-height-relaxed)", margin: "0 0 var(--spacing-24)", maxWidth: "48rem" }}>
          {tool.tagline}
        </p>

        {tool.usesRoster && <RosterBar />}

        {children}

        <div className="bgn-explainer">
          <h2 className="bgn-explainer__title">How it works</h2>
          <ToolExplainer tool={tool} />
        </div>
      </section>
    </Container>
  );
}
