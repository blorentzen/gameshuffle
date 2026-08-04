import Link from "next/link";
import { Button } from "@empac/cascadeds";

/**
 * Streamer invite + Pro upsell on the free-tools hub. Frames the free tools as
 * the on-ramp, then sells GS Pro's real, shipped stream layer (overlay, chat
 * commands, channel points, markets, token economy) — not per-tool live
 * integration, which is still on the roadmap. Static → /gs-pro.
 */
const BEATS = [
  "OBS overlay + broadcaster tools built in",
  "Chat commands & channel-point rewards your viewers control",
  "Prediction markets, awards & a token economy your chat plays in",
];

export function ProToolsBand() {
  return (
    <section className="tools-pro-band">
      <span className="tools-pro-band__eyebrow">For streamers</span>
      <h2 className="tools-pro-band__heading">Take game night live with GS Pro</h2>
      <p className="tools-pro-band__body">
        These tools are free to use solo. <strong>GameShuffle Pro</strong> adds a full stream layer —
        an OBS overlay, chat commands, and channel-point rewards that turn your viewers into players.
      </p>
      <ul className="tools-pro-band__beats">
        {BEATS.map((b) => (
          <li key={b}>{b}</li>
        ))}
      </ul>
      <Link href="/gs-pro" className="tools-pro-band__link">
        <Button variant="primary" size="large">
          Explore GS Pro
        </Button>
      </Link>
    </section>
  );
}
