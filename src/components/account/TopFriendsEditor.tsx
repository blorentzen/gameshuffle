"use client";

/**
 * Top Friends editor (account → Profile). Pick up to MAX people you follow to
 * feature on your public profile, in order. Auto-saves each change.
 */

import { useCallback, useEffect, useState } from "react";
import { FriendTile } from "@/components/social/FriendTile";
import type { FriendProfile } from "@/lib/social/topFriends";

const MAX = 12;

export function TopFriendsEditor() {
  const [following, setFollowing] = useState<FriendProfile[]>([]);
  const [topIds, setTopIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/account/top-friends", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => {
        if (b) {
          setFollowing(b.following ?? []);
          setTopIds(((b.topFriends ?? []) as FriendProfile[]).map((f) => f.id));
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const save = useCallback(async (ids: string[]) => {
    setSaving(true);
    try {
      await fetch("/api/account/top-friends", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ friendIds: ids }),
      });
    } finally {
      setSaving(false);
    }
  }, []);

  function update(ids: string[]) {
    setTopIds(ids);
    void save(ids);
  }
  const add = (id: string) => {
    if (topIds.length >= MAX || topIds.includes(id)) return;
    update([...topIds, id]);
  };
  const remove = (id: string) => update(topIds.filter((x) => x !== id));
  const move = (id: string, dir: -1 | 1) => {
    const i = topIds.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= topIds.length) return;
    const next = [...topIds];
    [next[i], next[j]] = [next[j], next[i]];
    update(next);
  };

  const byId = new Map(following.map((f) => [f.id, f]));
  const top = topIds.map((id) => byId.get(id)).filter((f): f is FriendProfile => !!f);
  const available = following.filter((f) => !topIds.includes(f.id));

  return (
    <div className="account-card">
      <h2>Top Friends</h2>
      <p style={{ marginBottom: "var(--spacing-20)", fontSize: "var(--font-size-14)", color: "var(--text-secondary)" }}>
        Feature up to {MAX} people you follow on your profile, in your order.
        {saving ? " · Saving…" : ""}
      </p>

      {loading ? (
        <p style={{ color: "var(--text-secondary)" }}>Loading…</p>
      ) : (
        <>
          {top.length > 0 ? (
            <div className="tf-selected">
              {top.map((f, i) => (
                <div key={f.id} className="tf-selected__item">
                  <span className="tf-pos">{i + 1}</span>
                  <FriendTile friend={f} size={48} linked={false} />
                  <div className="tf-controls">
                    <button type="button" onClick={() => move(f.id, -1)} disabled={i === 0} aria-label="Move up">↑</button>
                    <button type="button" onClick={() => move(f.id, 1)} disabled={i === top.length - 1} aria-label="Move down">↓</button>
                    <button type="button" onClick={() => remove(f.id)} aria-label="Remove" className="tf-remove">×</button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: "var(--text-secondary)" }}>No top friends yet — add some below.</p>
          )}

          <h3 style={{ margin: "var(--spacing-24) 0 var(--spacing-12)", fontSize: "var(--font-size-16)" }}>
            Add from people you follow
          </h3>
          {available.length > 0 ? (
            <div className="friend-grid">
              {available.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className="tf-add"
                  disabled={topIds.length >= MAX}
                  onClick={() => add(f.id)}
                >
                  <FriendTile friend={f} size={48} linked={false} />
                  <span className="tf-add__plus">＋</span>
                </button>
              ))}
            </div>
          ) : (
            <p style={{ color: "var(--text-secondary)" }}>
              {following.length
                ? "Everyone you follow is already featured."
                : "Follow people to feature them here."}
            </p>
          )}
        </>
      )}
    </div>
  );
}
