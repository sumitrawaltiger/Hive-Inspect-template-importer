"use client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div role="alert" className="rounded-xl border border-red-300 bg-red-50 px-6 py-10 text-center text-red-900">
      <p className="text-lg font-semibold">This page could not be loaded</p>
      <p className="mt-1 text-sm">The server or database did not answer. Nothing you saved earlier is affected.</p>
      <button onClick={reset} className="mt-4 rounded bg-red-700 px-4 py-2 text-sm font-medium text-white">Try again</button>
    </div>
  );
}
