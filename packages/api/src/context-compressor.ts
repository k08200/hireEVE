/**
 * Context Compressor — Inspired by Claude Code's services/compact/
 *
 * When conversations exceed a token threshold, older messages are
 * summarized into a compact form to stay within LLM context limits
 * while preserving important information.
 */

import { prisma } from "./db.js";
import { MODEL, openai } from "./openai.js";

/** Approximate token count (rough: ~3 chars per token for mixed Korean/English) */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3);
}

/** Max tokens for conversation history before compaction triggers */
const MAX_HISTORY_TOKENS = 12_000;
/** Keep the most recent N messages uncompressed */
const KEEP_RECENT_MESSAGES = 10;
/** Minimum messages before compaction is considered */
const MIN_MESSAGES_FOR_COMPACTION = 15;

interface ChatMessage {
  id: string;
  role: string;
  content: string;
  createdAt: Date;
}

/**
 * Compact conversation history if it exceeds token limits.
 * Returns optimized message array for LLM consumption.
 *
 * Strategy (from Claude Code's compact service):
 * 1. If history is short enough, return as-is
 * 2. If too long, summarize older messages into a SYSTEM summary
 * 3. Keep recent messages intact for conversation continuity
 */
export async function compactHistory(
  conversationId: string,
  messages: ChatMessage[],
): Promise<{ role: string; content: string }[]> {
  // Not enough messages to warrant compaction
  if (messages.length < MIN_MESSAGES_FOR_COMPACTION) {
    return messages.map((m) => ({
      role: m.role.toLowerCase(),
      content: m.content,
    }));
  }

  // Calculate total tokens
  const totalTokens = messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);

  // Under limit — no compaction needed
  if (totalTokens <= MAX_HISTORY_TOKENS) {
    return messages.map((m) => ({
      role: m.role.toLowerCase(),
      content: m.content,
    }));
  }

  // Split: older messages to summarize, recent messages to keep
  const olderMessages = messages.slice(0, -KEEP_RECENT_MESSAGES);
  const recentMessages = messages.slice(-KEEP_RECENT_MESSAGES);

  // Check if we already have a summary for these older messages
  const existingSummary = await prisma.conversationSummary.findFirst({
    where: {
      conversationId,
      upToMessageId: olderMessages[olderMessages.length - 1]?.id,
    },
  });

  let summaryText: string;

  if (existingSummary) {
    summaryText = existingSummary.summary;
  } else {
    // Generate summary of older messages
    summaryText = await generateSummary(olderMessages);

    // Save summary for reuse
    try {
      await prisma.conversationSummary.create({
        data: {
          conversationId,
          summary: summaryText,
          messageCount: olderMessages.length,
          upToMessageId: olderMessages[olderMessages.length - 1]?.id || "",
        },
      });
    } catch {
      // Summary storage is non-critical
    }
  }

  // Return: summary as system context + recent messages
  return [
    {
      role: "system",
      content: `[Previous conversation summary — ${olderMessages.length} messages compressed]\n${summaryText}`,
    },
    ...recentMessages.map((m) => ({
      role: m.role.toLowerCase(),
      content: m.content,
    })),
  ];
}

/** Generate a summary of older messages using LLM */
async function generateSummary(messages: ChatMessage[]): Promise<string> {
  const transcript = messages
    .map((m) => {
      const role = m.role === "USER" ? "User" : "EVE";
      // Truncate very long messages in the summary input
      const content = m.content.length > 500 ? `${m.content.slice(0, 500)}...` : m.content;
      return `${role}: ${content}`;
    })
    .join("\n");

  try {
    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: `You are a conversation summarizer. Summarize the following conversation history into a concise but information-dense summary. Preserve:
- Key decisions made
- Important facts mentioned
- Action items and their status
- User preferences expressed
- Any unresolved questions

Keep the summary under 500 words. Use the same language as the conversation (Korean if Korean, English if English). Format as bullet points.`,
        },
        {
          role: "user",
          content: `Summarize this conversation:\n\n${transcript}`,
        },
      ],
      max_tokens: 800,
    });

    return response.choices[0]?.message?.content || "Summary unavailable";
  } catch {
    // Fallback: simple truncation if LLM fails
    return messages
      .slice(-5)
      .map((m) => {
        const role = m.role === "USER" ? "User" : "EVE";
        return `${role}: ${m.content.slice(0, 100)}`;
      })
      .join("\n");
  }
}
