import Link from "next/link";
import LandingRedirect from "../components/landing-redirect";

const FEATURES = [
  {
    icon: "mail",
    title: "Email",
    desc: "Reads incoming emails first and alerts you about urgent ones",
  },
  {
    icon: "calendar",
    title: "Calendar",
    desc: "Prepares meeting briefs in advance and catches scheduling conflicts",
  },
  {
    icon: "check",
    title: "Tasks",
    desc: "Flags overdue tasks and helps you prioritize what matters",
  },
  {
    icon: "bell",
    title: "Reminders",
    desc: "Automatically reminds you about follow-ups you might forget",
  },
  {
    icon: "user",
    title: "Contacts",
    desc: "Manage clients, partners, and investor contacts in one place",
  },
  {
    icon: "file",
    title: "Notes & Briefing",
    desc: "Prepares your daily briefing every morning automatically",
  },
];

function FeatureIcon({ type }: { type: string }) {
  const props = {
    width: 24,
    height: 24,
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
        <svg aria-hidden="true" {...props}>
          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
          <polyline points="22,6 12,13 2,6" />
        </svg>
      );
    case "calendar":
      return (
        <svg aria-hidden="true" {...props}>
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      );
    case "check":
      return (
        <svg aria-hidden="true" {...props}>
          <polyline points="9 11 12 14 22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
      );
    case "bell":
      return (
        <svg aria-hidden="true" {...props}>
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      );
    case "user":
      return (
        <svg aria-hidden="true" {...props}>
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      );
    case "file":
      return (
        <svg aria-hidden="true" {...props}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      );
    default:
      return null;
  }
}

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-[#0a0a0f] text-white">
      <LandingRedirect />
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 max-w-6xl mx-auto">
        <span className="text-lg font-bold text-blue-400">EVE</span>
        <div className="flex items-center gap-4">
          <Link href="/login" className="text-sm text-gray-400 hover:text-white transition">
            Sign in
          </Link>
          <Link
            href="/login"
            className="text-sm bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg transition"
          >
            Get Started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-6 pt-20 pb-16 text-center">
        <div className="inline-block bg-blue-600/10 border border-blue-500/20 rounded-full px-4 py-1.5 text-xs text-blue-400 mb-6">
          Your First AI Employee
        </div>
        <h1 className="text-4xl md:text-5xl font-bold leading-tight mb-6">
          Work like a team, even alone
        </h1>
        <p className="text-lg text-gray-400 max-w-2xl mx-auto leading-relaxed mb-10">
          EVE is an AI employee that acts without being asked. She checks your emails, preps for
          meetings, and follows up on things you might forget. While you focus on what matters — EVE
          never stops working.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Link
            href="/login"
            className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-3 rounded-lg text-sm font-medium transition-colors shadow-lg shadow-blue-600/25"
          >
            Get Started Free
          </Link>
          <Link
            href="/login"
            className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-8 py-3 rounded-lg text-sm font-medium transition-colors border border-gray-700"
          >
            Try Demo
          </Link>
        </div>
      </section>

      {/* Social proof */}
      <section className="max-w-4xl mx-auto px-6 pb-16">
        <div className="flex items-center justify-center gap-8 text-sm text-gray-500">
          <div className="text-center">
            <p className="text-2xl font-bold text-white">60+</p>
            <p>AI Tools</p>
          </div>
          <div className="w-px h-10 bg-gray-800" />
          <div className="text-center">
            <p className="text-2xl font-bold text-white">24/7</p>
            <p>Always On</p>
          </div>
          <div className="w-px h-10 bg-gray-800" />
          <div className="text-center">
            <p className="text-2xl font-bold text-white">Real-time</p>
            <p>Notifications</p>
          </div>
        </div>
      </section>

      {/* Key message */}
      <section className="max-w-4xl mx-auto px-6 py-16">
        <div className="bg-gradient-to-br from-gray-900 to-gray-900/50 border border-gray-800 rounded-2xl p-8 md:p-12">
          <h2 className="text-2xl md:text-3xl font-bold mb-4">Acts before you ask</h2>
          <p className="text-gray-400 leading-relaxed max-w-2xl">
            Say &ldquo;show my emails&rdquo; and she finds them instantly. Say &ldquo;schedule a
            meeting tomorrow&rdquo; and it&apos;s on your calendar. But EVE&apos;s real value goes
            beyond that — she alerts you about urgent emails, catches overdue tasks, and prepares
            your daily briefing every morning. Without being told.
          </p>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-4xl mx-auto px-6 py-16">
        <h2 className="text-2xl font-bold text-center mb-3">All your work in one conversation</h2>
        <p className="text-gray-500 text-center mb-12">
          EVE connects all your scattered tools into one place
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="bg-gray-900/50 border border-gray-800/50 rounded-xl p-5 hover:border-gray-700 transition"
            >
              <div className="w-10 h-10 rounded-lg bg-blue-600/10 text-blue-400 flex items-center justify-center mb-3">
                <FeatureIcon type={f.icon} />
              </div>
              <h3 className="text-sm font-semibold mb-1">{f.title}</h3>
              <p className="text-xs text-gray-500 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-4xl mx-auto px-6 py-16">
        <h2 className="text-2xl font-bold text-center mb-12">Get started in 3 steps</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              step: "1",
              title: "Sign up",
              desc: "Start in seconds with your Google account",
            },
            {
              step: "2",
              title: "Connect",
              desc: "Link Gmail and Calendar — EVE handles the rest",
            },
            {
              step: "3",
              title: "Chat",
              desc: "Just tell her what you need. EVE executes",
            },
          ].map((s) => (
            <div key={s.step} className="text-center">
              <div className="w-10 h-10 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center mx-auto mb-3">
                {s.step}
              </div>
              <h3 className="font-semibold mb-1">{s.title}</h3>
              <p className="text-sm text-gray-500">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing teaser */}
      <section className="max-w-4xl mx-auto px-6 py-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
            <h3 className="font-semibold mb-1">Free</h3>
            <p className="text-3xl font-bold mb-3">
              $0<span className="text-sm text-gray-500 font-normal">/mo</span>
            </p>
            <p className="text-xs text-gray-500">50 messages / month</p>
          </div>
          <div className="bg-blue-600/5 border border-blue-500/30 rounded-xl p-6 relative">
            <span className="absolute -top-2.5 left-4 bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded">
              POPULAR
            </span>
            <h3 className="font-semibold mb-1">Pro</h3>
            <p className="text-3xl font-bold mb-3">
              $29<span className="text-sm text-gray-500 font-normal">/mo</span>
            </p>
            <p className="text-xs text-gray-500">2,000 messages / month</p>
          </div>
          <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
            <h3 className="font-semibold mb-1">Team</h3>
            <p className="text-3xl font-bold mb-3">
              $99<span className="text-sm text-gray-500 font-normal">/mo</span>
            </p>
            <p className="text-xs text-gray-500">10,000 messages / month</p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-4xl mx-auto px-6 py-20 text-center">
        <h2 className="text-3xl font-bold mb-4">
          Skip the hiring process.
          <br />
          Just add EVE.
        </h2>
        <p className="text-gray-500 mb-8">
          The first team member for solo founders, freelancers, and small teams
        </p>
        <Link
          href="/login"
          className="inline-block bg-blue-600 hover:bg-blue-500 text-white px-10 py-3.5 rounded-lg text-sm font-medium transition-colors shadow-lg shadow-blue-600/25"
        >
          Get Started
        </Link>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-800/50 py-8 px-6">
        <div className="max-w-4xl mx-auto flex items-center justify-between text-xs text-gray-600">
          <span>EVE - Your First AI Employee</span>
          <div className="flex items-center gap-4">
            <Link href="/login" className="hover:text-gray-400 transition">
              Sign in
            </Link>
            <Link href="/billing" className="hover:text-gray-400 transition">
              Pricing
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
