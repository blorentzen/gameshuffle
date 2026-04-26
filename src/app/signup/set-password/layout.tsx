import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Set a password",
  description: "Set a password for your GameShuffle account so you have a fallback sign-in method.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function SetPasswordLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
