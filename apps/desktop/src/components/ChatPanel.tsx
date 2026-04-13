import { useEffect, useRef, useState } from "react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const API_BASE = "http://localhost:8000";

function getToken(): string | null {
  try {
    return localStorage.getItem("eve-token");
  } catch {
    return null;
  }
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

interface ChatPanelProps {
  onClose: () => void;
}

export default function ChatPanel({ onClose }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const sendingRef = useRef(false);

  useEffect(() => {
    inputRef.current?.focus();
    loadLastConversation();
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const loadLastConversation = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/chat/conversations`, {
        headers: authHeaders(),
      });
      if (!res.ok) return;
      const convs = await res.json();
      if (Array.isArray(convs) && convs.length > 0) {
        const last = convs[0];
        setConversationId(last.id);
        const msgRes = await fetch(`${API_BASE}/api/chat/conversations/${last.id}`, {
          headers: authHeaders(),
        });
        if (msgRes.ok) {
          const data = await msgRes.json();
          if (data.messages && Array.isArray(data.messages)) {
            setMessages(
              data.messages.map((m: { id: string; role: string; content: string }) => ({
                id: m.id,
                role: m.role === "user" ? "user" : "assistant",
                content: m.content,
              }))
            );
          }
        }
      }
    } catch {
      // Fresh conversation
    }
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || streaming || sendingRef.current) return;
    sendingRef.current = true;

    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      let convId = conversationId;
      if (!convId) {
        const res = await fetch(`${API_BASE}/api/chat/conversations`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({}),
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("Failed to create conversation");
        const data = await res.json();
        convId = data.id;
        setConversationId(convId);
      }

      const res = await fetch(
        `${API_BASE}/api/chat/conversations/${convId}/messages`,
        {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ content: text }),
          signal: controller.signal,
        }
      );

      if (!res.ok) {
        let errorMsg = `Error ${res.status}`;
        try {
          const errData = await res.json();
          errorMsg = errData.error || errorMsg;
        } catch { /* ignore */ }
        setMessages((prev) => [
          ...prev,
          { id: crypto.randomUUID(), role: "assistant", content: errorMsg },
        ]);
        return;
      }

      const assistantId = crypto.randomUUID();
      setMessages((prev) => [
        ...prev,
        { id: assistantId, role: "assistant", content: "" },
      ]);

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = "";

      if (reader) {
        try {
          let done = false;
          while (!done) {
            const result = await reader.read();
            done = result.done;
            if (result.value) {
              sseBuffer += decoder.decode(result.value, { stream: true });
              const lines = sseBuffer.split("\n");
              sseBuffer = lines.pop() || "";
              for (const line of lines) {
                if (!line.startsWith("data: ")) continue;
                try {
                  const data = JSON.parse(line.slice(6));
                  if (data.type === "token" && data.content) {
                    setMessages((prev) =>
                      prev.map((m) =>
                        m.id === assistantId
                          ? { ...m, content: m.content + data.content }
                          : m
                      )
                    );
                  }
                } catch {
                  // ignore parse errors
                }
              }
            }
          }
        } finally {
          reader.releaseLock();
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "assistant", content: "Connection error. Is the API server running?" },
      ]);
    } finally {
      abortRef.current = null;
      sendingRef.current = false;
      setStreaming(false);
    }
  };

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <div className="chat-header-info">
          <div className="chat-header-dot" />
          <span>EVE</span>
        </div>
        <button className="chat-close-btn" onClick={onClose}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>

      <div className="chat-messages" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="chat-empty">
            <p>Hi! I'm EVE, your AI employee.</p>
            <p className="chat-empty-sub">Ask me anything or give me a task.</p>
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={`chat-msg chat-msg-${msg.role}`}>
            <div className={`chat-bubble chat-bubble-${msg.role}`}>
              {msg.content}
              {msg.role === "assistant" && streaming && msg === messages[messages.length - 1] && (
                <span className="chat-cursor">▊</span>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="chat-input-area">
        <textarea
          ref={inputRef}
          className="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendMessage();
            }
          }}
          placeholder="Message EVE..."
          rows={1}
          disabled={streaming}
        />
        <button
          className="chat-send-btn"
          onClick={sendMessage}
          disabled={streaming || !input.trim()}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    </div>
  );
}
