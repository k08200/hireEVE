import type { Metadata } from "next";
import Link from "next/link";
import CommandPalette from "../components/command-palette";
import { ConfirmProvider } from "../components/confirm-dialog";
import KeyboardShortcuts from "../components/keyboard-shortcuts";
import MobileNav from "../components/mobile-nav";
import NavLink from "../components/nav-link";
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
          <ConfirmProvider>
            <nav className="border-b border-gray-800 bg-gray-950/80 backdrop-blur sticky top-0 z-50">
              <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-4 md:gap-8">
                <Link href="/" className="text-lg font-bold">
                  <span className="text-blue-400">EVE</span>
                </Link>
                <div className="hidden md:flex items-center gap-6">
                  <NavLink href="/dashboard">Dashboard</NavLink>
                  <NavLink href="/chat">Chat</NavLink>
                  <NavLink href="/tasks">Tasks</NavLink>
                  <NavLink href="/notes">Notes</NavLink>
                  <NavLink href="/contacts">Contacts</NavLink>
                  <NavLink href="/reminders">Reminders</NavLink>
                </div>
                <div className="ml-auto flex items-center gap-3">
                  <NotificationBell />
                  <NavLink href="/settings" className="hidden md:inline">
                    Settings
                  </NavLink>
                  <MobileNav />
                </div>
              </div>
            </nav>
            <KeyboardShortcuts />
            <CommandPalette />
            {children}
          </ConfirmProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
