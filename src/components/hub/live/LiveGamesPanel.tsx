"use client";

/**
 * The stream page's Live games tab: polls, Stream Bingo, Chat Draft and
 * Chat Brain in one place, so running one never means leaving the stream.
 * The same screens as Streaming ▸ Live games (they work between streams
 * there). The inner view follows `?view=`, so the control room's cards open
 * the right one; a game that's running carries a Live badge.
 */

import { Tabs } from "@empac/cascadeds";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PollsTab } from "@/components/account/PollsTab";
import { StreamBingoTab } from "@/components/account/StreamBingoTab";
import { ChatDraftTab } from "@/components/account/ChatDraftTab";
import { ChatBrainStreamTab } from "@/components/account/ChatBrainStreamTab";
import { BreakModeTab } from "@/components/account/BreakModeTab";
import { useHubLive } from "./HubLiveProvider";

const VIEWS = ["polls", "bingo", "draft", "chat-brain", "break"] as const;
type View = (typeof VIEWS)[number];

export function LiveGamesPanel() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data } = useHubLive();
  const raw = searchParams.get("view");
  const active: View = (VIEWS as readonly string[]).includes(raw ?? "") ? (raw as View) : firstRunning(data) ?? "polls";

  const onChange = (id: string) => {
    const next = new URLSearchParams(searchParams.toString());
    next.set("tab", "live-games");
    next.set("view", id);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  const live = (on: boolean | undefined) => (on ? "Live" : undefined);
  return (
    <div className="hub-livegames">
      <Tabs
        variant="pills"
        activeTab={active}
        onChange={onChange}
        tabs={[
          { id: "polls", label: "Polls", badge: live(!!data?.poll), content: <PollsTab /> },
          { id: "bingo", label: "Bingo", badge: live(data?.bingo?.status === "open"), content: <StreamBingoTab /> },
          { id: "draft", label: "Chat Draft", badge: live(!!data?.draft), content: <div className="account-card"><ChatDraftTab /></div> },
          { id: "chat-brain", label: "Chat Brain", badge: live(!!data?.brain), content: <div className="account-card"><ChatBrainStreamTab /></div> },
          { id: "break", label: "Break mode", badge: live(!!data?.breakMode), content: <div className="account-card"><BreakModeTab /></div> },
        ]}
      />
    </div>
  );
}

function firstRunning(data: ReturnType<typeof useHubLive>["data"]): View | null {
  if (!data) return null;
  if (data.poll) return "polls";
  if (data.bingo?.status === "open") return "bingo";
  if (data.draft) return "draft";
  if (data.brain) return "chat-brain";
  if (data.breakMode) return "break";
  return null;
}
