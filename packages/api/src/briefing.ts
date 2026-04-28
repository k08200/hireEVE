/**
 * Daily Briefing — EVE's autonomous planning feature
 *
 * Aggregates tasks, calendar events, and recent emails into a daily summary.
 * Can be triggered manually or via cron.
 */

import type { FastifyInstance } from "fastify";
import { getUserId } from "./auth.js";
import { type BriefingSignals, buildBriefingSignals } from "./briefing-signals.js";
import { getBriefingStatus } from "./briefing-status.js";
import { listEvents } from "./calendar.js";
import { prisma } from "./db.js";
import { listEmails } from "./gmail.js";
import { listNotes } from "./notes.js";
import { createCompletion, EVE_SYSTEM_PROMPT, MODEL, openai } from "./openai.js";
import { listTasks } from "./tasks.js";

interface BriefingData {
  tasks: unknown;
  events: unknown;
  emails: unknown;
  notes: unknown;
  signals: BriefingSignals;
}

async function gatherBriefingData(userId: string): Promise<BriefingData> {
  const results = await Promise.allSettled([
    listTasks(userId),
    listEvents(userId, 10).catch(() => ({ events: [] })),
    listEmails(userId, 5).catch(() => ({ emails: [] })),
    listNotes(userId).catch(() => ({ notes: [] })),
  ]);

  const data = {
    tasks: results[0].status === "fulfilled" ? results[0].value : { tasks: [] },
    events: results[1].status === "fulfilled" ? results[1].value : { events: [] },
    emails: results[2].status === "fulfilled" ? results[2].value : { emails: [] },
    notes: results[3].status === "fulfilled" ? results[3].value : { notes: [] },
  };

  return {
    ...data,
    signals: buildBriefingSignals(data),
  };
}

export default async function generateBriefing(userId: string): Promise<string> {
  const data = await gatherBriefingData(userId);

  const today = new Date().toLocaleDateString("ko-KR", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // The brief is the user's first read of the day — it has to make them feel
  // "someone thought about my day." Data dumps fail that bar. This prompt asks
  // the model to *decide* what matters and surface connections across domains.
  const briefingPrompt = `오늘은 ${today}. 사용자가 자리에 앉자마자 읽는 1분짜리 아침 브리핑을 써줘.

## 너의 역할
데이터를 요약하는 게 아니라, **오늘 뭐부터 해야 할지 결정**하는 것. 직원처럼 생각하고 말해.

## 반드시 할 것
1. **도메인 연결**: "서버가 미리 찾은 신호"의 crossLinks를 우선 근거로 삼아 이메일·캘린더·태스크를 엮어서 언급. 새로운 연결을 상상해서 만들지 말고, 근거가 약하면 생략.
2. **Top 3 액션**: 오늘 해야 할 구체적 행동 3개, 우선순위 순서대로. 각각 한 줄 이유.
3. **빈 시간 활용**: 캘린더가 비어있으면 "여유 있으니 X하기 좋아요"처럼 능동 제안.
4. **반드시 생략**: "데이터를 전달받았다", "X 일정이 없습니다" 같은 메타 코멘트. 유저는 그거 알 필요 없음.

## 출력 형식
- 첫 줄: 오늘 하루 한 줄 요약 (예: "오늘 미팅 1건, 답장 밀린 게 2개 있어요")
- **오늘의 Top 3** — 번호 붙은 액션 + 이유
- **연결된 항목** (있을 때만) — 이메일/태스크/일정이 어떻게 얽혀있는지
- **나머지** — 일정과 이메일 요약 2~3줄
- 한국어, 친근한 직원 톤, 리포트 톤 X
- 전체 150~300자

## 예시
오늘은 미팅 1건, 답장 밀린 게 2개 있어요.

**오늘의 Top 3**
1. 오전에 김○○님 답장 쓰기 — 48시간 지났고 내일 미팅 리드타임이라 급함
2. 오후 3시 Zoom 전에 Notion 자료 읽기 — 회의 효율 위해 15분만 투자
3. 피치덱 2시간 블록 확보 — 다음 주 투자자 미팅 앞두고 밀림

**연결**
- Vercel 배포 실패 이메일 → "deploy 수정" 태스크와 같은 건. Top 1 답장과 별개로 오전 중 처리 권장.

**나머지**
- 15:00 Zoom 외 일정 없음
- 읽지 않은 이메일 중 긴급 없음

---

## 서버가 미리 찾은 신호
이 섹션은 결정적 규칙으로 만든 근거다. 연결된 항목을 말할 때는 가능한 한 이 안의 crossLinks, deadlines, urgentItems를 사용해.
Signals: ${JSON.stringify(data.signals)}

## 오늘 데이터
Tasks: ${JSON.stringify(data.tasks)}
Calendar: ${JSON.stringify(data.events)}
Emails: ${JSON.stringify(data.emails)}
Recent Notes: ${JSON.stringify(data.notes)}`;

  if (!openai) {
    return "EVE briefing unavailable — LLM not configured.";
  }

  const response = await createCompletion({
    model: MODEL,
    messages: [
      { role: "system", content: EVE_SYSTEM_PROMPT },
      { role: "user", content: briefingPrompt },
    ],
  });

  return response.choices[0]?.message?.content || "No briefing generated.";
}

export function briefingRoutes(app: FastifyInstance) {
  // POST /api/briefing/generate — Generate daily briefing
  app.post("/generate", async (request) => {
    const userId = getUserId(request);
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

  // GET /api/briefing/data — Get raw briefing data
  app.get("/data", async (request) => {
    const userId = getUserId(request);
    const data = await gatherBriefingData(userId);
    return data;
  });

  // GET /api/briefing/today — Latest briefing stored today (or null)
  app.get("/today", async (request) => {
    const userId = getUserId(request);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const note = await prisma.note.findFirst({
      where: {
        userId,
        title: { startsWith: "Daily Briefing" },
        createdAt: { gte: todayStart },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, content: true, createdAt: true },
    });

    return { briefing: note };
  });

  // GET /api/briefing/status — Today's briefing, notification, and push state
  app.get("/status", (request) => {
    const userId = getUserId(request);
    return getBriefingStatus(userId);
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
