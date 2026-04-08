"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../lib/api";

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
      sublabel: "Open chat",
      action: () => router.push("/chat"),
    },
    {
      id: "new-chat",
      label: "New conversation",
      sublabel: "Start new chat",
      action: () => {
        apiFetch<{ id: string }>("/api/chat/conversations", {
          method: "POST",
        })
          .then((conv) => router.push(`/chat/${conv.id}`))
          .catch(() => router.push("/chat"));
      },
    },
    {
      id: "dashboard",
      label: "Go to Dashboard",
      sublabel: "Dashboard",
      action: () => router.push("/dashboard"),
    },
    {
      id: "email",
      label: "Go to Email",
      sublabel: "Email",
      action: () => router.push("/email"),
    },
    {
      id: "calendar",
      label: "Go to Calendar",
      sublabel: "Calendar",
      action: () => router.push("/calendar"),
    },
    {
      id: "tasks",
      label: "Go to Tasks",
      sublabel: "Task manager",
      action: () => router.push("/tasks"),
    },
    { id: "notes", label: "Go to Notes", sublabel: "Notes", action: () => router.push("/notes") },
    {
      id: "contacts",
      label: "Go to Contacts",
      sublabel: "Contacts",
      action: () => router.push("/contacts"),
    },
    {
      id: "reminders",
      label: "Go to Reminders",
      sublabel: "Reminders",
      action: () => router.push("/reminders"),
    },
    {
      id: "notifications",
      label: "Go to Notifications",
      sublabel: "Notifications",
      action: () => router.push("/notifications"),
    },
    {
      id: "automations",
      label: "Go to Automations",
      sublabel: "Automations",
      action: () => router.push("/automations"),
    },
    {
      id: "settings",
      label: "Go to Settings",
      sublabel: "Settings",
      action: () => router.push("/settings"),
    },
    {
      id: "billing",
      label: "Go to Billing",
      sublabel: "Billing",
      action: () => router.push("/billing"),
    },
    // Quick-create actions
    {
      id: "new-task",
      label: "New task",
      sublabel: "Create new task",
      action: () => router.push("/tasks?new=1"),
    },
    {
      id: "new-note",
      label: "New note",
      sublabel: "Create new note",
      action: () => router.push("/notes?new=1"),
    },
    {
      id: "new-reminder",
      label: "New reminder",
      sublabel: "Create new reminder",
      action: () => router.push("/reminders?new=1"),
    },
    {
      id: "new-contact",
      label: "New contact",
      sublabel: "Add new contact",
      action: () => router.push("/contacts?new=1"),
    },
    {
      id: "shortcuts",
      label: "Keyboard shortcuts",
      sublabel: "View shortcuts (Cmd+/)",
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
            placeholder="Type a command..."
            className="w-full bg-transparent text-sm focus:outline-none placeholder-gray-500"
          />
        </div>
        <div className="max-h-64 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <p className="text-sm text-gray-500 px-4 py-3">No results</p>
          ) : (
            filtered.map((cmd, i) => (
              <button
                type="button"
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
