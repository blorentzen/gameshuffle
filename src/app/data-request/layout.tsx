import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Data Request",
  description:
    "Submit a privacy-related request — access, correction, deletion, portability, or marketing opt-out. We respond within 30 days.",
  alternates: {
    canonical: "https://gameshuffle.co/data-request",
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default function DataRequestLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
