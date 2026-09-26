"use client";

import { Accordion } from "@empac/cascadeds";
import type { CompanionTool } from "@/lib/game-nights/companion/tools";

/**
 * "How it works" explainer for a companion tool — a two-item accordion covering
 * what the game/tool is and how it's played. We always assume the reader has
 * never played, so content lives in the tools registry (about + howToPlay).
 */
export function ToolExplainer({ tool }: { tool: CompanionTool }) {
  return (
    <Accordion
      variant="bordered"
      defaultOpenIds={["how"]}
      items={[
        { id: "about", title: "What it is", content: <p className="bgn-explainer__about">{tool.about}</p> },
        {
          id: "how",
          title: "How to play",
          content: (
            <ol className="bgn-explainer__steps">
              {tool.howToPlay.map((step, i) => <li key={i}>{step}</li>)}
            </ol>
          ),
        },
      ]}
    />
  );
}
