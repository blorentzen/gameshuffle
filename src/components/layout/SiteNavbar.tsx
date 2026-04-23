"use client";

import { Navbar } from "@empac/cascadeds";
import Image from "next/image";
import { UserMenu } from "@/components/auth/UserMenu";

export function SiteNavbar() {
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
      actions={<UserMenu />}
    />
  );
}
