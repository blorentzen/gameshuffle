import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact Us",
  description: "Get in touch with the GameShuffle team. Have a feature idea, found a bug, or need help? We want to hear from you.",
  openGraph: {
    title: "Contact Us | GameShuffle",
    description: "Get in touch with the GameShuffle team.",
    url: "https://www.gameshuffle.co/contact-us",
  },
  alternates: {
    canonical: "https://www.gameshuffle.co/contact-us",
  },
};

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return children;
}
