import type { Metadata } from "next";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@empac/cascadeds";
import { LegalPage, LegalSubSection, LegalContact, type LegalSection } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Cookie Policy",
  description: "How GameShuffle uses cookies and similar technologies. Cookieless analytics by default, no advertising or cross-site tracking, GPC honored.",
  openGraph: {
    title: "Cookie Policy | GameShuffle",
    description: "How GameShuffle uses cookies — cookieless analytics by default, no advertising or cross-site tracking.",
    url: "https://gameshuffle.co/cookie-policy",
  },
  alternates: {
    canonical: "https://gameshuffle.co/cookie-policy",
  },
  robots: {
    index: true,
    follow: false,
  },
};

const SECTIONS: LegalSection[] = [
  {
    id: "about-this-cookie-policy",
    title: "About This Cookie Policy",
    content: (
      <>
        <p>This Cookie Policy explains how GameShuffle uses cookies and similar technologies when you visit our website at gameshuffle.co. It explains what these technologies are, why we use them, and your rights to control our use of them.</p>
        <p>This Cookie Policy supplements our <a href="/privacy">Privacy Policy</a> and should be read together with it.</p>
      </>
    ),
  },
  {
    id: "what-are-cookies",
    title: "What Are Cookies?",
    content: (
      <>
        <p>Cookies are small text files placed on your computer or mobile device when you visit a website. They are widely used to make websites work, work more efficiently, and provide reporting information to website owners.</p>
        <p>Cookies set by the website owner (in our case, GameShuffle) are called &ldquo;first-party cookies.&rdquo; Cookies set by parties other than the website owner are called &ldquo;third-party cookies.&rdquo; Third-party cookies enable third-party features or functionality on or through the website (such as analytics).</p>
        <p>In addition to cookies, websites may use similar technologies including local storage (such as <code>localStorage</code> and <code>sessionStorage</code>), HTTP-only authentication tokens, and beacons or pixels. We refer to all of these collectively as &ldquo;cookies&rdquo; throughout this policy.</p>
      </>
    ),
  },
  {
    id: "why-do-we-use-cookies",
    title: "Why Do We Use Cookies?",
    content: (
      <>
        <p>We use cookies for several reasons:</p>
        <ul>
          <li><strong>Strictly necessary:</strong> Some cookies are required for the Service to function, including authentication, security, and session management. These cannot be disabled.</li>
          <li><strong>Functional preferences:</strong> Some cookies remember choices you make to provide a personalized experience.</li>
          <li><strong>Analytics:</strong> Some cookies help us understand how visitors use the Service so we can improve it. Analytics cookies require your consent before being set.</li>
        </ul>
        <p>We do not use cookies for advertising, retargeting, or cross-site tracking.</p>
      </>
    ),
  },
  {
    id: "cookies-we-use",
    title: "Cookies We Use",
    content: (
      <>
        <p>The table below lists the cookies and similar technologies in use on GameShuffle. The exact cookies set may vary depending on the pages you visit and features you use.</p>
        <Table variant="bordered" dense>
          <TableHeader>
            <TableRow>
              <TableHead>Cookie / Storage</TableHead>
              <TableHead>Purpose</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Consent Required</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>Supabase session token</TableCell>
              <TableCell>Authentication — keeps you logged in</TableCell>
              <TableCell>First-party HTTP-only cookie (JWT)</TableCell>
              <TableCell>Session / refresh cycle</TableCell>
              <TableCell>No — strictly necessary</TableCell>
            </TableRow>
            <TableRow>
              <TableCell><code>cookieConsent</code></TableCell>
              <TableCell>Stores your cookie consent preference</TableCell>
              <TableCell>First-party <code>localStorage</code></TableCell>
              <TableCell>Persistent until cleared</TableCell>
              <TableCell>No — preference only</TableCell>
            </TableRow>
            <TableRow>
              <TableCell><code>__stripe_mid</code>, <code>__stripe_sid</code></TableCell>
              <TableCell>Stripe fraud prevention during checkout</TableCell>
              <TableCell>Third-party (set by Stripe)</TableCell>
              <TableCell>Session to 1 year</TableCell>
              <TableCell>No — strictly necessary for payment</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Vercel infrastructure cookies</TableCell>
              <TableCell>Hosting infrastructure (routing, security)</TableCell>
              <TableCell>First-party</TableCell>
              <TableCell>Session</TableCell>
              <TableCell>No — strictly necessary</TableCell>
            </TableRow>
            <TableRow>
              <TableCell><code>_ga</code>, <code>_ga_*</code>, <code>_gid</code></TableCell>
              <TableCell>Google Analytics — site usage analytics</TableCell>
              <TableCell>Third-party (set by Google)</TableCell>
              <TableCell>Up to 2 years</TableCell>
              <TableCell><strong>Yes — only set after consent</strong></TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Cloudflare Turnstile challenge</TableCell>
              <TableCell>Bot protection on signup/login forms</TableCell>
              <TableCell>Third-party (set by Cloudflare)</TableCell>
              <TableCell>Session</TableCell>
              <TableCell>No — strictly necessary for security</TableCell>
            </TableRow>
          </TableBody>
        </Table>

        <LegalSubSection number="4.1" title="Cookies We Don't Use">
          <p>We want to be clear about what we don&apos;t do:</p>
          <ul>
            <li><strong>No advertising cookies</strong> — we don&apos;t run advertisements on GameShuffle</li>
            <li><strong>No retargeting cookies</strong> — we don&apos;t track you across other websites</li>
            <li><strong>No social media tracking pixels</strong> — Facebook Pixel, TikTok Pixel, and similar tools are not used</li>
            <li><strong>No cross-site behavioral tracking</strong></li>
            <li><strong>Plausible Analytics</strong> runs on GameShuffle and is <strong>cookieless by design</strong> — it provides analytics without setting any cookies or using any local storage</li>
          </ul>
        </LegalSubSection>
      </>
    ),
  },
  {
    id: "how-to-manage-cookies",
    title: "How to Manage Cookies",
    content: (
      <>
        <LegalSubSection number="5.1" title="Cookie Consent Banner">
          <p>When you first visit GameShuffle, a banner asks whether you accept analytics cookies. Your options:</p>
          <ul>
            <li><strong>Accept:</strong> Google Analytics is loaded for usage tracking</li>
            <li><strong>Decline:</strong> Only strictly necessary cookies and Plausible (cookieless) are used</li>
          </ul>
          <p>You can change your preference at any time using the &ldquo;Manage Cookie Preferences&rdquo; link in our footer or by clearing the <code>cookieConsent</code> value from your browser&apos;s local storage.</p>
        </LegalSubSection>

        <LegalSubSection number="5.2" title="Global Privacy Control (GPC)">
          <p>We recognize and honor Global Privacy Control (GPC) signals. If your browser sends a GPC signal, we will treat it as a valid request to opt out of any tracking that would constitute a &ldquo;sale&rdquo; or &ldquo;share&rdquo; under applicable state privacy laws. We will not load Google Analytics if GPC is detected, regardless of explicit cookie consent.</p>
          <p>For more information about GPC, visit <a href="https://globalprivacycontrol.org" target="_blank" rel="noopener noreferrer">globalprivacycontrol.org</a>.</p>
        </LegalSubSection>

        <LegalSubSection number="5.3" title="Browser Controls">
          <p>Most web browsers allow you to control cookies through their settings. The means of refusing cookies through your web browser controls vary from browser to browser. Please visit your browser&apos;s help menu for more information:</p>
          <ul>
            <li><a href="https://support.google.com/chrome/answer/95647" target="_blank" rel="noopener noreferrer">Chrome</a></li>
            <li><a href="https://support.mozilla.org/en-US/kb/cookies-information-websites-store-on-your-computer" target="_blank" rel="noopener noreferrer">Firefox</a></li>
            <li><a href="https://support.apple.com/guide/safari/manage-cookies-sfri11471/mac" target="_blank" rel="noopener noreferrer">Safari</a></li>
            <li><a href="https://support.microsoft.com/en-us/microsoft-edge/delete-cookies-in-microsoft-edge-63947406-40ac-c3b8-57b9-2a946a29ae09" target="_blank" rel="noopener noreferrer">Edge</a></li>
            <li><a href="https://help.opera.com/en/latest/web-preferences/" target="_blank" rel="noopener noreferrer">Opera</a></li>
          </ul>
        </LegalSubSection>

        <LegalSubSection number="5.4" title="Opting Out of Specific Services">
          <ul>
            <li><strong>Google Analytics:</strong> Decline cookies via our consent banner, enable GPC in your browser, or install the <a href="https://tools.google.com/dlpage/gaoptout" target="_blank" rel="noopener noreferrer">Google Analytics Opt-Out Browser Add-On</a></li>
            <li><strong>Plausible:</strong> No opt-out is required as Plausible does not use cookies or track you across sites</li>
          </ul>
          <p>If you choose to disable cookies, you can still use GameShuffle, but some functionality may be limited (for example, you will need to log in again on each visit).</p>
        </LegalSubSection>
      </>
    ),
  },
  {
    id: "third-parties-that-set-cookies",
    title: "Third Parties That Set Cookies",
    content: (
      <>
        <p>The third parties listed below may set cookies on our website for the purposes described in our <a href="/privacy">Privacy Policy</a>:</p>
        <ul>
          <li><strong>Stripe</strong> — payment processing fraud prevention (<a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer">Stripe Privacy</a>)</li>
          <li><strong>Google Analytics</strong> — usage analytics with consent (<a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">Google Privacy</a>)</li>
          <li><strong>Cloudflare</strong> — bot protection via Turnstile (<a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noopener noreferrer">Cloudflare Privacy</a>)</li>
        </ul>
      </>
    ),
  },
  {
    id: "updates-to-this-cookie-policy",
    title: "Updates to This Cookie Policy",
    content: (
      <p>We may update this Cookie Policy from time to time to reflect changes in our cookie use, technology, or applicable law. We will notify users of material changes by email at least 30 days before the changes take effect. The Effective Date at the top of this page indicates when this Cookie Policy was last updated.</p>
    ),
  },
  {
    id: "contact",
    title: "Contact",
    content: <LegalContact introLine="If you have any questions about our use of cookies, please contact us:" />,
  },
];

export default function CookiePolicyPage() {
  return (
    <LegalPage
      title="Cookie Policy"
      intro="How GameShuffle uses cookies and similar technologies — what we set, why, and how to control them."
      effectiveDate="April 24, 2026"
      sections={SECTIONS}
      current="cookie-policy"
    />
  );
}
