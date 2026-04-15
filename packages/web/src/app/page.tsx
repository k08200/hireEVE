import Link from "next/link";
import LandingRedirect from "../components/landing-redirect";

const CAPABILITIES = [
  {
    icon: "mail",
    title: "Email Intelligence",
    desc: "Auto-classifies by priority, drafts replies, alerts on urgent messages before you even open your inbox.",
    highlight: "Reads 30+ emails in seconds",
  },
  {
    icon: "calendar",
    title: "Calendar & Meetings",
    desc: "Detects scheduling conflicts, preps meeting briefs, and syncs with Google Calendar in real-time.",
    highlight: "Never miss a meeting",
  },
  {
    icon: "brain",
    title: "Autonomous Actions",
    desc: "EVE doesn't wait for commands. She proactively creates reminders, flags overdue tasks, and sends daily briefings.",
    highlight: "Acts before you ask",
  },
  {
    icon: "shield",
    title: "Learns Your Patterns",
    desc: "Remembers your preferences, learns from feedback, and gets smarter with every interaction.",
    highlight: "Gets better over time",
  },
];

const USE_CASES = [
  {
    quote: "Show me urgent emails from this week",
    result: "Found 3 urgent emails. Investor follow-up needs response by tomorrow.",
  },
  {
    quote: "Schedule a meeting with Alice tomorrow at 2pm",
    result: "Created: Meeting with Alice, Tomorrow 2:00 PM. No conflicts detected.",
  },
  {
    quote: "What's on my plate today?",
    result: "3 tasks due today, 2 meetings, 1 urgent email waiting. Here's your priority order...",
  },
];

