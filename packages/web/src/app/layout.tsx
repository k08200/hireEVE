import type { Metadata, Viewport } from "next";
import AppShell from "../components/app-shell";
import CommandPalette from "../components/command-palette";
import KeyboardShortcuts from "../components/keyboard-shortcuts";
import Providers from "../components/providers";
import PushOnboardingBanner from "../components/push-onboarding-banner";
import PushRegister from "../components/push-register";
import PwaPrompts from "../components/pwa-prompts";
import ServiceWorkerRegister from "../components/sw-register";
import "./globals.css";

export const metadata: Metadata = {
  title: "EVE — Your AI Chief of Staff",
  description:
    "Your AI Chief of Staff. Triages email, preps meetings, and runs follow-ups for founders — without the six-figure salary.",
  manifest: "/manifest.json",
  openGraph: {
    title: "EVE — Your AI Chief of Staff",
    description:
      "Same job a human Chief of Staff does — email triage, meeting prep, follow-ups — for $29/mo, running 24/7.",
    siteName: "hireEVE",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "EVE — Your AI Chief of Staff",
    description:
      "The AI CoS founders couldn't afford to hire. $29/mo. Always on. Connect Gmail once, EVE handles the rest.",
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
  viewportFit: "cover",
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
          <PushOnboardingBanner />
          <PwaPrompts />
        </Providers>
      </body>
    </html>
  );
}
