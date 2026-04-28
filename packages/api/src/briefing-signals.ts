export type BriefingSource = "email" | "task" | "calendar";

export interface BriefingReference {
  source: BriefingSource;
  id: string | null;
  title: string;
}

export interface BriefingDeadlineSignal {
  source: BriefingSource;
  id: string | null;
  title: string;
  dueAt: string | null;
  dueText: string;
  reason: string;
}

export interface BriefingUrgencySignal {
  source: BriefingSource;
  id: string | null;
  title: string;
  reason: string;
}

export interface BriefingCrossLink {
  kind: "email_task" | "email_event" | "task_event";
  strength: number;
  reason: string;
  email?: BriefingReference;
  task?: BriefingReference;
  event?: BriefingReference;
}

export interface BriefingSignals {
  deadlines: BriefingDeadlineSignal[];
  urgentItems: BriefingUrgencySignal[];
  crossLinks: BriefingCrossLink[];
}

interface NormalizedTask {
  id: string | null;
  title: string;
  description: string;
  status: string;
  priority: string;
  dueDate: string | null;
}

interface NormalizedEvent {
  id: string | null;
  title: string;
  description: string;
  location: string;
  start: string | null;
  end: string | null;
}

interface NormalizedEmail {
  id: string | null;
  from: string;
  subject: string;
  snippet: string;
  date: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const STOPWORDS = new Set([
  "about",
  "agenda",
  "call",
  "daily",
  "email",
  "from",
  "hello",
  "meeting",
  "please",
  "sync",
  "thanks",
  "today",
  "tomorrow",
  "weekly",
  "with",
  "관련",
  "논의",
  "메일",
  "미팅",
  "부탁",
  "오늘",
  "요청",
  "일정",
  "정기",
  "주간",
  "회의",
]);

const URGENCY_PATTERNS = [
  { pattern: /urgent|asap|blocked|deadline|overdue|by eod|eow/i, reason: "urgent keyword" },
  { pattern: /긴급|급함|급해|마감|오늘까지|기한|늦었|지연|장애|실패/i, reason: "긴급 키워드" },
];

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string") return value;
  }
  return "";
}

function readNullableString(record: Record<string, unknown>, keys: string[]): string | null {
  const value = readString(record, keys);
  return value.trim() ? value : null;
}

function unwrapArray(value: unknown, key: string): Record<string, unknown>[] {
  const record = asRecord(value);
  const rows = Array.isArray(record?.[key]) ? record[key] : Array.isArray(value) ? value : [];
  return rows.map(asRecord).filter((row): row is Record<string, unknown> => row !== null);
}

function normalizeTasks(value: unknown): NormalizedTask[] {
  return unwrapArray(value, "tasks")
    .map((row) => ({
      id: readNullableString(row, ["id"]),
      title: readString(row, ["title"]),
      description: readString(row, ["description"]),
      status: readString(row, ["status"]),
      priority: readString(row, ["priority"]).toUpperCase(),
      dueDate: readNullableString(row, ["dueDate", "due_date"]),
    }))
    .filter((task) => task.title.trim().length > 0);
}

function normalizeEvents(value: unknown): NormalizedEvent[] {
  return unwrapArray(value, "events")
    .map((row) => ({
      id: readNullableString(row, ["id"]),
      title: readString(row, ["title", "summary"]),
      description: readString(row, ["description"]),
      location: readString(row, ["location"]),
      start: readNullableString(row, ["start", "startTime"]),
      end: readNullableString(row, ["end", "endTime"]),
    }))
    .filter((event) => event.title.trim().length > 0);
}

function normalizeEmails(value: unknown): NormalizedEmail[] {
  return unwrapArray(value, "emails")
    .map((row) => ({
      id: readNullableString(row, ["id", "gmailId"]),
      from: readString(row, ["from"]),
      subject: readString(row, ["subject"]),
      snippet: readString(row, ["snippet", "summary"]),
      date: readNullableString(row, ["date", "receivedAt"]),
    }))
    .filter((email) => email.subject.trim().length > 0 || email.snippet.trim().length > 0);
}

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function dayIso(date: Date): string {
  return startOfDay(date).toISOString();
}

