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
}
