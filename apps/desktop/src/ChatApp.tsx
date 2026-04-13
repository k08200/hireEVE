import { useState, useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import ChatPanel from "./components/ChatPanel";
import LoginPanel from "./components/LoginPanel";
import "./styles.css";

const API_BASE = "http://localhost:8000";

function ChatApp() {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<{ name?: string; email: string } | null>(null);
  const [loading, setLoading] = useState(true);

  // Check for existing token on mount
  useEffect(() => {
    const saved = localStorage.getItem("eve-token");
    if (saved) {
      verifyToken(saved);
    } else {
      setLoading(false);
    }
  }, []);

  const verifyToken = async (t: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/me`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (res.ok) {
        const data = await res.json();
        setToken(t);
        setUser({ name: data.name, email: data.email });
      } else {
        localStorage.removeItem("eve-token");
      }
    } catch {
      // API not reachable, keep token for later
      setToken(t);
    }
    setLoading(false);
  };

  const handleLogin = (t: string, u: { name?: string; email: string }) => {
    localStorage.setItem("eve-token", t);
    setToken(t);
    setUser(u);
  };

  const handleLogout = () => {
    localStorage.removeItem("eve-token");
    setToken(null);
    setUser(null);
  };

  if (loading) {
    return (
      <div className="chat-window">
        <div className="chat-loading">Loading...</div>
      </div>
    );
  }

  return (
    <div className="chat-window">
      <div
        className="chat-title-bar"
        onMouseDown={() => getCurrentWindow().startDragging()}
      >
        <div className="chat-title-info">
          <div className="chat-dot-green" />
          <span>EVE</span>
          {user && <span className="chat-title-user">{user.name || user.email}</span>}
        </div>
        <div className="chat-title-actions">
          {token && (
            <button className="chat-logout-btn" onClick={handleLogout} title="Logout">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          )}
          <button
            className="chat-title-close"
            onClick={() => getCurrentWindow().close()}
          >
            ✕
          </button>
        </div>
      </div>
      {token ? (
        <ChatPanel onClose={() => getCurrentWindow().close()} />
      ) : (
        <LoginPanel onLogin={handleLogin} />
      )}
    </div>
  );
}

export default ChatApp;
