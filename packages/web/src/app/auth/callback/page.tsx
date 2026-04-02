"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef } from "react";
import { useAuth } from "../../../lib/auth";

function CallbackHandler() {
  const searchParams = useSearchParams();
  const { loginWithToken } = useAuth();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const token = searchParams.get("token");
    if (token) {
      // loginWithToken stores token, verifies user, triggers init-sync, then navigates to /chat
      loginWithToken(token).catch(() => {
        window.location.href = "/login?error=google_failed";
      });
    } else {
      window.location.href = "/login?error=google_failed";
    }
  }, [searchParams, loginWithToken]);

  return (
    <div className="flex items-center justify-center h-screen">
      <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense>
      <CallbackHandler />
    </Suspense>
  );
}
