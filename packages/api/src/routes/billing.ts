import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { PLANS, stripe } from "../stripe.js";

export async function billingRoutes(app: FastifyInstance) {
  // POST /api/billing/checkout — Create Stripe checkout session
  app.post("/checkout", async (request, reply) => {
    const { userId, plan } = request.body as {
      userId: string;
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
      success_url: `${process.env.FRONTEND_URL || "http://localhost:3000"}/billing?success=true`,
      cancel_url: `${process.env.FRONTEND_URL || "http://localhost:3000"}/billing?canceled=true`,
      metadata: { userId, plan },
    });

    return { url: session.url };
  });

  // POST /api/billing/portal — Create Stripe customer portal session
  app.post("/portal", async (request, reply) => {
    const { userId } = request.body as { userId: string };

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user?.stripeId) {
      return reply.code(400).send({ error: "No billing account" });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeId,
      return_url: `${process.env.FRONTEND_URL || "http://localhost:3000"}/billing`,
    });

    return { url: session.url };
  });

  // GET /api/billing/status — Get user's billing status
  app.get("/status", async (request, reply) => {
    const { userId } = request.query as { userId: string };
    if (!userId) return reply.code(400).send({ error: "userId required" });

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return reply.code(404).send({ error: "User not found" });

    const testCount = await prisma.testRun.count({ where: { userId } });
    const planConfig = PLANS[user.plan as keyof typeof PLANS];

    return {
      plan: user.plan,
      planName: planConfig.name,
      testLimit: planConfig.testLimit,
      testCount,
      stripeId: user.stripeId,
    };
  });
}
