import type { Metadata } from "next";
import { Container } from "@empac/cascadeds";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Read the GameShuffle Terms of Service. Covers account usage, user content, tournaments, intellectual property, and your rights as a user.",
  openGraph: {
    title: "Terms of Service | GameShuffle",
    description: "GameShuffle Terms of Service — account usage, tournaments, and your rights.",
    url: "https://gameshuffle.co/terms",
  },
  alternates: {
    canonical: "https://gameshuffle.co/terms",
  },
  robots: {
    index: true,
    follow: false,
  },
};

export default function TermsPage() {
  return (
    <main style={{ paddingTop: "3rem", paddingBottom: "3rem" }}>
      <Container>
        <div className="legal-page">
          <h1 className="legal-page__title">Terms of Service</h1>
          <p className="legal-page__effective">
            <strong>Effective Date:</strong> March 26, 2026<br />
            <strong>Operator:</strong> Empac (empac.co)<br />
            <strong>Platform:</strong> GameShuffle (gameshuffle.co)
          </p>

          <section id="acceptance-of-terms" className="legal-page__section">
            <h2>1. Acceptance of Terms</h2>
            <p>By accessing or using GameShuffle (&ldquo;the Service,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;), you agree to be bound by these Terms of Service (&ldquo;Terms&rdquo;). If you do not agree to these Terms, do not use the Service.</p>
            <p>These Terms constitute a legally binding agreement between you and Empac, the operator of GameShuffle. By creating an account, using any feature of the platform, or simply browsing the site, you acknowledge that you have read, understood, and agree to be bound by these Terms and our <a href="/privacy">Privacy Policy</a>, which is incorporated herein by reference.</p>
            <p>We reserve the right to update these Terms at any time. We will notify you of material changes by updating the Effective Date above. Continued use of the Service after changes constitutes acceptance of the updated Terms.</p>
          </section>

          <section id="eligibility-accounts" className="legal-page__section">
            <h2>2. Eligibility &amp; User Accounts</h2>

            <h3>2.1 Age Requirements</h3>
            <p>You must be at least 13 years of age to use GameShuffle. If you are under 18, you represent that you have your parent or guardian&apos;s permission to use the Service. Certain features — including content marked as 21+ — are restricted to users who are 21 years of age or older and have completed the applicable verification step.</p>

            <h3>2.2 Account Registration</h3>
            <p>To access certain features, you must create an account. You may register using an email address and password, or by connecting a supported third-party OAuth provider (Discord or Twitch). You agree to:</p>
            <ul>
              <li>Provide accurate, current, and complete information during registration</li>
              <li>Maintain the security of your password and account credentials</li>
              <li>Notify us immediately of any unauthorized access to your account</li>
              <li>Take responsibility for all activity that occurs under your account</li>
            </ul>
            <p>We reserve the right to suspend or terminate accounts that contain inaccurate information or that we determine, in our sole discretion, to be fraudulent or in violation of these Terms.</p>

            <h3>2.3 Account Security</h3>
            <p>GameShuffle uses industry-standard security practices including bcrypt password hashing, Cloudflare Turnstile bot protection, rate limiting, and Supabase&apos;s Row-Level Security (RLS) to protect your data. You are responsible for maintaining the confidentiality of your login credentials. We are not liable for any loss resulting from unauthorized use of your account.</p>

            <h3>2.4 Account Deletion</h3>
            <p>You may delete your account at any time from your account settings. Deletion is immediate and permanent. All associated data — including saved configurations, tournament registrations, and profile information — is deleted via cascading database constraints. This action cannot be undone.</p>
          </section>

          <section id="use-of-service" className="legal-page__section">
            <h2>3. Use of the Service</h2>

            <h3>3.1 Permitted Use</h3>
            <p>GameShuffle is a game night companion platform providing randomizers, tournament management tools, competitive resources, and related content. You may use the Service for personal, non-commercial purposes in accordance with these Terms.</p>

            <h3>3.2 Acceptable Use</h3>
            <p>You agree not to use the Service to:</p>
            <ul>
              <li>Violate any applicable law or regulation</li>
              <li>Impersonate any person or entity, or misrepresent your affiliation with any person or entity</li>
              <li>Upload, post, or transmit any content that is unlawful, harmful, threatening, abusive, harassing, defamatory, vulgar, obscene, or otherwise objectionable</li>
              <li>Interfere with or disrupt the integrity or performance of the Service or its servers</li>
              <li>Attempt to gain unauthorized access to any portion of the Service or any related systems</li>
              <li>Use automated scripts, bots, scrapers, or other tools to access or collect data from the Service without our express written permission</li>
              <li>Engage in any activity that places an unreasonable or disproportionately large load on our infrastructure</li>
              <li>Use the Service in any manner that could harm minors</li>
              <li>Use the Service to send spam, unsolicited communications, or promotional materials</li>
            </ul>

            <h3>3.3 Beta Features</h3>
            <p>Certain features — including the Competitive Hub and Tournament tools — are marked as Beta. Beta features are provided as-is, may contain bugs, and may change or be discontinued at any time without notice. We make no guarantees regarding the availability or performance of Beta features.</p>

            <h3>3.4 Tournaments</h3>
            <p>When you create a tournament on GameShuffle, you are acting as the organizer and are solely responsible for managing that tournament, communicating with participants, and ensuring the experience is conducted fairly and in accordance with these Terms. GameShuffle provides the tools; we are not a party to any tournament you organize.</p>
            <p>Tournament data — including participant registrations submitted by others — persists even if the organizing account is deleted. The organizer reference becomes null, but participant data remains accessible to those participants.</p>
          </section>

          <section id="user-generated-content" className="legal-page__section">
            <h2>4. User-Generated Content</h2>

            <h3>4.1 Your Content</h3>
            <p>GameShuffle allows you to create and share content including tournament listings, saved randomizer configurations, and public profiles (&ldquo;User Content&rdquo;). You retain ownership of any User Content you submit.</p>

            <h3>4.2 License to Us</h3>
            <p>By submitting User Content, you grant Empac a worldwide, non-exclusive, royalty-free license to use, store, display, reproduce, and distribute that content solely for the purpose of operating and improving the Service. This license ends when you delete your content or your account, except where your content has been shared with others (e.g., a publicly shared tournament or configuration link) and removing it would affect their experience.</p>

            <h3>4.3 Content Standards</h3>
            <p>You agree that your User Content will not:</p>
            <ul>
              <li>Infringe any third-party intellectual property rights</li>
              <li>Contain personal information of others without their consent</li>
              <li>Contain content that is hateful, discriminatory, or harassing</li>
              <li>Violate any applicable law</li>
            </ul>
            <p>We reserve the right to remove any User Content that violates these Terms without prior notice.</p>
          </section>

          <section id="intellectual-property" className="legal-page__section">
            <h2>5. Intellectual Property</h2>

            <h3>5.1 Our Property</h3>
            <p>GameShuffle, its design, features, code, branding, and all content we produce are owned by Empac and protected by applicable intellectual property laws. You may not copy, modify, distribute, sell, or lease any part of our Service without our written permission.</p>

            <h3>5.2 Third-Party Game IP</h3>
            <p>GameShuffle references game titles, characters, and assets owned by third parties (including Nintendo, Sony, Microsoft, and others) for informational and fan-community purposes. GameShuffle is not affiliated with, endorsed by, or officially connected to any game publisher. All third-party trademarks and intellectual property belong to their respective owners.</p>

            <h3>5.3 Feedback</h3>
            <p>If you submit feedback, suggestions, or ideas about the Service, you grant us the right to use that feedback without compensation or attribution to you.</p>
          </section>

          <section id="third-party-services" className="legal-page__section">
            <h2>6. Third-Party Services</h2>
            <p>GameShuffle integrates with several third-party services to operate. By using the Service, you acknowledge that your use may be subject to the terms and privacy policies of those services, including:</p>
            <ul>
              <li><strong>Supabase</strong> — database, authentication, and real-time features</li>
              <li><strong>Vercel</strong> — hosting and infrastructure</li>
              <li><strong>Cloudflare Turnstile</strong> — bot and spam protection</li>
              <li><strong>Google Analytics</strong> — usage analytics (loaded only with your consent)</li>
              <li><strong>Plausible</strong> — cookieless usage analytics</li>
              <li><strong>Discord</strong> — OAuth sign-in and account linking</li>
              <li><strong>Twitch</strong> — OAuth sign-in and account linking</li>
              <li><strong>JotForm</strong> — contact form</li>
            </ul>
            <p>We are not responsible for the practices or content of these third-party services.</p>
          </section>

          <section id="disclaimers-liability" className="legal-page__section">
            <h2>7. Disclaimers &amp; Limitation of Liability</h2>

            <h3>7.1 Service Provided As-Is</h3>
            <p className="legal-page__caps">THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE&rdquo; WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED. TO THE FULLEST EXTENT PERMITTED BY LAW, EMPAC DISCLAIMS ALL WARRANTIES, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.</p>
            <p>We do not warrant that the Service will be uninterrupted, error-free, or free of harmful components. We do not warrant that any content on the Service is accurate, complete, or up to date.</p>

            <h3>7.2 Limitation of Liability</h3>
            <p className="legal-page__caps">TO THE FULLEST EXTENT PERMITTED BY APPLICABLE LAW, EMPAC SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO LOSS OF PROFITS, DATA, GOODWILL, OR OTHER INTANGIBLE LOSSES, ARISING OUT OF OR IN CONNECTION WITH YOUR USE OF OR INABILITY TO USE THE SERVICE.</p>
            <p className="legal-page__caps">IN NO EVENT SHALL EMPAC&apos;S TOTAL LIABILITY TO YOU EXCEED THE GREATER OF (A) THE AMOUNT YOU PAID US IN THE TWELVE MONTHS PRIOR TO THE CLAIM, OR (B) ONE HUNDRED DOLLARS ($100).</p>

            <h3>7.3 Indemnification</h3>
            <p>You agree to indemnify and hold harmless Empac and its officers, employees, and contractors from any claims, damages, losses, or expenses (including reasonable legal fees) arising out of your use of the Service, your User Content, or your violation of these Terms.</p>
          </section>

          <section id="termination" className="legal-page__section">
            <h2>8. Termination</h2>

            <h3>8.1 By You</h3>
            <p>You may stop using the Service and delete your account at any time.</p>

            <h3>8.2 By Us</h3>
            <p>We reserve the right to suspend or permanently terminate your access to the Service at any time, with or without notice, if we believe you have violated these Terms or if we determine your use poses a risk to other users or the platform.</p>

            <h3>8.3 Effect of Termination</h3>
            <p>Upon termination, your right to use the Service immediately ceases. Provisions of these Terms that by their nature should survive termination — including intellectual property rights, disclaimers, and limitation of liability — will survive.</p>
          </section>

          <section id="changes-to-service" className="legal-page__section">
            <h2>9. Changes to the Service</h2>
            <p>We reserve the right to modify, suspend, or discontinue any part of the Service at any time without liability to you. We may add, remove, or change features — including Beta features — without prior notice. We will make reasonable efforts to communicate significant changes in advance when possible.</p>
          </section>

          <section id="governing-law" className="legal-page__section">
            <h2>10. Governing Law &amp; Disputes</h2>
            <p>These Terms are governed by the laws of the State of Washington, United States, without regard to its conflict of law provisions. Any disputes arising from these Terms or your use of the Service shall be resolved in the courts located in Pierce County, Washington.</p>
            <p>If you have a dispute with us, we encourage you to contact us first so we can try to resolve it informally.</p>
          </section>

          <section id="contact" className="legal-page__section">
            <h2>11. Contact</h2>
            <p>If you have questions about these Terms, please contact us:</p>
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
