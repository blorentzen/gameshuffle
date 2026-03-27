import type { Metadata } from "next";
import { Container } from "@empac/cascadeds";

export const metadata: Metadata = {
  title: "Privacy Policy",
};

export default function PrivacyPage() {
  return (
    <main style={{ paddingTop: "3rem", paddingBottom: "3rem" }}>
      <Container>
        <div style={{ maxWidth: 700, margin: "0 auto" }}>
          <h1 style={{ fontSize: "2.4rem", fontWeight: 700, marginBottom: "2rem" }}>Privacy Policy</h1>

          <p style={{ color: "#808080", marginBottom: "2rem", fontSize: "14px" }}>
            Last updated: [Date]
          </p>

          <section style={{ marginBottom: "2rem" }}>
            <h2 style={{ fontSize: "1.4rem", marginBottom: "0.75rem" }}>1. Information We Collect</h2>
            <p style={{ color: "#505050", lineHeight: 1.7 }}>[Content to be added — email, display name, gamertags, usage data]</p>
          </section>

          <section style={{ marginBottom: "2rem" }}>
            <h2 style={{ fontSize: "1.4rem", marginBottom: "0.75rem" }}>2. How We Use Your Information</h2>
            <p style={{ color: "#505050", lineHeight: 1.7 }}>[Content to be added — account management, tournament participation, communication]</p>
          </section>

          <section style={{ marginBottom: "2rem" }}>
            <h2 style={{ fontSize: "1.4rem", marginBottom: "0.75rem" }}>3. Cookies and Analytics</h2>
            <p style={{ color: "#505050", lineHeight: 1.7 }}>[Content to be added — Google Analytics (with consent), Plausible (cookieless), Cloudflare Turnstile]</p>
          </section>

          <section style={{ marginBottom: "2rem" }}>
            <h2 style={{ fontSize: "1.4rem", marginBottom: "0.75rem" }}>4. Data Storage</h2>
            <p style={{ color: "#505050", lineHeight: 1.7 }}>[Content to be added — Supabase (PostgreSQL), hosted infrastructure, data retention]</p>
          </section>

          <section style={{ marginBottom: "2rem" }}>
            <h2 style={{ fontSize: "1.4rem", marginBottom: "0.75rem" }}>5. Third-Party Services</h2>
            <p style={{ color: "#505050", lineHeight: 1.7 }}>[Content to be added — Supabase, Vercel, Cloudflare, Google Analytics, Plausible]</p>
          </section>

          <section style={{ marginBottom: "2rem" }}>
            <h2 style={{ fontSize: "1.4rem", marginBottom: "0.75rem" }}>6. Your Rights</h2>
            <p style={{ color: "#505050", lineHeight: 1.7 }}>[Content to be added — access, correction, deletion, data portability]</p>
          </section>

          <section style={{ marginBottom: "2rem" }}>
            <h2 style={{ fontSize: "1.4rem", marginBottom: "0.75rem" }}>7. Data Deletion</h2>
            <p style={{ color: "#505050", lineHeight: 1.7 }}>
              You can delete your account and all associated data at any time from your{" "}
              <a href="/account?tab=security" style={{ color: "#0E75C1" }}>account security settings</a>.
              Account deletion is immediate and permanent.
            </p>
          </section>

          <section style={{ marginBottom: "2rem" }}>
            <h2 style={{ fontSize: "1.4rem", marginBottom: "0.75rem" }}>8. Contact</h2>
            <p style={{ color: "#505050", lineHeight: 1.7 }}>
              If you have questions about this privacy policy, please <a href="/contact-us" style={{ color: "#0E75C1" }}>contact us</a>.
            </p>
          </section>
        </div>
      </Container>
    </main>
  );
}