function deadlineFromText(
  text: string,
  now: Date,
): { dueAt: string | null; dueText: string } | null {
  if (/\b(today|by eod)\b/i.test(text) || /오늘|오늘까지/.test(text)) {
    return { dueAt: dayIso(now), dueText: "today" };
  }
  if (/\btomorrow\b/i.test(text) || /내일/.test(text)) {
    return { dueAt: dayIso(new Date(now.getTime() + DAY_MS)), dueText: "tomorrow" };
  }
  if (/\b(this week|eow|end of week)\b/i.test(text) || /이번\s*주|금주/.test(text)) {
    return { dueAt: null, dueText: "this week" };
  }
  if (/\b(deadline|due)\b/i.test(text) || /마감|기한|까지/.test(text)) {
    return { dueAt: null, dueText: "deadline mentioned" };
  }
  return null;
}

function tokenize(text: string): string[] {
  const words = text.match(/[A-Za-z0-9가-힣]{2,}/g) || [];
  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const word of words) {
    const normalized = word.toLowerCase();
    if (STOPWORDS.has(normalized) || seen.has(normalized)) continue;
    seen.add(normalized);
    tokens.push(normalized);
  }
  return tokens;
}

function commonTokens(a: string, b: string): string[] {
  const left = new Set(tokenize(a));
  return tokenize(b).filter((token) => left.has(token));
}

function ref(source: BriefingSource, id: string | null, title: string): BriefingReference {
  return { source, id, title };
}

function titleFromEmail(email: NormalizedEmail): string {
  return email.subject || email.snippet || email.from || "Email";
}

function textFromTask(task: NormalizedTask): string {
  return `${task.title} ${task.description}`;
}

function textFromEvent(event: NormalizedEvent): string {
  return `${event.title} ${event.description} ${event.location}`;
}

function textFromEmail(email: NormalizedEmail): string {
  return `${email.from} ${email.subject} ${email.snippet}`;
}

function buildDeadlines(input: {
  tasks: NormalizedTask[];
  emails: NormalizedEmail[];
  events: NormalizedEvent[];
  now: Date;
}): BriefingDeadlineSignal[] {
  const signals: BriefingDeadlineSignal[] = [];

  for (const task of input.tasks) {
    if (task.status.toUpperCase() === "DONE") continue;
    if (!task.dueDate) continue;
    signals.push({
      source: "task",
      id: task.id,
      title: task.title,
      dueAt: task.dueDate,
      dueText: "task due date",
      reason:
        task.priority === "URGENT" || task.priority === "HIGH"
          ? `${task.priority} task`
          : "open task",
    });
  }

  for (const event of input.events) {
    if (!event.start) continue;
    signals.push({
      source: "calendar",
      id: event.id,
      title: event.title,
      dueAt: event.start,
      dueText: "event start",
      reason: "scheduled today/upcoming",
    });
  }

  for (const email of input.emails) {
    const deadline = deadlineFromText(textFromEmail(email), input.now);
    if (!deadline) continue;
    signals.push({
      source: "email",
      id: email.id,
      title: titleFromEmail(email),
      dueAt: deadline.dueAt,
      dueText: deadline.dueText,
      reason: "deadline language in email",
    });
  }

  return signals
    .sort((a, b) => {
      const left = parseDate(a.dueAt)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const right = parseDate(b.dueAt)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return left - right;
    })
    .slice(0, 8);
}

function buildUrgency(input: {
  tasks: NormalizedTask[];
  emails: NormalizedEmail[];
}): BriefingUrgencySignal[] {
  const signals: BriefingUrgencySignal[] = [];

  for (const task of input.tasks) {
    if (task.status.toUpperCase() === "DONE") continue;
    if (task.priority !== "URGENT" && task.priority !== "HIGH") continue;
    signals.push({
      source: "task",
      id: task.id,
      title: task.title,
      reason: `${task.priority} priority`,
    });
  }

  for (const email of input.emails) {
    const text = textFromEmail(email);
    const match = URGENCY_PATTERNS.find((entry) => entry.pattern.test(text));
    if (!match) continue;
    signals.push({
      source: "email",
      id: email.id,
      title: titleFromEmail(email),
      reason: match.reason,
    });
  }

  return signals.slice(0, 8);
}

