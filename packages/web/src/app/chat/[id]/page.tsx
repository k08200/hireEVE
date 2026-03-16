"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { apiFetch } from "../../../lib/api";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Message {
  id: string;
  role: "USER" | "ASSISTANT" | "SYSTEM";
  content: string;
  createdAt: string;
}

export default function ChatPage() {
  const { id } = useParams<{ id: string }>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Load conversation history
  useEffect(() => {
    apiFetch<{ messages: Message[] }>(`/api/chat/conversations/${id}`)
      .then((data) => setMessages(data.messages))
      .catch(() => {});
  }, [id]);

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  // Auto-resize textarea
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 200) + "px";
  };

  const sendMessage = async () => {
    const content = input.trim();
    if (!content || streaming) return;

    // Add user message immediately
    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "USER",
      content,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setStreaming(true);
    setStreamingContent("");

    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }

    try {
      const res = await fetch(`${API_BASE}/api/chat/conversations/${id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let fullContent = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const text = decoder.decode(value, { stream: true });
          const lines = text.split("\n");

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === "token") {
                fullContent += data.content;
                setStreamingContent(fullContent);
              } else if (data.type === "error") {
                fullContent += `\n\n[Error: ${data.content}]`;
                setStreamingContent(fullContent);
              }
            } catch {
              // skip malformed JSON
            }
          }
        }
      }

      // Replace streaming content with final message
      const assistantMsg: Message = {
        id: crypto.randomUUID(),
        role: "ASSISTANT",
        content: fullContent,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch {
      const errorMsg: Message = {
        id: crypto.randomUUID(),
        role: "ASSISTANT",
        content: "Connection failed. Please try again.",
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    }

    setStreaming(false);
    setStreamingContent("");
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <main className="flex flex-col h-[calc(100vh-3.5rem)]">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-3xl mx-auto space-y-4">
          {messages.length === 0 && !streaming && (
            <div className="text-center py-20">
              <h2 className="text-xl font-semibold mb-2">EVE</h2>
              <p className="text-gray-400">How can I help you today?</p>
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === "USER" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                  msg.role === "USER"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-800 text-gray-100"
                }`}
              >
                {msg.role !== "USER" && (
                  <p className="text-xs text-blue-400 font-medium mb-1">EVE</p>
                )}
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</p>
              </div>
            </div>
          ))}

          {/* Streaming message */}
          {streaming && streamingContent && (
            <div className="flex justify-start">
              <div className="max-w-[80%] rounded-2xl px-4 py-3 bg-gray-800 text-gray-100">
                <p className="text-xs text-blue-400 font-medium mb-1">EVE</p>
                <p className="whitespace-pre-wrap text-sm leading-relaxed">
                  {streamingContent}
                  <span className="inline-block w-2 h-4 bg-blue-400 animate-pulse ml-1" />
                </p>
              </div>
            </div>
          )}

          {/* Loading indicator */}
          {streaming && !streamingContent && (
            <div className="flex justify-start">
              <div className="rounded-2xl px-4 py-3 bg-gray-800">
                <p className="text-xs text-blue-400 font-medium mb-1">EVE</p>
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce [animation-delay:0ms]" />
                  <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce [animation-delay:150ms]" />
                  <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input area */}
      <div className="border-t border-gray-800 bg-gray-950 px-4 py-4">
        <div className="max-w-3xl mx-auto flex gap-3 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Type a message... (Shift+Enter for new line)"
            rows={1}
            className="flex-1 bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:border-blue-500 transition placeholder-gray-500"
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || streaming}
            className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white px-4 py-3 rounded-xl text-sm font-medium transition shrink-0"
          >
            Send
          </button>
        </div>
      </div>
    </main>
  );
}
