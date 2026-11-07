import type { ReactNode } from "react";
import { Container } from "@empac/cascadeds";
import "@/styles/studio.css";
import "@/styles/host.css";

/** /host and its tabs (journeys picks 2026-11-06, 5A to 8A), in the same frame as the Studio. */
export default function HostLayout({ children }: { children: ReactNode }) {
  return (
    <main className="hub-layout">
      <Container>{children}</Container>
    </main>
  );
}
