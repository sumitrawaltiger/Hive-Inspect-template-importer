import Link from "next/link";

export default function NotFound() {
  return (
    <div className="rounded-xl border border-stone-200 bg-white px-6 py-14 text-center">
      <p className="text-lg font-semibold">That template does not exist</p>
      <p className="mt-1 text-sm text-stone-500">It may have been deleted. Your other templates are untouched.</p>
      <Link href="/templates" className="mt-4 inline-block rounded bg-brand px-4 py-2 text-sm font-medium text-white">Back to my templates</Link>
    </div>
  );
}
