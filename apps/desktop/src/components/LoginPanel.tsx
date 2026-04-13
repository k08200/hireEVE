import { useState, useRef, useEffect } from "react";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

const API_BASE = "http://localhost:8000";

interface LoginPanelProps {
  onLogin: (token: string, user: { name?: string; email: string }) => void;
}

export default function LoginPanel({ onLogin }: LoginPanelProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"login" | "register" | "google-polling">("login");
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const oauthWinRef = useRef<WebviewWindow | null>(null);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    setLoading(true);
    setError("");

    try {
      const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Authentication failed");
        return;
      }

      onLogin(data.token, { name: data.user?.name, email: data.user?.email || email });
    } catch {
      setError("Cannot connect to server");
    } finally {
      setLoading(false);
    }
  };

  const startPolling = (nonce: string) => {
    pollingRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/auth/desktop-token/${nonce}`);
        const data = await res.json();

        if (data.status === "ok" && data.token) {
          if (pollingRef.current) clearInterval(pollingRef.current);
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          pollingRef.current = null;
          timeoutRef.current = null;

          // Close OAuth window
          try { oauthWinRef.current?.close(); } catch { /* ignore */ }
          oauthWinRef.current = null;

          // Verify token and get user info
          const meRes = await fetch(`${API_BASE}/api/auth/me`, {
            headers: { Authorization: `Bearer ${data.token}` },
          });
          if (meRes.ok) {
            const meData = await meRes.json();
            onLogin(data.token, { name: meData.user?.name, email: meData.user?.email });
          } else {
            setError("Failed to verify login");
            setLoading(false);
            setMode("login");
          }
        }
      } catch {
        // Network error — keep polling
      }
    }, 2000);

    timeoutRef.current = setTimeout(() => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
        try { oauthWinRef.current?.close(); } catch { /* ignore */ }
        setError("Login timed out. Please try again.");
        setLoading(false);
        setMode("login");
      }
    }, 3 * 60 * 1000);
  };

  const handleGoogleLogin = async () => {
    const nonce = crypto.randomUUID();
    const url = `${API_BASE}/api/auth/google/login?source=desktop&nonce=${nonce}`;

    setMode("google-polling");
    setError("");
    setLoading(true);

    // Open Google OAuth in a new Tauri WebviewWindow
    try {
      const oauthWin = new WebviewWindow("google-oauth", {
        url,
        title: "Sign in with Google",
        width: 500,
        height: 700,
        center: true,
        resizable: true,
        decorations: true,
        alwaysOnTop: true,
      });

      oauthWinRef.current = oauthWin;

      oauthWin.once("tauri://destroyed", () => {
        oauthWinRef.current = null;
      });
    } catch (err) {
      console.error("Failed to open OAuth window:", err);
      setError("Failed to open login window: " + String(err));
      setLoading(false);
      setMode("login");
      return;
    }

    // Start polling for token
    startPolling(nonce);
  };

  const cancelGoogleLogin = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    try { oauthWinRef.current?.close(); } catch { /* ignore */ }
    oauthWinRef.current = null;
    setMode("login");
    setLoading(false);
    setError("");
  };

  return (
    <div className="login-panel">
      <div className="login-logo">
        <svg width="48" height="48" viewBox="0 0 84 84">
          <defs>
            <radialGradient id="lg" cx="50%" cy="40%" r="50%">
              <stop offset="0%" stopColor="#1e3a5f" />
              <stop offset="100%" stopColor="#0f172a" />
            </radialGradient>
          </defs>
          <circle cx="42" cy="42" r="28" fill="url(#lg)" stroke="#3b82f6" strokeWidth="1.5" strokeOpacity="0.6" />
          <ellipse cx="34" cy="38" rx="3" ry="5" fill="#60a5fa" />
          <ellipse cx="50" cy="38" rx="3" ry="5" fill="#60a5fa" />
          <circle cx="35.5" cy="36" r="1" fill="white" opacity="0.8" />
          <circle cx="51.5" cy="36" r="1" fill="white" opacity="0.8" />
          <path d="M 36 52 Q 42 56 48 52" fill="none" stroke="#60a5fa" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <h2 className="login-title">EVE</h2>
        <p className="login-subtitle">Your AI Employee</p>
      </div>

      {mode === "google-polling" ? (
        <div className="login-form">
          <p className="login-token-info">
            Complete login in the Google window.
          </p>
          {error && <div className="login-error">{error}</div>}
          <div className="login-polling-spinner" />
          <button type="button" className="login-switch" onClick={cancelGoogleLogin}>
            Cancel
          </button>
        </div>
      ) : (
        <div className="login-form">
          {error && <div className="login-error">{error}</div>}

          <button type="button" className="login-google-btn" onClick={handleGoogleLogin}>
            <svg width="16" height="16" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>

          <div className="login-divider"><span>or</span></div>

          <form onSubmit={handleSubmit}>
            <input
              type="email"
              className="login-input"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              type="password"
              className="login-input"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button className="login-btn" type="submit" disabled={loading || !email || !password}>
              {loading ? "..." : mode === "login" ? "Sign In" : "Create Account"}
            </button>
          </form>

          <button
            type="button"
            className="login-switch"
            onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}
          >
            {mode === "login" ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
          </button>
        </div>
      )}
    </div>
  );
}
