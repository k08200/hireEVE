"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Command {
  id: string;
  label: string;
  sublabel?: string;
  action: () => void;
}

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const commands: Command[] = [
    {
      id: "chat",
      label: "Go to Chat",
      sublabel: "채팅으로 이동",
      action: () => router.push("/chat"),
    },
    {
      id: "new-chat",
      label: "New conversation",
      sublabel: "새 대화 시작",
      action: () => {
        fetch(`${API_BASE}/api/chat/conversations`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: "demo-user" }),
        })
          .then((r) => r.json())
          .then((conv) => router.push(`/chat/${conv.id}`))
          .catch(() => router.push("/chat"));
      },
    },
    {
      id: "dashboard",
      label: "Go to Dashboard",
      sublabel: "대시보드",
      action: () => router.push("/dashboard"),
    },
    {
      id: "tasks",
      label: "Go to Tasks",
      sublabel: "할 일 관리",
      action: () => router.push("/tasks"),
    },
    { id: "notes", label: "Go to Notes", sublabel: "메모", action: () => router.push("/notes") },
    {
      id: "contacts",
      label: "Go to Contacts",
      sublabel: "연락처",
      action: () => router.push("/contacts"),
    },
    {
      id: "reminders",
      label: "Go to Reminders",
      sublabel: "리마인더",
      action: () => router.push("/reminders"),
    },
    {
      id: "settings",
      label: "Go to Settings",
      sublabel: "설정",
      action: () => router.push("/settings"),
    },
    {
      id: "billing",
      label: "Go to Billing",
      sublabel: "요금제",
      action: () => router.push("/billing"),
    },
    {
      id: "shortcuts",
      label: "Keyboard shortcuts",
      sublabel: "단축키 보기 (Cmd+/)",
      action: () => {
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "/", metaKey: true }));
      },
    },
  ];

  const filtered = commands.filter((c) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return c.label.toLowerCase().includes(q) || (c.sublabel || "").toLowerCase().includes(q);
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
        setQuery("");
        setSelected(0);
      }
      if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    setSelected(0);
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((prev) => Math.min(prev + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter" && filtered[selected]) {
      e.preventDefault();
      filtered[selected].action();
      setOpen(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-start justify-center z-50 pt-[20vh] px-4"
      onClick={() => setOpen(false)}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-3 border-b border-gray-800">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command... / 명령어 입력..."
            className="w-full bg-transparent text-sm focus:outline-none placeholder-gray-500"
          />
        </div>
        <div className="max-h-64 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <p className="text-sm text-gray-500 px-4 py-3">No results / 결과 없음</p>
          ) : (
            filtered.map((cmd, i) => (
              <button
                key={cmd.id}
                onClick={() => {
                  cmd.action();
                  setOpen(false);
                }}
                onMouseEnter={() => setSelected(i)}
                className={`w-full text-left px-4 py-2.5 flex items-center justify-between text-sm transition ${
                  i === selected ? "bg-gray-800 text-white" : "text-gray-400 hover:bg-gray-800/50"
                }`}
              >
                <span>{cmd.label}</span>
                {cmd.sublabel && <span className="text-xs text-gray-600">{cmd.sublabel}</span>}
              </button>
            ))
          )}
        </div>
        <div className="border-t border-gray-800 px-4 py-2 flex items-center justify-between text-[10px] text-gray-600">
          <span>Navigate with arrows, Enter to select</span>
          <span>Esc to close</span>
        </div>
      </div>
    </div>
  );
}
