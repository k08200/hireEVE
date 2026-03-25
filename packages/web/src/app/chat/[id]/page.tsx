"use client";

import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Markdown } from "../../../components/markdown";
import { useToast } from "../../../components/toast";
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
  const [activeTools, setActiveTools] = useState<string[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [attachment, setAttachment] = useState<{ name: string; content: string } | null>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const { toast } = useToast();

  // Load conversation history
  useEffect(() => {
    apiFetch<{ messages: Message[] }>(`/api/chat/conversations/${id}`)
      .then((data) => setMessages(data.messages))
      .catch(() => {});
  }, [id]);

  // Auto-focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

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

  const streamResponse = async (messageContent: string) => {
    setStreaming(true);
    setStreamingContent("");

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(`${API_BASE}/api/chat/conversations/${id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
        headers: { "Content-Type": "application/json" },
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

  return (
    <main className="flex flex-col h-[calc(100vh-3.5rem)]">
      {/* Header */}
      <div className="flex items-center justify-end px-4 pt-2">
        <a
          href={`${API_BASE}/api/chat/conversations/${id}/export`}
          download
          className="text-xs text-gray-500 hover:text-gray-300 transition px-2 py-1 rounded border border-gray-800 hover:border-gray-600"
        >
          Export .md
        </a>
      </div>

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

          {messages.map((msg, idx) => (
            <div
              key={msg.id}
              className={`group flex ${msg.role === "USER" ? "justify-end" : "justify-start"}`}
            >
              <div className="relative">
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                    msg.role === "USER" ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-100"
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
                    >
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                  </button>
                  {msg.role === "ASSISTANT" && (
                    <button
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
                      >
                        <polyline points="23 4 23 10 17 10" />
                        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                      </svg>
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setMessages((prev) => prev.filter((m) => m.id !== msg.id));
                      fetch(`${API_BASE}/api/chat/messages/${msg.id}`, { method: "DELETE" }).catch(
                        () => {},
                      );
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
                    >
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))}

          {/* Streaming message */}
          {streaming && streamingContent && (
            <div className="flex justify-start">
              <div className="max-w-[80%] rounded-2xl px-4 py-3 bg-gray-800 text-gray-100">
                <p className="text-xs text-blue-400 font-medium mb-1">EVE</p>
                <div>
                  <Markdown content={streamingContent} />
                  <span className="inline-block w-2 h-4 bg-blue-400 animate-pulse ml-1" />
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
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        )}
      </div>

      {/* Input area */}
      <div className="border-t border-gray-800 bg-gray-950 px-4 py-4">
        <div className="max-w-3xl mx-auto">
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
              >
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
            </button>
            <textarea
              ref={inputRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Type a message... / 메시지를 입력하세요 (Shift+Enter for new line)"
              rows={1}
              className="flex-1 bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:border-blue-500 transition placeholder-gray-500"
            />
            {streaming ? (
              <button
                type="button"
                onClick={stopGeneration}
                className="bg-red-600 hover:bg-red-500 text-white px-4 py-3 rounded-xl text-sm font-medium transition shrink-0"
              >
                Stop
              </button>
            ) : (
              <button
                type="button"
                onClick={sendMessage}
                disabled={!input.trim() && !attachment}
                className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white px-4 py-3 rounded-xl text-sm font-medium transition shrink-0"
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