function linkReason(tokens: string[], extra?: string): string {
  const base = `shared terms: ${tokens.slice(0, 3).join(", ")}`;
  return extra ? `${base}; ${extra}` : base;
}

function buildEmailTaskLinks(
  emails: NormalizedEmail[],
  tasks: NormalizedTask[],
): BriefingCrossLink[] {
  const links: BriefingCrossLink[] = [];

  for (const email of emails) {
    const emailText = textFromEmail(email);

    for (const task of tasks) {
      if (task.status.toUpperCase() === "DONE") continue;
      const tokens = commonTokens(emailText, textFromTask(task));
      if (tokens.length === 0) continue;
      links.push({
        kind: "email_task",
        strength: tokens.length,
        reason: linkReason(tokens),
        email: ref("email", email.id, titleFromEmail(email)),
        task: ref("task", task.id, task.title),
      });
    }
  }

  return links;
}

function buildEmailEventLinks(
  emails: NormalizedEmail[],
  events: NormalizedEvent[],
): BriefingCrossLink[] {
  const links: BriefingCrossLink[] = [];

  for (const email of emails) {
    const emailText = textFromEmail(email);

    for (const event of events) {
      const tokens = commonTokens(emailText, textFromEvent(event));
      if (tokens.length === 0) continue;
      links.push({
        kind: "email_event",
        strength: tokens.length,
        reason: linkReason(tokens),
        email: ref("email", email.id, titleFromEmail(email)),
        event: ref("calendar", event.id, event.title),
      });
    }
  }

  return links;
}

function buildTaskEventLinks(
  tasks: NormalizedTask[],
  events: NormalizedEvent[],
): BriefingCrossLink[] {
  const links: BriefingCrossLink[] = [];

  for (const task of tasks) {
    if (task.status.toUpperCase() === "DONE") continue;
    for (const event of events) {
      const tokens = commonTokens(textFromTask(task), textFromEvent(event));
      if (tokens.length === 0) continue;
      const taskDue = parseDate(task.dueDate);
      const eventStart = parseDate(event.start);
      const dueBeforeEvent =
        taskDue !== null && eventStart !== null && taskDue.getTime() <= eventStart.getTime();
      links.push({
        kind: "task_event",
        strength: tokens.length + (dueBeforeEvent ? 1 : 0),
        reason: linkReason(tokens, dueBeforeEvent ? "task due before event" : undefined),
        task: ref("task", task.id, task.title),
        event: ref("calendar", event.id, event.title),
      });
    }
  }

  return links;
}

function buildCrossLinks(input: {
  tasks: NormalizedTask[];
  emails: NormalizedEmail[];
  events: NormalizedEvent[];
}): BriefingCrossLink[] {
  const links = [
    ...buildEmailTaskLinks(input.emails, input.tasks),
    ...buildEmailEventLinks(input.emails, input.events),
    ...buildTaskEventLinks(input.tasks, input.events),
  ];

  return links.sort((a, b) => b.strength - a.strength).slice(0, 8);
}

export function buildBriefingSignals(
  data: { tasks: unknown; events: unknown; emails: unknown },
  opts?: { now?: Date },
): BriefingSignals {
  const now = opts?.now ?? new Date();
  const tasks = normalizeTasks(data.tasks);
  const events = normalizeEvents(data.events);
  const emails = normalizeEmails(data.emails);

  return {
    deadlines: buildDeadlines({ tasks, emails, events, now }),
    urgentItems: buildUrgency({ tasks, emails }),
    crossLinks: buildCrossLinks({ tasks, emails, events }),
  };
}
