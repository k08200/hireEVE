"use client";

import { type ThemeChoice, useThemeChoice } from "../lib/theme";
import Tabs from "./ui/tabs";

const THEME_TABS = [
  { id: "system", label: "System" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
];

/**
 * Theme picker: system (default, follows the OS live) or an explicit
 * light/dark override, persisted in localStorage. The pre-hydration script
 * in layout.tsx makes the first paint match, so switching here never
 * flashes.
 */
export default function AppearanceSection() {
  const [choice, setChoice] = useThemeChoice();

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm text-ink">Theme</p>
        <p className="mt-0.5 text-xs text-ink-mid">
          System follows your OS setting and updates live.
        </p>
      </div>
      <Tabs
        tabs={THEME_TABS}
        active={choice}
        onChange={(id) => setChoice(id as ThemeChoice)}
        ariaLabel="Theme"
      />
    </div>
  );
}
