import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-gray-800 bg-gray-950 mt-auto">
      <div className="max-w-6xl mx-auto px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4 text-xs text-gray-600">
          <span>
            <span className="text-blue-400 font-medium">EVE</span> v0.2.0
          </span>
          <span>Built for solo founders / 1인 창업자를 위해</span>
        </div>
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <Link href="/billing" className="hover:text-gray-300 transition">
            Pricing
          </Link>
          <Link href="/settings" className="hover:text-gray-300 transition">
            Settings
          </Link>
          <a href="mailto:support@hireeve.com" className="hover:text-gray-300 transition">
            Contact
          </a>
        </div>
      </div>
    </footer>
  );
}
