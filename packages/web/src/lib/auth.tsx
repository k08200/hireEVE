"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { apiFetch } from "./api";

interface User {
  id: string;
  email: string;
  name: string | null;
  plan: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  googleConnected: boolean | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  loginWithToken: (token: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [googleConnected, setGoogleConnected] = useState<boolean | null>(null);
  const router = useRouter();

  // Load token from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem("eve-token");
    if (stored) {
      setToken(stored);
      // Verify token
      apiFetch<{ user: User & { googleConnected?: boolean } }>("/api/auth/me", {
        headers: { Authorization: `Bearer ${stored}` },
      })
        .then((data) => {
          setUser(data.user);
          setGoogleConnected(data.user.googleConnected ?? false);
          // Auto-sync on app reload if Google is connected
          if (data.user.googleConnected) {
            apiFetch("/api/auth/init-sync", {
              method: "POST",
              headers: { Authorization: `Bearer ${stored}` },
            }).catch(() => {});
          }
        })
        .catch(() => {
          localStorage.removeItem("eve-token");
          setToken(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const data = await apiFetch<{ token: string; user: User }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      localStorage.setItem("eve-token", data.token);
      setToken(data.token);
      setUser(data.user);
      router.push("/chat");

      // Fire-and-forget: trigger initial sync if Google is connected
      apiFetch("/api/auth/init-sync", {
        method: "POST",
        headers: { Authorization: `Bearer ${data.token}` },
      }).catch(() => {});
    },
    [router],
  );

  const register = useCallback(
    async (email: string, password: string, name?: string) => {
      const data = await apiFetch<{ token: string; user: User }>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ email, password, name }),
      });
      localStorage.setItem("eve-token", data.token);
      setToken(data.token);
      setUser(data.user);
      router.push("/chat");
    },
    [router],
  );

  const loginWithToken = useCallback(async (newToken: string) => {
    console.log("[auth] loginWithToken: start");
    localStorage.setItem("eve-token", newToken);
    setToken(newToken);
    console.log("[auth] loginWithToken: token stored, calling /api/auth/me");
    try {
      const data = await apiFetch<{ user: User }>("/api/auth/me", {
        headers: { Authorization: `Bearer ${newToken}` },
      });
      console.log("[auth] loginWithToken: /api/auth/me success", data.user?.email);
      setUser(data.user);
    } catch (err) {
      console.error("[auth] loginWithToken: /api/auth/me FAILED", err);
      throw err;
    }

    // Fire-and-forget: trigger initial sync (calendar, contacts) after Google login
    apiFetch("/api/auth/init-sync", {
      method: "POST",
      headers: { Authorization: `Bearer ${newToken}` },
    }).catch(() => {});

    console.log("[auth] loginWithToken: redirecting to /chat");
    window.location.href = "/chat";
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("eve-token");
    setToken(null);
    setUser(null);
    router.push("/login");
  }, [router]);

  return (
    <AuthContext.Provider
      value={{ user, token, loading, googleConnected, login, register, loginWithToken, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
