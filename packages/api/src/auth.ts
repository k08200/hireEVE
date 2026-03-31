import bcrypt from "bcryptjs";
import type { FastifyReply, FastifyRequest } from "fastify";
import jwt from "jsonwebtoken";
import { prisma } from "./db.js";

const JWT_SECRET = process.env.JWT_SECRET || "eve-dev-secret-change-in-production";
const TOKEN_EXPIRY = "7d";

export interface JwtPayload {
  userId: string;
  email: string;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/** Extract userId from Authorization header or fall back to "demo-user" */
export function getUserId(request: FastifyRequest): string {
  const auth = request.headers.authorization;
  if (auth?.startsWith("Bearer ")) {
    try {
      const payload = verifyToken(auth.slice(7));
      return payload.userId;
    } catch {
      // invalid token — fall through to demo
    }
  }
  return "demo-user";
}

/** Fastify preHandler that requires authentication */
export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  const auth = request.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    return reply.code(401).send({ error: "Authentication required" });
  }
  try {
    const payload = verifyToken(auth.slice(7));
    // Attach to request for downstream handlers
    (request as unknown as { userId: string }).userId = payload.userId;
  } catch {
    return reply.code(401).send({ error: "Invalid or expired token" });
  }
}

/** Ensure demo user exists (for unauthenticated use) */
export async function ensureDemoUser() {
  const hash = await hashPassword("demo");
  await prisma.user.upsert({
    where: { id: "demo-user" },
    create: {
      id: "demo-user",
      email: "demo@hireeve.com",
      name: "Demo User",
      passwordHash: hash,
    },
    update: {
      email: "demo@hireeve.com",
      name: "Demo User",
      passwordHash: hash,
    },
  });

  // Seed sample data if demo user has no tasks yet
  const taskCount = await prisma.task.count({ where: { userId: "demo-user" } });
  if (taskCount === 0) {
    await seedDemoData();
  }
}

async function seedDemoData() {
  const uid = "demo-user";
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  // Sample tasks
  await prisma.task.createMany({
    data: [
      {
        userId: uid,
        title: "랜딩 페이지 최종 검토",
        description: "CTA 버튼, 카피, 모바일 반응형 확인",
        status: "IN_PROGRESS",
        priority: "HIGH",
        dueDate: tomorrow,
      },
      {
        userId: uid,
        title: "Product Hunt 런치 준비",
        description: "스크린샷 5장, 태그라인, 메이커 코멘트 작성",
        status: "TODO",
        priority: "HIGH",
        dueDate: nextWeek,
      },
      {
        userId: uid,
        title: "투자자 미팅 자료 정리",
        description: "피치덱 v3 업데이트, 재무 모델 첨부",
        status: "TODO",
        priority: "URGENT",
        dueDate: tomorrow,
      },
      {
        userId: uid,
        title: "고객 피드백 정리",
        description: "베타 테스터 5명 피드백 스프레드시트 정리",
        status: "DONE",
        priority: "MEDIUM",
      },
      {
        userId: uid,
        title: "블로그 글 초안",
        description: "'1인 창업자가 AI 직원을 채용한 이유' 주제",
        status: "TODO",
        priority: "LOW",
        dueDate: nextWeek,
      },
    ],
  });

  // Sample notes
  await prisma.note.createMany({
    data: [
      {
        userId: uid,
        title: "EVE 로드맵 Q2",
        content:
          "## 2분기 목표\n\n1. Slack 양방향 연동 완성\n2. 팀 워크스페이스 정식 출시\n3. 데스크톱 앱 v1.0 배포\n4. Product Hunt 런치\n\n### KPI\n- MAU 500명\n- 유료 전환 5%",
      },
      {
        userId: uid,
        title: "투자자 미팅 메모",
        content:
          "## ABC Ventures 미팅 (3/28)\n\n- 관심 포인트: TAM, 경쟁 차별화\n- 피드백: 한국어 특화 좋음, 팀 기능 빨리 추가\n- 다음 단계: 2주 후 후속 미팅",
      },
      {
        userId: uid,
        title: "경쟁사 분석",
        content:
          "### 직접 경쟁\n- Notion AI: 문서 중심, 채팅 아님\n- ChatGPT: 범용, 도구 연동 약함\n\n### EVE 차별점\n- 한국어 네이티브\n- 36+ 도구 통합\n- 자율 백그라운드 에이전트\n- 데스크톱 캐릭터",
      },
    ],
  });

  // Sample contacts
  await prisma.contact.createMany({
    data: [
      {
        userId: uid,
        name: "김민수",
        email: "minsu@example.com",
        company: "ABC Ventures",
        role: "심사역",
        tags: "투자자,VC",
      },
      {
        userId: uid,
        name: "이수진",
        email: "sujin@example.com",
        company: "TechStartup",
        role: "CTO",
        tags: "파트너,기술",
      },
      {
        userId: uid,
        name: "박지훈",
        email: "jihoon@example.com",
        company: "DesignLab",
        role: "디자이너",
        tags: "프리랜서,디자인",
      },
      {
        userId: uid,
        name: "Sarah Chen",
        email: "sarah@example.com",
        company: "Product Hunt",
        role: "Community Manager",
        tags: "런치,커뮤니티",
      },
      {
        userId: uid,
        name: "정하나",
        email: "hana@example.com",
        phone: "010-1234-5678",
        company: "마케팅코리아",
        role: "마케터",
        tags: "마케팅,콘텐츠",
      },
    ],
  });

  // Sample reminders
  const inTwoHours = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  const tomorrowMorning = new Date(tomorrow);
  tomorrowMorning.setHours(9, 0, 0, 0);
  await prisma.reminder.createMany({
    data: [
      {
        userId: uid,
        title: "투자자 이메일 답장",
        description: "ABC Ventures 김민수 심사역에게 후속 자료 보내기",
        remindAt: inTwoHours,
      },
      {
        userId: uid,
        title: "팀 주간 미팅",
        description: "이수진 CTO와 기술 진행상황 공유",
        remindAt: tomorrowMorning,
      },
    ],
  });

  // Sample calendar events
  const meetingStart = new Date(tomorrow);
  meetingStart.setHours(14, 0, 0, 0);
  const meetingEnd = new Date(tomorrow);
  meetingEnd.setHours(15, 0, 0, 0);
  await prisma.calendarEvent.createMany({
    data: [
      {
        userId: uid,
        title: "투자자 미팅 — ABC Ventures",
        startTime: meetingStart,
        endTime: meetingEnd,
        location: "강남 위워크 3층",
        color: "#3b82f6",
      },
      {
        userId: uid,
        title: "Product Hunt 런치 전략 회의",
        startTime: new Date(nextWeek.setHours(10, 0, 0, 0)),
        endTime: new Date(nextWeek.setHours(11, 0, 0, 0)),
        meetingLink: "https://meet.google.com/abc-defg-hij",
        color: "#8b5cf6",
      },
    ],
  });

  console.log("[SEED] Demo data created for demo-user");
}
