import Link from "next/link";
import HeroTyping from "../components/hero-typing";
import LandingRedirect from "../components/landing-redirect";

const FEATURES = [
  {
    title: "Email & Classification",
    desc: "Read, send, and auto-classify emails by priority.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
        <polyline points="22,6 12,13 2,6" />
      </svg>
    ),
  },
  {
    title: "Calendar & Scheduling",
    desc: "Create events, check schedules, detect conflicts.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
  },
  {
    title: "Tasks & Reminders",
    desc: "Track to-dos with priorities and due dates.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="9 11 12 14 22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    ),
  },
  {
    title: "Notes & Documents",
    desc: "Quick memos, reports, and auto-generated proposals.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    ),
  },
  {
    title: "Contacts & CRM",
    desc: "Manage your network with tags and search.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
  {
    title: "Integrations",
    desc: "Gmail, Slack, Notion, Calendar — all connected.",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </svg>
    ),
  },
];

export default function LandingPage() {
  return (
    <main>
      <LandingRedirect />

      {/* ── Hero ─────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        {/* Subtle gradient bg */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-600/[0.07] via-transparent to-transparent" />

        <div className="relative max-w-4xl mx-auto px-6 pt-24 pb-20 text-center">
          <div className="inline-flex items-center gap-2 bg-gray-800/60 border border-gray-700/40 rounded-full px-3.5 py-1.5 text-xs text-gray-300 mb-6">
            <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
            36+ tools, one AI employee
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-5 leading-[1.1]">
            Your First
            <br />
            <span className="text-blue-400">AI Employee</span>
          </h1>

          <p className="text-base sm:text-lg text-gray-400 max-w-xl mx-auto mb-3 leading-relaxed">
            EVE handles <HeroTyping />
          </p>
          <p className="text-sm text-gray-500 max-w-md mx-auto mb-8">
            Built for solo founders who wear too many hats.
            <br className="hidden sm:block" />
            1인 창업자를 위한 AI 직원. 혼자 다 하지 마세요.
          </p>

          <div className="flex gap-3 justify-center">
            <Link
              href="/login"
              className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-lg font-medium transition-colors text-sm shadow-lg shadow-blue-600/20"
            >
              Get Started Free
            </Link>
            <Link
              href="/billing"
              className="bg-gray-800/80 hover:bg-gray-700 text-gray-200 px-6 py-2.5 rounded-lg font-medium transition-colors text-sm border border-gray-700/60"
            >
              View Plans
            </Link>
          </div>

          {/* Stats */}
          <div className="flex justify-center gap-10 mt-14">
            {[
              { value: "36+", label: "Tools" },
              { value: "13", label: "Categories" },
              { value: "5", label: "Integrations" },
            ].map((s) => (
              <div key={s.label}>
                <p className="text-xl font-bold text-gray-100">{s.value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ─────────────────────────────────── */}
      <section className="max-w-4xl mx-auto px-6 pb-20">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="group bg-gray-900/60 border border-gray-800/60 rounded-xl p-5 hover:border-gray-700/80 hover:bg-gray-900/80 transition-colors"
            >
              <div className="w-9 h-9 rounded-lg bg-gray-800/80 border border-gray-700/40 flex items-center justify-center text-gray-400 group-hover:text-blue-400 transition-colors mb-3">
                {f.icon}
              </div>
              <h3 className="font-semibold text-sm text-gray-100 mb-1">{f.title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ─────────────────────────────── */}
      <section className="max-w-4xl mx-auto px-6 pb-20">
        <h2 className="text-xl font-bold text-center mb-10">How it works</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
          {[
            { step: "1", title: "Connect accounts", desc: "Link Gmail, Calendar, Slack with one click" },
            { step: "2", title: "Tell EVE what to do", desc: "Chat naturally in Korean or English" },
            { step: "3", title: "EVE handles it", desc: "Emails, calendar, tasks, research — done" },
          ].map((item) => (
            <div key={item.step} className="text-center">
              <div className="w-9 h-9 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-lg flex items-center justify-center mx-auto mb-3 text-sm font-bold">
                {item.step}
              </div>
              <h4 className="font-medium text-sm text-gray-200 mb-1">{item.title}</h4>
              <p className="text-sm text-gray-500">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Use cases ────────────────────────────────── */}
      <section className="max-w-3xl mx-auto px-6 pb-20">
        <h2 className="text-xl font-bold text-center mb-8">
          What founders ask EVE
        </h2>
        <div className="space-y-3">
          {[
            { q: "오늘 브리핑 해줘", a: "12 emails, 3 events, 2 overdue tasks. Here's your morning summary..." },
            { q: "Send a follow-up to investor@vc.com", a: "Done. Sent a professional follow-up referencing your last meeting." },
            { q: "내일 오후 3시에 미팅 잡아줘", a: "No conflicts. Created: Meeting tomorrow at 3:00 PM KST." },
            { q: "Write a product launch proposal", a: "Generated a 2-page proposal with summary, timeline, and budget." },
          ].map((item) => (
            <div
              key={item.q}
              className="bg-gray-900/60 border border-gray-800/60 rounded-xl p-4 space-y-2.5"
            >
              <div className="flex items-start gap-2.5">
                <span className="text-[10px] bg-blue-600/80 text-white px-1.5 py-0.5 rounded font-medium shrink-0 mt-0.5">
                  You
                </span>
                <p className="text-sm text-gray-200">{item.q}</p>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="text-[10px] bg-gray-700/80 text-blue-400 px-1.5 py-0.5 rounded font-medium shrink-0 mt-0.5">
                  EVE
                </span>
                <p className="text-sm text-gray-500">{item.a}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────── */}
      <section className="border-t border-gray-800/60 py-16">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-xl font-bold mb-2">
            Stop juggling. Start delegating.
          </h2>
          <p className="text-sm text-gray-500 mb-6">
            Free to start. No credit card required. / 무료로 시작하세요.
          </p>
          <Link
            href="/login"
            className="bg-blue-600 hover:bg-blue-500 text-white px-7 py-2.5 rounded-lg font-medium transition-colors inline-block text-sm shadow-lg shadow-blue-600/20"
          >
            Try EVE Now
          </Link>
        </div>
      </section>
    </main>
  );
}
