import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Email preferences",
  description: "Manage your GameShuffle email subscriptions.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function UnsubscribeLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
