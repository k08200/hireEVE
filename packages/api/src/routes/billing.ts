import type { FastifyInstance } from "fastify";
import { getUserId, requireAuth } from "../auth.js";
import { prisma } from "../db.js";
import { PLANS, stripe } from "../stripe.js";

export async function billingRoutes(app: FastifyInstance) {
  // All billing routes require authentication
  app.addHook("preHandler", requireAuth);
  // POST /api/billing/checkout — Create Stripe checkout session
  app.post("/checkout", async (request, reply) => {
    const userId = getUserId(request);
    const { plan } = request.body as {
      plan: "PRO" | "TEAM";
    };

    const planConfig = PLANS[plan];
    if (!planConfig?.priceId) {
      return reply.code(400).send({ error: "Invalid plan" });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return reply.code(404).send({ error: "User not found" });

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: user.stripeId ? undefined : user.email,
      customer: user.stripeId || undefined,
      line_items: [{ price: planConfig.priceId, quantity: 1 }],
      success_url: `${process.env.WEB_URL || "http://localhost:8001"}/billing?success=true`,
      cancel_url: `${process.env.WEB_URL || "http://localhost:8001"}/billing?canceled=true`,
      metadata: { userId, plan },
    });

    return { url: session.url };
  });

  // POST /api/billing/portal — Create Stripe customer portal session
  app.post("/portal", async (request, reply) => {
    const userId = getUserId(request);

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user?.stripeId) {
      return reply.code(400).send({ error: "No billing account" });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeId,
      return_url: `${process.env.WEB_URL || "http://localhost:8001"}/billing`,
    });

    return { url: session.url };
  });

  // GET /api/billing/status — Get user's billing status
  app.get("/status", async (request, reply) => {
    const userId = getUserId(request);

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return reply.code(404).send({ error: "User not found" });

    const planConfig = PLANS[user.plan as keyof typeof PLANS];

    // Count user messages this billing period (current calendar month)
    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const messageCount = await prisma.message.count({
      where: {
        conversation: { userId },
        role: "USER",
        createdAt: { gte: periodStart },
      },
    });

    return {
      plan: user.plan,
      planName: planConfig.name,
      messageLimit: planConfig.messageLimit,
      messageCount,
      stripeId: user.stripeId,
    };
  });
}
