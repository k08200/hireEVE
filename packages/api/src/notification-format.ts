/**
 * Notification text helpers — turn internal tool names and raw email
 * metadata into messages a user actually wants to see on their phone.
 *
 * Rules of thumb:
 * - Title carries WHAT happened/needs to happen (3–5 words)
 * - Body carries WHO and any concrete next step
 * - No function names, no JSON payloads, no [internal_id] tags
 */

interface ToolArgs {
  to?: string;
  recipient?: string;
  subject?: string;
  title?: string;
  message?: string;
  query?: string;
  task_id?: string;
  taskId?: string;
  event_id?: string;
  eventId?: string;
  [key: string]: unknown;
}

/** Strip "Display Name <a@b.com>" → "Display Name", or just trim email. */
export function senderName(raw: string | null | undefined): string {
  if (!raw) return "발신자 불명";
  const match = raw.match(/^([^<]+?)\s*</);
  if (match?.[1]) return match[1].trim().slice(0, 30);
  return raw.replace(/[<>]/g, "").trim().slice(0, 30);
}

/** Map autonomous-agent tool calls to a human Korean summary. */
export function humanizeAutoExec(
  fnName: string,
  args: ToolArgs,
): { autoTitle: string; autoMessage: string } {
  const summary = TOOL_SUMMARIES[fnName];
  if (summary) {
    const built = summary(args);
    return { autoTitle: `[EVE] ${built.title}`, autoMessage: built.body };
  }
  // Unknown tool — at least drop the JSON dump.
  const friendly = fnName.replace(/_/g, " ");
  return {
    autoTitle: "[EVE] 작업 완료",
    autoMessage: `${friendly} 처리했습니다.`,
  };
}

type Summary = (args: ToolArgs) => { title: string; body: string };

const TOOL_SUMMARIES: Record<string, Summary> = {
  send_email: (a) => ({
    title: "메일 발송 완료",
    body: `${senderName(a.to || a.recipient)}에게 "${truncate(a.subject, 40)}" 보냈어요.`,
  }),
  draft_email: (a) => ({
    title: "답장 초안 준비",
    body: `${senderName(a.to || a.recipient)}에게 보낼 초안을 준비했어요. 검토해주세요.`,
  }),
  classify_emails: () => ({
    title: "메일 분류 완료",
    body: "받은 편지함의 우선순위를 정리했어요.",
  }),
  trash_email: (a) => ({
    title: "메일 정리",
    body: `광고/뉴스레터 ${a.subject ? `"${truncate(a.subject, 30)}" ` : ""}휴지통으로 옮겼어요.`,
  }),
  create_task: (a) => ({
    title: "할 일 추가",
    body: `"${truncate(a.title, 50)}" 태스크에 담았어요.`,
  }),
  update_task: () => ({ title: "할 일 업데이트", body: "태스크 상태를 갱신했어요." }),
  complete_task: (a) => ({
    title: "할 일 완료",
    body: a.title ? `"${truncate(a.title, 50)}" 끝냈어요.` : "태스크 하나 완료했어요.",
  }),
  create_reminder: (a) => ({
    title: "리마인더 등록",
    body: `"${truncate(a.title, 50)}" 잊지 않게 알려드릴게요.`,
  }),
  create_event: (a) => ({
    title: "캘린더 등록",
    body: `"${truncate(a.title, 50)}" 일정 추가했어요.`,
  }),
  create_note: (a) => ({
    title: "노트 작성",
    body: `"${truncate(a.title, 50)}" 노트 저장했어요.`,
  }),
  update_note: () => ({ title: "노트 업데이트", body: "노트를 갱신했어요." }),
  search_web: (a) => ({
    title: "웹 검색",
    body: a.query ? `"${truncate(a.query, 60)}" 검색했어요.` : "웹 검색을 마쳤어요.",
  }),
};

/** Format urgent-email push body — no internal IDs, sender first. */
export function formatUrgentEmailBody(
  emails: Array<{ from: string | null; subject: string | null; summary?: string | null }>,
): string {
  if (emails.length === 0) return "";
  const top = emails[0];
  const who = senderName(top.from);
  const what = truncate(top.summary || top.subject || "새 메일", 60);
  if (emails.length === 1) return `${who}: ${what}`;
  return `긴급 메일 ${emails.length}건. 최신: ${who} — ${what}`;
}

function truncate(value: string | undefined | null, max: number): string {
  if (!value) return "";
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}