function Icon({ type }: { type: string }) {
  const p = {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (type) {
    case "mail":
      return (
        <svg aria-hidden="true" {...p}>
          <rect x="2" y="4" width="20" height="16" rx="2" />
          <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
        </svg>
      );
    case "calendar":
      return (
        <svg aria-hidden="true" {...p}>
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      );
    case "brain":
      return (
        <svg aria-hidden="true" {...p}>
          <path d="M12 2a4 4 0 0 1 4 4 4 4 0 0 1-1.5 3.1A5 5 0 0 1 17 13v1a2 2 0 0 1-2 2h-1v4l-2 2-2-2v-4H9a2 2 0 0 1-2-2v-1a5 5 0 0 1 2.5-3.9A4 4 0 0 1 8 6a4 4 0 0 1 4-4z" />
        </svg>
      );
    case "shield":
      return (
        <svg aria-hidden="true" {...p}>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      );
    case "zap":
      return (
        <svg aria-hidden="true" {...p}>
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
      );
    case "arrow":
      return (
        <svg aria-hidden="true" {...p}>
          <path d="M5 12h14M12 5l7 7-7 7" />
        </svg>
      );
    default:
      return null;
  }
}

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-[#06060a] text-white overflow-hidden">
      <LandingRedirect />

      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-5 max-w-6xl mx-auto">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-sm font-bold">
            E
          </div>
          <span className="text-lg font-bold tracking-tight">EVE</span>
        </Link>
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="text-sm text-gray-400 hover:text-white transition px-3 py-1.5"
          >
            Sign in
          </Link>
          <Link
            href="/login"
            className="text-sm bg-white text-black hover:bg-gray-200 px-5 py-2 rounded-lg font-medium transition"
          >
            Start Free
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative max-w-5xl mx-auto px-6 pt-24 pb-20 text-center">
        {/* Glow effect */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-blue-600/8 rounded-full blur-[120px] pointer-events-none" />

        <div className="relative">
          <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-1.5 text-xs text-gray-300 mb-8 backdrop-blur-sm">
            <Icon type="zap" />
            <span>Your First AI Employee</span>
          </div>

          <h1 className="text-5xl md:text-7xl font-bold leading-[1.1] tracking-tight mb-6">
            Stop managing.
            <br />
            <span className="bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">
              Start delegating.
            </span>
          </h1>

          <p className="text-lg md:text-xl text-gray-400 max-w-2xl mx-auto leading-relaxed mb-12">
            EVE reads your emails, manages your calendar, tracks your tasks, and learns how you
            work. All from a single conversation.
          </p>

          <div className="flex items-center justify-center gap-4 flex-wrap">
            <Link
              href="/login"
              className="group inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-8 py-3.5 rounded-xl text-sm font-medium transition-all shadow-lg shadow-blue-600/20 hover:shadow-blue-500/30"
            >
              Get Started Free
              <Icon type="arrow" />
            </Link>
            <Link
              href="#demo"
              className="inline-flex items-center gap-2 text-gray-400 hover:text-white px-6 py-3.5 text-sm transition"
            >
              See how it works
            </Link>
          </div>
        </div>
      </section>

      {/* Demo conversation */}
      <section id="demo" className="max-w-3xl mx-auto px-6 pb-24">
        <div className="bg-gray-900/60 border border-gray-800/60 rounded-2xl p-6 md:p-8 backdrop-blur-sm">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-3 h-3 rounded-full bg-red-500/60" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
            <div className="w-3 h-3 rounded-full bg-green-500/60" />
            <span className="text-xs text-gray-600 ml-2">EVE Chat</span>
          </div>
          <div className="space-y-5">
            {USE_CASES.map((uc) => (
              <div key={uc.quote} className="space-y-3">
                <div className="flex justify-end">
                  <div className="bg-blue-600/20 border border-blue-500/20 rounded-2xl rounded-tr-md px-4 py-2.5 max-w-sm">
                    <p className="text-sm text-blue-100">{uc.quote}</p>
                  </div>
                </div>
                <div className="flex justify-start">
                  <div className="bg-gray-800/60 border border-gray-700/40 rounded-2xl rounded-tl-md px-4 py-2.5 max-w-md">
                    <p className="text-sm text-gray-300">{uc.result}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Capabilities */}
      <section className="max-w-5xl mx-auto px-6 py-24">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Everything a teammate does.
            <br />
            <span className="text-gray-500">Without the overhead.</span>
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {CAPABILITIES.map((c) => (
            <div
              key={c.title}
              className="group bg-gray-900/40 border border-gray-800/50 rounded-2xl p-7 hover:border-gray-700/80 transition-all hover:bg-gray-900/60"
            >
              <div className="w-11 h-11 rounded-xl bg-blue-600/10 text-blue-400 flex items-center justify-center mb-4 group-hover:bg-blue-600/20 transition">
                <Icon type={c.icon} />
              </div>
              <h3 className="text-lg font-semibold mb-2">{c.title}</h3>
              <p className="text-sm text-gray-400 leading-relaxed mb-3">{c.desc}</p>
              <span className="inline-block text-xs text-blue-400/80 bg-blue-400/5 px-3 py-1 rounded-full">
                {c.highlight}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-5xl mx-auto px-6 py-24">
        <h2 className="text-3xl font-bold text-center mb-16">Up and running in 2 minutes</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {[
            {
              step: "01",
              title: "Create account",
              desc: "Sign up with email or Google. Free plan includes 50 messages/month.",
            },
            {
              step: "02",
              title: "Connect Google",
              desc: "One click to link Gmail & Calendar. EVE syncs everything automatically.",
            },
            {
              step: "03",
              title: "Just chat",
              desc: "Tell EVE what you need in plain language. She handles the rest.",
            },
          ].map((s) => (
            <div key={s.step} className="relative">
              <span className="text-5xl font-bold text-gray-800/40 mb-4 block">{s.step}</span>
              <h3 className="text-lg font-semibold mb-2">{s.title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section className="max-w-5xl mx-auto px-6 py-24">
        <h2 className="text-3xl font-bold text-center mb-4">Simple pricing</h2>
        <p className="text-gray-500 text-center mb-12">Start free. Upgrade when you need more.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-4xl mx-auto">
          <div className="bg-gray-900/40 border border-gray-800 rounded-2xl p-7">
            <h3 className="text-sm text-gray-400 font-medium mb-1">Free</h3>
            <p className="text-4xl font-bold mb-1">
              $0<span className="text-base text-gray-600 font-normal">/mo</span>
            </p>
            <p className="text-xs text-gray-600 mb-6">50 messages/month</p>
            <ul className="space-y-2 text-sm text-gray-400">
              <li className="flex items-center gap-2">
                <span className="text-green-500">&#10003;</span> All core features
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-500">&#10003;</span> Gmail & Calendar
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-500">&#10003;</span> 1 device
              </li>
            </ul>
            <Link
              href="/login"
              className="mt-6 block text-center bg-gray-800 hover:bg-gray-700 text-white py-2.5 rounded-xl text-sm font-medium transition"
            >
              Get Started
            </Link>
          </div>
          <div className="bg-blue-600/5 border-2 border-blue-500/30 rounded-2xl p-7 relative">
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider">
              Popular
            </span>
            <h3 className="text-sm text-blue-400 font-medium mb-1">Pro</h3>
            <p className="text-4xl font-bold mb-1">
              $29<span className="text-base text-gray-600 font-normal">/mo</span>
            </p>
            <p className="text-xs text-gray-600 mb-6">2,000 messages/month</p>
            <ul className="space-y-2 text-sm text-gray-400">
              <li className="flex items-center gap-2">
                <span className="text-green-500">&#10003;</span> Everything in Free
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-500">&#10003;</span> Autonomous agent
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-500">&#10003;</span> 5 devices
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-500">&#10003;</span> GPT-4o model
              </li>
            </ul>
            <Link
              href="/login"
              className="mt-6 block text-center bg-blue-600 hover:bg-blue-500 text-white py-2.5 rounded-xl text-sm font-medium transition shadow-lg shadow-blue-600/20"
            >
              Start Pro
            </Link>
          </div>
          <div className="bg-gray-900/40 border border-gray-800 rounded-2xl p-7">
            <h3 className="text-sm text-gray-400 font-medium mb-1">Team</h3>
            <p className="text-4xl font-bold mb-1">
              $99<span className="text-base text-gray-600 font-normal">/mo</span>
            </p>
            <p className="text-xs text-gray-600 mb-6">10,000 messages/month</p>
            <ul className="space-y-2 text-sm text-gray-400">
              <li className="flex items-center gap-2">
                <span className="text-green-500">&#10003;</span> Everything in Pro
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-500">&#10003;</span> Workspace sharing
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-500">&#10003;</span> Unlimited devices
              </li>
              <li className="flex items-center gap-2">
                <span className="text-green-500">&#10003;</span> Pattern learning
              </li>
            </ul>
            <Link
              href="/login"
              className="mt-6 block text-center bg-gray-800 hover:bg-gray-700 text-white py-2.5 rounded-xl text-sm font-medium transition"
            >
              Start Team
            </Link>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative max-w-5xl mx-auto px-6 py-32 text-center">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px] bg-blue-600/6 rounded-full blur-[100px] pointer-events-none" />
        <div className="relative">
          <h2 className="text-4xl md:text-5xl font-bold mb-6 leading-tight">
            Your next hire
            <br />
            costs $0/month.
          </h2>
          <p className="text-lg text-gray-500 mb-10 max-w-lg mx-auto">
            Join solo founders who replaced 3 tools with one AI teammate.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 bg-white text-black hover:bg-gray-200 px-10 py-4 rounded-xl text-sm font-semibold transition-all shadow-lg"
          >
            Get Started Free
            <Icon type="arrow" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-800/30 py-10 px-6">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <div className="w-6 h-6 rounded bg-blue-600 flex items-center justify-center text-[10px] font-bold text-white">
              E
            </div>
            <span>EVE &mdash; Your First AI Employee</span>
          </div>
          <div className="flex items-center gap-6 text-xs text-gray-600">
            <Link href="/login" className="hover:text-gray-300 transition">
              Sign in
            </Link>
            <Link href="/billing" className="hover:text-gray-300 transition">
              Pricing
            </Link>
            <Link href="/download" className="hover:text-gray-300 transition">
              Desktop
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
