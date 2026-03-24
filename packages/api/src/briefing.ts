/**
 * Daily Briefing — EVE's autonomous planning feature
 *
 * Aggregates tasks, calendar events, and recent emails into a daily summary.
 * Can be triggered manually or via cron.
 */

import type { FastifyInstance } from "fastify";
import { prisma } from "./db.js";
import { listEvents } from "./calendar.js";
import { listEmails } from "./gmail.js";
import { listTasks } from "./tasks.js";
import { listNotes } from "./notes.js";
import { EVE_SYSTEM_PROMPT, MODEL, openai } from "./openai.js";

interface BriefingData {
  tasks: unknown;
  events: unknown;
  emails: unknown;
  notes: unknown;
}

async function gatherBriefingData(userId: string): Promise<BriefingData> {
  const results = await Promise.allSettled([
    listTasks(userId),
    listEvents(userId, 10).catch(() => ({ events: [] })),
    listEmails(userId, 5).catch(() => ({ emails: [] })),
    listNotes(userId).catch(() => ({ notes: [] })),
  ]);

  return {
    tasks: results[0].status === "fulfilled" ? results[0].value : { tasks: [] },
    events: results[1].status === "fulfilled" ? results[1].value : { events: [] },
    emails: results[2].status === "fulfilled" ? results[2].value : { emails: [] },
    notes: results[3].status === "fulfilled" ? results[3].value : { notes: [] },
  };
}

export default async function generateBriefing(userId: string): Promise<string> {
  const data = await gatherBriefingData(userId);

  const briefingPrompt = `Based on the following data, create a concise daily briefing for the user.
Include:
1. Today's schedule (from calendar)
2. Priority tasks that need attention
3. Important unread emails
4. Any relevant notes

Format it as a clear, actionable summary in Korean. Use bullet points.
Be concise — this is a quick morning briefing, not a long report.

Current data:
Tasks: ${JSON.stringify(data.tasks)}
Calendar: ${JSON.stringify(data.events)}
Emails: ${JSON.stringify(data.emails)}
Recent Notes: ${JSON.stringify(data.notes)}

Today is ${new Date().toLocaleDateString("ko-KR", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}.`;

  if (!openai) {
    return "EVE briefing unavailable — LLM not configured.";
  }

  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: EVE_SYSTEM_PROMPT },
      { role: "user", content: briefingPrompt },
    ],
  });

  return response.choices[0]?.message?.content || "No briefing generated.";
}

export async function briefingRoutes(app: FastifyInstance) {
  // POST /api/briefing/generate — Generate daily briefing
  app.post("/generate", async (request) => {
    const { userId } = request.body as { userId: string };
    const briefing = await generateBriefing(userId);

    // Save briefing as a note
    await prisma.note.create({
      data: {
        userId,
        title: `Daily Briefing — ${new Date().toLocaleDateString("ko-KR")}`,
        content: briefing,
      },
    });

    return { briefing };
  });

  // GET /api/briefing/data — Get raw briefing data (for debugging)
  app.get("/data", async (request) => {
    const { userId } = request.query as { userId: string };
    const data = await gatherBriefingData(userId || "demo-user");
    return data;
  });
}

// Tool for EVE to generate briefing on demand
export const BRIEFING_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "generate_briefing",
      description:
        "Generate a daily briefing summarizing today's tasks, calendar events, emails, and notes. Use this when the user asks for a daily summary or morning briefing.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
];
