"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { CardSkeleton } from "../../components/skeleton";
import { useToast } from "../../components/toast";
import { apiFetch } from "../../lib/api";

interface BillingStatus {
  plan: string;
  planName: string;
  messageLimit: number;
  messageCount: number;
  stripeId: string | null;
}

const PLANS = [
  {
    key: "FREE",
    name: "Free",
    price: "$0",
    period: "",
    limit: "50 messages/month",
    features: ["Gmail & Calendar integration", "Task management", "Basic AI assistant"],
  },
  {
    key: "PRO",
    name: "Pro",
    price: "$29",
    period: "/mo",
    limit: "2,000 messages/month",
    features: [
      "Everything in Free",
      "Unlimited tool usage",
      "Priority response",
      "Web search",
      "File attachments",
    ],
  },
  {
    key: "TEAM",
    name: "Team",
    price: "$99",
    period: "/mo",
    limit: "10,000 messages/month",
    features: [
      "Everything in Pro",
      "Team workspace",
      "Shared conversations",
      "Admin dashboard",
      "Dedicated support",
    ],
  },
  {
    key: "ENTERPRISE",
    name: "Enterprise",
    price: "Custom",
    period: "",
    limit: "Unlimited",
    features: ["Everything in Team", "On-premise option", "SLA guarantee", "Custom integrations"],
  },
];

export default function BillingPage() {
  return (
    <Suspense>
      <BillingContent />
    </Suspense>
  );
}

function BillingContent() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const success = searchParams.get("success");
  const canceled = searchParams.get("canceled");

  useEffect(() => {
    apiFetch<BillingStatus>("/api/billing/status?userId=demo-user")
      .then(setStatus)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleUpgrade(plan: "PRO" | "TEAM") {
    try {
      const { url } = await apiFetch<{ url: string }>("/api/billing/checkout", {
        method: "POST",
        body: JSON.stringify({ userId: "demo-user", plan }),
      });
      if (url) window.location.href = url;
    } catch {
      toast("Failed to create checkout session", "error");
    }
  }

  async function handleManage() {
    try {
      const { url } = await apiFetch<{ url: string }>("/api/billing/portal", {
        method: "POST",
        body: JSON.stringify({ userId: "demo-user" }),
      });
      if (url) window.location.href = url;
    } catch {
      toast("Failed to open billing portal", "error");
    }
  }

  return (
    <main className="max-w-5xl mx-auto px-6 py-12">
      <h1 className="text-3xl font-bold mb-2">Billing</h1>
      <p className="text-gray-400 mb-8">Choose a plan that fits your workflow</p>

      {success && (
        <div className="bg-green-900/30 border border-green-700 rounded-lg p-4 mb-6">
          Subscription activated successfully!
        </div>
      )}
      {canceled && (
        <div className="bg-yellow-900/30 border border-yellow-700 rounded-lg p-4 mb-6">
          Checkout was canceled.
        </div>
      )}

      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      )}

      {!loading && status && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-10">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Current Plan</p>
              <p className="text-xl font-bold">{status.planName}</p>
              <p className="text-sm text-gray-400 mt-1">
                {status.messageCount} /{" "}
                {status.messageLimit === Infinity ? "∞" : status.messageLimit} messages used
              </p>
              {status.messageLimit !== Infinity && status.messageLimit > 0 && (
                <div className="w-48 bg-gray-800 rounded-full h-2 mt-2">
                  <div
                    className={`h-2 rounded-full transition-all duration-500 ${
                      status.messageCount / status.messageLimit > 0.9
                        ? "bg-red-500"
                        : status.messageCount / status.messageLimit > 0.7
                          ? "bg-yellow-500"
                          : "bg-blue-500"
                    }`}
                    style={{
                      width: `${Math.min((status.messageCount / status.messageLimit) * 100, 100)}%`,
                    }}
                  />
                </div>
              )}
            </div>
            {status.stripeId && (
              <button
                onClick={handleManage}
                className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm transition"
              >
                Manage Subscription
              </button>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {PLANS.map((plan) => {
          const isCurrent = status?.plan === plan.key;
          return (
            <div
              key={plan.key}
              className={`bg-gray-900 border rounded-xl p-6 flex flex-col ${
                isCurrent
                  ? "border-blue-500"
                  : plan.key === "PRO"
                    ? "border-blue-500/50 ring-1 ring-blue-500/20"
                    : "border-gray-800"
              }`}
            >
              {plan.key === "PRO" && (
                <span className="text-[10px] uppercase bg-blue-600 text-white px-2 py-0.5 rounded-full font-medium mb-2 self-start">
                  Most Popular
                </span>
              )}
              <p className="text-lg font-bold mb-1">{plan.name}</p>
              <p className="text-2xl font-bold mb-1">
                {plan.price}
                <span className="text-sm text-gray-500 font-normal">{plan.period}</span>
              </p>
              <p className="text-sm text-gray-400 mb-4">{plan.limit}</p>

              <ul className="space-y-2 mb-6 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="text-sm text-gray-300 flex items-start gap-2">
                    <span className="text-green-400 mt-0.5">✓</span>
                    {f}
                  </li>
                ))}
              </ul>

              {isCurrent ? (
                <div className="text-center text-sm text-blue-400 font-medium py-2">
                  Current Plan
                </div>
              ) : plan.key === "FREE" ? (
                <div />
              ) : plan.key === "ENTERPRISE" ? (
                <a
                  href="mailto:sales@hireeve.com"
                  className="block text-center bg-gray-800 hover:bg-gray-700 text-white py-2.5 rounded-lg text-sm font-medium transition"
                >
                  Contact Sales
                </a>
              ) : (
                <button
                  onClick={() => handleUpgrade(plan.key as "PRO" | "TEAM")}
                  className="bg-blue-600 hover:bg-blue-500 text-white py-2.5 rounded-lg text-sm font-medium transition"
                >
                  Upgrade to {plan.name}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </main>
  );
}
