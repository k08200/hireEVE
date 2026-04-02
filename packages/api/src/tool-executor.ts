/**
 * Shared Tool Executor — Used by both chat routes and autonomous agent
 *
 * Extracts executeToolCall from chat.ts so background agents can use the same tools.
 */

import { BRIEFING_TOOLS } from "./briefing.js";
import {
  CALENDAR_TOOLS,
  checkConflicts,
  createEvent,
  deleteEvent,
  listEvents,
} from "./calendar.js";
import {
  CONTACT_TOOLS,
  createContact,
  deleteContact,
  listContacts,
  updateContact,
} from "./contacts.js";
import {
  FILE_TOOLS,
  listRecentDownloads,
  organizeDownloads,
  readAndSummarize,
  searchFiles,
} from "./files.js";
import { classifyEmails, GMAIL_TOOLS, listEmails, readEmail, sendEmail } from "./gmail.js";
import {
  IMESSAGE_TOOLS,
  isIMessageAvailable,
  listRecentChats as listIMessageChats,
  readIMessages,
  sendIMessage,
} from "./imessage.js";
import {
  getClipboard,
  getRunningApps,
  getSystemInfo,
  isMacOS,
  MACOS_TOOLS,
  openItem,
  setClipboard,
  takeScreenshot,
} from "./macos.js";
import { getUpcomingMeetings, joinMeeting, MEETING_TOOLS, summarizeMeeting } from "./meeting.js";
import { getNews, NEWS_TOOLS } from "./news.js";
import { createNote, deleteNote, listNotes, NOTE_TOOLS, updateNote } from "./notes.js";
import {
  createNotionPage,
  listNotionDatabases,
  NOTION_CONFIGURED,
  NOTION_TOOLS,
  searchNotion,
} from "./notion.js";
import {
  createReminder,
  deleteReminder,
  dismissReminder,
  listReminders,
  REMINDER_TOOLS,
} from "./reminders.js";
import { SEARCH_TOOLS, webSearch } from "./search.js";
import { listSlackChannels, readSlackMessages, SLACK_TOOLS, sendSlackMessage } from "./slack.js";
import { createTask, deleteTask, listTasks, TASK_TOOLS, updateTask } from "./tasks.js";
import {
  calculate,
  convertCurrency,
  generatePassword,
  shortenUrl,
  translate,
  UTILITY_TOOLS,
} from "./utilities.js";
import { getWeather, WEATHER_TOOLS } from "./weather.js";
import { WRITER_TOOLS, writeDocument } from "./writer.js";

const SLACK_CONFIGURED = !!(process.env.SLACK_BOT_TOKEN || process.env.SLACK_WEBHOOK_URL);

const TIME_TOOL = {
  type: "function" as const,
  function: {
    name: "get_current_time",
    description: "Get current date and time in KST (Korean Standard Time) and UTC.",
    parameters: { type: "object", properties: {}, required: [] },
  },
};

const GOOGLE_TOOLS = [...GMAIL_TOOLS, ...CALENDAR_TOOLS];

export const ALWAYS_TOOLS = [
  ...TASK_TOOLS,
  ...NOTE_TOOLS,
  ...REMINDER_TOOLS,
  ...CONTACT_TOOLS,
  ...SEARCH_TOOLS,
  ...WRITER_TOOLS,
  ...BRIEFING_TOOLS,
  ...MEETING_TOOLS,
  ...FILE_TOOLS,
  ...WEATHER_TOOLS,
  ...NEWS_TOOLS,
  ...UTILITY_TOOLS,
  TIME_TOOL,
  ...(SLACK_CONFIGURED ? SLACK_TOOLS : []),
  ...(NOTION_CONFIGURED ? NOTION_TOOLS : []),
  ...(isMacOS() ? MACOS_TOOLS : []),
  ...(isIMessageAvailable() ? IMESSAGE_TOOLS : []),
];

export const ALL_TOOLS = [...ALWAYS_TOOLS, ...GOOGLE_TOOLS];

