/**
 * macOS iMessage Integration via AppleScript
 *
 * Requires macOS with Messages.app configured.
 * Uses osascript to interact with Messages.app.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

const IS_MACOS = process.platform === "darwin";

async function runAppleScript(script: string): Promise<string> {
  if (!IS_MACOS) throw new Error("iMessage integration requires macOS");
  const { stdout } = await exec("osascript", ["-e", script], { timeout: 10_000 });
  return stdout.trim();
}

/** Escape string for safe embedding in AppleScript double-quoted strings */
function escapeAppleScript(str: string): string {
  return str
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")
    .replace(/\t/g, "\\t");
}

/** Send an iMessage to a phone number or email */
export async function sendIMessage(
  to: string,
  text: string,
): Promise<{ success: boolean; to: string }> {
  const escapedText = escapeAppleScript(text);
  const escapedTo = escapeAppleScript(to);
  const script = `
    tell application "Messages"
      set targetService to 1st account whose service type = iMessage
      set targetBuddy to participant "${escapedTo}" of targetService
      send "${escapedText}" to targetBuddy
    end tell
  `;
  await runAppleScript(script);
  return { success: true, to };
}

/** Sanitize input for safe use in SQLite queries (via CLI) — allow only phone/email chars */
function sanitizeSqliteParam(input: string): string {
  // Strip everything except alphanumeric, +, @, ., -, _
  return input.replace(/[^a-zA-Z0-9+@._-]/g, "");
}

/** Read recent iMessages from a specific contact */
export async function readIMessages(
  from: string,
  count: number = 10,
): Promise<{ messages: Array<{ text: string; date: string; isFromMe: boolean }> }> {
  // Read from chat.db directly (SQLite) for reliability
  const homeDir = process.env.HOME || "/Users";
  const dbPath = `${homeDir}/Library/Messages/chat.db`;

  const { execFile: execFileCallback } = await import("node:child_process");
  const execSql = promisify(execFileCallback);

  const safeFrom = sanitizeSqliteParam(from);
  if (!safeFrom) return { messages: [] };
  const safeCount = Math.max(1, Math.min(Math.round(count), 100));

  try {
    // Build parameterized-style query: sqlite3 CLI doesn't support bind params,
    // so we use a static query template with char() to avoid string interpolation.
    // Convert sanitized input to SQLite char() sequence to prevent any injection.
    const charCodes = Array.from(`%${safeFrom}%`).map((c) => c.charCodeAt(0));
    const charExpr = charCodes.map((c) => `char(${c})`).join("||");

    const query = `
      SELECT
        m.text,
        datetime(m.date/1000000000 + 978307200, 'unixepoch', 'localtime') as date,
        m.is_from_me
      FROM message m
      JOIN chat_message_join cmj ON m.ROWID = cmj.message_id
      JOIN chat c ON cmj.chat_id = c.ROWID
      WHERE c.chat_identifier LIKE (${charExpr})
      ORDER BY m.date DESC
      LIMIT ${safeCount}
    `;

    const { stdout } = await execSql("sqlite3", ["-json", dbPath, query], { timeout: 5_000 });
    const rows = JSON.parse(stdout || "[]");
    return {
      messages: rows.map((r: { text: string; date: string; is_from_me: number }) => ({
        text: r.text || "",
        date: r.date,
        isFromMe: r.is_from_me === 1,
      })),
    };
  } catch {
    // Fallback: Full Disk Access might not be granted
    return { messages: [] };
  }
}

/** Get recent conversations list */
export async function listRecentChats(
  count: number = 20,
): Promise<{ chats: Array<{ identifier: string; displayName: string; lastMessage: string }> }> {
  const homeDir = process.env.HOME || "/Users";
  const dbPath = `${homeDir}/Library/Messages/chat.db`;

  const { execFile: execFileCallback } = await import("node:child_process");
  const execSql = promisify(execFileCallback);

  try {
    const query = `
      SELECT
        c.chat_identifier as identifier,
        c.display_name as displayName,
        m.text as lastMessage
      FROM chat c
      LEFT JOIN chat_message_join cmj ON c.ROWID = cmj.chat_id
      LEFT JOIN message m ON cmj.message_id = m.ROWID
      WHERE m.ROWID = (
        SELECT MAX(m2.ROWID) FROM message m2
        JOIN chat_message_join cmj2 ON m2.ROWID = cmj2.message_id
        WHERE cmj2.chat_id = c.ROWID
      )
      ORDER BY m.date DESC
      LIMIT ${Math.max(1, Math.min(Math.round(count), 100))}
    `;

    const { stdout } = await execSql("sqlite3", ["-json", dbPath, query], { timeout: 5_000 });
    const rows = JSON.parse(stdout || "[]");
    return {
      chats: rows.map((r: { identifier: string; displayName: string; lastMessage: string }) => ({
        identifier: r.identifier || "",
        displayName: r.displayName || r.identifier || "",
        lastMessage: r.lastMessage || "",
      })),
    };
  } catch {
    return { chats: [] };
  }
}

/** Send a macOS system notification */
export async function sendNotification(title: string, message: string): Promise<void> {
  if (!IS_MACOS) return;
  const escapedTitle = escapeAppleScript(title);
  const escapedMsg = escapeAppleScript(message);
  await runAppleScript(`display notification "${escapedMsg}" with title "${escapedTitle}"`);
}

/** Check if iMessage is available on this machine */
export function isIMessageAvailable(): boolean {
  return IS_MACOS;
}

// Tool definitions for function calling
export const IMESSAGE_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "send_imessage",
      description:
        "Send an iMessage to a phone number or Apple ID email. Only works on macOS with Messages.app configured. Use for personal/direct messages to contacts.",
      parameters: {
        type: "object",
        properties: {
          to: {
            type: "string",
            description: "Phone number (e.g., +821012345678) or Apple ID email",
          },
          text: {
            type: "string",
            description: "Message text to send",
          },
        },
        required: ["to", "text"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "read_imessages",
      description:
        "Read recent iMessages from a specific contact. Returns up to 10 recent messages with timestamps. Requires Full Disk Access on macOS.",
      parameters: {
        type: "object",
        properties: {
          from: {
            type: "string",
            description: "Phone number or Apple ID to read messages from",
          },
          count: {
            type: "number",
            description: "Number of messages to retrieve (default: 10)",
          },
        },
        required: ["from"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_imessage_chats",
      description:
        "List recent iMessage conversations. Shows who you've been messaging and the last message. Requires Full Disk Access on macOS.",
      parameters: {
        type: "object",
        properties: {
          count: {
            type: "number",
            description: "Number of chats to list (default: 20)",
          },
        },
        required: [],
      },
    },
  },
];
