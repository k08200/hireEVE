import Fastify from "fastify";
import cors from "@fastify/cors";
import { prisma } from "./db.js";
import { testRoutes } from "./routes/tests.js";
import { agentRoutes } from "./routes/agents.js";
import { billingRoutes } from "./routes/billing.js";
import { webhookRoutes } from "./routes/webhook.js";

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });

// Raw body support for Stripe webhook signature verification
app.addContentTypeParser(
  "application/json",
  { parseAs: "string" },
  (req, body, done) => {
    try {
      (req as unknown as { rawBody: string }).rawBody = body as string;
      done(null, JSON.parse(body as string));
    } catch (err) {
      done(err as Error, undefined);
    }
  },
);

await app.register(testRoutes, { prefix: "/api/tests" });
await app.register(agentRoutes, { prefix: "/api/agents" });
await app.register(billingRoutes, { prefix: "/api/billing" });
await app.register(webhookRoutes, { prefix: "/api/webhook" });

app.get("/api/health", async () => ({ status: "ok", timestamp: new Date().toISOString() }));

app.addHook("onClose", async () => {
  await prisma.$disconnect();
});

const port = Number(process.env.PORT) || 3001;
await app.listen({ port, host: "0.0.0.0" });
console.log(`ProbeAI API running on http://localhost:${port}`);
