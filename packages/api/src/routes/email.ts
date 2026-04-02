/**
 * Email API — Gmail integration for reading, classifying, and drafting emails
 *
 * Requires Google OAuth token. Falls back to mock data for demo mode.
 */
import type { FastifyInstance } from "fastify";
import { getUserId } from "../auth.js";
import { prisma } from "../db.js";

interface EmailMessage {
  id: string;
  from: string;
  to: string;
  subject: string;
  snippet: string;
  body?: string;
  date: string;
  labels: string[];
  isRead: boolean;
  priority: "urgent" | "normal" | "low";
}

// Demo emails for when Gmail isn't connected
const DEMO_EMAILS: EmailMessage[] = [
  {
    id: "demo-1",
    from: "investor@vc.com",
    to: "me@startup.com",
    subject: "Follow-up: Series A Discussion",
    snippet: "Hi, I wanted to follow up on our conversation last week about the Series A round...",
    date: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    labels: ["INBOX", "IMPORTANT"],
    isRead: false,
    priority: "urgent",
  },
  {
    id: "demo-2",
    from: "team@notion.so",
    to: "me@startup.com",
    subject: "Your weekly Notion digest",
    snippet:
      "Here's what happened in your workspace this week: 12 pages updated, 3 new databases...",
    date: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    labels: ["INBOX"],
    isRead: true,
    priority: "low",
  },
  {
    id: "demo-3",
    from: "partner@company.co",
    to: "me@startup.com",
    subject: "Partnership Proposal — Q2 Collaboration",
    snippet:
      "We'd love to explore a partnership opportunity with your team for the upcoming quarter...",
    date: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
    labels: ["INBOX"],
    isRead: false,
    priority: "normal",
  },
  {
    id: "demo-4",
    from: "noreply@github.com",
    to: "me@startup.com",
    subject: "[hireEVE] New pull request #42: Add calendar integration",
    snippet: "k08200 opened a new pull request in hireEVE/probeai: Add calendar integration...",
    date: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
    labels: ["INBOX", "CATEGORY_UPDATES"],
    isRead: true,
    priority: "normal",
  },
  {
    id: "demo-5",
    from: "accounting@service.com",
    to: "me@startup.com",
    subject: "Invoice #INV-2026-0089 — March Services",
    snippet: "Please find attached the invoice for March 2026 services. Total: $2,450.00...",
    date: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    labels: ["INBOX"],
    isRead: false,
    priority: "normal",
  },
  {
    id: "demo-6",
    from: "newsletter@techcrunch.com",
    to: "me@startup.com",
    subject: "TechCrunch Daily: AI Agents Are the New SaaS",
    snippet: "Today's top stories: Why AI agents are replacing traditional SaaS tools...",
    date: new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString(),
    labels: ["INBOX", "CATEGORY_PROMOTIONS"],
    isRead: true,
    priority: "low",
  },
];

async function getGmailEmails(userId: string): Promise<EmailMessage[] | null> {
  const token = await prisma.userToken.findFirst({
    where: { userId, provider: "google" },
  });
  if (!token) return null;

  try {
    const { google } = await import("googleapis");
    const auth = new google.auth.OAuth2();
    auth.setCredentials({
      access_token: token.accessToken,
      refresh_token: token.refreshToken,
    });

    const gmail = google.gmail({ version: "v1", auth });
    const response = await gmail.users.messages.list({
      userId: "me",
      maxResults: 20,
      labelIds: ["INBOX"],
    });

    const messages: EmailMessage[] = [];
    for (const msg of response.data.messages || []) {
      const detail = await gmail.users.messages.get({
        userId: "me",
        id: msg.id || "",
        format: "metadata",
        metadataHeaders: ["From", "To", "Subject", "Date"],
      });

      const headers = detail.data.payload?.headers || [];
      const getHeader = (name: string) => headers.find((h) => h.name === name)?.value || "";

      messages.push({
        id: msg.id || "",
        from: getHeader("From"),
        to: getHeader("To"),
        subject: getHeader("Subject"),
        snippet: detail.data.snippet || "",
        date: getHeader("Date") || new Date().toISOString(),
        labels: detail.data.labelIds || [],
        isRead: !(detail.data.labelIds || []).includes("UNREAD"),
        priority: (detail.data.labelIds || []).includes("IMPORTANT") ? "urgent" : "normal",
      });
    }

    return messages;
  } catch {
    return null;
  }
}

