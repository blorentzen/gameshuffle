import type { Metadata } from "next";
import { ToolPageShell } from "@/components/game-nights/companion/ToolPageShell";
import { Cribbage } from "@/components/game-nights/companion/Cribbage";

export const metadata: Metadata = {
  title: "Cribbage Board — digital pegging to 121",
  description: "A digital cribbage board: race to 121 with the skunk and double-skunk lines marked. Free, no account needed.",
};

export default function CribbagePage() {
  return (
    <ToolPageShell toolId="cribbage">
      <Cribbage />
    </ToolPageShell>
  );
}
