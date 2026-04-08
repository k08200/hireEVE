"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef } from "react";
import { useToast } from "../../components/toast";
import { apiFetch } from "../../lib/api";

export default function ChatListPage() {
  return (
    <Suspense>
      <NewChatWelcome />
    </Suspense>
  );
}

function NewChatWelcome() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const prefillHandled = useRef(false);

  // Handle ?prefill= parameter
  useEffect(() => {
    if (prefillHandled.current) return;
    const prefill = searchParams.get("prefill");
    if (!prefill) return;
    prefillHandled.current = true;

    (async () => {
      try {
        const conv = await apiFetch<{ id: string }>("/api/chat/conversations", {
          method: "POST",
          body: JSON.stringify({}),
        });
        router.push(`/chat/${conv.id}?prefill=${encodeURIComponent(prefill)}`);
      } catch {
        toast("Failed to create conversation", "error");
      }
    })();
  }, [searchParams, router, toast]);

  const startChat = async (initialMessage?: string) => {
    try {
      const conv = await apiFetch<{ id: string }>("/api/chat/conversations", {
        method: "POST",
        body: JSON.stringify({}),
      });
      if (initialMessage) {
        router.push(`/chat/${conv.id}?prefill=${encodeURIComponent(initialMessage)}`);
      } else {
        router.push(`/chat/${conv.id}`);
      }
    } catch {
      toast("Failed to create conversation", "error");
    }
  };

  const suggestions = [
    { label: "Daily briefing", message: "Give me today's briefing" },
    { label: "Check emails", message: "Check my emails" },
    { label: "Show tasks", message: "Show my tasks" },
    { label: "Write a report", message: "Write a report" },
    { label: "Schedule meeting", message: "Schedule a meeting" },
    { label: "Search contacts", message: "Search contacts" },
  ];

  return (
    <div className="flex flex-col items-center justify-center h-full px-4">
      <div className="max-w-2xl w-full text-center">
        <h1 className="text-2xl font-semibold text-gray-100 mb-2">What can I help with?</h1>
        <p className="text-sm text-gray-500 mb-10">
          EVE is ready to assist. Ask anything or pick a suggestion below.
        </p>

        {/* Quick input */}
        <div className="relative mb-8">
          <button
            type="button"
            onClick={() => startChat()}
            className="w-full bg-[#1a1a24] border border-gray-700/50 rounded-2xl px-5 py-4 text-left text-gray-500 text-sm hover:border-gray-600 transition cursor-text"
          >
            Message EVE...
          </button>
        </div>

        {/* Suggestions */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-w-lg mx-auto">
          {suggestions.map((s) => (
            <button
              key={s.message}
              type="button"
              onClick={() => startChat(s.message)}
              className="bg-[#1a1a24] border border-gray-800/60 hover:border-gray-700 rounded-xl px-4 py-3 text-left transition group"
            >
              <p className="text-[13px] text-gray-300 group-hover:text-white transition">
                {s.label}
              </p>
              <p className="text-[11px] text-gray-600 mt-0.5">{s.message}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
