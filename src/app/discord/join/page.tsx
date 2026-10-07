import type { Metadata } from "next";
import { DiscordJoin } from "./DiscordJoin";

export const metadata: Metadata = {
  title: "Join from Discord",
  description: "Create your free GameShuffle account with the Discord account you play with.",
  robots: { index: false, follow: false },
};

export default function DiscordJoinPage() {
  return <DiscordJoin />;
}
