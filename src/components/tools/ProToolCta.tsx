import Link from "next/link";
import { Button } from "@empac/cascadeds";

/**
 * "Streaming? Go Pro" upsell shown on an individual free-tool page. Sells GS
 * Pro's real, existing stream integration (overlay, chat commands, channel
 * points) rather than claiming this specific tool is wired to the stream —
 * per-tool live integration is on the roadmap, not shipped. Static → /gs-pro.
 */
export function ProToolCta() {
  return (
    <aside className="tool-pro-cta">
      <div className="tool-pro-cta__text">
        <span className="tool-pro-cta__eyebrow">Streaming?</span>
        <p className="tool-pro-cta__line">
          <strong>GS Pro</strong> connects GameShuffle to your stream — OBS overlay, chat commands,
          and channel-point rewards that pull your viewers into the action.
        </p>
      </div>
      <Link href="/gs-pro" className="tool-pro-cta__link">
        <Button variant="primary">Explore GS Pro</Button>
      </Link>
    </aside>
  );
}
