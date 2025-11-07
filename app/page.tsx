import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-slate-900/70 border border-slate-700 rounded-2xl shadow-xl p-8 space-y-6">
        <h1 className="text-2xl font-semibold text-center">
          Mystery Box
        </h1>
        <p className="text-sm text-slate-300 text-center">
          Silahkan Masuk ke Member Site.
        </p>

        <div className="space-y-4">
          <Link
            href="/member/login"
            className="block w-full text-center rounded-xl bg-memberAccent/10 border border-memberAccent/50 px-4 py-3 text-sm font-medium hover:bg-memberAccent/20 transition"
          >
            Masuk Member Site
          </Link>
        </div>
      </div>
    </main>
  );
}
