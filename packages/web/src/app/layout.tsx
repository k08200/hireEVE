import type { Metadata, Viewport } from "next";
import Link from "next/link";
import CommandPalette from "../components/command-palette";
import Footer from "../components/footer";
import KeyboardShortcuts from "../components/keyboard-shortcuts";
import MobileNav from "../components/mobile-nav";
import NavLink from "../components/nav-link";
import NotificationBell from "../components/notification-bell";
import Providers from "../components/providers";
import ServiceWorkerRegister from "../components/sw-register";
import UserMenu from "../components/user-menu";
import WorkspaceNav from "../components/workspace-nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "EVE — Your First AI Employee",
  description:
    "An autonomous AI teammate that handles coding, email, scheduling, and more for solo founders. 1인 창업자의 첫 번째 AI 직원.",
  manifest: "/manifest.json",
  openGraph: {
    title: "EVE — Your First AI Employee",
    description:
      "An autonomous AI teammate for solo founders. Chat, email, tasks, scheduling, and more.",
    siteName: "hireEVE",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "EVE — Your First AI Employee",
    description: "An autonomous AI teammate for solo founders.",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "EVE",
  },
};

export const viewport: Viewport = {
  themeColor: "#030712",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-950 text-gray-100 min-h-screen flex flex-col antialiased">
        <Providers>
          <nav className="border-b border-gray-800/60 bg-gray-950/90 backdrop-blur-md sticky top-0 z-50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 h-12 flex items-center gap-6">
              <Link href="/" className="flex items-center gap-2 shrink-0">
                <span className="text-base font-bold tracking-tight text-blue-400">EVE</span>
              </Link>
              <div className="hidden md:flex items-center gap-1">
                <NavLink href="/chat">Chat</NavLink>
                <WorkspaceNav />
              </div>
              <div className="ml-auto flex items-center gap-2">
                <NotificationBell />
                <UserMenu />
                <MobileNav />
              </div>
            </div>
          </nav>
          <KeyboardShortcuts />
          <CommandPalette />
          <div className="flex-1">{children}</div>
          <Footer />
          <ServiceWorkerRegister />
        </Providers>
      </body>
    </html>
  );
}
