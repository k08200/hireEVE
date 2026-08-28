/**
 * /api/keys — CRUD for MCP machine credentials (mail/mcp docs: the key
 * authenticates ONLY the MCP endpoint). Session-authenticated like every
 * settings surface; the raw key appears exactly once, in the creation
 * response. Revocation is a userId-scoped timestamp — a foreign id is a
 * no-op, and the row stays listable so the user can see what existed.
 */

import type { FastifyInstance } from "fastify";
import { getUserId, requireAuth } from "../auth.js";
import { prisma } from "../db.js";
import { MAX_ACTIVE_KEYS, mintApiKey } from "../mcp/api-keys.js";

const MAX_NAME_CHARS = 60;

export async function apiKeyRoutes(app: FastifyInstance) {
  app.get("/", { preHandler: requireAuth }, async (request) => {
    const uid = getUserId(request);
    const rows = await prisma.apiKey.findMany({
      where: { userId: uid },
      select: {
        id: true,
        name: true,
        prefix: true,
        createdAt: true,
        lastUsedAt: true,
        revokedAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
    return {
      keys: rows.map((row) => ({
        id: row.id,
        name: row.name,
        prefix: row.prefix,
        createdAt: row.createdAt.toISOString(),
        lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
        revoked: row.revokedAt !== null,
      })),
    };
  });

  app.post(
    "/",
    {
      preHandler: requireAuth,
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      const uid = getUserId(request);
      const { name } = (request.body as { name?: string }) || {};
      const trimmed = typeof name === "string" ? name.trim() : "";
      if (!trimmed || trimmed.length > MAX_NAME_CHARS) {
        return reply
          .code(400)
          .send({ error: `Key name is required (at most ${MAX_NAME_CHARS} characters).` });
      }
      const active = await prisma.apiKey.count({ where: { userId: uid, revokedAt: null } });
      if (active >= MAX_ACTIVE_KEYS) {
        return reply
          .code(400)
          .send({ error: `At most ${MAX_ACTIVE_KEYS} active keys — revoke one first.` });
      }
      const minted = mintApiKey();
      const created = await prisma.apiKey.create({
        data: { userId: uid, name: trimmed, keyHash: minted.tokenHash, prefix: minted.prefix },
      });
      // The ONLY response that ever carries the raw key.
      return { id: created.id, name: trimmed, prefix: minted.prefix, key: minted.token };
    },
  );

  app.delete("/:id", { preHandler: requireAuth }, async (request) => {
    const { id } = request.params as { id: string };
    const uid = getUserId(request);
    await prisma.apiKey.updateMany({
      where: { id, userId: uid, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { revoked: true };
  });
}
