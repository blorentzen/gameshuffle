/**
 * Layout for the (stream) route group.
 *
 * Just a passthrough that imports the stream-specific stylesheet —
 * route-group layouts in Next.js App Router can't replace the root
 * layout, only nest inside it. The actual "no nav, no footer, no
 * cookie banner" behavior comes from ConditionalChrome at the root
 * level matching this group's URL patterns.
 */

import "../../styles/stream.css";

export default function StreamLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <>{children}</>;
}
