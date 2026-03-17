import type { FastifyInstance } from "fastify";
import type Stripe from "stripe";
import { prisma } from "../db.js";
import { stripe } from "../stripe.js";

export async function webhookRoutes(app: FastifyInstance) {
  // POST /api/webhook/stripe — Stripe webhook handler
  app.post("/stripe", {
    config: { rawBody: true },
    handler: async (request, reply) => {
      const sig = request.headers["stripe-signature"] as string;
      const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

      if (!endpointSecret) {
        return reply.code(500).send({ error: "Webhook secret not configured" });
      }

      let event: Stripe.Event;
      try {
        event = stripe.webhooks.constructEvent(
          (request as unknown as { rawBody: string }).rawBody,
          sig,
          endpointSecret,
        );
      } catch {
        return reply.code(400).send({ error: "Invalid signature" });
      }

      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object as Stripe.Checkout.Session;
          const userId = session.metadata?.userId;
          const plan = session.metadata?.plan as "PRO" | "TEAM" | undefined;

          if (userId && plan) {
            await prisma.user.update({
              where: { id: userId },
              data: {
                plan,
                stripeId: session.customer as string,
              },
            });
          }
          break;
        }

        case "customer.subscription.deleted": {
          const subscription = event.data.object as Stripe.Subscription;
          const customerId = subscription.customer as string;

          await prisma.user.updateMany({
            where: { stripeId: customerId },
            data: { plan: "FREE" },
          });
          break;
        }
      }

      return { received: true };
    },
  });
}
