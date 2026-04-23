"use client";

import { Container } from "@empac/cascadeds";

export default function TwitchLayout({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ paddingTop: "2rem", paddingBottom: "3rem" }}>
      <Container>
        <div style={{ maxWidth: 800, margin: "0 auto" }}>{children}</div>
      </Container>
    </main>
  );
}
