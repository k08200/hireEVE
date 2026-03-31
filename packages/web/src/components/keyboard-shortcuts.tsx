"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const SHORTCUTS = [
  { keys: ["Cmd", "K"], label: "Command palette / 명령 팔레트" },
  { keys: ["Cmd", "N"], label: "New conversation / 새 대화" },
  { keys: ["Cmd", "D"], label: "Go to Dashboard / 대시보드" },
  { keys: ["Cmd", "E"], label: "Go to Email / 이메일" },
  { keys: ["Cmd", "T"], label: "Go to Tasks / 할 일" },
  { keys: ["Cmd", "/"], label: "Show shortcuts / 단축키 보기" },
  { keys: ["Esc"], label: "Close modal / 닫기" },
];

export default function KeyboardShortcuts() {
  const router = useRouter();
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && showHelp) {
        setShowHelp(false);
        return;
      }

      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;

      switch (e.key) {
        case "n":
          e.preventDefault();
          fetch(
            `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/chat/conversations`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ userId: "demo-user" }),
            },
          )
            .then((r) => r.json())
            .then((conv) => router.push(`/chat/${conv.id}`))
            .catch(() => router.push("/chat"));
          break;
        case "d":
          e.preventDefault();
          router.push("/dashboard");
          break;
        case "e":
          e.preventDefault();
          router.push("/email");
          break;
        case "t":
          e.preventDefault();
          router.push("/tasks");
          break;
        case "/":
          e.preventDefault();
          setShowHelp((prev) => !prev);
          break;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [router, showHelp]);

  if (!showHelp) return null;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: click-to-close backdrop
    // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard handled by global listener
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4"
      onClick={() => setShowHelp(false)}
    >
      {/* biome-ignore lint/a11y/noStaticElementInteractions: stop propagation container */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: keyboard handled by parent */}
      <div
        className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-semibold mb-4">Keyboard Shortcuts / 키보드 단축키</h3>
        <div className="space-y-3">
          {SHORTCUTS.map((s) => (
            <div key={s.label} className="flex items-center justify-between">
              <span className="text-sm text-gray-400">{s.label}</span>
              <div className="flex gap-1">
                {s.keys.map((k) => (
                  <kbd
                    key={k}
                    className="bg-gray-800 border border-gray-700 rounded px-2 py-0.5 text-xs text-gray-300 font-mono"
                  >
                    {k}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-600 mt-4 text-center">
          Press Esc or click outside to close
        </p>
      </div>
    </div>
  );
}
