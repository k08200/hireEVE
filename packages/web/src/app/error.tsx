"use client";

function ErrorPage({
  error,
  reset,
}: {
  error: globalThis.Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex flex-col items-center justify-center min-h-[60vh] px-6">
      <p className="text-5xl font-bold text-red-500/50 mb-4">Oops</p>
      <h1 className="text-xl font-semibold mb-2">Something went wrong</h1>
      <p className="text-gray-400 text-sm mb-2 text-center max-w-md">
        An unexpected error occurred. Please try again.
      </p>
      {error.message && (
        <p className="text-xs text-gray-600 mb-6 font-mono bg-gray-900 border border-gray-800 rounded px-3 py-1.5 max-w-md truncate">
          {error.message}
        </p>
      )}
      <button
        type="button"
        onClick={reset}
        className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition"
      >
        Try again
      </button>
    </main>
  );
}

export default ErrorPage;
