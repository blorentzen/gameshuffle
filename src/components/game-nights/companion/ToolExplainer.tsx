"use client";

import { Accordion } from "@empac/cascadeds";

/**
 * "How it works" explainer for a companion tool — a two-item accordion covering
 * what the game/tool is and how it's played. We always assume the reader has
 * never played, so content lives in the tools registry (about + howToPlay).
 *
 * Takes the text only: this is a client component, and the registry entry also
 * holds the tool's icon component, which can't cross from a server page.
 */
export function ToolExplainer({ about, howToPlay }: { about: string; howToPlay: string[] }) {
  return (
    <Accordion
      variant="bordered"
      defaultOpenIds={["how"]}
      items={[
        { id: "about", title: "What it is", content: <p className="bgn-explainer__about">{about}</p> },
        {
          id: "how",
          title: "How to play",
          content: (
            <ol className="bgn-explainer__steps">
              {howToPlay.map((step, i) => <li key={i}>{step}</li>)}
            </ol>
          ),
        },
      ]}
    />
  );
}
