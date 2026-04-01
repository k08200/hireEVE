"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import Sidebar from "./sidebar";

const NO_SIDEBAR_ROUTES = ["/", "/login", "/auth/callback", "/reset-password", "/verify-email"];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const showSidebar = !NO_SIDEBAR_ROUTES.includes(pathname);

  if (!showSidebar) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile header */}
        <div className="md:hidden flex items-center gap-3 px-4 h-12 border-b border-gray-800/40 shrink-0">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="text-gray-400 hover:text-white transition p-1"
            aria-label="Menu"
          >
            <svg
              aria-hidden="true"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <span className="text-sm font-semibold text-gray-300">EVE</span>
        </div>
        <main className="flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  );
}
