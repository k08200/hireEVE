import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

// Typed accessor for Prisma models not yet in generated types
// (AgentLog, PendingAction, TokenUsage, Memory, ConversationSummary, etc.)
// This is the SINGLE file where `any` is permitted (via biome.json override).
// All other files import `db` instead of casting `prisma as any`.
// biome-ignore lint/suspicious/noExplicitAny: Prisma delegate methods require dynamic typing
type DynamicModel = Record<string, (...args: any[]) => Promise<any>>;
export const db = prisma as unknown as Record<string, DynamicModel>;
