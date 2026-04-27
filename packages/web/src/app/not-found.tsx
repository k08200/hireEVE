import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex flex-col items-center justify-center min-h-[60vh] px-6">
      <p className="text-6xl font-bold text-gray-700 mb-4">404</p>
      <h1 className="text-xl font-semibold mb-2">Page Not Found</h1>
      <p className="text-gray-400 text-sm mb-8 text-center max-w-md">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <div className="flex gap-3">
        <Link
          href="/inbox"
          className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition"
        >
          Go to Inbox
        </Link>
        <Link
          href="/briefing"
          className="bg-gray-800 hover:bg-gray-700 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition border border-gray-700"
        >
          Briefing
        </Link>
      </div>
    </main>
  );
}
