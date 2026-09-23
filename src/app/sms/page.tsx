import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSubSection, type LegalSection } from "@/components/legal/LegalPage";

/**
 * Public SMS program page.
 *
 * GameShuffle's real opt-in lives in account settings, behind a login, which a
 * carrier reviewing a toll-free registration cannot reach. This page is the
 * public record of that program: the exact consent language, the disclosures,
 * and a faithful rendering of the form a signed-in user sees. It is the URL we
 * give as opt-in proof, and it is useful to recipients on its own terms.
 */

export const metadata: Metadata = {
  title: "Text Messages (SMS)",
  description: "How GameShuffle text messages work: what we send, how you opt in and out, message frequency, and rates. We never sell or share your number.",
  openGraph: {
    title: "GameShuffle Text Messages (SMS)",
    description: "What we text, how to opt in and out, frequency and rates.",
    url: "https://www.gameshuffle.co/sms",
  },
  alternates: { canonical: "https://www.gameshuffle.co/sms" },
  robots: { index: true, follow: true },
};

/** A faithful, non-interactive rendering of the opt-in as it appears in-app. */
function OptInPreview() {
  return (
    <div className="sms-optin" role="img" aria-label="The GameShuffle text message opt-in form as it appears in your account settings">
      <p className="sms-optin__caption">Account &rarr; Security &rarr; Text messages</p>

      <label className="sms-optin__label" htmlFor="sms-preview-phone">Mobile phone number</label>
      <div className="sms-optin__field" id="sms-preview-phone">(555) 123&ndash;4567</div>

      <p className="sms-optin__body">
        Add a US mobile number for GameShuffle event reminders and messages from organizers. We&apos;ll text a
        code to confirm it&apos;s yours, and you pick which texts you want next.
      </p>

      <ul className="sms-optin__checks">
        <li><span className="sms-optin__box" aria-hidden /> <strong>Event reminders</strong> &mdash; a text before an event you registered for.</li>
        <li><span className="sms-optin__box" aria-hidden /> <strong>Messages from organizers</strong> &mdash; when the host of an event you joined messages attendees.</li>
        <li><span className="sms-optin__box sms-optin__box--fixed" aria-hidden /> <strong>Account security</strong> &mdash; verification codes and security alerts. On while a number is saved.</li>
      </ul>

      <p className="sms-optin__fine">
        <strong>Message frequency:</strong> varies with the events you join. Most people get a few texts a month.<br />
        <strong>Standard rates:</strong> message and data rates may apply.<br />
        <strong>Help &amp; Stop:</strong> reply HELP for help, STOP to cancel at any time.<br />
        By adding your number and ticking a box above, you agree to receive automated text messages from
        GameShuffle. Consent is not required to use GameShuffle or to buy anything.{" "}
        <Link href="/terms">Terms of Service</Link> | <Link href="/privacy#text-messages">Privacy Policy</Link>
      </p>

      <div className="sms-optin__submit">Save my number</div>
      <p className="sms-optin__note">Shown for reference. The live form is in your account settings once you sign in.</p>
    </div>
  );
}

const SECTIONS: LegalSection[] = [
  {
    id: "what-we-send",
    title: "What We Text",
    content: (
      <>
        <p>Text messaging is optional. GameShuffle works fully without a phone number, and we never ask for one at signup.</p>
        <p>There are only three things we will ever text you, and you choose the first two:</p>
        <ul>
          <li><strong>Event reminders</strong> &mdash; a message before a game night or tournament you registered for.</li>
          <li><strong>Messages from organizers</strong> &mdash; when the host of an event you joined messages everyone attending. Organizers never see your phone number.</li>
          <li><strong>Account security</strong> &mdash; verification codes and alerts about your own account, such as a password change. These are sent while you have a confirmed number saved, because an alert about a change you did not make is one you want even if you turned everything else off.</li>
        </ul>
        <p><strong>We do not send marketing or promotional text messages.</strong></p>
      </>
    ),
  },
  {
    id: "how-to-opt-in",
    title: "How You Opt In",
    content: (
      <>
        <p>You add your own number in your account settings and confirm it with a one-time code we text to it. Nothing else is sent to a number until that confirmation succeeds. Then you tick the categories you want. Nothing optional is ticked for you.</p>
        <OptInPreview />
      </>
    ),
  },
  {
    id: "how-to-opt-out",
    title: "How You Opt Out",
    content: (
      <>
        <LegalSubSection number="3.1" title="From Your Phone">
          <p>Reply <strong>STOP</strong> to any message to stop all texts from GameShuffle. Reply <strong>HELP</strong> for help. Both are honored immediately by our carrier, and we mirror the change in your account.</p>
        </LegalSubSection>
        <LegalSubSection number="3.2" title="From Your Account">
          <p>Turn any category off, or remove your number entirely, in your account settings. Opting out never affects your account, your events, or anything else you can do on GameShuffle.</p>
        </LegalSubSection>
      </>
    ),
  },
  {
    id: "frequency-and-rates",
    title: "Frequency, Rates and Carriers",
    content: (
      <>
        <p><strong>Message frequency varies</strong> with the events you join. If you have no upcoming events, most months you will get nothing at all.</p>
        <p><strong>Message and data rates may apply</strong>, depending on your mobile plan.</p>
        <p>Carriers are not liable for delayed or undelivered messages. US numbers only at this time.</p>
      </>
    ),
  },
  {
    id: "your-number",
    title: "What We Do With Your Number",
    content: (
      <>
        <p><strong>We do not sell, rent, or share your mobile number or your SMS consent with anyone for their own marketing, and we never share it with third parties or affiliates for marketing purposes.</strong></p>
        <p>Your number is shared only with Twilio, the carrier service that delivers the message for us, and only to deliver a message you asked for. Full detail is in our <Link href="/privacy#text-messages">Privacy Policy</Link>.</p>
        <p>Questions about texts: <a href="mailto:support@gameshuffle.co">support@gameshuffle.co</a>.</p>
      </>
    ),
  },
];

export default function SmsPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Text Messages (SMS)"
      intro="What GameShuffle texts, how you turn it on and off, and what we do with your number."
      effectiveDate="September 23, 2026"
      sections={SECTIONS}
      current="privacy"
    />
  );
}
