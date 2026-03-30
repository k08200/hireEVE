"use client";

import { AuthProvider } from "../lib/auth";
import { I18nProvider } from "../lib/i18n";
import { ConfirmProvider } from "./confirm-dialog";
import { ToastProvider } from "./toast";

export default function Providers({ children }: { children: React.ReactNode }) {
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
