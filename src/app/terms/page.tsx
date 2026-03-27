import type { Metadata } from "next";
import { Container } from "@empac/cascadeds";

export const metadata: Metadata = {
  title: "Terms of Service",
};

export default function TermsPage() {
  return (
    <main style={{ paddingTop: "3rem", paddingBottom: "3rem" }}>
      <Container>
        <div style={{ maxWidth: 700, margin: "0 auto" }}>
          <h1 style={{ fontSize: "2.4rem", fontWeight: 700, marginBottom: "2rem" }}>Terms of Service</h1>

          <p style={{ color: "#808080", marginBottom: "2rem", fontSize: "14px" }}>
            Last updated: [Date]
          </p>

          <section style={{ marginBottom: "2rem" }}>
            <h2 style={{ fontSize: "1.4rem", marginBottom: "0.75rem" }}>1. Acceptance of Terms</h2>
            <p style={{ color: "#505050", lineHeight: 1.7 }}>[Content to be added]</p>
          </section>

          <section style={{ marginBottom: "2rem" }}>
            <h2 style={{ fontSize: "1.4rem", marginBottom: "0.75rem" }}>2. User Accounts</h2>
            <p style={{ color: "#505050", lineHeight: 1.7 }}>[Content to be added]</p>
          </section>

          <section style={{ marginBottom: "2rem" }}>
            <h2 style={{ fontSize: "1.4rem", marginBottom: "0.75rem" }}>3. Acceptable Use</h2>
            <p style={{ color: "#505050", lineHeight: 1.7 }}>[Content to be added]</p>
          </section>

          <section style={{ marginBottom: "2rem" }}>
            <h2 style={{ fontSize: "1.4rem", marginBottom: "0.75rem" }}>4. Intellectual Property</h2>
            <p style={{ color: "#505050", lineHeight: 1.7 }}>[Content to be added]</p>
          </section>

          <section style={{ marginBottom: "2rem" }}>
            <h2 style={{ fontSize: "1.4rem", marginBottom: "0.75rem" }}>5. Termination</h2>
            <p style={{ color: "#505050", lineHeight: 1.7 }}>[Content to be added]</p>
          </section>

          <section style={{ marginBottom: "2rem" }}>
            <h2 style={{ fontSize: "1.4rem", marginBottom: "0.75rem" }}>6. Limitation of Liability</h2>
            <p style={{ color: "#505050", lineHeight: 1.7 }}>[Content to be added]</p>
          </section>

          <section style={{ marginBottom: "2rem" }}>
            <h2 style={{ fontSize: "1.4rem", marginBottom: "0.75rem" }}>7. Changes to Terms</h2>
            <p style={{ color: "#505050", lineHeight: 1.7 }}>[Content to be added]</p>
          </section>

          <section style={{ marginBottom: "2rem" }}>
            <h2 style={{ fontSize: "1.4rem", marginBottom: "0.75rem" }}>8. Contact</h2>
            <p style={{ color: "#505050", lineHeight: 1.7 }}>
              If you have questions about these terms, please <a href="/contact-us" style={{ color: "#0E75C1" }}>contact us</a>.
            </p>
          </section>
        </div>
      </Container>
    </main>
  );
}
