"use client";

import { useEffect } from "react";
import { AuthProvider } from "../lib/auth";
import { I18nProvider } from "../lib/i18n";
import { initSentryClient } from "../lib/sentry";
import { ConfirmProvider } from "./confirm-dialog";
import { ToastProvider } from "./toast";

export default function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initSentryClient();
  }, []);
  return (
    <I18nProvider>
      <ToastProvider>
        <AuthProvider>
          <ConfirmProvider>{children}</ConfirmProvider>
        </AuthProvider>
      </ToastProvider>
    </I18nProvider>
  );
}
