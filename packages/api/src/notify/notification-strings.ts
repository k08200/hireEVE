/**
 * Notification copy, per language.
 *
 * This is Klorn's own voice — "Draft ready", "2 urgent emails" — so it follows
 * the user's chosen language. That is a different rule from a reply, which
 * follows the language of the mail it answers (email-reply.ts). Mixing the two
 * up produces a Korean reply announced by an English banner.
 *
 * Ships en + ko, matching the languages the clients offer. An unknown language
 * falls back to English rather than throwing: a missing translation must never
 * cost the user a notification.
 */

export const NOTIFICATION_LANGUAGES = ["en", "ko"] as const;
export type NotificationLanguage = (typeof NOTIFICATION_LANGUAGES)[number];

const DEFAULT_LANGUAGE: NotificationLanguage = "en";

/** Narrow an arbitrary stored/requested language to one we actually ship. */
export function resolveNotificationLanguage(raw: string | null | undefined): NotificationLanguage {
  if (!raw) return DEFAULT_LANGUAGE;
  const base = raw.toLowerCase().split(/[-_]/)[0];
  return (NOTIFICATION_LANGUAGES as readonly string[]).includes(base)
    ? (base as NotificationLanguage)
    : DEFAULT_LANGUAGE;
}

interface NotificationCopy {
  unknownSender: string;
  newMail: string;
  /** Multi-mail summary, e.g. "3 urgent emails. Latest: Alice - Subject". */
  urgentDigest: (count: number, who: string, what: string) => string;
  actionComplete: { title: string; body: (action: string) => string };
  tools: Record<
    string,
    {
      title: string;
      body: (v: { subject: string; to: string; title: string; query: string }) => string;
    }
  >;
}

const EN: NotificationCopy = {
  unknownSender: "Unknown sender",
  newMail: "New mail",
  urgentDigest: (count, who, what) => `${count} urgent emails. Latest: ${who} - ${what}`,
  actionComplete: { title: "Action complete", body: (action) => `${action} finished.` },
  tools: {
    send_email: { title: "Email sent", body: (v) => `Sent "${v.subject}" to ${v.to}.` },
    draft_email: {
      title: "Draft ready",
      body: (v) => `Prepared a draft for ${v.to}. Review it before sending.`,
    },
    classify_emails: {
      title: "Mail prioritized",
      body: () => "Inbox priority has been refreshed.",
    },
    trash_email: {
      title: "Mail cleaned up",
      body: (v) => `Moved ${v.subject ? `"${v.subject}" ` : "a low-priority message "}to trash.`,
    },
    create_task: { title: "Task added", body: (v) => `Added "${v.title}" to tasks.` },
    update_task: { title: "Task updated", body: () => "Task status was updated." },
    complete_task: {
      title: "Task complete",
      body: (v) => (v.title ? `Completed "${v.title}".` : "Completed a task."),
    },
    create_reminder: {
      title: "Reminder set",
      body: (v) => `A reminder is set for "${v.title}".`,
    },
    create_event: {
      title: "Calendar event added",
      body: (v) => `Added "${v.title}" to the calendar.`,
    },
    create_note: { title: "Note saved", body: (v) => `Saved note "${v.title}".` },
    update_note: { title: "Note updated", body: () => "The note was updated." },
    search_web: {
      title: "Web search complete",
      body: (v) => (v.query ? `Searched "${v.query}".` : "Web search is complete."),
    },
  },
};

const KO: NotificationCopy = {
  unknownSender: "발신자 불명",
  newMail: "새 메일",
  urgentDigest: (count, who, what) => `긴급 메일 ${count}건. 최신: ${who} - ${what}`,
  actionComplete: { title: "작업 완료", body: (action) => `${action} 작업을 마쳤습니다.` },
  tools: {
    send_email: { title: "메일 보냄", body: (v) => `"${v.subject}"을(를) ${v.to}에게 보냈습니다.` },
    draft_email: {
      title: "초안 준비됨",
      body: (v) => `${v.to}에게 보낼 초안을 준비했습니다. 보내기 전에 확인하세요.`,
    },
    classify_emails: { title: "메일 정리됨", body: () => "받은편지함 우선순위를 갱신했습니다." },
    trash_email: {
      title: "메일 정리함",
      body: (v) =>
        `${v.subject ? `"${v.subject}"을(를) ` : "중요하지 않은 메일을 "}휴지통으로 옮겼습니다.`,
    },
    create_task: { title: "할 일 추가됨", body: (v) => `"${v.title}"을(를) 할 일에 추가했습니다.` },
    update_task: { title: "할 일 업데이트됨", body: () => "할 일 상태를 업데이트했습니다." },
    complete_task: {
      title: "할 일 완료",
      body: (v) => (v.title ? `"${v.title}"을(를) 완료했습니다.` : "할 일을 완료했습니다."),
    },
    create_reminder: { title: "알림 설정됨", body: (v) => `"${v.title}" 알림을 설정했습니다.` },
    create_event: {
      title: "일정 추가됨",
      body: (v) => `"${v.title}"을(를) 캘린더에 추가했습니다.`,
    },
    create_note: { title: "메모 저장됨", body: (v) => `"${v.title}" 메모를 저장했습니다.` },
    update_note: { title: "메모 업데이트됨", body: () => "메모를 업데이트했습니다." },
    search_web: {
      title: "웹 검색 완료",
      body: (v) => (v.query ? `"${v.query}"을(를) 검색했습니다.` : "웹 검색을 마쳤습니다."),
    },
  },
};

const COPY: Record<NotificationLanguage, NotificationCopy> = { en: EN, ko: KO };

export function notificationCopy(language: string | null | undefined): NotificationCopy {
  return COPY[resolveNotificationLanguage(language)];
}
