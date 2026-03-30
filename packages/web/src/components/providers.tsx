"use client";

import { AuthProvider } from "../lib/auth";
import { ConfirmProvider } from "./confirm-dialog";
import { ToastProvider } from "./toast";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <AuthProvider>
        <ConfirmProvider>{children}</ConfirmProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
