/**
 * generateSmartReply() drafts the body of an AUTO_REPLY rule — a reply that can
 * be auto-sent without a human reading it. It must answer in the language the
 * sender wrote in; a Korean email answered in English is a visible failure that
 * nobody reviews before it leaves the mailbox.
 *
 * The observable here is the system prompt handed to the LLM, so that is what
 * these assertions pin.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const createCompletion = vi.hoisted(() => vi.fn());

vi.mock("../db.js", () => {
  const prisma = { emailRule: { findMany: vi.fn(), update: vi.fn() } };
  return { prisma, db: prisma };
});
vi.mock("../llm/openai.js", () => ({
  createCompletion,
  DRAFT_MODEL: "test-draft-model",
  openai: {},
}));

import { generateSmartReply } from "../mail/email-reply.js";

const EMAIL = {
  from: "김대표 <ceo@example.co.kr>",
  subject: "일정 확인 부탁드립니다",
  body: "다음 주 화요일 오후 3시 미팅 가능하신가요?",
};

function systemPromptOfLastCall(): string {
  const [request] = createCompletion.mock.calls.at(-1) ?? [];
  const system = request?.messages?.find((message: { role: string }) => message.role === "system");
  return system?.content ?? "";
}

describe("generateSmartReply language handling", () => {
  beforeEach(() => {
    createCompletion.mockReset();
    createCompletion.mockResolvedValue({
      choices: [{ message: { content: "네, 화요일 오후 3시 좋습니다." } }],
    });
  });

  it("instructs the model to reply in the incoming email's language", async () => {
    await generateSmartReply("Confirm the meeting", EMAIL, "user-1");

    expect(systemPromptOfLastCall()).toMatch(/same language as the incoming email/i);
  });

  it("does not hardcode English as the reply language", async () => {
    await generateSmartReply("Confirm the meeting", EMAIL, "user-1");

    expect(systemPromptOfLastCall()).not.toMatch(/write in english/i);
  });

  it("still lets an explicit template language win over the sender's language", async () => {
    await generateSmartReply("Always answer in English.", EMAIL, "user-1");

    expect(systemPromptOfLastCall()).toMatch(/template/i);
  });
});
