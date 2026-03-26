"use client";

import { usePathname } from "next/navigation";
import { Container } from "@empac/cascadeds";

const NAV_ITEMS = [
  { href: "/account", label: "Overview" },
  { href: "/account/profile", label: "Profile" },
  { href: "/account/configs", label: "Saved Configs" },
];

export default function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <main style={{ paddingTop: "2rem", paddingBottom: "3rem" }}>
      <Container>
        <div className="account-layout">
          <nav className="account-sidebar">
            {NAV_ITEMS.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className={`account-sidebar__link ${
                  pathname === item.href ? "account-sidebar__link--active" : ""
                }`}
              >
                {item.label}
              </a>
            ))}
          </nav>
          <div className="account-content">{children}</div>
        </div>
      </Container>
    </main>
  );
}
