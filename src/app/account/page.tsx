"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient } from "@/lib/supabase/client";

interface UserProfile {
  display_name: string | null;
  created_at: string;
  role: string;
}

export default function AccountOverviewPage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [configCount, setConfigCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    const supabase = createClient();

    supabase
      .from("users")
      .select("display_name, created_at, role")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        if (data) setProfile(data as UserProfile);
      });

    supabase
      .from("saved_configs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .then(({ count }) => {
        setConfigCount(count || 0);
      });
  }, [user]);

  if (!user || !profile) {
    return <div className="account-card"><p>Loading...</p></div>;
  }

  const memberSince = new Date(profile.created_at).toLocaleDateString(
    "en-US",
    { month: "long", year: "numeric" }
  );

  return (
    <>
      <div className="account-card">
        <h2>Account Overview</h2>
        <div className="account-card__row">
          <span className="account-card__label">Display Name</span>
          <span className="account-card__value">
            {profile.display_name || "Not set"}
          </span>
        </div>
        <div className="account-card__row">
          <span className="account-card__label">Email</span>
          <span className="account-card__value">{user.email}</span>
        </div>
        <div className="account-card__row">
          <span className="account-card__label">Member Since</span>
          <span className="account-card__value">{memberSince}</span>
        </div>
        <div className="account-card__row">
          <span className="account-card__label">Saved Configs</span>
          <span className="account-card__value">{configCount}</span>
        </div>
      </div>

      <div className="account-card">
        <h2>Subscription</h2>
        <div className="account-card__row">
          <span className="account-card__label">Current Plan</span>
          <span className="account-card__value">Free</span>
        </div>
      </div>
    </>
  );
}
