import type { Metadata, Viewport } from "next";
import AppShell from "../components/app-shell";
import CommandPalette from "../components/command-palette";
import KeyboardShortcuts from "../components/keyboard-shortcuts";
import Providers from "../components/providers";
import PushRegister from "../components/push-register";
import PwaPrompts from "../components/pwa-prompts";
import ServiceWorkerRegister from "../components/sw-register";
import "./globals.css";

export const metadata: Metadata = {
  title: "EVE — Your First AI Employee",
  description:
    "An autonomous AI employee that handles email, scheduling, tasks, and more for solo founders and small teams.",
  manifest: "/manifest.json",
  openGraph: {
    title: "EVE — Your First AI Employee",
    description:
      "An autonomous AI employee for solo founders. Email, tasks, scheduling, and more — all in one conversation.",
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
      <body className="bg-gray-950 text-gray-100 antialiased">
        <Providers>
          <KeyboardShortcuts />
          <CommandPalette />
          <AppShell>{children}</AppShell>
          <ServiceWorkerRegister />
          <PushRegister />
          <PwaPrompts />
        </Providers>
      </body>
    </html>
  );
}
