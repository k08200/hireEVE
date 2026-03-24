import { google } from "googleapis";
import { getAuthedClient } from "./gmail.js";

export async function listEvents(userId: string, maxResults = 10) {
  const auth = await getAuthedClient(userId);
  if (!auth) return { error: "Google Calendar not connected. Please connect your Google account first." };

  const calendar = google.calendar({ version: "v3", auth });
  const res = await calendar.events.list({
    calendarId: "primary",
    timeMin: new Date().toISOString(),
    maxResults,
    singleEvents: true,
    orderBy: "startTime",
  });

  const events = (res.data.items || []).map((e) => ({
    id: e.id,
    summary: e.summary || "(No title)",
    start: e.start?.dateTime || e.start?.date || "",
    end: e.end?.dateTime || e.end?.date || "",
    location: e.location || "",
    description: e.description || "",
  }));

  return { events };
}

export async function createEvent(
  userId: string,
  summary: string,
  startTime: string,
  endTime: string,
  description?: string,
  location?: string,
) {
  const auth = await getAuthedClient(userId);
  if (!auth) return { error: "Google Calendar not connected." };

  const calendar = google.calendar({ version: "v3", auth });
  const res = await calendar.events.insert({
    calendarId: "primary",
    requestBody: {
      summary,
      description: description || "",
      location: location || "",
      start: { dateTime: startTime, timeZone: "Asia/Seoul" },
      end: { dateTime: endTime, timeZone: "Asia/Seoul" },
    },
  });

  return { success: true, eventId: res.data.id, htmlLink: res.data.htmlLink };
}

export async function deleteEvent(userId: string, eventId: string) {
  const auth = await getAuthedClient(userId);
  if (!auth) return { error: "Google Calendar not connected." };

  const calendar = google.calendar({ version: "v3", auth });
  await calendar.events.delete({
    calendarId: "primary",
    eventId,
  });

  return { success: true };
}

export const CALENDAR_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "list_events",
      description: "List upcoming events from the user's Google Calendar",
      parameters: {
        type: "object",
        properties: {
          max_results: {
            type: "number",
            description: "Number of upcoming events to fetch (default 10)",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_event",
      description: "Create a new event on the user's Google Calendar",
      parameters: {
        type: "object",
        properties: {
          summary: { type: "string", description: "Event title" },
          start_time: {
            type: "string",
            description: "Start time in ISO 8601 format (e.g. 2026-03-25T14:00:00+09:00)",
          },
          end_time: {
            type: "string",
            description: "End time in ISO 8601 format (e.g. 2026-03-25T15:00:00+09:00)",
          },
          description: { type: "string", description: "Event description (optional)" },
          location: { type: "string", description: "Event location (optional)" },
        },
        required: ["summary", "start_time", "end_time"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "delete_event",
      description: "Delete an event from the user's Google Calendar by its ID",
      parameters: {
        type: "object",
        properties: {
          event_id: { type: "string", description: "The Google Calendar event ID to delete" },
        },
        required: ["event_id"],
      },
    },
  },
];
