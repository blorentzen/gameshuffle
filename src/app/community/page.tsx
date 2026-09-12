import { redirect } from "next/navigation";

/**
 * The old singular "Community" home is superseded by the Community Hub at
 * /communities. Redirect so there's a single, unambiguous social surface.
 * (Individual post permalinks still live at /community/post/[id].)
 */
export default function CommunityIndexRedirect() {
  redirect("/communities");
}
