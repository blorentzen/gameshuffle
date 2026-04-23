import type { Metadata } from "next";
import { Container } from "@empac/cascadeds";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Learn how GameShuffle collects, uses, and protects your data. We use cookieless analytics by default and never sell your information.",
  openGraph: {
    title: "Privacy Policy | GameShuffle",
    description: "How GameShuffle handles your data — cookieless analytics, no data selling, full self-service deletion.",
    url: "https://gameshuffle.co/privacy",
  },
  alternates: {
    canonical: "https://gameshuffle.co/privacy",
  },
  robots: {
    index: true,
    follow: false,
  },
};

export default function PrivacyPage() {
  return (
    <main style={{ paddingTop: "3rem", paddingBottom: "3rem" }}>
      <Container>
        <div className="legal-page">
          <h1 className="legal-page__title">Privacy Policy</h1>
          <p className="legal-page__effective">
            <strong>Effective Date:</strong> March 26, 2026<br />
            <strong>Operator:</strong> Empac (empac.co)<br />
            <strong>Platform:</strong> GameShuffle (gameshuffle.co)
          </p>

          <section id="introduction" className="legal-page__section">
            <h2>1. Introduction</h2>
            <p>GameShuffle (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) is operated by Empac. This Privacy Policy explains what information we collect, how we use it, who we share it with, and what rights you have over your data.</p>
            <p>We built GameShuffle with privacy in mind. We use cookieless analytics by default, we don&apos;t sell your data, and we give you full control over your account — including permanent, self-service deletion.</p>
            <p>By using GameShuffle, you agree to the collection and use of information as described in this Policy.</p>
          </section>

          <section id="information-we-collect" className="legal-page__section">
            <h2>2. Information We Collect</h2>

            <h3>2.1 Information You Provide Directly</h3>
            <p><strong>Account information:</strong></p>
            <ul>
              <li>Email address (required for signup)</li>
              <li>Display name and username</li>
              <li>Password (bcrypt-hashed by Supabase — we never store plain-text passwords)</li>
              <li>Gamertags you choose to add: PlayStation Network, Nintendo Switch Online, Xbox Live, Steam, and Epic Games usernames</li>
            </ul>
            <p><strong>Profile preferences:</strong></p>
            <ul>
              <li>Avatar preference (initials, Discord avatar, or Twitch avatar)</li>
              <li>Game night profile settings including player count, content preferences, and consoles owned (currently stored but not actively displayed)</li>
            </ul>
            <p><strong>Tournament data:</strong></p>
            <ul>
              <li>Tournament details you create: title, description, rules, race settings, track lists, and item restrictions</li>
              <li>Participant registration information: display name, friend code, Discord username, and participation status</li>
            </ul>
            <p><strong>Saved configurations:</strong></p>
            <ul>
              <li>Randomizer setups, kart builds, item sets, and other tool configurations you save to your account</li>
            </ul>
            <p><strong>Contact form submissions:</strong></p>
            <ul>
              <li>Any information you voluntarily submit via our contact form (powered by JotForm)</li>
            </ul>

            <h3>2.2 Information From Third-Party Sign-In Providers</h3>
            <p>If you sign in or link your account using Discord or Twitch, we receive the following from those providers:</p>
            <ul>
              <li><strong>Discord:</strong> User ID, username, and avatar URL</li>
              <li><strong>Twitch:</strong> User ID, username, and avatar URL</li>
            </ul>
            <p>We do not receive your password from these providers. Their collection and handling of your data is governed by their own privacy policies.</p>

            <h3>2.3 Twitch Streamer Integration</h3>
            <p>If you connect your Twitch account for the streamer integration (distinct from sign-in), we additionally collect and store:</p>
            <ul>
              <li>Your Twitch display name, login, and numeric user ID</li>
              <li>OAuth access and refresh tokens, <strong>encrypted at rest</strong> using AES-256-GCM, used to subscribe to your stream&apos;s events and manage channel point rewards on your behalf</li>
              <li>The scopes you authorize (e.g. reading chat as the GameShuffle bot, managing channel point redemptions)</li>
              <li>Live session data while you&apos;re streaming: current Twitch category, viewers who opt into your randomizer lobby (their Twitch user ID and display name), and the randomized loadouts generated for each shuffle</li>
              <li>A randomly generated overlay token that powers your OBS browser source and the public lobby viewer page</li>
            </ul>
            <p>You can disconnect the Twitch integration at any time from the Twitch dashboard page. Disconnecting revokes the OAuth tokens, removes the channel point reward we created, deletes our EventSub subscriptions, and deletes the stored connection record and all session data.</p>

            <h3>2.4 Information Collected Automatically</h3>
            <p><strong>Server and infrastructure logs:</strong> Vercel, our hosting provider, collects standard server logs including IP addresses and request metadata as part of normal infrastructure operation. We do not use this data for tracking or profiling.</p>
            <p><strong>Bot protection:</strong> Cloudflare Turnstile is used on signup and login forms to detect and prevent automated abuse. It processes your IP address and browser fingerprint. It does not set cookies and is invisible to normal users.</p>
            <p><strong>Analytics:</strong> We use two analytics tools with different privacy profiles:</p>
            <ul>
              <li><strong>Plausible Analytics</strong> — cookieless, privacy-friendly analytics that collects page views and custom events without using cookies or tracking you across sites. This runs for all visitors regardless of cookie consent because it does not require consent under GDPR or CCPA by design.</li>
              <li><strong>Google Analytics (G-WBXS3D8GBL)</strong> — collects page views, events, and anonymized IP addresses. This tool uses cookies and is only loaded if you explicitly accept cookies via our consent banner.</li>
            </ul>
          </section>

          <section id="how-we-use-information" className="legal-page__section">
            <h2>3. How We Use Your Information</h2>
            <p>We use the information we collect to:</p>
            <ul>
              <li>Create and manage your account</li>
              <li>Provide the features and functionality of the Service, including randomizers, tournament management, and competitive tools</li>
              <li>Authenticate your identity and keep your account secure</li>
              <li>Display your profile information to other users where you have chosen to make it public (e.g., tournament participant lists, public profiles at <code>/u/[username]</code>)</li>
              <li>Respond to your support requests and contact form submissions</li>
              <li>Understand how the Service is used so we can improve it (via analytics)</li>
              <li>Enforce our Terms of Service and protect the integrity of the platform</li>
              <li>Comply with legal obligations</li>
            </ul>
            <p>We do not use your data to serve targeted advertising. We do not sell your data to third parties.</p>
          </section>

          <section id="cookies-analytics" className="legal-page__section">
            <h2>4. Cookies &amp; Analytics</h2>

            <h3>4.1 What Cookies We Use</h3>
            <p>GameShuffle uses a minimal number of cookies:</p>
            <table className="legal-page__table">
              <thead>
                <tr>
                  <th>Cookie</th>
                  <th>Purpose</th>
                  <th>Duration</th>
                  <th>Consent required?</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Supabase session (HTTP-only JWT)</td>
                  <td>Keeps you logged in</td>
                  <td>Session / refresh cycle</td>
                  <td>No — functionally required</td>
                </tr>
                <tr>
                  <td><code>cookieConsent</code> (localStorage)</td>
                  <td>Remembers your cookie consent choice</td>
                  <td>Persistent</td>
                  <td>No — preference only</td>
                </tr>
                <tr>
                  <td>Google Analytics cookies</td>
                  <td>Usage analytics</td>
                  <td>Up to 2 years</td>
                  <td><strong>Yes — only set after consent</strong></td>
                </tr>
              </tbody>
            </table>

            <h3>4.2 Cookie Consent</h3>
            <p>On your first visit, a banner asks whether you accept analytics cookies. If you accept, Google Analytics is loaded. If you decline, only Plausible (cookieless) runs. You can use the full platform regardless of your choice — we do not gate any features behind cookie consent.</p>
            <p>Your preference is stored in your browser&apos;s <code>localStorage</code> under the key <code>cookieConsent</code>. You can change your preference at any time by clearing your browser storage or contacting us.</p>

            <h3>4.3 Opting Out</h3>
            <ul>
              <li><strong>Google Analytics:</strong> Decline cookies via our consent banner, or use the <a href="https://tools.google.com/dlpage/gaoptout" target="_blank" rel="noopener noreferrer">Google Analytics Opt-Out Browser Add-On</a></li>
              <li><strong>Plausible:</strong> Plausible is cookieless and does not track you across sites. No opt-out is required, but Plausible honors standard Do Not Track signals.</li>
            </ul>
          </section>

          <section id="data-storage-security" className="legal-page__section">
            <h2>5. Data Storage &amp; Security</h2>

            <h3>5.1 Where Your Data Is Stored</h3>
            <p>All account and application data is stored in Supabase&apos;s PostgreSQL database. Supabase is hosted on AWS infrastructure. Data may be processed in the United States or other jurisdictions where Supabase operates.</p>

            <h3>5.2 How We Protect Your Data</h3>
            <p>We take security seriously and have implemented the following protections:</p>
            <ul>
              <li><strong>Password hashing:</strong> All passwords are bcrypt-hashed server-side by Supabase. Compromised password detection is enabled.</li>
              <li><strong>Row-Level Security (RLS):</strong> Enabled on all database tables — you can only read or write your own data unless content is explicitly public.</li>
              <li><strong>Session management:</strong> Handled by Supabase Auth using JWT access tokens and refresh tokens stored in HTTP-only cookies, inaccessible to JavaScript.</li>
              <li><strong>Bot protection:</strong> Cloudflare Turnstile on all authentication forms.</li>
              <li><strong>Brute force protection:</strong> Client-side lockout after 5 failed login attempts with a 60-second cooldown, backed by Supabase server-side rate limiting.</li>
              <li><strong>Service role key:</strong> Our server-side admin key is never exposed to the browser and is only used for specific privileged operations.</li>
              <li><strong>Email verification:</strong> Required before creating or joining tournaments.</li>
            </ul>
            <p>No system is perfectly secure. While we work hard to protect your data, we cannot guarantee absolute security. If you believe your account has been compromised, please contact us immediately.</p>
          </section>

          <section id="third-party-services" className="legal-page__section">
            <h2>6. Third-Party Services</h2>
            <p>We work with the following third-party services to operate GameShuffle. Each has its own privacy practices:</p>
            <table className="legal-page__table">
              <thead>
                <tr>
                  <th>Service</th>
                  <th>Purpose</th>
                  <th>Privacy Policy</th>
                </tr>
              </thead>
              <tbody>
                <tr><td><strong>Supabase</strong></td><td>Auth, database, real-time</td><td><a href="https://supabase.com/privacy" target="_blank" rel="noopener noreferrer">supabase.com/privacy</a></td></tr>
                <tr><td><strong>Vercel</strong></td><td>Hosting and infrastructure</td><td><a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer">vercel.com/legal/privacy-policy</a></td></tr>
                <tr><td><strong>Cloudflare</strong></td><td>Bot protection (Turnstile)</td><td><a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noopener noreferrer">cloudflare.com/privacypolicy</a></td></tr>
                <tr><td><strong>Google Analytics</strong></td><td>Usage analytics (with consent)</td><td><a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">policies.google.com/privacy</a></td></tr>
                <tr><td><strong>Plausible</strong></td><td>Cookieless analytics</td><td><a href="https://plausible.io/privacy" target="_blank" rel="noopener noreferrer">plausible.io/privacy</a></td></tr>
                <tr><td><strong>Discord</strong></td><td>OAuth sign-in, account linking</td><td><a href="https://discord.com/privacy" target="_blank" rel="noopener noreferrer">discord.com/privacy</a></td></tr>
                <tr><td><strong>Twitch</strong></td><td>OAuth sign-in, account linking, streamer integration (chat bot, EventSub, channel point rewards)</td><td><a href="https://www.twitch.tv/p/legal/privacy-notice/" target="_blank" rel="noopener noreferrer">twitch.tv/p/legal/privacy-notice</a></td></tr>
                <tr><td><strong>JotForm</strong></td><td>Contact form</td><td><a href="https://www.jotform.com/privacy/" target="_blank" rel="noopener noreferrer">jotform.com/privacy</a></td></tr>
              </tbody>
            </table>
            <p>We are not responsible for the data practices of these third parties. We encourage you to review their privacy policies.</p>
          </section>

          <section id="public-information" className="legal-page__section">
            <h2>7. Public Information &amp; Sharing</h2>
            <p>Some information on GameShuffle is visible to other users or the public:</p>
            <ul>
              <li><strong>Public profiles</strong> (<code>/u/[username]</code>) — your display name, username, and any content you choose to display publicly</li>
              <li><strong>Tournament listings</strong> — tournaments you create are publicly browsable, including their title, description, and participant list</li>
              <li><strong>Shared configurations</strong> — saved randomizer configs with a share link are accessible to anyone with the link</li>
              <li><strong>Tournament participation</strong> — your display name and registration status are visible to other tournament participants and the organizer</li>
            </ul>
            <p>You control what you share. You can manage your public profile and linked accounts from your account settings at any time.</p>
          </section>

          <section id="data-retention-deletion" className="legal-page__section">
            <h2>8. Data Retention &amp; Deletion</h2>

            <h3>8.1 Retention</h3>
            <p>We retain your account data for as long as your account is active. If you delete your account, all associated data is permanently deleted immediately via cascading database constraints.</p>

            <h3>8.2 Account Deletion</h3>
            <p>You can delete your account at any time from your account settings. This action is:</p>
            <ul>
              <li><strong>Immediate</strong> — your account is removed right away</li>
              <li><strong>Permanent</strong> — deletion cannot be undone</li>
              <li><strong>Complete</strong> — all associated data including saved configs, tournament registrations, and profile information is deleted</li>
            </ul>
            <p><strong>Exception:</strong> Tournament data you created persists for other participants even after your account is deleted. Your organizer reference becomes null, but participant registrations submitted by others remain accessible to those participants.</p>

            <h3>8.3 Supabase Auth Logs</h3>
            <p>Supabase retains authentication audit logs per their own data retention policy, independent of our account deletion process.</p>
          </section>

          <section id="your-rights" className="legal-page__section">
            <h2>9. Your Rights</h2>
            <p>Depending on where you are located, you may have the following rights regarding your personal data:</p>
            <ul>
              <li><strong>Access</strong> — view all personal data we hold about you via your account settings</li>
              <li><strong>Correction</strong> — edit your profile information at any time from account settings</li>
              <li><strong>Deletion</strong> — permanently delete your account and all associated data via self-service</li>
              <li><strong>Portability</strong> — data export is not yet available but is planned for a future update</li>
              <li><strong>Withdraw consent</strong> — decline or withdraw analytics cookie consent at any time</li>
              <li><strong>Unlink OAuth providers</strong> — disconnect Discord or Twitch from your account at any time</li>
            </ul>
            <p>To exercise any right not available via self-service, contact us at the address below and we will respond within 30 days.</p>
            <p><strong>California residents (CCPA):</strong> We do not sell personal information. You have the right to know what data we collect and to request deletion — both available via your account settings or by contacting us.</p>
            <p><strong>EEA/UK residents (GDPR):</strong> Our legal basis for processing your data is performance of a contract (providing the Service you signed up for) and, where applicable, your consent (analytics cookies). You have the right to lodge a complaint with your local supervisory authority.</p>
          </section>

          <section id="childrens-privacy" className="legal-page__section">
            <h2>10. Children&apos;s Privacy</h2>
            <p>GameShuffle is not directed at children under 13. We do not knowingly collect personal information from children under 13. If you believe a child under 13 has provided us with personal information, please contact us and we will promptly delete it.</p>
          </section>

          <section id="changes-to-policy" className="legal-page__section">
            <h2>11. Changes to This Policy</h2>
            <p>We may update this Privacy Policy from time to time. We will notify you of material changes by updating the Effective Date at the top of this page. Continued use of the Service after changes take effect constitutes your acceptance of the updated Policy.</p>
          </section>

          <section id="contact" className="legal-page__section">
            <h2>12. Contact</h2>
            <p>If you have questions about this Privacy Policy or how we handle your data, please contact us:</p>
            <p>
              <strong>Empac</strong><br />
              hello@empac.co<br />
              empac.co
            </p>
          </section>
        </div>
      </Container>
    </main>
  );
}
