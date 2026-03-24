import Link from "next/link";

const FEATURES = [
  {
    title: "Email & Classification",
    desc: "Read, send, and auto-classify emails by priority. Never miss urgent messages.",
    icon: "\u2709\uFE0F",
  },
  {
    title: "Calendar & Conflicts",
    desc: "Create events, check schedules, and detect conflicts before double-booking.",
    icon: "\uD83D\uDCC5",
  },
  {
    title: "Tasks & Reminders",
    desc: "Track to-dos with priorities, due dates, and automatic overdue alerts.",
    icon: "\u2705",
  },
  {
    title: "Notes & Documents",
    desc: "Quick memos, searchable notes, and auto-generated reports and proposals.",
    icon: "\uD83D\uDCDD",
  },
  {
    title: "Contacts & CRM",
    desc: "Manage your network with tags, search, and company info. Mini CRM built-in.",
    icon: "\uD83D\uDC64",
  },
  {
    title: "Slack & Integrations",
    desc: "Send Slack messages, read channels, and get daily briefings — all from chat.",
    icon: "\uD83D\uDD17",
  },
  {
    title: "Web Search",
    desc: "EVE searches the web for you — market research, competitor info, anything.",
    icon: "\uD83C\uDF10",
  },
  {
    title: "Background Agent",
    desc: "Runs autonomously — checks overdue tasks, due reminders, and alerts you.",
    icon: "\uD83E\uDD16",
  },
];

export default function LandingPage() {
  return (
    <main className="min-h-[calc(100vh-3.5rem)]">
      {/* Hero */}
      <section className="max-w-4xl mx-auto px-6 pt-20 pb-16 text-center">
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
          Your First <span className="text-blue-400">AI Employee</span>
        </h1>
        <p className="text-lg text-gray-400 max-w-2xl mx-auto mb-8 leading-relaxed">
          EVE handles email, calendar, tasks, notes, contacts, Slack, web search, and more —
          autonomously. 30+ tools. One AI employee. Built for solo founders who wear too many hats.
        </p>
        <div className="flex gap-3 justify-center">
          <Link
            href="/chat"
            className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-xl font-medium transition text-sm"
          >
            Start Chatting
          </Link>
          <Link
            href="/billing"
            className="bg-gray-800 hover:bg-gray-700 text-white px-6 py-3 rounded-xl font-medium transition text-sm border border-gray-700"
          >
            View Plans
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-4xl mx-auto px-6 pb-20">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="bg-gray-900 border border-gray-800 rounded-xl p-6">
              <span className="text-2xl mb-3 block">{f.icon}</span>
              <h3 className="font-semibold mb-1">{f.title}</h3>
              <p className="text-sm text-gray-400">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-4xl mx-auto px-6 pb-20">
        <h2 className="text-2xl font-bold text-center mb-8">How it works</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="text-center">
            <div className="w-10 h-10 bg-blue-600/20 text-blue-400 rounded-full flex items-center justify-center mx-auto mb-3 font-bold">
              1
            </div>
            <h4 className="font-medium mb-1">Connect accounts / 계정 연동</h4>
            <p className="text-sm text-gray-400">Link Gmail, Calendar, Slack with one click</p>
          </div>
          <div className="text-center">
            <div className="w-10 h-10 bg-blue-600/20 text-blue-400 rounded-full flex items-center justify-center mx-auto mb-3 font-bold">
              2
            </div>
            <h4 className="font-medium mb-1">Tell EVE what to do / 시키면 됩니다</h4>
            <p className="text-sm text-gray-400">Chat naturally in Korean or English</p>
          </div>
          <div className="text-center">
            <div className="w-10 h-10 bg-blue-600/20 text-blue-400 rounded-full flex items-center justify-center mx-auto mb-3 font-bold">
              3
            </div>
            <h4 className="font-medium mb-1">EVE handles it / 알아서 처리</h4>
            <p className="text-sm text-gray-400">Emails, calendar, tasks, research — all done</p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-gray-800 py-16">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-2xl font-bold mb-3">
            Stop juggling. Start delegating. / 혼자 다 하지 마세요.
          </h2>
          <p className="text-gray-400 mb-6">
            Free to start. No credit card required. / 무료로 시작하세요.
          </p>
          <Link
            href="/chat"
            className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-3 rounded-xl font-medium transition inline-block text-sm"
          >
            Try EVE Now
          </Link>
        </div>
      </section>
    </main>
  );
}
