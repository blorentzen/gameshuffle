"use client";

import { Container } from "@empac/cascadeds";

export default function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main style={{ paddingTop: "2rem", paddingBottom: "3rem" }}>
      {/* Let the CDS Container own the page width — same `--container-
       *  max-width` (1440px) the global navbar uses, so the sidebar
       *  rail + content column line up with the nav above. The legacy
       *  800px cap made sense for the single-column tab layout but
       *  starves the right column once the sidebar is in play. */}
      <Container>{children}</Container>
    </main>
  );
}
