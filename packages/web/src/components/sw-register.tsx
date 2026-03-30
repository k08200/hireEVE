"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          // Force update check on every page load
          reg.update();
        })
        .catch(() => {
          // SW registration failed — not critical
        });
    }
  }, []);

  return null;
}
