import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Container } from "@empac/cascadeds";
import { homeViewer } from "@/lib/home/viewer";
import { homeRoom } from "@/lib/home/forYou";
import { RoomBody, RoomHeader } from "@/components/home/HomeRoom";
import { DUEL_SHOWN } from "@/lib/originals/dailies";
import { duelChallenger } from "@/lib/originals/duel/store";
import { gsDay } from "@/lib/time/gsClock";
import { MerchShelf } from "@/components/store/ShopEntry";
import { shopVisibleToVisitors } from "@/lib/store/visibility";
import { spaceById } from "@/lib/games/spaces";
import { isStaffRole } from "@/lib/subscription";

/**
 * /home: your room (journeys picks 2026-11-06, 6A and 7A, https://claude.ai/artifact/DqZuBnVSJFAuDSDY4Ssb11). Signed
 * in, the logo, the phone app bar's Home and a visit to / come here; / is the front page for visitors (members reach it
 * with /?front=1). The room: your header and what's happening, your game spaces, today, your people, your things.
 * The five worlds are the header's tabs (home cleanup picks 2026-11-07, 2A). Signed out, this sends you to the front page.
 */
export const metadata: Metadata = {
  title: "Home",
  robots: { index: false, follow: false },
};

export default async function HomeRoomPage() {
  const viewer = await homeViewer().catch(() => null);
  if (!viewer) redirect("/");
  const duelToday = DUEL_SHOWN ? await duelChallenger(gsDay()).catch(() => null) : null;
  const room = await homeRoom(viewer.userId, { pro: viewer.pro, supporter: viewer.supporter }, viewer.next, duelToday, viewer.role)
    .catch((e) => { console.error("[home] room failed:", e); return null; });
  if (!room) redirect("/?front=1");
  // Wear it (shop picks 2026-11-08): merch after Your games, designs for the games you play first, while visitors can
  // see the shop (staff before).
  const shopShown = (await shopVisibleToVisitors().catch(() => false)) || isStaffRole(viewer.role);
  const mine = room.games.map((g) => spaceById(g.id)?.merch?.source).filter((x): x is string => !!x);
  const wear = shopShown ? (
    <MerchShelf from="home-room" prefer={mine.length ? new RegExp(mine.join("|"), "i") : undefined}
      line={mine.length ? "From the GameShuffle shop, starting with the games you play." : "From the GameShuffle shop, made when you order."} className="room-wear" />
  ) : null;
  return (
    <>
      <RoomHeader head={room.head} showing={room.showing} interests={room.interests} band={room.band} />
      <main>
        <Container>
          <RoomBody room={room} userId={viewer.userId} wear={wear} />
        </Container>
      </main>
    </>
  );
}
