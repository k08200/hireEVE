import type { ReactNode } from "react";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}

export default function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      {icon && (
        <div className="w-12 h-12 rounded-xl bg-surface-raised border border-line flex items-center justify-center mb-4 text-ink-dim">
          {icon}
        </div>
      )}
      <h3 className="text-base font-medium text-ink mb-1">{title}</h3>
      <p className="text-sm text-ink-dim max-w-xs mb-5">{description}</p>
      {action}
    </div>
  );
}
