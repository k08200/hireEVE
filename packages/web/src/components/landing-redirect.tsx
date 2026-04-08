"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** If user has a token, redirect to dashboard. Used on landing page. */
export default function LandingRedirect() {
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem("eve-token");
    if (token) {
      router.replace("/chat");
    }
  }, [router]);

  return null;
}
