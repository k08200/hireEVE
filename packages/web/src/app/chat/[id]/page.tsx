"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
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
    <Suspense>
      <ChatPageContent />
    </Suspense>
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
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const prefillHandled = useRef(false);
  const { toast } = useToast();

  // Load conversation
  useEffect(() => {
    apiFetch<{ messages: Message[]; title?: string | null }>(`/api/chat/conversations/${id}`)
      .then((data) => {
        setMessages(data.messages);

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
          streamResponseDirect(prefill);
        }
      })
      .catch(() => {});
  }, [id, searchParams]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

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

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
  };

  const generateSuggestions = (userMsg: string, assistantMsg: string) => {
    const s: string[] = [];
    const lower = `${userMsg} ${assistantMsg}`.toLowerCase();

    if (lower.includes("email") || lower.includes("메일")) {
      s.push("중요한 메일만 보여줘", "답장 써줘");
    } else if (lower.includes("task") || lower.includes("할 일")) {
      s.push("오늘 마감인 것만 보여줘", "우선순위 정리해줘");
    } else if (lower.includes("calendar") || lower.includes("일정")) {
      s.push("이번 주 일정 보여줘", "빈 시간대 찾아줘");
    } else if (lower.includes("note") || lower.includes("메모")) {
      s.push("최근 메모 보여줘", "보고서 작성해줘");
    }

    if (s.length === 0) {
      s.push("더 자세히 설명해줘", "다른 방법은?");
    }
    s.push("요약해줘");
    setSuggestions(s.slice(0, 3));
  };

  const processStream = async (
    res: Response,
    messageContent: string,
  ) => {
    const reader = res.body?.getReader();
    const decoder = new TextDecoder();
    let fullContent = "";

    if (reader) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const text = decoder.decode(value, { stream: true });
          for (const line of text.split("\n")) {
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
              // skip
            }
          }
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          if (fullContent) {
            const partialMsg: Message = {
              id: crypto.randomUUID(),
              role: "ASSISTANT",
              content: `${fullContent}\n\n_[Generation stopped]_`,
              createdAt: new Date().toISOString(),
            };
            setMessages((prev) => [...prev, partialMsg]);
            setStreaming(false);
            setStreamingContent("");
            setActiveTools([]);
            return;
          }
        }
        throw err;
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
  };

  const streamResponseDirect = async (messageContent: string) => {
    setStreaming(true);
    setStreamingContent("");
    setSuggestions([]);

    try {
      const res = await fetch(`${API_BASE}/api/chat/conversations/${id}/messages`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ content: messageContent }),
      });
      await processStream(res, messageContent);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "ASSISTANT",
          content: "Connection failed. Please try again.",
          createdAt: new Date().toISOString(),
        },
      ]);
    }

    setStreaming(false);
    setStreamingContent("");
    setActiveTools([]);
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

      if (res.status === 402) {
        const err = await res.json();
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "ASSISTANT",
            content: `Message limit reached (${err.messageLimit}). Current plan: **${err.plan}**. [Upgrade](/billing)`,
            createdAt: new Date().toISOString(),
          },
        ]);
        setStreaming(false);
        return;
      }

      await processStream(res, messageContent);
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "ASSISTANT",
            content: "Connection failed. Please try again.",
            createdAt: new Date().toISOString(),
          },
        ]);
      }
    }

    abortRef.current = null;
    setStreaming(false);
    setStreamingContent("");
    setActiveTools([]);
    inputRef.current?.focus();
  };

  const retryMessage = async (msgIndex: number) => {
    if (streaming) return;
    const assistantMsg = messages[msgIndex];
    if (!assistantMsg || assistantMsg.role !== "ASSISTANT") return;

    setMessages((prev) => prev.filter((m) => m.id !== assistantMsg.id));
    setStreaming(true);
    setStreamingContent("");

    try {
      const res = await fetch(`${API_BASE}/api/chat/conversations/${id}/retry`, {
        method: "POST",
        headers: authHeaders(),
      });
      await processStream(res, "");
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "ASSISTANT",
          content: "Retry failed. Please try again.",
          createdAt: new Date().toISOString(),
        },
      ]);
    }

    setStreaming(false);
    setStreamingContent("");
    setActiveTools([]);
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

  const copyMessage = (content: string) => {
    navigator.clipboard.writeText(content);
    toast("Copied", "success");
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div ref={scrollAreaRef} className="flex-1 overflow-y-auto relative">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
          {messages.length === 0 && !streaming && (
            <div className="flex flex-col items-center justify-center min-h-[60vh]">
              <h2 className="text-xl font-semibold text-gray-200 mb-2">EVE</h2>
              <p className="text-sm text-gray-500">How can I help you today?</p>
            </div>
          )}

          {messages.map((msg, idx) => (
            <div
              key={msg.id}
              className={`group py-5 ${idx > 0 ? "border-t border-gray-800/30" : ""}`}
            >
              <div className="flex gap-4">
                {/* Avatar */}
                <div className="shrink-0 pt-0.5">
                  {msg.role === "USER" ? (
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-[10px] font-bold text-white">
                      U
                    </div>
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-[10px] font-bold text-white">
                      E
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-gray-300 mb-1.5">
                    {msg.role === "USER" ? "You" : "EVE"}
                  </p>
                  {msg.role === "USER" ? (
                    <p className="text-[15px] text-gray-200 leading-relaxed whitespace-pre-wrap">
                      {msg.content}
                    </p>
                  ) : (
                    <div className="text-[15px] text-gray-200 leading-relaxed">
                      <Markdown content={msg.content} />
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={() => copyMessage(msg.content)}
                      className="p-1.5 rounded-md text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition"
                      title="Copy"
                    >
                      <svg aria-hidden="true"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                    </button>
                    {msg.role === "ASSISTANT" && (
                      <button
                        type="button"
                        onClick={() => retryMessage(idx)}
                        className="p-1.5 rounded-md text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition"
                        title="Retry"
                      >
                        <svg aria-hidden="true"
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="23 4 23 10 17 10" />
                          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}

          {/* Streaming */}
          {streaming && streamingContent && (
            <div className="py-5 border-t border-gray-800/30">
              <div className="flex gap-4">
                <div className="shrink-0 pt-0.5">
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-[10px] font-bold text-white">
                    E
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-gray-300 mb-1.5">EVE</p>
                  <div className="text-[15px] text-gray-200 leading-relaxed">
                    <Markdown content={streamingContent} />
                    <span className="inline-block w-0.5 h-5 bg-gray-400 rounded-full animate-pulse ml-0.5 align-text-bottom" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tool calls */}
          {streaming && activeTools.length > 0 && (
            <div className="py-3">
              <div className="flex gap-4">
                <div className="w-7 shrink-0" />
                <div className="flex flex-wrap gap-2">
                  {activeTools.map((tool) => (
                    <span
                      key={tool}
                      className="inline-flex items-center gap-1.5 text-xs text-amber-400/80 bg-amber-500/10 border border-amber-500/20 rounded-full px-3 py-1"
                    >
                      <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse" />
                      {tool.replace(/_/g, " ")}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Loading dots */}
          {streaming && !streamingContent && activeTools.length === 0 && (
            <div className="py-5 border-t border-gray-800/30">
              <div className="flex gap-4">
                <div className="shrink-0 pt-0.5">
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-[10px] font-bold text-white">
                    E
                  </div>
                </div>
                <div className="flex items-center gap-1.5 pt-2">
                  <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce [animation-delay:0ms]" />
                  <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce [animation-delay:150ms]" />
                  <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Scroll to bottom */}
        {showScrollBtn && (
          <button
            type="button"
            onClick={() => bottomRef.current?.scrollIntoView({ behavior: "smooth" })}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-gray-800 hover:bg-gray-700 border border-gray-600 text-gray-300 rounded-full w-9 h-9 flex items-center justify-center shadow-lg transition"
          >
            <svg aria-hidden="true"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        )}
      </div>

      {/* Input area */}
      <div className="shrink-0 px-4 pb-4 pt-2">
        <div className="max-w-3xl mx-auto">
          {/* Suggestions */}
          {suggestions.length > 0 && !streaming && (
            <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
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
                  className="text-[13px] text-gray-400 border border-gray-700/50 hover:border-gray-600 hover:text-gray-200 rounded-full px-4 py-1.5 transition whitespace-nowrap shrink-0"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Attachment preview */}
          {attachment && (
            <div className="flex items-center gap-2 mb-2 bg-gray-900 border border-gray-700/50 rounded-xl px-3 py-2 text-xs">
              <svg aria-hidden="true"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="text-gray-400 shrink-0"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              <span className="text-gray-300 truncate flex-1">{attachment.name}</span>
              <button
                type="button"
                onClick={() => setAttachment(null)}
                className="text-gray-500 hover:text-red-400 transition shrink-0 text-sm"
              >
                x
              </button>
            </div>
          )}

          {/* Input box */}
          <div className="bg-[#1a1a24] border border-gray-700/50 rounded-2xl focus-within:border-gray-600 transition">
            <textarea
              ref={inputRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Message EVE..."
              rows={1}
              className="w-full bg-transparent px-5 pt-4 pb-2 text-[15px] resize-none focus:outline-none placeholder-gray-500 max-h-[200px]"
            />
            <div className="flex items-center justify-between px-3 pb-3">
              <div className="flex items-center gap-1">
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
                  className="p-2 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-gray-800/50 transition"
                  title="Attach file"
                >
                  <svg
                    aria-hidden="true"
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                  </svg>
                </button>
                <VoiceButton
                  onTranscript={(text) => {
                    setInput((prev) => (prev ? `${prev} ${text}` : text));
                    inputRef.current?.focus();
                  }}
                  className="p-2 rounded-lg"
                />
              </div>

              {streaming ? (
                <button
                  type="button"
                  onClick={() => abortRef.current?.abort()}
                  className="p-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white transition"
                  title="Stop"
                >
                  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="6" width="12" height="12" rx="2" />
                  </svg>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={sendMessage}
                  disabled={!input.trim() && !attachment}
                  className="p-2 rounded-lg bg-white text-gray-900 hover:bg-gray-200 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed transition"
                  title="Send"
                >
                  <svg
                    aria-hidden="true"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="12" y1="19" x2="12" y2="5" />
                    <polyline points="5 12 12 5 19 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          <p className="text-center text-[11px] text-gray-600 mt-2">
            EVE can make mistakes. Verify important information.
          </p>
        </div>
      </div>
    </div>
  );
}
