import Link from "next/link";

export const metadata = {
  title: "Download EVE — Desktop App",
  description: "Download EVE desktop app for macOS. Your AI employee, always on your desktop.",
};

const PLATFORMS = [
  {
    name: "macOS (Apple Silicon)",
    arch: "aarch64",
    icon: "apple",
    fileName: "EVE_aarch64.dmg",
    url: "https://github.com/k08200/hireEVE/releases/latest/download/EVE_aarch64.dmg",
    recommended: true,
  },
  {
    name: "macOS (Intel)",
    arch: "x64",
    icon: "apple",
    fileName: "EVE_x64.dmg",
    url: "https://github.com/k08200/hireEVE/releases/latest/download/EVE_x64.dmg",
    recommended: false,
  },
];

function AppleIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

export default function DownloadPage() {
  return (
    <main className="min-h-screen bg-[#0a0a0f] text-white">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 max-w-6xl mx-auto">
        <Link href="/" className="text-lg font-bold text-blue-400">
          EVE
        </Link>
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
      <section className="max-w-4xl mx-auto px-6 pt-20 pb-10 text-center">
        <div className="inline-block bg-blue-600/10 border border-blue-500/20 rounded-full px-4 py-1.5 text-xs text-blue-400 mb-6">
          Desktop App
        </div>
        <h1 className="text-4xl md:text-5xl font-bold leading-tight mb-6">
          EVE on your desktop
        </h1>
        <p className="text-lg text-gray-400 max-w-2xl mx-auto leading-relaxed mb-4">
          A tiny companion that lives on your screen. Click to chat, get real-time notifications,
          and let EVE work alongside you — always one click away.
        </p>
      </section>

      {/* Download cards */}
      <section className="max-w-2xl mx-auto px-6 pb-16">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {PLATFORMS.map((p) => (
            <a
              key={p.arch}
              href={p.url}
              className={`relative flex flex-col items-center gap-4 p-8 rounded-2xl border transition-all hover:scale-[1.02] ${
                p.recommended
                  ? "bg-blue-600/5 border-blue-500/30 hover:border-blue-400/50"
                  : "bg-gray-900/50 border-gray-800 hover:border-gray-700"
              }`}
            >
              {p.recommended && (
                <span className="absolute -top-2.5 right-4 bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded">
                  RECOMMENDED
                </span>
              )}
              <div className="text-blue-400">
                <AppleIcon />
              </div>
              <div className="text-center">
                <h3 className="font-semibold text-lg mb-1">{p.name}</h3>
                <p className="text-xs text-gray-500 mb-4">{p.fileName}</p>
              </div>
              <div className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-colors">
                <DownloadIcon />
                Download
              </div>
            </a>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="max-w-3xl mx-auto px-6 py-16 border-t border-gray-800/50">
        <h2 className="text-xl font-bold text-center mb-8">Why the desktop app?</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              title: "Always visible",
              desc: "EVE floats on your desktop — click anytime to chat without switching tabs.",
            },
            {
              title: "Real-time alerts",
              desc: "Get native notifications for urgent emails, meetings, and task reminders.",
            },
            {
              title: "Lightweight",
              desc: "Under 20MB. Runs in the background with minimal CPU and memory usage.",
            },
          ].map((f) => (
            <div key={f.title} className="text-center">
              <h3 className="font-semibold mb-2">{f.title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Install instructions */}
      <section className="max-w-3xl mx-auto px-6 py-16 border-t border-gray-800/50">
        <h2 className="text-xl font-bold text-center mb-8">Installation</h2>
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6 max-w-lg mx-auto">
          <ol className="space-y-4 text-sm text-gray-300">
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">1</span>
              <span>Download the .dmg file for your Mac</span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">2</span>
              <span>Open the .dmg and drag EVE to Applications</span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">3</span>
              <span>
                If macOS blocks the app: <strong>System Settings → Privacy & Security → Open Anyway</strong>
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">4</span>
              <span>Sign in with Google and start chatting!</span>
            </li>
          </ol>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-4xl mx-auto px-6 py-16 text-center">
        <p className="text-gray-500 mb-4">
          Prefer the web? Use EVE directly in your browser — no download needed.
        </p>
        <Link
          href="/login"
          className="inline-block bg-gray-800 hover:bg-gray-700 text-gray-300 px-8 py-3 rounded-lg text-sm font-medium transition-colors border border-gray-700"
        >
          Open Web App
        </Link>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-800/50 py-8 px-6">
        <div className="max-w-4xl mx-auto flex items-center justify-between text-xs text-gray-600">
          <span>EVE - Your First AI Employee</span>
          <div className="flex items-center gap-4">
            <Link href="/" className="hover:text-gray-400 transition">
              Home
            </Link>
            <Link href="/login" className="hover:text-gray-400 transition">
              Sign in
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
