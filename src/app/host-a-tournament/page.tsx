import type { Metadata } from "next";
import { AppMarketingPage } from "@/components/marketing/AppMarketingPage";
import { MARKETING_APPS } from "@/data/marketing-apps";
import { WelcomeDemo } from "@/components/welcome/WelcomeDemo";
import "@/styles/welcome.css";

const content = MARKETING_APPS["host-a-tournament"];

export const metadata: Metadata = {
  title: content.metaTitle,
  description: content.metaDescription,
  openGraph: {
    title: content.metaTitle,
    description: content.metaDescription,
    url: `https://www.gameshuffle.co${content.path}`,
    images: ["https://cdn.empac.co/gameshuffle/images/opengraph/mk-tournaments-og.jpg"],
  },
  alternates: { canonical: `https://www.gameshuffle.co${content.path}` },
};

export default function Page() {
  return (
    <AppMarketingPage
      content={content}
      look={<WelcomeDemo id="bracket" label="bracket" />}
      plans={{
        title: "Free to run. Bigger when you need it.",
        intro: "Every format is free for one full lobby. Plans only add size and stream tools.",
        rows: ["account", "circuit", "pro"],
        from: "host-a-tournament",
        copy: {
          account: { name: "One full lobby, every format", body: "Brackets, Swiss, points or Heat to Mains, live scoring and a public page, free with an account." },
          circuit: { name: "Fields of 64 or 256", body: "Championship seasons, co-organizers, your branding and live randomized rounds." },
          pro: { name: "Put it on your stream", body: "The current match on your OBS overlay, chat voting on picks and bans, standings live for viewers." },
        },
        cta: { account: { label: "Create a tournament", href: "/tournament/create" } },
      }}
    />
  );
}
