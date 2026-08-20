"use client";

/**
 * The social feed — composer (@mention-aware) + For You / Following tabs, each a
 * self-loading list of PostCards. The centerpiece of the Community hub.
 */

import { useCallback, useEffect, useState } from "react";
import { MentionInput, Button, Tabs, Select, Chip, Input, type MentionUser } from "@empac/cascadeds";
import { useAuth } from "@/components/auth/AuthProvider";
import { useToast } from "@/components/toast/ToastProvider";
import { PostCard } from "@/components/social/PostCard";
import { FAVORITE_GAME_CATALOG } from "@/data/favorite-games";
import type { FeedPost } from "@/lib/social/feed";

type Scope = "for_you" | "following";

const GAME_OPTIONS = [
  { value: "", label: "Pick a game" },
  ...FAVORITE_GAME_CATALOG.map((g) => ({ value: g.name, label: g.name })),
];

function FeedList({
  scope,
  refreshKey,
  currentUserId,
}: {
  scope: Scope;
  refreshKey: number;
  currentUserId: string;
}) {
  // Reset happens by remount (parent keys this by scope+refreshKey), so the
  // effect only fetches — no synchronous setState in the effect body.
  const [posts, setPosts] = useState<FeedPost[] | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/social/posts?scope=${scope}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { posts: [] }))
      .then((d) => {
        if (live) setPosts((d.posts as FeedPost[]) ?? []);
      })
      .catch(() => {
        if (live) setPosts([]);
      });
    return () => {
      live = false;
    };
  }, [scope, refreshKey]);

  const onDeleted = useCallback(
    (id: string) => setPosts((ps) => (ps ? ps.filter((p) => p.id !== id) : ps)),
    [],
  );

  if (posts === null) return <p className="feed__msg">Loading…</p>;
  if (posts.length === 0) {
    return (
      <p className="feed__msg">
        {scope === "following"
          ? "Posts from people you follow will show up here. Follow some players to fill your feed."
          : "No posts yet. Be the first to say something."}
      </p>
    );
  }
  return (
    <div className="feed__list">
      {posts.map((p) => (
        <PostCard key={p.id} post={p} currentUserId={currentUserId} onDeleted={onDeleted} />
      ))}
    </div>
  );
}

export function SocialFeed() {
  const { user } = useAuth();
  const toast = useToast();
  const [value, setValue] = useState("");
  const [users, setUsers] = useState<MentionUser[]>([]);
  const [posting, setPosting] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [tab, setTab] = useState<Scope>("for_you");
  const [isGameNight, setIsGameNight] = useState(false);
  const [gnGame, setGnGame] = useState("");
  const [gnWhen, setGnWhen] = useState("");
  const [gnCapacity, setGnCapacity] = useState("");
  const [gnAnnounceDiscord, setGnAnnounceDiscord] = useState(false);

  useEffect(() => {
    fetch("/api/social/mention-users")
      .then((r) => (r.ok ? r.json() : { users: [] }))
      .then((d) => setUsers((d.users as MentionUser[]) ?? []))
      .catch(() => setUsers([]));
  }, []);

  async function submit() {
    const body = value.trim();
    if (!body || posting) return;
    setPosting(true);
    const payload: { body: string; kind?: string; meta?: Record<string, unknown>; announceDiscord?: boolean } = { body };
    if (isGameNight) {
      payload.kind = "game_night";
      payload.meta = {
        game: gnGame || null,
        startAt: gnWhen ? new Date(gnWhen).toISOString() : null,
        capacity: gnCapacity ? Number(gnCapacity) : null,
      };
      payload.announceDiscord = gnAnnounceDiscord;
    }
    const res = await fetch("/api/social/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setPosting(false);
    if (res.ok) {
      setValue("");
      setIsGameNight(false);
      setGnGame("");
      setGnWhen("");
      setGnCapacity("");
      setGnAnnounceDiscord(false);
      setTab("for_you");
      setRefreshKey((k) => k + 1);
    } else if (res.status === 429) {
      toast.error("You're posting too fast. Give it a sec.");
    } else {
      toast.error("Could not post. Try again.");
    }
  }

  if (!user) return null;

  return (
    <div className="feed">
      <div className="feed__composer">
        <MentionInput
          value={value}
          onChange={setValue}
          users={users}
          placeholder={isGameNight ? "Describe your game night…" : "Share something with the community…"}
          minRows={2}
          maxRows={8}
        />

        {isGameNight && (
          <div className="feed__gn-fields">
            <Select
              floatingLabel="Game"
              options={GAME_OPTIONS}
              value={gnGame}
              onChange={(v) => setGnGame(v as string)}
              fullWidth
            />
            <label className="feed__gn-when">
              <span className="feed__gn-label">When (optional)</span>
              <input
                type="datetime-local"
                className="save-setup-input"
                value={gnWhen}
                onChange={(e) => setGnWhen(e.target.value)}
              />
            </label>
            <Input
              type="number"
              floatingLabel="Capacity (optional)"
              value={gnCapacity}
              onChange={(e) => setGnCapacity(e.target.value)}
            />
            <label className="feed__gn-announce">
              <input
                type="checkbox"
                checked={gnAnnounceDiscord}
                onChange={(e) => setGnAnnounceDiscord(e.target.checked)}
              />
              <span>📣 Also announce to Discord <span className="feed__gn-hint">(GS Pro, if your bot is connected)</span></span>
            </label>
          </div>
        )}

        <div className="feed__composer-actions">
          <Chip
            label="🎮 Game Night"
            variant={isGameNight ? "primary" : "default"}
            onClick={() => setIsGameNight((v) => !v)}
          />
          <Button variant="primary" onClick={() => void submit()} disabled={posting || !value.trim()}>
            {isGameNight ? "Post Game Night" : "Post"}
          </Button>
        </div>
      </div>

      <Tabs
        variant="underline"
        activeTab={tab}
        onChange={(id) => setTab(id as Scope)}
        tabs={[
          {
            id: "for_you",
            label: "For You",
            content: (
              <FeedList
                key={`for_you-${refreshKey}`}
                scope="for_you"
                refreshKey={refreshKey}
                currentUserId={user.id}
              />
            ),
          },
          {
            id: "following",
            label: "Following",
            content: (
              <FeedList
                key={`following-${refreshKey}`}
                scope="following"
                refreshKey={refreshKey}
                currentUserId={user.id}
              />
            ),
          },
        ]}
      />
    </div>
  );
}
