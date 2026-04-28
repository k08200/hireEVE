export type WorkGraphRisk = "high" | "medium" | "low";

export interface WorkGraphPerson {
  name: string | null;
  email: string | null;
}

export interface WorkGraphSignals {
  emails: number;
  unreadEmails: number;
  urgentEmails: number;
  pendingActions: number;
  commitments: number;
  overdueCommitments: number;
}

export interface WorkGraphContext {
  id: string;
  kind: "email_thread" | "chat_conversation" | "loose_commitment";
  title: string;
  subtitle: string | null;
  href: string | null;
  people: WorkGraphPerson[];
  lastActivityAt: string;
  risk: WorkGraphRisk;
  reasons: string[];
  signals: WorkGraphSignals;
}

export interface WorkGraphSummary {
  generatedAt: string;
  contexts: WorkGraphContext[];
}
