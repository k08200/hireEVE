"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { captureFirstTouchAttribution } from "@/lib/attribution";

/**
 * Retired funnel step.
 *
 * Sign-up is open — the OAuth consent screen is in production and the beta
 * gate is off, so there is nothing here to request. The route survives because
 * the landing site, old DMs, and the Slack invite all still point at it; it
 * captures first-touch attribution (the one job it still had) and hands the
 * visitor to the sign-up tab rather than a form that no longer gates anything.
 *
 * `replace`, not `push`: back from /login must reach wherever the visitor came
 * from, not bounce through this redirect again.
 */
export default function EarlyAccessPage() {
  return (
    <Suspense>
      <EarlyAccessRedirect />
    </Suspense>
  );
}

function EarlyAccessRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    captureFirstTouchAttribution();
    const next = searchParams.get("next");
    const target =
      next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/early-access")
        ? `/login?mode=register&next=${encodeURIComponent(next)}`
        : "/login?mode=register";
    router.replace(target);
  }, [router, searchParams]);

  // Deliberately blank: this is a redirect, and a flash of "Early access" copy
  // would be the exact claim we are here to stop making.
  return null;
}
