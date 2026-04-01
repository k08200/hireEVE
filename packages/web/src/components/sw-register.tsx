"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        // Check for updates on page load and periodically
        reg.update();
        const interval = setInterval(() => reg.update(), 60 * 60 * 1000); // hourly
        return () => clearInterval(interval);
      })
      .catch(() => {
        // SW registration failed — not critical
      });
  }, []);

  return null;
}
