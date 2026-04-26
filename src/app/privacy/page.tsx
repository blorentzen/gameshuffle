import type { Metadata } from "next";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@empac/cascadeds";
import { LegalPage, LegalSubSection, LegalContact, type LegalSection } from "@/components/legal/LegalPage";

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

const SECTIONS: LegalSection[] = [
  {
    id: "introduction",
    title: "Introduction",
    content: (
      <>
        <p>GameShuffle (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) is operated by Britton Lorentzen, doing business as Empac and GameShuffle, with a registered business address at 4904 168th Ave E, Lake Tapps, WA 98391. This Privacy Policy explains what information we collect, how we use it, who we share it with, and what rights you have over your data.</p>
        <p>We built GameShuffle with privacy in mind. We use cookieless analytics by default, we don&apos;t sell your data, and we give you full control over your account — including permanent, self-service deletion.</p>
        <p>By using GameShuffle, you agree to the collection and use of information as described in this Policy.</p>
      </>
    ),
  },
  {
    id: "information-we-collect",
    title: "Information We Collect",
    content: (
      <>
        <LegalSubSection number="2.1" title="Information You Provide Directly">
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
            <li>Game night profile settings including player count, content preferences, and consoles owned</li>
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
          <p><strong>Subscription and payment information:</strong></p>
          <ul>
            <li>If you subscribe to GameShuffle Pro, billing information including your name, billing address, and payment card information is collected and processed by Stripe. We do not store your full payment card number — Stripe handles all payment data directly.</li>
            <li>We store subscription status, plan tier, billing cycle, and trial usage history</li>
          </ul>
          <p><strong>Contact form submissions:</strong></p>
          <ul>
            <li>Any information you voluntarily submit via our contact form</li>
          </ul>
        </LegalSubSection>

        <LegalSubSection number="2.2" title="Information From Third-Party Sign-In Providers">
          <p>If you sign in or link your account using Discord or Twitch, we receive the following from those providers:</p>
          <ul>
            <li><strong>Discord:</strong> User ID, username, email address, and avatar URL</li>
            <li><strong>Twitch:</strong> User ID, username, email address, and avatar URL</li>
          </ul>
          <p>We do not receive your password from these providers. Their collection and handling of your data is governed by their own privacy policies.</p>
        </LegalSubSection>

        <LegalSubSection number="2.3" title="Twitch Streamer Integration">
          <p>If you connect your Twitch account for the streamer integration (distinct from sign-in), we additionally collect and store:</p>
          <ul>
            <li>Your Twitch display name, login, and numeric user ID</li>
            <li>OAuth access and refresh tokens, <strong>encrypted at rest</strong> using AES-256-GCM, used to subscribe to your stream&apos;s events and manage channel point rewards on your behalf</li>
            <li>The scopes you authorize (e.g. reading chat as the GameShuffle bot, managing channel point redemptions)</li>
            <li>Live session data while you&apos;re streaming: current Twitch category, viewers who opt into your randomizer lobby (their Twitch user ID and display name), and the randomized loadouts generated for each shuffle</li>
            <li>A randomly generated overlay token that powers your OBS browser source and the public lobby viewer page</li>
          </ul>
          <p>You can disconnect the Twitch integration at any time from the Twitch dashboard page. Disconnecting revokes the OAuth tokens, removes the channel point reward we created, deletes our EventSub subscriptions, and deletes the stored connection record and all session data.</p>
        </LegalSubSection>

        <LegalSubSection number="2.4" title="Information Collected Automatically">
          <p><strong>Server and infrastructure logs:</strong> Vercel, our hosting provider, collects standard server logs including IP addresses and request metadata as part of normal infrastructure operation. We do not use this data for tracking or profiling.</p>
          <p><strong>Bot protection:</strong> Cloudflare Turnstile is used on signup and login forms to detect and prevent automated abuse. It processes your IP address and browser fingerprint. It does not set cookies and is invisible to normal users.</p>
          <p><strong>Analytics:</strong> We use two analytics tools with different privacy profiles:</p>
          <ul>
            <li><strong>Plausible Analytics</strong> — cookieless, privacy-friendly analytics that collects page views and custom events without using cookies or tracking you across sites. This runs for all visitors regardless of cookie consent because it does not require consent under GDPR or CCPA by design.</li>
            <li><strong>Google Analytics (G-WBXS3D8GBL)</strong> — collects page views, events, and anonymized IP addresses. This tool uses cookies and is only loaded if you explicitly accept cookies via our consent banner.</li>
          </ul>
        </LegalSubSection>
      </>
    ),
  },
  {
    id: "how-we-use-information",
    title: "How We Use Your Information",
    content: (
      <>
        <p>We use the information we collect to:</p>
        <ul>
          <li>Create and manage your account</li>
          <li>Provide the features and functionality of the Service, including randomizers, tournament management, sessions, and competitive tools</li>
          <li>Process subscription payments and manage your GameShuffle Pro subscription if applicable</li>
          <li>Authenticate your identity and keep your account secure</li>
          <li>Display your profile information to other users where you have chosen to make it public</li>
          <li>Manage third-party platform integrations (such as Twitch and Discord) on your behalf, including maintaining authenticated connections, executing bot commands you&apos;ve configured, and managing real-time event subscriptions</li>
          <li>Save and apply your preferences, settings, and configurations across the Service</li>
          <li>Respond to your support requests and contact form submissions</li>
          <li>Send transactional emails (receipts, password resets, trial-ending notifications, account changes)</li>
          <li>Send marketing and promotional communications, only with your opt-in consent</li>
          <li>Understand how the Service is used so we can improve it (via analytics)</li>
          <li>Monitor and maintain the reliability of third-party platform integrations</li>
          <li>Enforce our Terms of Service and protect the integrity of the platform</li>
          <li>Comply with legal obligations</li>
        </ul>
        <p>We do not use your data to serve targeted advertising. We do not sell your data to third parties.</p>
      </>
    ),
  },
  {
    id: "cookies-analytics",
    title: "Cookies & Analytics",
    content: (
      <>
        <LegalSubSection number="4.1" title="What Cookies We Use">
          <p>GameShuffle uses a minimal number of cookies. For complete details, see our <a href="/cookie-policy">Cookie Policy</a>.</p>
          <Table variant="bordered" dense>
            <TableHeader>
              <TableRow>
                <TableHead>Cookie</TableHead>
                <TableHead>Purpose</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Consent required?</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>Supabase session (HTTP-only JWT)</TableCell>
                <TableCell>Keeps you logged in</TableCell>
                <TableCell>Session / refresh cycle</TableCell>
                <TableCell>No — functionally required</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Stripe checkout cookies</TableCell>
                <TableCell>Fraud prevention during payment</TableCell>
                <TableCell>Session</TableCell>
                <TableCell>No — functionally required for checkout</TableCell>
              </TableRow>
              <TableRow>
                <TableCell><code>cookieConsent</code> (localStorage)</TableCell>
                <TableCell>Remembers your cookie consent choice</TableCell>
                <TableCell>Persistent</TableCell>
                <TableCell>No — preference only</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Google Analytics cookies</TableCell>
                <TableCell>Usage analytics</TableCell>
                <TableCell>Up to 2 years</TableCell>
                <TableCell><strong>Yes — only set after consent</strong></TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </LegalSubSection>

        <LegalSubSection number="4.2" title="Cookie Consent">
          <p>On your first visit, a banner asks whether you accept analytics cookies. If you accept, Google Analytics is loaded. If you decline, only Plausible (cookieless) runs. You can use the full platform regardless of your choice — we do not gate any features behind cookie consent.</p>
        </LegalSubSection>

        <LegalSubSection number="4.3" title="Global Privacy Control">
          <p>We recognize and honor Global Privacy Control (GPC) signals. If your browser sends a GPC signal, we will treat it as a valid request to opt out of any tracking that would constitute a &ldquo;sale&rdquo; or &ldquo;share&rdquo; under applicable state privacy laws, and we will not load Google Analytics regardless of explicit cookie consent. For more information about GPC, visit <a href="https://globalprivacycontrol.org" target="_blank" rel="noopener noreferrer">globalprivacycontrol.org</a>.</p>
        </LegalSubSection>

        <LegalSubSection number="4.4" title="Opting Out">
          <ul>
            <li><strong>Google Analytics:</strong> Decline cookies via our consent banner, enable GPC in your browser, or use the <a href="https://tools.google.com/dlpage/gaoptout" target="_blank" rel="noopener noreferrer">Google Analytics Opt-Out Browser Add-On</a></li>
            <li><strong>Plausible:</strong> Plausible is cookieless and does not track you across sites. No opt-out is required.</li>
          </ul>
        </LegalSubSection>
      </>
    ),
  },
  {
    id: "data-storage-security",
    title: "Data Storage & Security",
    content: (
      <>
        <LegalSubSection number="5.1" title="Where Your Data Is Stored">
          <p>All account and application data is stored in Supabase&apos;s PostgreSQL database. Supabase is hosted on AWS infrastructure, primarily in the United States. Plausible analytics data is processed in Germany. Other data may be processed in the United States or other jurisdictions where our service providers operate.</p>
        </LegalSubSection>

        <LegalSubSection number="5.2" title="How We Protect Your Data">
          <p>We take security seriously and have implemented the following protections:</p>
          <ul>
            <li><strong>Password hashing:</strong> All passwords are bcrypt-hashed server-side by Supabase. Compromised password detection is enabled.</li>
            <li><strong>Row-Level Security (RLS):</strong> Enabled on all database tables — you can only read or write your own data unless content is explicitly public.</li>
            <li><strong>Token encryption:</strong> Sensitive tokens including third-party OAuth credentials are encrypted at rest using AES-256-GCM.</li>
            <li><strong>Session management:</strong> Handled by Supabase Auth using JWT access tokens and refresh tokens stored in HTTP-only cookies, inaccessible to JavaScript.</li>
            <li><strong>Bot protection:</strong> Cloudflare Turnstile on all authentication forms.</li>
            <li><strong>Brute force protection:</strong> Client-side lockout after failed login attempts with cooldown periods, backed by Supabase server-side rate limiting.</li>
            <li><strong>Service role key:</strong> Our server-side admin key is never exposed to the browser and is only used for specific privileged operations.</li>
            <li><strong>Email verification:</strong> Required before creating or joining tournaments.</li>
            <li><strong>Payment security:</strong> Card data is handled entirely by Stripe (PCI-DSS Level 1 certified). We never see or store full card numbers.</li>
          </ul>
          <p>No system is perfectly secure. While we work hard to protect your data, we cannot guarantee absolute security. If you believe your account has been compromised, please contact us immediately at privacy@gameshuffle.co.</p>
        </LegalSubSection>
      </>
    ),
  },
  {
    id: "third-party-services",
    title: "Third-Party Services",
    content: (
      <>
        <p>We work with the following third-party services to operate GameShuffle. Each has its own privacy practices:</p>
        <Table variant="bordered" dense>
          <TableHeader>
            <TableRow>
              <TableHead>Service</TableHead>
              <TableHead>Purpose</TableHead>
              <TableHead>Privacy Policy</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow><TableCell><strong>Supabase</strong></TableCell><TableCell>Auth, database, real-time</TableCell><TableCell><a href="https://supabase.com/privacy" target="_blank" rel="noopener noreferrer">supabase.com/privacy</a></TableCell></TableRow>
            <TableRow><TableCell><strong>Vercel</strong></TableCell><TableCell>Hosting and infrastructure</TableCell><TableCell><a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer">vercel.com/legal/privacy-policy</a></TableCell></TableRow>
            <TableRow><TableCell><strong>Stripe</strong></TableCell><TableCell>Payment processing for GameShuffle Pro</TableCell><TableCell><a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer">stripe.com/privacy</a></TableCell></TableRow>
            <TableRow><TableCell><strong>MailerSend</strong></TableCell><TableCell>Transactional email delivery</TableCell><TableCell><a href="https://www.mailersend.com/legal/privacy" target="_blank" rel="noopener noreferrer">mailersend.com/legal/privacy</a></TableCell></TableRow>
            <TableRow><TableCell><strong>Cloudflare</strong></TableCell><TableCell>Bot protection (Turnstile)</TableCell><TableCell><a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noopener noreferrer">cloudflare.com/privacypolicy</a></TableCell></TableRow>
            <TableRow><TableCell><strong>Google Analytics</strong></TableCell><TableCell>Usage analytics (with consent)</TableCell><TableCell><a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">policies.google.com/privacy</a></TableCell></TableRow>
            <TableRow><TableCell><strong>Plausible</strong></TableCell><TableCell>Cookieless analytics</TableCell><TableCell><a href="https://plausible.io/privacy" target="_blank" rel="noopener noreferrer">plausible.io/privacy</a></TableCell></TableRow>
            <TableRow><TableCell><strong>Discord</strong></TableCell><TableCell>OAuth sign-in, account linking, bot integration</TableCell><TableCell><a href="https://discord.com/privacy" target="_blank" rel="noopener noreferrer">discord.com/privacy</a></TableCell></TableRow>
            <TableRow><TableCell><strong>Twitch</strong></TableCell><TableCell>OAuth sign-in, account linking, streamer integration</TableCell><TableCell><a href="https://www.twitch.tv/p/legal/privacy-notice/" target="_blank" rel="noopener noreferrer">twitch.tv/p/legal/privacy-notice</a></TableCell></TableRow>
            <TableRow><TableCell><strong>Termly</strong></TableCell><TableCell>Privacy compliance, cookie consent banner, DSAR form</TableCell><TableCell><a href="https://termly.io/our-privacy-policy/" target="_blank" rel="noopener noreferrer">termly.io/our-privacy-policy</a></TableCell></TableRow>
            <TableRow><TableCell><strong>Sentry</strong></TableCell><TableCell>Error monitoring (where applicable)</TableCell><TableCell><a href="https://sentry.io/privacy/" target="_blank" rel="noopener noreferrer">sentry.io/privacy</a></TableCell></TableRow>
          </TableBody>
        </Table>
        <p>We have data processing agreements (DPAs) in place with all service providers handling EU/UK personal data, incorporating Standard Contractual Clauses (SCCs) where required. We are not responsible for the data practices of these third parties. We encourage you to review their privacy policies.</p>
      </>
    ),
  },
  {
    id: "public-information",
    title: "Public Information & Sharing",
    content: (
      <>
        <p>Some information on GameShuffle is visible to other users or the public:</p>
        <ul>
          <li><strong>Public profiles</strong> (<code>/u/[username]</code>) — your display name, username, and any content you choose to display publicly</li>
          <li><strong>Tournament listings</strong> — tournaments you create are publicly browsable, including their title, description, and participant list</li>
          <li><strong>Shared configurations</strong> — saved randomizer configs with a share link are accessible to anyone with the link</li>
          <li><strong>Tournament participation</strong> — your display name and registration status are visible to other tournament participants and the organizer</li>
          <li><strong>Session participation</strong> — when you join a GameShuffle session, your display name and any picks/bans you make are visible to other session participants and viewers (where the streamer has enabled the public lobby viewer)</li>
        </ul>
        <p>You control what you share. You can manage your public profile and linked accounts from your account settings at any time.</p>
      </>
    ),
  },
  {
    id: "data-retention-deletion",
    title: "Data Retention & Deletion",
    content: (
      <>
        <LegalSubSection number="8.1" title="Retention">
          <p>We retain your account data for as long as your account is active. If you delete your account, all associated data is permanently deleted immediately via cascading database constraints.</p>
          <p>For users who have subscribed to GameShuffle Pro, Stripe retains transaction records for 7 years per their own data retention policy (independent of our account deletion process), in compliance with US tax and financial recordkeeping requirements.</p>
        </LegalSubSection>

        <LegalSubSection number="8.2" title="Account Deletion">
          <p>You can delete your account at any time from your account settings. This action is:</p>
          <ul>
            <li><strong>Immediate</strong> — your account is removed right away</li>
            <li><strong>Permanent</strong> — deletion cannot be undone</li>
            <li><strong>Complete</strong> — all associated data including saved configs, tournament registrations, profile information, and integration tokens is deleted; active subscriptions are cancelled</li>
          </ul>
          <p><strong>Exception:</strong> Tournament data you created persists for other participants even after your account is deleted. Your organizer reference becomes null, but participant registrations submitted by others remain accessible to those participants.</p>
        </LegalSubSection>

        <LegalSubSection number="8.3" title="Supabase Auth Logs">
          <p>Supabase retains authentication audit logs per their own data retention policy, independent of our account deletion process.</p>
        </LegalSubSection>
      </>
    ),
  },
  {
    id: "your-rights",
    title: "Your Rights",
    content: (
      <>
        <p>Depending on where you are located, you may have the following rights regarding your personal data:</p>
        <ul>
          <li><strong>Access</strong> — view all personal data we hold about you via your account settings or by submitting a request</li>
          <li><strong>Correction</strong> — edit your profile information at any time from account settings</li>
          <li><strong>Deletion</strong> — permanently delete your account and all associated data via self-service</li>
          <li><strong>Portability</strong> — request a copy of your data in a portable format</li>
          <li><strong>Withdraw consent</strong> — decline or withdraw analytics cookie consent at any time</li>
          <li><strong>Unlink OAuth providers</strong> — disconnect Discord or Twitch from your account at any time</li>
          <li><strong>Opt out of marketing</strong> — unsubscribe from marketing emails at any time via the link in every marketing email or via account settings</li>
          <li><strong>Right to appeal</strong> — if we decline a privacy request, you may appeal by emailing privacy@gameshuffle.co</li>
        </ul>
        <p>To exercise any right not available via self-service, submit a request via our <a href="/data-request">Data Request Form</a> or contact us at privacy@gameshuffle.co. We will respond within the timeframe required by applicable law (typically 30-45 days).</p>
        <p><strong>California residents (CCPA/CPRA):</strong> We do not sell or share personal information for cross-context behavioral advertising. You have the right to know what data we collect, request deletion, request correction, and opt out of any &ldquo;sale&rdquo; or &ldquo;share&rdquo; — all available via your account settings, our Data Request Form, or by contacting us.</p>
        <p><strong>Other US state residents:</strong> Residents of Colorado, Connecticut, Delaware, Florida, Indiana, Iowa, Kentucky, Maryland, Minnesota, Montana, Nebraska, New Hampshire, New Jersey, Oregon, Rhode Island, Tennessee, Texas, Utah, and Virginia have similar rights under their respective state privacy laws.</p>
        <p><strong>EEA/UK residents (GDPR):</strong> Our legal basis for processing your data is performance of a contract (providing the Service you signed up for), legitimate interests (security, analytics, integration health), legal obligations (tax records, legal compliance), and where applicable, your consent (analytics cookies, marketing emails). You have the right to lodge a complaint with your local supervisory authority.</p>
        <p>We do not currently have an EU/UK Article 27 representative as our processing of EU/UK personal data is occasional and does not involve high-risk processing. We will appoint a representative if our EU/UK presence grows to meet the threshold.</p>
      </>
    ),
  },
  {
    id: "international-transfers",
    title: "International Data Transfers",
    content: (
      <>
        <p>Our servers are located in the United States, with some analytics processing in Germany (Plausible). Your information may be transferred to, stored by, and processed by us and our service providers in the United States, Germany, United Kingdom, Ireland, Canada, and other countries.</p>
        <p>For transfers of personal information from the EEA, UK, or Switzerland to other countries, we rely on the European Commission&apos;s Standard Contractual Clauses (SCCs) as the legal mechanism for such transfers. Our service providers incorporate SCCs in their data processing agreements with us.</p>
      </>
    ),
  },
  {
    id: "childrens-privacy",
    title: "Children's Privacy",
    content: (
      <>
        <p>GameShuffle is not directed at children under 13. We do not knowingly collect personal information from children under 13. By using the Service, you represent that you are at least 13 years old, or that you are the parent or guardian of such a minor and consent to such minor dependent&apos;s use of the Services. Users between the ages of 13 and 18 should review this Privacy Policy with a parent or guardian.</p>
        <p>If we learn that personal information from users under 13 has been collected without verifiable parental consent, we will deactivate the account and take reasonable measures to promptly delete such data from our records. If you become aware of any data we may have collected from children under 13, please contact us at privacy@gameshuffle.co.</p>
      </>
    ),
  },
  {
    id: "changes-to-policy",
    title: "Changes to This Policy",
    content: (
      <p>We may update this Privacy Policy from time to time. We will notify users of material changes by email at least 30 days before the changes take effect. Updates for new functionality, security updates, bug fixes, or court orders may take effect immediately. The Effective Date at the top of this page indicates when this Policy was last updated. Continued use of the Service after changes take effect constitutes your acceptance of the updated Policy.</p>
    ),
  },
  {
    id: "contact",
    title: "Contact",
    content: <LegalContact introLine="If you have questions about this Privacy Policy or how we handle your data, please contact us:" />,
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro="What we collect, how we use it, who we share it with, and your rights."
      effectiveDate="April 24, 2026"
      sections={SECTIONS}
      current="privacy"
    />
  );
}
