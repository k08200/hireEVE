import type { Metadata } from "next";
import Link from "next/link";
import CommandPalette from "../components/command-palette";
import KeyboardShortcuts from "../components/keyboard-shortcuts";
import MobileNav from "../components/mobile-nav";
import NotificationBell from "../components/notification-bell";
import { ToastProvider } from "../components/toast";
import "./globals.css";

export const metadata: Metadata = {
  title: "EVE — Your First AI Employee",
  description:
    "An autonomous AI teammate that handles coding, email, scheduling, and more for solo founders.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-950 text-gray-100 min-h-screen">
        <ToastProvider>
          <nav className="border-b border-gray-800 bg-gray-950/80 backdrop-blur sticky top-0 z-50">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-4 md:gap-8">
              <Link href="/" className="text-lg font-bold">
                <span className="text-blue-400">EVE</span>
              </Link>
              <div className="hidden md:flex items-center gap-6">
                <Link
                  href="/dashboard"
                  className="text-sm text-gray-400 hover:text-white transition"
                >
                  Dashboard
                </Link>
                <Link href="/chat" className="text-sm text-gray-400 hover:text-white transition">
                  Chat
                </Link>
                <Link href="/tasks" className="text-sm text-gray-400 hover:text-white transition">
                  Tasks
                </Link>
                <Link href="/notes" className="text-sm text-gray-400 hover:text-white transition">
                  Notes
                </Link>
                <Link
                  href="/contacts"
                  className="text-sm text-gray-400 hover:text-white transition"
                >
                  Contacts
                </Link>
                <Link
                  href="/reminders"
                  className="text-sm text-gray-400 hover:text-white transition"
                >
                  Reminders
                </Link>
              </div>
              <div className="ml-auto flex items-center gap-3">
                <NotificationBell />
                <Link
                  href="/settings"
                  className="hidden md:inline text-sm text-gray-400 hover:text-white transition"
                >
                  Settings
                </Link>
                <MobileNav />
              </div>
            </div>
          </nav>
          <KeyboardShortcuts />
          <CommandPalette />
          {children}
        </ToastProvider>
      </body>
    </html>
  );
}
