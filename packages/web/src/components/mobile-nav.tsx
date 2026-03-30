"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const MAIN_ITEMS = [
  { href: "/chat", label: "Chat" },
];

const WORKSPACE_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/email", label: "Email" },
  { href: "/calendar", label: "Calendar" },
  { href: "/tasks", label: "Tasks" },
  { href: "/notes", label: "Notes" },
  { href: "/contacts", label: "Contacts" },
  { href: "/reminders", label: "Reminders" },
  { href: "/automations", label: "Automations" },
];

const ACCOUNT_ITEMS = [
  { href: "/settings", label: "Settings" },
  { href: "/billing", label: "Billing" },
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
      const handler = (e: KeyboardEvent) => {
        if (e.key === "Escape") setOpen(false);
      };
      window.addEventListener("keydown", handler);
      return () => {
        document.body.style.overflow = "";
        window.removeEventListener("keydown", handler);
      };
    }
    document.body.style.overflow = "";
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
              {MAIN_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-6 py-3 text-sm font-medium transition ${
                    pathname.startsWith(item.href)
                      ? "text-blue-400 bg-blue-500/10"
                      : "text-gray-200 hover:text-white hover:bg-gray-900"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
              <div className="px-6 pt-4 pb-1.5">
                <p className="text-[10px] font-medium text-gray-600 uppercase tracking-wider">Workspace</p>
              </div>
              {WORKSPACE_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-6 py-2.5 text-sm transition ${
                    pathname.startsWith(item.href)
                      ? "text-blue-400 bg-blue-500/10"
                      : "text-gray-400 hover:text-white hover:bg-gray-900"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
              <div className="border-t border-gray-800 mt-2 pt-2">
                {ACCOUNT_ITEMS.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 px-6 py-2.5 text-sm transition ${
                      pathname.startsWith(item.href)
                        ? "text-blue-400 bg-blue-500/10"
                        : "text-gray-500 hover:text-white hover:bg-gray-900"
                    }`}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
              <div className="px-6 py-3 text-[10px] text-gray-600 border-t border-gray-800 mt-1">
                EVE v0.2.0
              </div>
            </div>
          </nav>
        </div>
      )}
    </>
  );
}
