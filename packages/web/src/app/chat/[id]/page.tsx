"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import AuthGuard from "../../../components/auth-guard";
import { Markdown } from "../../../components/markdown";
import { useToast } from "../../../components/toast";
import VoiceButton from "../../../components/voice-button";
import { API_BASE, apiFetch, authHeaders } from "../../../lib/api";

interface Message {
  id: string;
  role: "USER" | "ASSISTANT" | "SYSTEM";
  content: string;
  createdAt: string;
}

export default function ChatPage() {
  return (
    <AuthGuard>
      <Suspense>
        <ChatPageContent />
      </Suspense>
    </AuthGuard>
  );
}

function ChatPageContent() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [activeTools, setActiveTools] = useState<string[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [attachment, setAttachment] = useState<{ name: string; content: string } | null>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [title, setTitle] = useState("");
  const [reactions, setReactions] = useState<Record<string, "up" | "down">>({});
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const prefillHandled = useRef(false);
  const { toast } = useToast();

  // Load reactions from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(`eve-reactions-${id}`);
      if (stored) setReactions(JSON.parse(stored));
    } catch {
      // ignore
    }
  }, [id]);

  const toggleReaction = (msgId: string, type: "up" | "down") => {
    setReactions((prev) => {
      const next = { ...prev };
      if (next[msgId] === type) {
        delete next[msgId];
      } else {
        next[msgId] = type;
      }
      localStorage.setItem(`eve-reactions-${id}`, JSON.stringify(next));
      return next;
    });
  };

  // Load conversation history + title, then handle ?prefill= auto-send
  useEffect(() => {
    apiFetch<{ messages: Message[]; title?: string | null }>(`/api/chat/conversations/${id}`)
      .then((data) => {
        setMessages(data.messages);
        if (data.title) setTitle(data.title);

        // Auto-send prefill message (from Email "Ask EVE to Reply" etc.)
        const prefill = searchParams.get("prefill");
        if (prefill && !prefillHandled.current && data.messages.length === 0) {
          prefillHandled.current = true;
          const userMsg: Message = {
            id: crypto.randomUUID(),
            role: "USER",
            content: prefill,
            createdAt: new Date().toISOString(),
          };
          setMessages([userMsg]);
          // Delay slightly so streamResponse is available
          setTimeout(() => {
            setStreaming(true);
            setStreamingContent("");
            setSuggestions([]);
            fetch(`${API_BASE}/api/chat/conversations/${id}/messages`, {
              method: "POST",
              headers: authHeaders(),
              body: JSON.stringify({ content: prefill }),
            })
              .then(async (res) => {
                const reader = res.body?.getReader();
                const decoder = new TextDecoder();
                let fullContent = "";
                if (reader) {
                  while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    const text = decoder.decode(value, { stream: true });
                    for (const line of text.split("\n")) {
                      if (!line.startsWith("data: ")) continue;
                      try {
                        const d = JSON.parse(line.slice(6));
                        if (d.type === "token") {
                          fullContent += d.content;
                          setStreamingContent(fullContent);
                        }
                      } catch { /* skip */ }
                    }
                  }
                }
                const assistantMsg: Message = {
                  id: crypto.randomUUID(),
                  role: "ASSISTANT",
                  content: fullContent,
                  createdAt: new Date().toISOString(),
                };
                setMessages((prev) => [...prev, assistantMsg]);
              })
              .catch(() => {
                setMessages((prev) => [
                  ...prev,
                  { id: crypto.randomUUID(), role: "ASSISTANT", content: "Connection failed. Please try again.", createdAt: new Date().toISOString() },
                ]);
              })
              .finally(() => {
                setStreaming(false);
                setStreamingContent("");
              });
          }, 100);
        }
      })
      .catch(() => {});
  }, [id, searchParams]);

  // Auto-focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  // Cmd+F to toggle in-chat search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault();
        setSearchOpen((prev) => {
          if (!prev) {
            setTimeout(() => searchInputRef.current?.focus(), 50);
          } else {
            setSearchQuery("");
          }
          return !prev;
        });
      }
      if (e.key === "Escape" && searchOpen) {
        setSearchOpen(false);
        setSearchQuery("");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [searchOpen]);

  // Detect scroll position for scroll-to-bottom button
  useEffect(() => {
    const el = scrollAreaRef.current;
    if (!el) return;
    const handler = () => {
      const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      setShowScrollBtn(distFromBottom > 200);
    };
    el.addEventListener("scroll", handler);
    return () => el.removeEventListener("scroll", handler);
  }, []);

  // Auto-resize textarea
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
  };

  const generateSuggestions = (userMsg: string, assistantMsg: string) => {
    // Simple context-based suggestion generation
    const suggestions: string[] = [];
    const lower = `${userMsg} ${assistantMsg}`.toLowerCase();

    if (lower.includes("email") || lower.includes("메일")) {
      suggestions.push("중요한 메일만 보여줘", "답장 써줘");
    } else if (lower.includes("task") || lower.includes("할 일")) {
      suggestions.push("오늘 마감인 것만 보여줘", "우선순위 정리해줘");
    } else if (lower.includes("calendar") || lower.includes("일정")) {
      suggestions.push("이번 주 일정 보여줘", "빈 시간대 찾아줘");
    } else if (lower.includes("note") || lower.includes("메모")) {
      suggestions.push("최근 메모 보여줘", "보고서 작성해줘");
    } else if (lower.includes("contact") || lower.includes("연락처")) {
      suggestions.push("최근 추가된 연락처", "태그별로 정리해줘");
    }

    // Always add generic follow-ups
    if (suggestions.length === 0) {
      suggestions.push("더 자세히 설명해줘", "다른 방법은?");
    }
    suggestions.push("요약해줘");

    setSuggestions(suggestions.slice(0, 3));
  };

  const streamResponse = async (messageContent: string) => {
    setStreaming(true);
    setStreamingContent("");
    setSuggestions([]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(`${API_BASE}/api/chat/conversations/${id}/messages`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ content: messageContent }),
        signal: controller.signal,
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
              } else if (data.type === "tool_call") {
                setActiveTools((prev) => [...prev, data.name]);
              } else if (data.type === "tool_result") {
                setActiveTools((prev) => prev.filter((t) => t !== data.name));
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

      const assistantMsg: Message = {
        id: crypto.randomUUID(),
        role: "ASSISTANT",
        content: fullContent,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
      generateSuggestions(messageContent, fullContent);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        // User stopped generation — save partial content
        const partial = streamingContent;
        if (partial) {
          const partialMsg: Message = {
            id: crypto.randomUUID(),
            role: "ASSISTANT",
            content: `${partial}\n\n_[Generation stopped]_`,
            createdAt: new Date().toISOString(),
          };
          setMessages((prev) => [...prev, partialMsg]);
        }
      } else {
        const errorMsg: Message = {
          id: crypto.randomUUID(),
          role: "ASSISTANT",
          content: "Connection failed. Please try again.",
          createdAt: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, errorMsg]);
      }
    }

    abortRef.current = null;
    setStreaming(false);
    setStreamingContent("");
    setActiveTools([]);
    inputRef.current?.focus();
  };

  const stopGeneration = () => {
    abortRef.current?.abort();
  };

  const sendMessage = async () => {
    let content = input.trim();
    if (!content && !attachment) return;
    if (streaming) return;

    if (attachment) {
      const prefix = `[Attached file: ${attachment.name}]\n\`\`\`\n${attachment.content.slice(0, 8000)}\n\`\`\`\n\n`;
      content = prefix + content;
      setAttachment(null);
    }

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "USER",
      content,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");

    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }

    await streamResponse(content);
  };

  const retryMessage = async (msgIndex: number) => {
    if (streaming) return;
    const assistantMsg = messages[msgIndex];
    if (!assistantMsg || assistantMsg.role !== "ASSISTANT") return;

    // Remove this assistant message from UI
    setMessages((prev) => prev.filter((m) => m.id !== assistantMsg.id));
    setStreaming(true);
    setStreamingContent("");

    try {
      const res = await fetch(`${API_BASE}/api/chat/conversations/${id}/retry`, {
        method: "POST",
        headers: authHeaders(),
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
              } else if (data.type === "tool_call") {
                setActiveTools((prev) => [...prev, data.name]);
              } else if (data.type === "tool_result") {
                setActiveTools((prev) => prev.filter((t) => t !== data.name));
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

      const newAssistantMsg: Message = {
        id: crypto.randomUUID(),
        role: "ASSISTANT",
        content: fullContent,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, newAssistantMsg]);
    } catch {
      const errorMsg: Message = {
        id: crypto.randomUUID(),
        role: "ASSISTANT",
        content: "Retry failed. Please try again.",
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    }

    setStreaming(false);
    setStreamingContent("");
    setActiveTools([]);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 512_000) {
      toast("File too large (max 500KB)", "error");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setAttachment({ name: file.name, content: reader.result as string });
    };
    if (
      file.type.startsWith("text/") ||
      file.name.match(/\.(json|csv|md|txt|yaml|yml|xml|log)$/i)
    ) {
      reader.readAsText(file);
    } else {
      reader.readAsDataURL(file);
    }
    e.target.value = "";
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const searchMatchCount = searchQuery
    ? messages.filter((m) => m.content.toLowerCase().includes(searchQuery.toLowerCase())).length
    : 0;

  return (
    <main className="flex flex-col h-[calc(100vh-3.5rem)]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-2 gap-2">
        <h2 className="text-sm font-medium text-gray-400 truncate">
          {title || "New conversation"}
        </h2>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              setSearchOpen((prev) => !prev);
              if (!searchOpen) setTimeout(() => searchInputRef.current?.focus(), 50);
              else setSearchQuery("");
            }}
            className="text-gray-500 hover:text-gray-300 transition p-1"
            title="Search messages (Cmd+F)"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              role="img"
              aria-label="Search"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </button>
          <a
            href={`${API_BASE}/api/chat/conversations/${id}/export`}
            download
            className="text-xs text-gray-500 hover:text-gray-300 transition px-2 py-1 rounded border border-gray-800 hover:border-gray-600"
          >
            Export .md
          </a>
        </div>
      </div>

      {/* Search bar */}
      {searchOpen && (
        <div className="px-4 py-2 border-b border-gray-800 bg-gray-900/50">
          <div className="max-w-3xl mx-auto flex items-center gap-2">
            <input
              ref={searchInputRef}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search in conversation... / 대화에서 검색..."
              className="flex-1 bg-transparent text-sm focus:outline-none placeholder-gray-500"
            />
            {searchQuery && <span className="text-xs text-gray-500">{searchMatchCount} found</span>}
            <button
              type="button"
              onClick={() => {
                setSearchOpen(false);
                setSearchQuery("");
              }}
              className="text-gray-500 hover:text-gray-300 text-xs transition"
            >
              Esc
            </button>
          </div>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollAreaRef} className="flex-1 overflow-y-auto px-4 py-6 relative">
        <div className="max-w-3xl mx-auto space-y-4">
          {messages.length === 0 && !streaming && (
            <div className="text-center py-20">
              <h2 className="text-xl font-semibold mb-2">EVE</h2>
              <p className="text-gray-400 mb-6">How can I help you today? / 무엇을 도와드릴까요?</p>
              <div className="flex flex-wrap gap-2 justify-center max-w-lg mx-auto">
                {[
                  "오늘 브리핑 해줘",
                  "메일 확인해줘",
                  "할 일 보여줘",
                  "보고서 써줘",
                  "일정 잡아줘",
                  "연락처 검색",
                ].map((q) => (
                  <button
                    type="button"
                    key={q}
                    onClick={() => {
                      const userMsg: Message = {
                        id: crypto.randomUUID(),
                        role: "USER",
                        content: q,
                        createdAt: new Date().toISOString(),
                      };
                      setMessages((prev) => [...prev, userMsg]);
                      streamResponse(q);
                    }}
                    className="bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 px-3 py-1.5 rounded-lg text-xs transition"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, idx) => {
            const isSearchMatch =
              searchQuery && msg.content.toLowerCase().includes(searchQuery.toLowerCase());
            const dimmed = searchQuery && !isSearchMatch;

            return (
              <div
                key={msg.id}
                className={`group flex ${msg.role === "USER" ? "justify-end" : "justify-start"} ${dimmed ? "opacity-30" : ""} transition-opacity`}
              >
                <div className="relative">
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                      msg.role === "USER" ? "bg-blue-600 text-white shadow-sm shadow-blue-600/20" : "bg-gray-800/80 border border-gray-700/40 text-gray-100"
                    }`}
                  >
                    {msg.role !== "USER" && (
                      <p className="text-xs text-blue-400 font-medium mb-1">EVE</p>
                    )}
                    {msg.role === "USER" ? (
                      <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</p>
                    ) : (
                      <Markdown content={msg.content} />
                    )}
                    <p
                      className={`text-[10px] mt-1 opacity-0 group-hover:opacity-100 transition-opacity ${msg.role === "USER" ? "text-blue-200" : "text-gray-500"}`}
                    >
                      {new Date(msg.createdAt).toLocaleTimeString("ko-KR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <div
                    className={`absolute top-1 ${msg.role === "USER" ? "left-0 -translate-x-full pr-1" : "right-0 translate-x-full pl-1"} opacity-0 group-hover:opacity-100 transition-opacity flex gap-0.5`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(msg.content);
                        toast("Copied to clipboard", "success");
                      }}
                      className="text-gray-600 hover:text-gray-300 p-1 rounded transition"
                      title="Copy"
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        role="img"
                        aria-label="Copy"
                      >
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                    </button>
                    {msg.role === "ASSISTANT" && (
                      <>
                        <button
                          type="button"
                          onClick={() => toggleReaction(msg.id, "up")}
                          className={`p-1 rounded transition ${reactions[msg.id] === "up" ? "text-green-400" : "text-gray-600 hover:text-green-400"}`}
                          title="Good response / 좋은 답변"
                        >
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill={reactions[msg.id] === "up" ? "currentColor" : "none"}
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            role="img"
                            aria-label="Thumbs up"
                          >
                            <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleReaction(msg.id, "down")}
                          className={`p-1 rounded transition ${reactions[msg.id] === "down" ? "text-red-400" : "text-gray-600 hover:text-red-400"}`}
                          title="Bad response / 나쁜 답변"
                        >
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill={reactions[msg.id] === "down" ? "currentColor" : "none"}
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            role="img"
                            aria-label="Thumbs down"
                          >
                            <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => retryMessage(idx)}
                          className="text-gray-600 hover:text-yellow-400 p-1 rounded transition"
                          title="Retry / 다시 생성"
                        >
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            role="img"
                            aria-label="Retry"
                          >
                            <polyline points="23 4 23 10 17 10" />
                            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                          </svg>
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setMessages((prev) => prev.filter((m) => m.id !== msg.id));
                        fetch(`${API_BASE}/api/chat/messages/${msg.id}`, {
                          method: "DELETE",
                          headers: authHeaders(),
                        }).catch(() => {});
                        toast("Message deleted", "info");
                      }}
                      className="text-gray-600 hover:text-red-400 p-1 rounded transition"
                      title="Delete"
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        role="img"
                        aria-label="Delete"
                      >
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Streaming message */}
          {streaming && streamingContent && (
            <div className="flex justify-start">
              <div className="max-w-[80%] rounded-2xl px-4 py-3 bg-gray-800/80 border border-gray-700/40 text-gray-100">
                <p className="text-xs text-blue-400 font-medium mb-1">EVE</p>
                <div>
                  <Markdown content={streamingContent} />
                  <span className="inline-block w-1.5 h-4 bg-blue-400 rounded-sm animate-pulse ml-0.5" />
                </div>
              </div>
            </div>
          )}

          {/* Tool call indicator */}
          {streaming && activeTools.length > 0 && (
            <div className="flex justify-start">
              <div className="rounded-2xl px-4 py-2 bg-gray-800/50 border border-gray-700">
                {activeTools.map((tool) => (
                  <div key={tool} className="flex items-center gap-2 text-xs text-yellow-400">
                    <span className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
                    {tool.replace(/_/g, " ")}...
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Loading indicator */}
          {streaming && !streamingContent && activeTools.length === 0 && (
            <div className="flex justify-start">
              <div className="rounded-2xl px-4 py-3 bg-gray-800">
                <p className="text-xs text-blue-400 font-medium mb-1">EVE</p>
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce [animation-delay:0ms]" />
                    <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce [animation-delay:150ms]" />
                    <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce [animation-delay:300ms]" />
                  </div>
                  <span className="text-xs text-gray-500">Thinking...</span>
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Scroll to bottom button */}
        {showScrollBtn && (
          <button
            type="button"
            onClick={() => bottomRef.current?.scrollIntoView({ behavior: "smooth" })}
            className="absolute bottom-4 right-6 bg-gray-800 hover:bg-gray-700 border border-gray-600 text-gray-300 rounded-full w-9 h-9 flex items-center justify-center shadow-lg transition"
            title="Scroll to bottom"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              role="img"
              aria-label="Scroll down"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        )}
      </div>

      {/* Input area */}
      <div className="border-t border-gray-800/60 bg-gray-950/90 backdrop-blur-md px-4 py-3">
        <div className="max-w-3xl mx-auto">
          {/* Suggestion chips */}
          {suggestions.length > 0 && !streaming && (
            <div className="flex gap-2 mb-2 overflow-x-auto">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    const userMsg: Message = {
                      id: crypto.randomUUID(),
                      role: "USER",
                      content: s,
                      createdAt: new Date().toISOString(),
                    };
                    setMessages((prev) => [...prev, userMsg]);
                    setSuggestions([]);
                    streamResponse(s);
                  }}
                  className="bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 px-3 py-1.5 rounded-lg text-xs transition whitespace-nowrap shrink-0"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          {attachment && (
            <div className="flex items-center gap-2 mb-2 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-blue-400 shrink-0"
                role="img"
                aria-label="File"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              <span className="text-gray-300 truncate flex-1">{attachment.name}</span>
              <button
                type="button"
                onClick={() => setAttachment(null)}
                className="text-gray-500 hover:text-red-400 transition shrink-0"
              >
                ✕
              </button>
            </div>
          )}
          <div className="flex gap-2 items-end">
            <input
              ref={fileRef}
              type="file"
              onChange={handleFileSelect}
              accept=".txt,.md,.json,.csv,.yaml,.yml,.xml,.log,.js,.ts,.py,.html,.css"
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="text-gray-500 hover:text-gray-300 p-3 transition shrink-0"
              title="Attach file"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                role="img"
                aria-label="Attach file"
              >
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
            </button>
            <VoiceButton
              onTranscript={(text) => {
                setInput((prev) => (prev ? `${prev} ${text}` : text));
                inputRef.current?.focus();
              }}
              className="p-3 shrink-0"
            />
            <textarea
              ref={inputRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Type a message... / 메시지를 입력하세요 (Shift+Enter for new line)"
              rows={1}
              className="flex-1 bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition-colors placeholder-gray-500"
            />
            {streaming ? (
              <button
                type="button"
                onClick={stopGeneration}
                className="bg-red-600/90 hover:bg-red-500 text-white px-4 py-3 rounded-xl text-sm font-medium transition-colors shrink-0"
              >
                Stop
              </button>
            ) : (
              <button
                type="button"
                onClick={sendMessage}
                disabled={!input.trim() && !attachment}
                className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 disabled:text-gray-500 disabled:cursor-not-allowed text-white px-4 py-3 rounded-xl text-sm font-medium transition-colors shrink-0 shadow-sm shadow-blue-600/20"
              >
                Send
              </button>
            )}
          </div>
          <div className="flex justify-between mt-1 px-1">
            <span className="text-[10px] text-gray-600">{messages.length} messages</span>
            {input.length > 0 && (
              <span
                className={`text-[10px] ${input.length > 4000 ? "text-red-400" : "text-gray-600"}`}
              >
                {input.length.toLocaleString()} chars
              </span>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
