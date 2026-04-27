import type { ReactNode } from "react";
import { Container } from "@empac/cascadeds";
import { HelpSidebar } from "@/components/help/HelpSidebar";

export default function HelpLayout({ children }: { children: ReactNode }) {
  return (
    <main className="help-page">
      <Container>
        <div className="help-page__layout">
          <div className="help-page__sidebar">
            <HelpSidebar />
          </div>
          <div className="help-page__content">{children}</div>
        </div>
      </Container>
    </main>
  );
}
