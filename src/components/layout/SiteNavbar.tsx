"use client";

import { Navbar, Button } from "@empac/cascadeds";
import Image from "next/image";
import { useEffect, useState } from "react";
import { UserMenu } from "@/components/auth/UserMenu";
import { useAuth } from "@/components/auth/AuthProvider";
import { createClient } from "@/lib/supabase/client";

export function SiteNavbar() {
  const { user } = useAuth();
  const [hasTwitchConnection, setHasTwitchConnection] = useState(false);

  useEffect(() => {
    if (!user) {
      setHasTwitchConnection(false);
      return;
    }
    const supabase = createClient();
    supabase
      .from("twitch_connections")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => setHasTwitchConnection(!!data));
  }, [user]);

  return (
    <Navbar
      logo={
        <a href="/">
          <Image
            src="/images/fg/logos/gameshuggle-wht.png"
            alt="GameShuffle"
            width={150}
            height={40}
            style={{ height: "auto" }}
            priority
          />
        </a>
      }
      links={[]}
      actions={
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          {hasTwitchConnection && (
            <a href="/twitch">
              <Button variant="ghost" size="small">
                Twitch Hub
              </Button>
            </a>
          )}
          <UserMenu />
        </div>
      }
    />
  );
}
