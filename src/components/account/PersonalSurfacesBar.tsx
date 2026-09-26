"use client";

import Link from "next/link";
import { Button } from "@empac/cascadeds";
import { IconBroadcast, IconExternalLink, IconLayout, IconUser } from "@tabler/icons-react";

/**
 * "Here is what you are editing."
 *
 * Brand & Theme changes land on surfaces nowhere near the settings screen, so
 * it is easy to tune a background for minutes without ever seeing it. This bar
 * links straight to each surface the theme touches, opened in a new tab so the
 * editor stays put.
 *
 * Built from CDS `Button` rather than hand-rolled pills: sizing, padding, focus
 * and hover then come from the design system and match every other control on
 * the page instead of being invented here.
 *
 * Only surfaces the person actually has are listed: no profile link without a
 * username, no stream links unless they stream.
 */
export function PersonalSurfacesBar({
  username,
  isStreamer = false,
}: {
  username: string | null;
  isStreamer?: boolean;
}) {
  const surfaces = [
    { href: username ? `/u/${username}` : null, label: "Your profile", icon: IconUser, hint: "Background, links, layout and custom CSS" },
    { href: isStreamer && username ? `/live/${username}` : null, label: "Your live page", icon: IconBroadcast, hint: "What viewers see while you stream" },
    { href: isStreamer ? "/account/streamer?tab=overlay-layout" : null, label: "Overlay layout", icon: IconLayout, hint: "The OBS overlay your theme skins" },
  ].filter((s): s is { href: string; label: string; icon: typeof IconUser; hint: string } => !!s.href);

  if (surfaces.length === 0) return null;

  return (
    <div className="surfaces-bar">
      <p className="surfaces-bar__lead">
        These settings change how you look to everyone else. Open a surface to see the result:
      </p>
      <div className="surfaces-bar__links">
        {surfaces.map((s) => (
          <Link key={s.href} href={s.href} target="_blank" rel="noopener noreferrer" title={s.hint}>
            <Button variant="secondary" size="small" iconBefore={s.icon} iconAfter={IconExternalLink}>
              {s.label}
            </Button>
          </Link>
        ))}
      </div>
    </div>
  );
}
