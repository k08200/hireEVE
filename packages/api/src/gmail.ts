import { google } from "googleapis";
import { prisma } from "./db.js";

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const REDIRECT_URI =
  process.env.GOOGLE_REDIRECT_URI || "http://localhost:8000/api/auth/google/callback";

export function getOAuth2Client(): InstanceType<typeof google.auth.OAuth2> {
  return new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
}

export function getAuthUrl() {
  const oauth2 = getOAuth2Client();
  return oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/gmail.modify",
      "https://www.googleapis.com/auth/calendar",
    ],
  });
}

export async function getAuthedClient(
  _userId: string,
): Promise<InstanceType<typeof google.auth.OAuth2> | null> {
  // MVP: find any google token
  const token = await prisma.userToken.findFirst({
    where: { provider: "google" },
  });

  if (!token) return null;

  const oauth2 = getOAuth2Client();
  oauth2.setCredentials({
    access_token: token.accessToken,
    refresh_token: token.refreshToken,
  });

  // Auto-refresh expired tokens
  oauth2.on("tokens", async (newTokens) => {
    await prisma.userToken.update({
      where: { id: token.id },
      data: {
        accessToken: newTokens.access_token ?? "",
        expiresAt: newTokens.expiry_date ? new Date(newTokens.expiry_date) : null,
      },
    });
  });

  return oauth2;
}

// Gmail tool functions for EVE

export async function listEmails(userId: string, maxResults = 10) {
  const auth = await getAuthedClient(userId);
  if (!auth) return { error: "Gmail not connected. Please connect your Gmail first." };

  const gmail = google.gmail({ version: "v1", auth });
  const res = await gmail.users.messages.list({
    userId: "me",
    maxResults,
    labelIds: ["INBOX"],
  });

  const messages = res.data.messages || [];
  const emails = [];

  for (const msg of messages.slice(0, maxResults)) {
    const detail = await gmail.users.messages.get({
      userId: "me",
      id: msg.id ?? "",
      format: "metadata",
      metadataHeaders: ["From", "Subject", "Date"],
    });

    const headers = detail.data.payload?.headers || [];
    emails.push({
      id: msg.id,
      from: headers.find((h) => h.name === "From")?.value || "",
      subject: headers.find((h) => h.name === "Subject")?.value || "",
      date: headers.find((h) => h.name === "Date")?.value || "",
      snippet: detail.data.snippet || "",
    });
  }

  return { emails };
}

export async function readEmail(userId: string, emailId: string) {
  const auth = await getAuthedClient(userId);
  if (!auth) return { error: "Gmail not connected." };

  const gmail = google.gmail({ version: "v1", auth });
  const res = await gmail.users.messages.get({
    userId: "me",
    id: emailId,
    format: "full",
  });

  const headers = res.data.payload?.headers || [];
  const parts = res.data.payload?.parts || [];

  let body = "";
  const textPart = parts.find((p) => p.mimeType === "text/plain");
  if (textPart?.body?.data) {
    body = Buffer.from(textPart.body.data, "base64").toString("utf-8");
  } else if (res.data.payload?.body?.data) {
    body = Buffer.from(res.data.payload.body.data, "base64").toString("utf-8");
  }

  return {
    id: emailId,
    from: headers.find((h) => h.name === "From")?.value || "",
    to: headers.find((h) => h.name === "To")?.value || "",
    subject: headers.find((h) => h.name === "Subject")?.value || "",
    date: headers.find((h) => h.name === "Date")?.value || "",
    body,
  };
}

export async function sendEmail(userId: string, to: string, subject: string, body: string) {
  const auth = await getAuthedClient(userId);
  if (!auth) return { error: "Gmail not connected." };

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
}

export async function classifyEmails(userId: string, maxResults = 10) {
  const result = await listEmails(userId, maxResults);
  if ("error" in result) return result;

  const classified = result.emails.map((email) => {
    const from = (email.from || "").toLowerCase();
    const subject = (email.subject || "").toLowerCase();

    let priority: "high" | "medium" | "low" = "low";
    let category = "other";

    // High priority signals
    if (
      subject.includes("urgent") || subject.includes("긴급") ||
      subject.includes("asap") || subject.includes("important") ||
      subject.includes("중요") || subject.includes("action required")
    ) {
      priority = "high";
    }

    // Category detection
    if (subject.includes("invoice") || subject.includes("payment") || subject.includes("결제") || subject.includes("청구")) {
      category = "billing";
      if (priority === "low") priority = "medium";
    } else if (subject.includes("meeting") || subject.includes("미팅") || subject.includes("invite") || subject.includes("calendar")) {
      category = "meeting";
      if (priority === "low") priority = "medium";
    } else if (subject.includes("deploy") || subject.includes("build") || subject.includes("error") || subject.includes("alert")) {
      category = "engineering";
      if (priority === "low") priority = "medium";
    } else if (from.includes("noreply") || from.includes("no-reply") || from.includes("newsletter") || from.includes("marketing")) {
      category = "automated";
      priority = "low";
    } else if (subject.includes("re:") || subject.includes("회신")) {
      category = "conversation";
      if (priority === "low") priority = "medium";
    }

    return { ...email, priority, category };
  });

  // Sort: high → medium → low
  const order = { high: 0, medium: 1, low: 2 };
  classified.sort((a, b) => order[a.priority] - order[b.priority]);

  const summary = {
    high: classified.filter((e) => e.priority === "high").length,
    medium: classified.filter((e) => e.priority === "medium").length,
    low: classified.filter((e) => e.priority === "low").length,
  };

  return { emails: classified, summary };
}

// Tool definitions for function calling
export const GMAIL_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "list_emails",
      description: "List recent emails from the user's Gmail inbox",
      parameters: {
        type: "object",
        properties: {
          max_results: {
            type: "number",
            description: "Number of emails to fetch (default 10, max 20)",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "read_email",
      description: "Read the full content of a specific email by its ID",
      parameters: {
        type: "object",
        properties: {
          email_id: {
            type: "string",
            description: "The Gmail message ID to read",
          },
        },
        required: ["email_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "classify_emails",
      description: "Classify and prioritize inbox emails by urgency (high/medium/low) and category (billing, meeting, engineering, conversation, automated, other). Returns sorted list with high-priority first.",
      parameters: {
        type: "object",
        properties: {
          max_results: {
            type: "number",
            description: "Number of emails to classify (default 10)",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "send_email",
      description: "Send an email on behalf of the user",
      parameters: {
        type: "object",
        properties: {
          to: { type: "string", description: "Recipient email address" },
          subject: { type: "string", description: "Email subject line" },
          body: { type: "string", description: "Email body text" },
        },
        required: ["to", "subject", "body"],
      },
    },
  },
];

