"use client";

import { Navbar } from "@empac/cascadeds";
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

  const links = hasTwitchConnection ? [{ label: "Twitch", href: "/twitch" }] : [];

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
      links={links}
      actions={<UserMenu />}
    />
  );
}
