"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

const NAV = [
  { href: "/", label: "หน้าแรก", icon: "🏠" },
  { href: "/book", label: "จองคอร์ท", icon: "🎾" },
  { href: "/cart", label: "ตะกร้า/คิว", icon: "🧺" },
  { href: "/bookings", label: "รายการจอง", icon: "📋" },
  { href: "/wallet", label: "Wallet", icon: "👛" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const bare = path.startsWith("/login");

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  if (bare) return <main className="flex-1">{children}</main>;
  return (
    <div className="flex-1 flex flex-col max-w-md w-full mx-auto min-h-dvh">
      <main className="flex-1 px-4 pt-4 pb-24">{children}</main>
      <nav
        className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md grid grid-cols-5 border-t"
        style={{ background: "var(--panel)", borderColor: "var(--line)", paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {NAV.map((n) => {
          const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
          return (
            <Link key={n.href} href={n.href} className={`nav-item ${active ? "active" : ""}`}>
              <span className="text-lg leading-none">{n.icon}</span>
              <span>{n.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
