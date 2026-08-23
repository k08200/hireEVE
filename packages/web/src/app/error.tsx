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
      <p className="mb-4 rounded-full border border-state-danger-line bg-state-danger-bg px-3 py-1 text-xs font-semibold text-state-danger-ink">
        Screen paused
      </p>
      <h1 className="text-xl font-semibold mb-2">Something went wrong on this screen.</h1>
      <p className="text-ink-mid text-sm mb-2 text-center max-w-md">
        Reload the latest context and continue from there.
      </p>
      {error.message && (
        <p className="text-xs text-ink-mid mb-6 font-mono bg-surface-raised border border-line rounded px-3 py-1.5 max-w-md truncate">
          {error.message}
        </p>
      )}
      <button
        type="button"
        onClick={reset}
        className="bg-accent-solid hover:bg-accent-solid-hover text-accent-solid-ink px-5 py-2.5 rounded-lg text-sm font-medium transition focus-ring"
      >
        Try again
      </button>
    </main>
  );
}

export default ErrorPage;
