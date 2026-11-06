/**
 * Layout for the (stream) route group.
 *
 * Just a passthrough that imports the stream-specific stylesheet —
 * route-group layouts in Next.js App Router can't replace the root
 * layout, only nest inside it. The actual "no nav, no footer, no
 * cookie banner" behavior comes from ConditionalChrome at the root
 * level matching this group's URL patterns.
 *
 * Every OBS source here gets ContainerUnitsFallback: older OBS draws browser sources with a Chromium that has no
 * container units.
 */

import "../../styles/stream.css";
import { ContainerUnitsFallback } from "@/components/stream/ContainerUnitsFallback";

export default function StreamLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <><ContainerUnitsFallback />{children}</>;
}
