import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn("STRIPE_SECRET_KEY not set — billing endpoints will fail");
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2025-08-27.basil",
});

export const PLANS = {
  FREE: { name: "Free", priceId: null, testLimit: 10 },
  PRO: { name: "Pro", priceId: process.env.STRIPE_PRO_PRICE_ID || "", testLimit: 500 },
  TEAM: { name: "Team", priceId: process.env.STRIPE_TEAM_PRICE_ID || "", testLimit: 5000 },
  ENTERPRISE: { name: "Enterprise", priceId: null, testLimit: Infinity },
} as const;
