"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../lib/auth";

export default function UserMenu() {
  const { user, loading, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (loading) return null;

  if (!user) {
    return (
      <Link
        href="/login"
        className="text-xs text-gray-300 hover:text-white bg-gray-800/80 hover:bg-gray-700 border border-gray-700/60 px-3 py-1.5 rounded-lg transition-colors"
      >
        Sign in
      </Link>
    );
  }

  const initials = (user.name || user.email)
    .split(/[\s@]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0].toUpperCase())
    .join("");

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="w-7 h-7 rounded-full bg-blue-600/80 hover:bg-blue-500 text-white text-[10px] font-bold flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:ring-offset-1 focus:ring-offset-gray-950"
        title={user.email}
        aria-label="User menu"
      >
        {initials}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-52 bg-gray-900 border border-gray-800 rounded-xl shadow-2xl shadow-black/40 z-50 py-1 animate-slide-up">
          <div className="px-3.5 py-2.5 border-b border-gray-800/80">
            <p className="text-sm font-medium truncate text-gray-100">{user.name || "User"}</p>
            <p className="text-xs text-gray-500 truncate">{user.email}</p>
            <span className="inline-block mt-1.5 text-[10px] bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded-md border border-blue-500/20 font-medium">
              {user.plan}
            </span>
          </div>
          <div className="py-1">
            <Link
              href="/settings"
              onClick={() => setOpen(false)}
              className="block px-3.5 py-2 text-sm text-gray-300 hover:bg-gray-800/80 hover:text-white transition-colors rounded-md mx-1"
            >
              Settings
            </Link>
            <Link
              href="/billing"
              onClick={() => setOpen(false)}
              className="block px-3.5 py-2 text-sm text-gray-300 hover:bg-gray-800/80 hover:text-white transition-colors rounded-md mx-1"
            >
              Billing
            </Link>
          </div>
          <div className="border-t border-gray-800/80 pt-1">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                logout();
              }}
              className="w-[calc(100%-0.5rem)] text-left px-3.5 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors rounded-md mx-1"
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