export async function executeToolCall(
  userId: string,
  functionName: string,
  args: Record<string, unknown>,
): Promise<string> {
  try {
    switch (functionName) {
      case "list_emails":
        return JSON.stringify(await listEmails(userId, (args.max_results as number) || 10));
      case "read_email":
        return JSON.stringify(await readEmail(userId, args.email_id as string));
      case "send_email":
        return JSON.stringify(
          await sendEmail(userId, args.to as string, args.subject as string, args.body as string),
        );
      case "classify_emails":
        return JSON.stringify(await classifyEmails(userId, (args.max_results as number) || 10));
      case "list_events":
        return JSON.stringify(await listEvents(userId, (args.max_results as number) || 10));
      case "create_event":
        return JSON.stringify(
          await createEvent(
            userId,
            args.summary as string,
            args.start_time as string,
            args.end_time as string,
            args.description as string | undefined,
            args.location as string | undefined,
          ),
        );
      case "delete_event":
        return JSON.stringify(await deleteEvent(userId, args.event_id as string));
      case "check_calendar_conflicts":
        return JSON.stringify(
          await checkConflicts(userId, args.start_time as string, args.end_time as string),
        );
      case "list_tasks":
        return JSON.stringify(await listTasks(userId, args.status as string | undefined));
      case "create_task":
        return JSON.stringify(
          await createTask(
            userId,
            args.title as string,
            args.description as string | undefined,
            args.priority as string | undefined,
            args.due_date as string | undefined,
          ),
        );
      case "update_task": {
        const { task_id, ...rest } = args;
        return JSON.stringify(await updateTask(task_id as string, rest));
      }
      case "delete_task":
        return JSON.stringify(await deleteTask(args.task_id as string));
      case "list_notes":
        return JSON.stringify(await listNotes(userId, args.search as string | undefined));
      case "create_note":
        return JSON.stringify(
          await createNote(userId, args.title as string, args.content as string),
        );
      case "update_note": {
        const { note_id, ...noteRest } = args;
        return JSON.stringify(await updateNote(note_id as string, noteRest));
      }
      case "delete_note":
        return JSON.stringify(await deleteNote(args.note_id as string));
      case "send_slack_message":
        return JSON.stringify(
          await sendSlackMessage({
            channel: args.channel as string,
            text: args.text as string,
            thread_ts: args.thread_ts as string | undefined,
          }),
        );
      case "list_slack_channels":
        return JSON.stringify(await listSlackChannels());
      case "read_slack_messages":
        return JSON.stringify(
          await readSlackMessages(args.channel as string, (args.limit as number) || 10),
        );
      case "generate_briefing": {
        const { default: generateBriefingForChat } = await import("./briefing.js");
        return JSON.stringify(await generateBriefingForChat(userId));
      }
      case "list_reminders":
        return JSON.stringify(
          await listReminders(userId, (args.include_completed as boolean) || false),
        );
      case "create_reminder":
        return JSON.stringify(
          await createReminder(
            userId,
            args.title as string,
            args.remind_at as string,
            args.description as string | undefined,
          ),
        );
      case "dismiss_reminder":
        return JSON.stringify(await dismissReminder(args.reminder_id as string));
      case "delete_reminder":
        return JSON.stringify(await deleteReminder(args.reminder_id as string));
      case "list_contacts":
        return JSON.stringify(await listContacts(userId, args.search as string | undefined));
      case "create_contact":
        return JSON.stringify(
          await createContact(userId, {
            name: args.name as string,
            email: args.email as string | undefined,
            phone: args.phone as string | undefined,
            company: args.company as string | undefined,
            role: args.role as string | undefined,
            notes: args.notes as string | undefined,
            tags: args.tags as string | undefined,
          }),
        );
      case "update_contact": {
        const { contact_id, ...contactRest } = args;
        return JSON.stringify(await updateContact(contact_id as string, contactRest));
      }
      case "delete_contact":
        return JSON.stringify(await deleteContact(args.contact_id as string));
      case "web_search":
        return JSON.stringify(
          await webSearch(args.query as string, (args.max_results as number) || 5),
        );
      case "write_document":
        return JSON.stringify(
          await writeDocument(
            userId,
            args.type as string,
            args.topic as string,
            args.details as string | undefined,
          ),
        );
      case "get_current_time": {
        const now = new Date();
        const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
        return JSON.stringify({
          utc: now.toISOString(),
          kst: kst.toISOString().replace("Z", "+09:00"),
          formatted_kst: now.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }),
          day_of_week: now.toLocaleDateString("ko-KR", { weekday: "long", timeZone: "Asia/Seoul" }),
        });
      }
      case "search_notion":
        return JSON.stringify(await searchNotion(args.query as string));
      case "create_notion_page":
        return JSON.stringify(
          await createNotionPage(
            args.parent_id as string,
            args.title as string,
            args.content as string,
          ),
        );
      case "list_notion_databases":
        return JSON.stringify(await listNotionDatabases());
      case "send_imessage":
        return JSON.stringify(await sendIMessage(args.to as string, args.text as string));
      case "read_imessages":
        return JSON.stringify(
          await readIMessages(args.from as string, (args.count as number) || 10),
        );
      case "list_imessage_chats":
        return JSON.stringify(await listIMessageChats((args.count as number) || 20));
      case "get_clipboard":
        return JSON.stringify(await getClipboard());
      case "set_clipboard":
        return JSON.stringify(await setClipboard(args.text as string));
      case "get_running_apps":
        return JSON.stringify(await getRunningApps());
      case "open_item":
        return JSON.stringify(await openItem(args.path as string));
      case "get_system_info":
        return JSON.stringify(await getSystemInfo());
      case "take_screenshot":
        return JSON.stringify(await takeScreenshot());
      case "get_upcoming_meetings":
        return JSON.stringify(await getUpcomingMeetings(userId));
      case "join_meeting":
        return JSON.stringify(await joinMeeting(args.meeting_link as string));
      case "summarize_meeting":
        return JSON.stringify(
          await summarizeMeeting(
            args.title as string,
            args.notes as string,
            (args.attendees as string[]) || [],
          ),
        );
      case "search_files":
        return JSON.stringify(
          await searchFiles(args.query as string, args.folder as string | undefined),
        );
      case "read_and_summarize_file":
        return JSON.stringify(await readAndSummarize(args.file_path as string));
      case "organize_downloads":
        return JSON.stringify(await organizeDownloads());
      case "list_recent_downloads":
        return JSON.stringify(await listRecentDownloads((args.count as number) || 10));
      case "get_weather":
        return JSON.stringify(await getWeather(args.location as string));
      case "get_news":
        return JSON.stringify(
          await getNews(args.topic as string | undefined, args.sources as string[] | undefined),
        );
      case "translate_text":
        return JSON.stringify(
          await translate(args.text as string, args.from as string, args.to as string),
        );
      case "shorten_url":
        return JSON.stringify(await shortenUrl(args.url as string));
      case "calculate":
        return JSON.stringify(calculate(args.expression as string));
      case "convert_currency":
        return JSON.stringify(
          await convertCurrency(args.amount as number, args.from as string, args.to as string),
        );
      case "generate_password":
        return JSON.stringify(generatePassword(Math.min((args.length as number) || 16, 64)));
      default:
        return JSON.stringify({ error: `Unknown function: ${functionName}` });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return JSON.stringify({ error: message });
  }
}