/** Parse email From header: "Name <email@domain>" or "email@domain" */
function parseFromHeader(from: string): { name: string; email: string } | null {
  if (!from) return null;

  // "Display Name <email@domain.com>"
  const match = from.match(/^(.+?)\s*<([^>]+)>$/);
  if (match) {
    return { name: match[1].replace(/^["']|["']$/g, "").trim(), email: match[2].trim().toLowerCase() };
  }

  // Plain "email@domain.com"
  const emailOnly = from.trim().toLowerCase();
  if (emailOnly.includes("@")) {
    return { name: emailOnly.split("@")[0], email: emailOnly };
  }

  return null;
}

/** Skip automated/noreply senders */
const SKIP_PATTERNS = [
  /noreply@/i,
  /no-reply@/i,
  /donotreply@/i,
  /notifications?@/i,
  /mailer-daemon@/i,
  /postmaster@/i,
  /^system@/i,
  /newsletter@/i,
  /updates?@/i,
  /digest@/i,
  /alert@/i,
];

function isAutomatedSender(email: string): boolean {
  return SKIP_PATTERNS.some((p) => p.test(email));
}

/** Auto-add unique senders as contacts (fire-and-forget) */
async function autoAddContacts(userId: string, emails: EmailMessage[]): Promise<void> {
  const seen = new Set<string>();

  for (const email of emails) {
    const parsed = parseFromHeader(email.from);
    if (!parsed || !parsed.email) continue;
    if (isAutomatedSender(parsed.email)) continue;
    if (seen.has(parsed.email)) continue;
    seen.add(parsed.email);

    // Check if contact already exists for this user+email
    const existing = await prisma.contact.findFirst({
      where: { userId, email: parsed.email },
    });
    if (existing) continue;

    // Wrap in try/catch to handle race condition (concurrent requests)
    try {
      await prisma.contact.create({
        data: {
          userId,
          name: parsed.name,
          email: parsed.email,
          tags: "auto-added",
        },
      });
    } catch {
      // Duplicate created by concurrent request — ignore
    }
  }
}

export async function emailRoutes(app: FastifyInstance) {
  // List emails (Gmail or demo)
  app.get("/", async (request) => {
    const { filter } = request.query as { filter?: string };
    const uid = getUserId(request);

    const gmailEmails = await getGmailEmails(uid);
    let emails = gmailEmails || DEMO_EMAILS;

    // Auto-add senders as contacts (non-blocking)
    if (gmailEmails) {
      autoAddContacts(uid, gmailEmails).catch(() => {});
    }

    if (filter === "unread") {
      emails = emails.filter((e) => !e.isRead);
    } else if (filter === "urgent") {
      emails = emails.filter((e) => e.priority === "urgent");
    }

    return {
      emails,
      source: gmailEmails ? "gmail" : "demo",
      total: emails.length,
      unread: emails.filter((e) => !e.isRead).length,
    };
  });

  // Get single email with full body
  app.get("/:id", async (request) => {
    const { id } = request.params as { id: string };
    const uid = getUserId(request);

    // Try Gmail first
    const token = await prisma.userToken.findFirst({
      where: { userId: uid, provider: "google" },
    });

    if (token && !id.startsWith("demo-")) {
      try {
        const { google } = await import("googleapis");
        const auth = new google.auth.OAuth2();
        auth.setCredentials({
          access_token: token.accessToken,
          refresh_token: token.refreshToken,
        });

        const gmail = google.gmail({ version: "v1", auth });
        const detail = await gmail.users.messages.get({
          userId: "me",
          id,
          format: "full",
        });

        const headers = detail.data.payload?.headers || [];
        const getHeader = (name: string) => headers.find((h) => h.name === name)?.value || "";

        // Extract body from parts
        let body = "";
        const payload = detail.data.payload;
        if (payload?.body?.data) {
          body = Buffer.from(payload.body.data, "base64").toString("utf-8");
        } else if (payload?.parts) {
          // Find text/plain or text/html part
          const textPart = payload.parts.find((p) => p.mimeType === "text/plain");
          const htmlPart = payload.parts.find((p) => p.mimeType === "text/html");
          const part = textPart || htmlPart;
          if (part?.body?.data) {
            body = Buffer.from(part.body.data, "base64").toString("utf-8");
          }
        }

        return {
          id,
          from: getHeader("From"),
          to: getHeader("To"),
          subject: getHeader("Subject"),
          snippet: detail.data.snippet || "",
          body,
          date: getHeader("Date") || new Date().toISOString(),
          labels: detail.data.labelIds || [],
          isRead: !(detail.data.labelIds || []).includes("UNREAD"),
          priority: (detail.data.labelIds || []).includes("IMPORTANT") ? "urgent" : "normal",
        };
      } catch {
        // Fall through to demo
      }
    }

    // Fallback to demo emails
    const email = DEMO_EMAILS.find((e) => e.id === id);
    if (email) {
      return {
        ...email,
        body: `${email.snippet}\n\nThis is the full email body for the demo message.`,
      };
    }
    return { error: "Email not found" };
  });

  // Send email via Gmail
  app.post("/send", async (request) => {
    const uid = getUserId(request);
    const { to, subject, body } = request.body as { to: string; subject: string; body: string };

    if (!to || !subject || !body) {
      return { error: "Missing required fields: to, subject, body" };
    }

    const token = await prisma.userToken.findFirst({
      where: { userId: uid, provider: "google" },
    });

    if (!token) {
      return { error: "Gmail not connected. Please connect your Google account first." };
    }

    try {
      const { google } = await import("googleapis");
      const auth = new google.auth.OAuth2();
      auth.setCredentials({
        access_token: token.accessToken,
        refresh_token: token.refreshToken,
      });

      const gmail = google.gmail({ version: "v1", auth });
      const encodedSubject = `=?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`;
      const raw = Buffer.from(
        `To: ${to}\r\nSubject: ${encodedSubject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}`,
      ).toString("base64url");

      const res = await gmail.users.messages.send({
        userId: "me",
        requestBody: { raw },
      });

      return { success: true, messageId: res.data.id };
    } catch {
      return { error: "Failed to send email. Please try again." };
    }
  });

  // Email stats
  app.get("/stats/summary", async (request) => {
    const uid = getUserId(request);

    const gmailEmails = await getGmailEmails(uid);
    const emails = gmailEmails || DEMO_EMAILS;

    return {
      total: emails.length,
      unread: emails.filter((e) => !e.isRead).length,
      urgent: emails.filter((e) => e.priority === "urgent").length,
      today: emails.filter((e) => {
        const d = new Date(e.date);
        const now = new Date();
        return d.toDateString() === now.toDateString();
      }).length,
      source: gmailEmails ? "gmail" : "demo",
    };
  });
}
