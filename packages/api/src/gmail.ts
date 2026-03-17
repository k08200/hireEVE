import { google } from "googleapis";
import { prisma } from "./db.js";

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || "http://localhost:8000/api/auth/google/callback";

export function getOAuth2Client() {
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
    ],
  });
}

export async function getAuthedClient(_userId: string) {
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
        accessToken: newTokens.access_token!,
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
      id: msg.id!,
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
    `To: ${to}\r\nSubject: ${encodedSubject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}`
  ).toString("base64url");

  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw },
  });

  return { success: true, messageId: res.data.id };
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

// Execute a tool call
export async function executeToolCall(
  userId: string,
  functionName: string,
  args: Record<string, unknown>,
): Promise<string> {
  try {
    switch (functionName) {
      case "list_emails": {
        const result = await listEmails(userId, (args.max_results as number) || 10);
        return JSON.stringify(result);
      }
      case "read_email": {
        const result = await readEmail(userId, args.email_id as string);
        return JSON.stringify(result);
      }
      case "send_email": {
        const result = await sendEmail(
          userId,
          args.to as string,
          args.subject as string,
          args.body as string,
        );
        return JSON.stringify(result);
      }
      default:
        return JSON.stringify({ error: `Unknown function: ${functionName}` });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return JSON.stringify({ error: message });
  }
}
