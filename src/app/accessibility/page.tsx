import type { Metadata } from "next";
import { LegalPage, LegalSubSection, LegalContact, type LegalSection } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Accessibility Statement",
  description: "GameShuffle's commitment to WCAG 2.1 Level AA accessibility, what we test, known limitations, and how to report a barrier.",
  openGraph: {
    title: "Accessibility Statement | GameShuffle",
    description: "Our WCAG 2.1 Level AA commitment, current conformance, and how to report a barrier.",
    url: "https://gameshuffle.co/accessibility",
  },
  alternates: {
    canonical: "https://gameshuffle.co/accessibility",
  },
  robots: {
    index: true,
    follow: true,
  },
};

const SECTIONS: LegalSection[] = [
  {
    id: "our-commitment",
    title: "Our Commitment",
    content: (
      <>
        <p>GameShuffle is committed to making our platform accessible to the widest possible audience, regardless of ability or technology. We strive to meet <a href="https://www.w3.org/TR/WCAG21/" target="_blank" rel="noopener noreferrer">Web Content Accessibility Guidelines (WCAG) 2.1 Level AA</a> across the entire site.</p>
        <p>Accessibility is an ongoing effort. We treat it as a first-class product concern, not a checklist — every new feature is evaluated against our accessibility commitments before it ships.</p>
      </>
    ),
  },
  {
    id: "conformance-status",
    title: "Conformance Status",
    content: (
      <>
        <p>This Accessibility Statement applies to the GameShuffle web application at <a href="https://www.gameshuffle.co">gameshuffle.co</a>, including all subpages and authenticated areas.</p>
        <p><strong>Standard targeted:</strong> WCAG 2.1, Level AA.</p>
        <p><strong>Current status:</strong> Partially conformant. Most of the site meets WCAG 2.1 AA. We have an active backlog of issues we are working through, listed under <a href="#known-limitations">Known Limitations</a> below.</p>
      </>
    ),
  },
  {
    id: "what-weve-built-in",
    title: "What We've Built In",
    content: (
      <>
        <p>The following accessibility features are implemented across the platform:</p>
        <ul>
          <li><strong>Semantic HTML.</strong> Headings, landmarks, lists, and form controls use the right elements so assistive technologies can navigate the page structure.</li>
          <li><strong>Keyboard navigation.</strong> All interactive elements (buttons, links, form fields, tabs, modals, menus) are reachable and operable using only the keyboard.</li>
          <li><strong>Visible focus indicators.</strong> Focus is always visible — we never set <code>outline: none</code> without a replacement.</li>
          <li><strong>ARIA where appropriate.</strong> Custom widgets (tabs, modals, accordions, the cookie consent banner) include the ARIA roles, states, and properties expected by screen readers.</li>
          <li><strong>Color contrast.</strong> Text and interactive elements meet or exceed WCAG 2.1 AA contrast ratios via our design system tokens.</li>
          <li><strong>Form labels and errors.</strong> Form fields have associated labels, and validation errors are announced through accessible alert regions.</li>
          <li><strong>Reduced motion respect.</strong> Animations honor the user's <code>prefers-reduced-motion</code> setting where applicable.</li>
          <li><strong>Responsive design.</strong> The site is usable at 200% zoom and on small viewports without loss of functionality.</li>
          <li><strong>Multiple sign-in options.</strong> Email/password, magic link, Discord, and Twitch sign-in let users pick the method that works best for their setup.</li>
        </ul>
      </>
    ),
  },
  {
    id: "how-we-test",
    title: "How We Test",
    content: (
      <>
        <p>We test accessibility through a combination of automated tooling and manual review:</p>
        <ul>
          <li><strong>Design system foundation.</strong> Our UI is built on CascadeDS, an internal design system whose components are designed against WCAG 2.1 AA from the ground up.</li>
          <li><strong>Automated checks.</strong> Linting catches common issues (missing alt text, invalid ARIA, etc.) at development time.</li>
          <li><strong>Keyboard pass.</strong> New flows are tested using only the keyboard before merge.</li>
          <li><strong>Screen reader spot-checks.</strong> Core flows (sign up, sign in, randomize, save config, join tournament, account settings) are periodically tested with VoiceOver on macOS and NVDA on Windows.</li>
          <li><strong>Browser zoom.</strong> Layouts are checked at 200% zoom to confirm content remains usable.</li>
          <li><strong>Real user feedback.</strong> Issues reported via the methods in <a href="#report-a-barrier">Report a Barrier</a> are triaged like product bugs.</li>
        </ul>
      </>
    ),
  },
  {
    id: "known-limitations",
    title: "Known Limitations",
    content: (
      <>
        <p>We know about the following accessibility gaps and are actively working on them:</p>
        <ul>
          <li><strong>Some images use <code>&lt;img&gt;</code> tags without optimization.</strong> A handful of icons and avatars across randomizer cards, tournament listings, and saved-config thumbnails use raw <code>&lt;img&gt;</code> elements. Alt text is present, but the bandwidth and Core Web Vitals impact is suboptimal. Tracked for migration to optimized image components.</li>
          <li><strong>Tournament drag-and-drop track ordering.</strong> The drag-and-drop track ordering UI is keyboard accessible (you can use arrow keys after focusing a track), but the keyboard interaction model is less discoverable than a fully ARIA-described listbox would be. We are evaluating a redesign.</li>
          <li><strong>Twitch streamer overlay.</strong> The OBS browser-source overlay at <code>/overlay/[token]</code> is intentionally a visual-only surface for broadcast streams; it is not designed as an accessible interface and should not be used as one.</li>
          <li><strong>Live regions during real-time updates.</strong> Some real-time updates (lounge race results, tournament participant joins) update silently for screen reader users. We plan to add polite ARIA live regions for these surfaces.</li>
          <li><strong>Captcha challenge.</strong> Sign-up and sign-in use Cloudflare Turnstile. Turnstile is generally accessible, but if you encounter a barrier with the challenge itself, please use the magic link sign-in option as an alternative or contact us.</li>
        </ul>
        <p>If you encounter an accessibility barrier that is not on this list, we want to know — see <a href="#report-a-barrier">Report a Barrier</a> below.</p>
      </>
    ),
  },
  {
    id: "compatibility",
    title: "Browser and Assistive Technology Compatibility",
    content: (
      <>
        <p>GameShuffle is designed to work with the following combinations:</p>
        <LegalSubSection number="6.1" title="Supported browsers">
          <ul>
            <li>Latest two stable versions of Chrome, Firefox, Safari, and Edge</li>
            <li>iOS Safari and Android Chrome on the two most recent OS versions</li>
          </ul>
        </LegalSubSection>
        <LegalSubSection number="6.2" title="Tested assistive technologies">
          <ul>
            <li>VoiceOver (macOS, iOS) with Safari</li>
            <li>NVDA (Windows) with Firefox and Chrome</li>
            <li>TalkBack (Android) with Chrome</li>
          </ul>
        </LegalSubSection>
        <LegalSubSection number="6.3" title="Known incompatibilities">
          <ul>
            <li>Internet Explorer is not supported.</li>
            <li>Browsers more than two major versions out of date may render parts of the site incorrectly.</li>
          </ul>
        </LegalSubSection>
      </>
    ),
  },
  {
    id: "report-a-barrier",
    title: "Report a Barrier",
    content: (
      <>
        <p>If you encounter an accessibility barrier on GameShuffle — anything that prevents you from using a feature or accessing content — we want to fix it.</p>
        <p>The fastest way to report a barrier is by email. Please include:</p>
        <ul>
          <li>The URL of the page where you ran into the issue</li>
          <li>A description of what you were trying to do</li>
          <li>The browser, operating system, and any assistive technology you were using (e.g. &ldquo;Chrome on macOS with VoiceOver&rdquo;)</li>
          <li>What happened, and what you expected to happen</li>
        </ul>
        <p>We aim to respond to accessibility reports within 5 business days, and to resolve issues based on severity. Critical barriers — anything that blocks access to an entire surface — are prioritized.</p>
      </>
    ),
  },
  {
    id: "alternative-access",
    title: "Alternative Ways to Access GameShuffle",
    content: (
      <>
        <p>If a part of the site is currently inaccessible to you and you cannot wait for a fix, please contact us using the methods below. We will work with you to provide the information or perform the action through an alternative channel — for example, by email or over a voice call — at no cost.</p>
      </>
    ),
  },
  {
    id: "feedback-and-formal-complaints",
    title: "Feedback and Formal Complaints",
    content: (
      <>
        <p>We welcome all feedback on the accessibility of GameShuffle. If you would like to make a formal complaint about accessibility, please email us at the address in the <a href="#contact">Contact</a> section. We will acknowledge receipt within 5 business days and respond substantively within 30 days.</p>
        <p>If you are a resident of a jurisdiction with an accessibility regulator and you are not satisfied with our response, you may have the right to escalate your complaint to that regulator. We will provide guidance on this process if requested.</p>
      </>
    ),
  },
  {
    id: "updates-to-this-statement",
    title: "Updates to This Statement",
    content: (
      <p>We will update this Accessibility Statement when we make material changes to the platform that affect accessibility, when we resolve items from the <a href="#known-limitations">Known Limitations</a> list, or at least once per year. The Effective Date at the top of this page indicates when this statement was last updated.</p>
    ),
  },
  {
    id: "contact",
    title: "Contact",
    content: (
      <LegalContact
        introLine="To report an accessibility barrier, request information in an alternative format, or ask any question about this statement:"
        email="support@gameshuffle.co"
        roleTitle="Britton Lorentzen, Accessibility Contact"
        showDataRequestLink={false}
      />
    ),
  },
];

export default function AccessibilityPage() {
  return (
    <LegalPage
      title="Accessibility Statement"
      intro="Our commitment to WCAG 2.1 Level AA, what we've built in, where we know we fall short, and how to tell us when we miss the mark."
      effectiveDate="April 26, 2026"
      sections={SECTIONS}
      current="accessibility"
    />
  );
}
