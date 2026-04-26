import type { Metadata } from "next";
import { LegalPage, LegalSubSection, LegalContact, type LegalSection } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Read the GameShuffle Terms of Service. Covers account usage, GameShuffle Pro subscriptions, user content, tournaments, intellectual property, dispute resolution, and your rights as a user.",
  openGraph: {
    title: "Terms of Service | GameShuffle",
    description: "GameShuffle Terms of Service — accounts, subscriptions, tournaments, and your rights.",
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

const SECTIONS: LegalSection[] = [
  {
    id: "acceptance-of-terms",
    title: "Acceptance of Terms",
    content: (
      <>
        <p>By accessing or using GameShuffle (the &ldquo;Service,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;), you agree to be bound by these Terms of Service (&ldquo;Terms&rdquo;). If you do not agree to these Terms, do not use the Service.</p>
        <p>These Terms constitute a legally binding agreement between you and Britton Lorentzen, doing business as Empac and GameShuffle, a sole proprietorship registered in the State of Washington with a registered business address at 4904 168th Ave E, Lake Tapps, WA 98391. By creating an account, using any feature of the platform, or simply browsing the site, you acknowledge that you have read, understood, and agree to be bound by these Terms and our <a href="/privacy">Privacy Policy</a>, which is incorporated herein by reference.</p>
        <p>GameShuffle is a coordination and session management platform for game nights and live streaming. The Service organizes multiplayer game sessions, randomizes game-related selections (such as character or track combinations), facilitates participant interaction through third-party integrations (including Twitch and Discord), and manages live streaming overlays. GameShuffle does not provide, distribute, or grant access to any third-party intellectual property, including video games, characters, or game content. Users are responsible for legally owning or accessing any games they play in connection with the Service.</p>
        <p>We will provide users with at least 30 days&apos; prior notice before any material changes to these Terms take effect. Updates for new functionality, security updates, bug fixes, or to comply with a court order may take effect immediately. Continued use of the Service after changes take effect constitutes your acceptance of the updated Terms.</p>
      </>
    ),
  },
  {
    id: "eligibility-accounts",
    title: "Eligibility & User Accounts",
    content: (
      <>
        <LegalSubSection number="2.1" title="Age Requirements">
          <p>You must be at least 13 years of age to use GameShuffle. If you are under 18, you represent that you have your parent or guardian&apos;s permission to use the Service. Certain features may be restricted to users who are 18 or 21 years of age or older. The Services are not directed at children under 13.</p>
        </LegalSubSection>
        <LegalSubSection number="2.2" title="Account Registration">
          <p>To access certain features, you must create an account. You may register using an email address and password, or by connecting a supported third-party OAuth provider (Discord or Twitch). You agree to:</p>
          <ul>
            <li>Provide accurate, current, and complete information during registration</li>
            <li>Maintain the security of your password and account credentials</li>
            <li>Notify us immediately of any unauthorized access to your account</li>
            <li>Take responsibility for all activity that occurs under your account</li>
          </ul>
          <p>We reserve the right to suspend or terminate accounts that contain inaccurate information or that we determine, in our sole discretion, to be fraudulent or in violation of these Terms.</p>
        </LegalSubSection>
        <LegalSubSection number="2.3" title="Account Security">
          <p>GameShuffle uses industry-standard security practices including bcrypt password hashing, Cloudflare Turnstile bot protection, rate limiting, AES-256-GCM encryption for sensitive tokens, and Supabase&apos;s Row-Level Security (RLS) to protect your data. You are responsible for maintaining the confidentiality of your login credentials. We are not liable for any loss resulting from unauthorized use of your account.</p>
        </LegalSubSection>
        <LegalSubSection number="2.4" title="Account Deletion">
          <p>You may delete your account at any time from your account settings. Deletion is immediate and permanent. All associated data — including saved configurations, tournament registrations, profile information, and integration tokens — is deleted via cascading database constraints. Active subscriptions are cancelled. This action cannot be undone.</p>
        </LegalSubSection>
      </>
    ),
  },
  {
    id: "use-of-service",
    title: "Use of the Service",
    content: (
      <>
        <LegalSubSection number="3.1" title="Permitted Use">
          <p>GameShuffle provides randomizers, tournament management tools, GameShuffle sessions, competitive resources, and related content. You may use the Service for personal or internal business purposes in accordance with these Terms.</p>
        </LegalSubSection>
        <LegalSubSection number="3.2" title="Beta Features">
          <p>Certain features — including but not limited to the Competitive Hub and Tournament tools — may be marked as Beta. Beta features are provided as-is, may contain bugs, and may change or be discontinued at any time without notice. We make no guarantees regarding the availability or performance of Beta features.</p>
        </LegalSubSection>
        <LegalSubSection number="3.3" title="Tournaments and Sessions">
          <p>When you create a tournament or GameShuffle session, you are acting as the organizer or host and are solely responsible for managing it, communicating with participants, and ensuring the experience is conducted fairly and in accordance with these Terms. GameShuffle provides the tools; we are not a party to any tournament or session you organize.</p>
          <p>Tournament data — including participant registrations submitted by others — persists even if the organizing account is deleted. The organizer reference becomes null, but participant data remains accessible to those participants.</p>
        </LegalSubSection>
      </>
    ),
  },
  {
    id: "prohibited-activities",
    title: "Prohibited Activities",
    content: (
      <>
        <p>You agree not to use the Service to:</p>
        <ul>
          <li>Violate any applicable law or regulation</li>
          <li>Impersonate any person or entity, or misrepresent your affiliation with any person or entity</li>
          <li>Upload, post, or transmit any content that is unlawful, harmful, threatening, abusive, harassing, defamatory, vulgar, obscene, or otherwise objectionable</li>
          <li>Use the Service to harass, abuse, threaten, or otherwise harm other users</li>
          <li>Interfere with or disrupt the integrity or performance of the Service or its servers, including by uploading malicious code, attempting to overwhelm system resources, or circumventing security measures</li>
          <li>Attempt to gain unauthorized access to any portion of the Service or any related systems</li>
          <li>Use automated means (bots, scrapers, or similar tools) to access or collect data from the Service except as expressly permitted</li>
          <li>Engage in any activity that places an unreasonable or disproportionately large load on our infrastructure</li>
          <li>Use the Service in any manner that could harm minors</li>
          <li>Use the Service to send spam, unsolicited communications, or promotional materials</li>
          <li>Use the Service to advertise or offer to sell goods and services</li>
          <li>Sell or otherwise transfer your profile or account</li>
          <li>Attempt to bypass subscription tier restrictions, circumvent payment, or access GameShuffle Pro features without an active paid subscription</li>
          <li>Use the Service to violate the Terms of Service of any integrated third-party platform, including Twitch, Discord, or any other platform to which the Services connect</li>
          <li>Use the Service in a manner that violates the rights of any third party, including intellectual property rights, privacy rights, or publicity rights</li>
          <li>Reverse engineer, decompile, or attempt to derive the source code of any part of the Service</li>
        </ul>
        <p>Violation of these terms may result in immediate suspension or termination of your account and may subject you to civil or criminal liability.</p>
      </>
    ),
  },
  {
    id: "pro-subscription",
    title: "GameShuffle Pro Subscription",
    content: (
      <>
        <LegalSubSection number="5.1" title="Subscription Plans">
          <p>GameShuffle offers a paid subscription plan, GameShuffle Pro, in addition to the free tier. Pro is available at $9 per month or $99 per year. The free tier remains available indefinitely with limited functionality.</p>
        </LegalSubSection>
        <LegalSubSection number="5.2" title="Free Trial">
          <p>We offer a 14-day free trial of GameShuffle Pro to new users. A valid payment method is required to start the trial. At the end of the trial, your account will automatically convert to your selected plan (monthly or annual) and your payment method will be charged. We will send reminder emails before the trial ends.</p>
          <p>You may cancel during the trial at any time from your account settings to avoid being charged. We limit each user to one free trial; subsequent subscriptions require immediate payment.</p>
        </LegalSubSection>
        <LegalSubSection number="5.3" title="Billing and Auto-Renewal">
          <p>GameShuffle Pro subscriptions automatically renew at the end of each billing cycle (monthly or annually) unless cancelled. You authorize us to charge your selected payment method on a recurring basis until you cancel.</p>
          <p>Charges will appear on your statement as <strong>EMPAC* GS PRO</strong>. Billing is processed by Empac, the parent brand operating GameShuffle.</p>
        </LegalSubSection>
        <LegalSubSection number="5.4" title="Payment Methods">
          <p>We accept Visa, Mastercard, American Express, Discover, Apple Pay, and Google Pay. All payments are processed in US dollars by Stripe. We do not store your full payment card information.</p>
          <p>Sales tax is calculated and collected by Stripe Tax based on your billing location. International transactions are converted by your financial institution at their current exchange rate.</p>
        </LegalSubSection>
        <LegalSubSection number="5.5" title="Cancellation">
          <p>You can cancel your subscription at any time from your account settings or via the Stripe Customer Portal accessible from your account. Cancellation takes effect at the end of your current billing period — you retain Pro access through that date.</p>
        </LegalSubSection>
        <LegalSubSection number="5.6" title="Refunds">
          <ul>
            <li>New monthly subscribers may request a prorated refund within 7 days of payment</li>
            <li>New annual subscribers may request a prorated refund within 30 days of payment</li>
            <li>After these periods, your subscription continues until the end of the current billing period when cancelled</li>
            <li>Refunds are processed to your original payment method within 5-10 business days</li>
          </ul>
          <p>To request a refund, contact us at billing@gameshuffle.co.</p>
        </LegalSubSection>
        <LegalSubSection number="5.7" title="Failed Payments">
          <p>If a recurring payment fails, we will automatically retry the charge over a period of approximately two weeks. If all retries fail, your account will revert to the free tier and we will notify you by email. Your account data and connections are preserved — you can resubscribe at any time to restore Pro access.</p>
        </LegalSubSection>
        <LegalSubSection number="5.8" title="Price Changes">
          <p>We may change subscription pricing from time to time. We will notify existing subscribers at least 30 days before any price increase takes effect. Continued use of the subscription after the price change takes effect constitutes acceptance of the new price.</p>
        </LegalSubSection>
      </>
    ),
  },
  {
    id: "user-generated-content",
    title: "User-Generated Content",
    content: (
      <>
        <LegalSubSection number="6.1" title="Your Content">
          <p>GameShuffle allows you to create and share content including tournament listings, saved randomizer configurations, public profiles, and submissions to community features (&ldquo;User Content&rdquo;). You retain ownership of any User Content you submit.</p>
        </LegalSubSection>
        <LegalSubSection number="6.2" title="License to Us">
          <p>By submitting User Content, you grant us a worldwide, non-exclusive, royalty-free license to use, store, display, reproduce, and distribute that content for the purpose of operating, improving, and promoting the Service. This license ends when you delete your content or your account, except where your content has been shared with others (e.g., a publicly shared tournament or configuration link) and removing it would affect their experience.</p>
        </LegalSubSection>
        <LegalSubSection number="6.3" title="Content Standards">
          <p>You represent and warrant that your User Content will not:</p>
          <ul>
            <li>Infringe any third-party intellectual property rights</li>
            <li>Contain personal information of others without their consent</li>
            <li>Contain content that is hateful, discriminatory, harassing, or threatening</li>
            <li>Violate any applicable law</li>
          </ul>
          <p>We reserve the right to remove any User Content that violates these Terms without prior notice.</p>
        </LegalSubSection>
        <LegalSubSection number="6.4" title="Reporting">
          <p>If you believe content on GameShuffle violates these Terms, contact us at legal@gameshuffle.co.</p>
        </LegalSubSection>
      </>
    ),
  },
  {
    id: "intellectual-property",
    title: "Intellectual Property",
    content: (
      <>
        <LegalSubSection number="7.1" title="Our Property">
          <p>GameShuffle, its design, features, code, branding, and all content we produce are owned by Britton Lorentzen DBA Empac and protected by applicable intellectual property laws. You may not copy, modify, distribute, sell, or lease any part of our Service without our written permission.</p>
        </LegalSubSection>
        <LegalSubSection number="7.2" title="Third-Party Game IP">
          <p>GameShuffle references game titles, characters, and assets owned by third parties (including Nintendo, Sony, Microsoft, and others) for informational and coordination purposes. <strong>GameShuffle is not affiliated with, endorsed by, or officially connected to any game publisher.</strong> All third-party trademarks and intellectual property belong to their respective owners. Users are responsible for legally owning or accessing any games they play in connection with the Service.</p>
        </LegalSubSection>
        <LegalSubSection number="7.3" title="Feedback">
          <p>If you submit feedback, suggestions, or ideas about the Service, you grant us the right to use that feedback without compensation or attribution to you.</p>
        </LegalSubSection>
      </>
    ),
  },
  {
    id: "dmca",
    title: "Digital Millennium Copyright Act (DMCA) Notice and Policy",
    content: (
      <>
        <p>We respect the intellectual property rights of others. If you believe that any material available on or through the Services infringes upon any copyright you own or control, please notify our Designated Copyright Agent.</p>
        <LegalSubSection number="8.1" title="Filing a Notification">
          <p>All copyright infringement notifications must include the elements required by 17 U.S.C. § 512(c)(3):</p>
          <ol>
            <li>A physical or electronic signature of the copyright owner or authorized representative</li>
            <li>Identification of the copyrighted work claimed to have been infringed</li>
            <li>Identification of the material that is claimed to be infringing, with information sufficient to permit us to locate the material</li>
            <li>Information sufficient to permit us to contact you (address, telephone number, email address)</li>
            <li>A statement that you have a good faith belief that the use of the material is not authorized by the copyright owner, its agent, or the law</li>
            <li>A statement that the information in the notification is accurate, and under penalty of perjury, that you are authorized to act on behalf of the copyright owner</li>
          </ol>
        </LegalSubSection>
        <LegalSubSection number="8.2" title="Counter-Notification">
          <p>If your content has been removed in response to a DMCA notification and you believe the removal was a mistake, you may submit a counter-notification with the elements required by 17 U.S.C. § 512(g)(3).</p>
        </LegalSubSection>
        <LegalSubSection number="8.3" title="Designated Copyright Agent">
          <p>
            <strong>Britton Lorentzen</strong><br />
            Attn: Designated Copyright Agent<br />
            4904 168th Ave E<br />
            Lake Tapps, WA 98391<br />
            United States
          </p>
          <p>
            Email: <a href="mailto:legal@gameshuffle.co">legal@gameshuffle.co</a><br />
            Phone: (888) 603-6722
          </p>
          <p>DMCA Registration Number: DMCA-1071900</p>
        </LegalSubSection>
        <LegalSubSection number="8.4" title="Repeat Infringers">
          <p>We will terminate the accounts of users determined to be repeat infringers in appropriate circumstances.</p>
        </LegalSubSection>
      </>
    ),
  },
  {
    id: "third-party-services",
    title: "Third-Party Services",
    content: (
      <p>GameShuffle integrates with several third-party services to operate. By using the Service, you acknowledge that your use may be subject to the terms and privacy policies of those services. A complete list of third-party services is available in our <a href="/privacy">Privacy Policy</a>. We are not responsible for the practices or content of these third-party services.</p>
    ),
  },
  {
    id: "disclaimers",
    title: "Disclaimers",
    content: (
      <>
        <p className="legal-page-v2__caps">THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE&rdquo; WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED. TO THE FULLEST EXTENT PERMITTED BY LAW, WE DISCLAIM ALL WARRANTIES, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.</p>
        <p className="legal-page-v2__caps">WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR FREE OF HARMFUL COMPONENTS. WE DO NOT WARRANT THAT ANY CONTENT ON THE SERVICE IS ACCURATE, COMPLETE, OR UP TO DATE.</p>
      </>
    ),
  },
  {
    id: "limitation-of-liability",
    title: "Limitation of Liability",
    content: (
      <>
        <p className="legal-page-v2__caps">TO THE FULLEST EXTENT PERMITTED BY APPLICABLE LAW, WE SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO LOSS OF PROFITS, DATA, GOODWILL, OR OTHER INTANGIBLE LOSSES, ARISING OUT OF OR IN CONNECTION WITH YOUR USE OF OR INABILITY TO USE THE SERVICE.</p>
        <p className="legal-page-v2__caps">NOTWITHSTANDING ANYTHING TO THE CONTRARY CONTAINED HEREIN, OUR TOTAL LIABILITY TO YOU FOR ANY CAUSE WHATSOEVER AND REGARDLESS OF THE FORM OF ACTION, WILL AT ALL TIMES BE LIMITED TO THE LESSER OF (A) THE AMOUNT YOU PAID US IN THE SIX (6) MONTH PERIOD PRIOR TO THE CAUSE OF ACTION, OR (B) ONE HUNDRED DOLLARS ($100.00 USD).</p>
        <p className="legal-page-v2__caps">CERTAIN US STATE LAWS AND INTERNATIONAL LAWS DO NOT ALLOW LIMITATIONS ON IMPLIED WARRANTIES OR THE EXCLUSION OR LIMITATION OF CERTAIN DAMAGES. IF THESE LAWS APPLY TO YOU, SOME OR ALL OF THE ABOVE DISCLAIMERS OR LIMITATIONS MAY NOT APPLY TO YOU, AND YOU MAY HAVE ADDITIONAL RIGHTS.</p>
      </>
    ),
  },
  {
    id: "indemnification",
    title: "Indemnification",
    content: (
      <p>You agree to defend, indemnify, and hold harmless Britton Lorentzen DBA Empac and any agents from any loss, damage, liability, claim, or demand, including reasonable attorneys&apos; fees and expenses, made by any third party due to or arising out of: (1) your User Content; (2) your use of the Services; (3) breach of these Terms; (4) any breach of your representations and warranties set forth in these Terms; (5) your violation of the rights of a third party, including intellectual property rights; or (6) any harmful act toward any other user of the Services.</p>
    ),
  },
  {
    id: "termination",
    title: "Termination",
    content: (
      <>
        <LegalSubSection number="13.1" title="By You">
          <p>You may stop using the Service and delete your account at any time.</p>
        </LegalSubSection>
        <LegalSubSection number="13.2" title="By Us">
          <p>We reserve the right to suspend or permanently terminate your access to the Service at any time, with or without notice, if we believe you have violated these Terms or if we determine your use poses a risk to other users or the platform.</p>
        </LegalSubSection>
        <LegalSubSection number="13.3" title="Effect of Termination">
          <p>Upon termination, your right to use the Service immediately ceases. Provisions of these Terms that by their nature should survive termination — including intellectual property rights, disclaimers, limitation of liability, dispute resolution, and indemnification — will survive.</p>
        </LegalSubSection>
      </>
    ),
  },
  {
    id: "dispute-resolution",
    title: "Dispute Resolution",
    content: (
      <>
        <LegalSubSection number="14.1" title="Informal Negotiations">
          <p>To expedite resolution and control the cost of any dispute, you and we agree to first attempt to negotiate any dispute informally for at least thirty (30) days before initiating arbitration. Such informal negotiations commence upon written notice from one party to the other. Most disputes can be resolved at this stage by contacting us at legal@gameshuffle.co.</p>
        </LegalSubSection>
        <LegalSubSection number="14.2" title="Binding Arbitration">
          <p>If we cannot resolve a dispute through informal negotiations, the dispute will be finally and exclusively resolved by binding arbitration. <strong>You understand that without this provision, you would have the right to sue in court and have a jury trial.</strong></p>
          <p>The arbitration shall be commenced and conducted under the Commercial Arbitration Rules of the American Arbitration Association (&ldquo;AAA&rdquo;) and, where appropriate, the AAA&apos;s Supplementary Procedures for Consumer Related Disputes. If arbitration costs are determined by the arbitrator to be excessive, we will pay all arbitration fees and expenses. The arbitration may be conducted in person, through the submission of documents, by phone, or online.</p>
          <p>The arbitration will take place in Pierce County, Washington. If a dispute proceeds in court rather than arbitration, the dispute shall be commenced in the state and federal courts located in Pierce County, Washington.</p>
        </LegalSubSection>
        <LegalSubSection number="14.3" title="Class Action Waiver">
          <p>The parties agree that any arbitration shall be limited to the dispute between the parties individually. To the full extent permitted by law: (a) no arbitration shall be joined with any other proceeding; (b) there is no right or authority for any dispute to be arbitrated on a class-action basis or to utilize class action procedures; and (c) there is no right or authority for any dispute to be brought in a purported representative capacity on behalf of the general public or any other persons.</p>
        </LegalSubSection>
        <LegalSubSection number="14.4" title="Time Limit">
          <p>In no event shall any dispute brought by either party related in any way to the Services be commenced more than one (1) year after the cause of action arose.</p>
        </LegalSubSection>
        <LegalSubSection number="14.5" title="Exceptions">
          <p>The following disputes are not subject to the above provisions concerning informal negotiations and binding arbitration: (a) any disputes seeking to enforce or protect, or concerning the validity of, intellectual property rights; (b) any dispute related to allegations of theft, piracy, invasion of privacy, or unauthorized use; and (c) any claim for injunctive relief.</p>
        </LegalSubSection>
      </>
    ),
  },
  {
    id: "governing-law",
    title: "Governing Law",
    content: (
      <p>These Terms are governed by the laws of the State of Washington, United States, without regard to its conflict of law principles.</p>
    ),
  },
  {
    id: "changes-to-terms",
    title: "Changes to These Terms",
    content: (
      <p>We may update these Terms from time to time. We will notify users of material changes by email at least 30 days before the changes take effect. Updates for new functionality, security updates, bug fixes, or to comply with a court order may take effect immediately. The Effective Date at the top of this page indicates when these Terms were last updated.</p>
    ),
  },
  {
    id: "miscellaneous",
    title: "Miscellaneous",
    content: (
      <>
        <p>These Terms and any policies posted by us constitute the entire agreement between you and us regarding the Service. Our failure to enforce any right or provision shall not be deemed a waiver of that right. If any provision is found to be unenforceable, the remaining provisions will remain in full force and effect.</p>
        <p>You may not assign these Terms without our written consent. We may assign these Terms at any time without notice.</p>
      </>
    ),
  },
  {
    id: "california-users",
    title: "California Users and Residents",
    content: (
      <p>If any complaint with us is not satisfactorily resolved, you can contact the Complaint Assistance Unit of the Division of Consumer Services of the California Department of Consumer Affairs in writing at 1625 North Market Blvd., Suite N 112, Sacramento, California 95834 or by telephone at (800) 952-5210 or (916) 445-1254.</p>
    ),
  },
  {
    id: "contact",
    title: "Contact",
    content: (
      <LegalContact
        introLine="If you have questions about these Terms, please contact us:"
        email="legal@gameshuffle.co"
        roleTitle="Britton Lorentzen"
        showDataRequestLink={false}
      />
    ),
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      intro="The rules for using GameShuffle — accounts, subscriptions, tournaments, and your rights."
      effectiveDate="April 24, 2026"
      sections={SECTIONS}
      current="terms"
    />
  );
}
