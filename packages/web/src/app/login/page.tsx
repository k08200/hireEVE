"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useToast } from "../../components/toast";
import { useAuth } from "../../lib/auth";

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const { login, register, user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && user) {
      router.push("/chat");
    }
  }, [user, authLoading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    setLoading(true);
    try {
      if (mode === "login") {
        await login(email, password);
        toast("Welcome back!", "success");
      } else {
        await register(email, password, name || undefined);
        toast("Account created!", "success");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      const match = msg.match(/API \d+: (.+)/);
      const parsed = match ? (() => { try { return JSON.parse(match[1]).error; } catch { return match[1]; } })() : msg;
      toast(parsed, "error");
    }
    setLoading(false);
  };

  const handleDemo = async () => {
    setLoading(true);
    try {
      await login("demo@hireeve.com", "demo");
      toast("Welcome to EVE demo!", "success");
    } catch {
      try {
        await register("demo@hireeve.com", "demo", "Demo User");
        toast("Welcome to EVE demo!", "success");
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed";
        toast(msg, "error");
      }
    }
    setLoading(false);
  };

  if (authLoading) {
    return (
      <main className="flex items-center justify-center min-h-[calc(100vh-3rem)]">
        <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
      </main>
    );
  }

  return (
    <main className="flex items-center justify-center min-h-[calc(100vh-3rem)] px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold">
            <span className="text-blue-400">EVE</span>
          </h1>
          <p className="text-gray-500 text-xs mt-1.5">Your First AI Employee</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          {mode === "register" && (
            <div>
              <label htmlFor="name" className="block text-xs font-medium text-gray-400 mb-1.5">
                Name
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className="w-full bg-gray-900 border border-gray-800 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition placeholder-gray-500"
              />
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-xs font-medium text-gray-400 mb-1.5">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              className="w-full bg-gray-900 border border-gray-800 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition placeholder-gray-500"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-xs font-medium text-gray-400 mb-1.5">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === "register" ? "At least 6 characters" : "Your password"}
              required
              minLength={mode === "register" ? 6 : undefined}
              className="w-full bg-gray-900 border border-gray-800 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition placeholder-gray-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !email || !password}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 disabled:text-gray-500 disabled:cursor-not-allowed text-white py-2.5 rounded-lg text-sm font-medium transition-colors shadow-sm shadow-blue-600/20"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                {mode === "login" ? "Signing in..." : "Creating account..."}
              </span>
            ) : mode === "login" ? (
              "Sign in"
            ) : (
              "Create account"
            )}
          </button>
        </form>

        {/* Toggle mode */}
        <div className="text-center mt-4">
          <button
            type="button"
            onClick={() => setMode(mode === "login" ? "register" : "login")}
            className="text-xs text-gray-500 hover:text-blue-400 transition-colors"
          >
            {mode === "login"
              ? "Don't have an account? Sign up"
              : "Already have an account? Sign in"}
          </button>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3 my-5">
          <div className="flex-1 h-px bg-gray-800/80" />
          <span className="text-xs text-gray-600">or</span>
          <div className="flex-1 h-px bg-gray-800/80" />
        </div>

        {/* Demo button */}
        <button
          type="button"
          onClick={handleDemo}
          disabled={loading}
          className="w-full bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-gray-700 text-gray-300 py-2.5 rounded-lg text-sm font-medium transition-colors"
        >
          Try Demo (no sign-up needed)
        </button>

        {/* Back to home */}
        <div className="text-center mt-5">
          <Link href="/" className="text-xs text-gray-600 hover:text-gray-400 transition-colors">
            Back to home
          </Link>
        </div>
      </div>
    </main>
  );
}
