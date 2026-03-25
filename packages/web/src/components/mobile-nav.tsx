"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: "◫" },
  { href: "/chat", label: "Chat", icon: "💬" },
  { href: "/tasks", label: "Tasks", icon: "✓" },
  { href: "/notes", label: "Notes", icon: "📝" },
  { href: "/contacts", label: "Contacts", icon: "👤" },
  { href: "/reminders", label: "Reminders", icon: "⏰" },
  { href: "/settings", label: "Settings", icon: "⚙" },
  { href: "/billing", label: "Billing", icon: "💳" },
];

export default function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        className="md:hidden text-gray-400 hover:text-white transition p-1"
        aria-label="Menu"
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {open ? (
            <>
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </>
          ) : (
            <>
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </>
          )}
        </svg>
      </button>

      {open && (
        <div className="fixed inset-0 top-14 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <nav className="relative bg-gray-950 border-b border-gray-800 shadow-xl">
            <div className="flex flex-col py-2">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-6 py-3 text-sm transition ${
                    pathname.startsWith(item.href)
                      ? "text-blue-400 bg-blue-500/10"
                      : "text-gray-400 hover:text-white hover:bg-gray-900"
                  }`}
                >
                  <span className="w-5 text-center">{item.icon}</span>
                  {item.label}
                </Link>
              ))}
            </div>
          </nav>
        </div>
      )}
    </>
  );
}
