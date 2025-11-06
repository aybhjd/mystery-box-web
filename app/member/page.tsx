"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type UserRole = "ADMIN" | "CS" | "MEMBER";

type MemberProfile = {
  id: string;
  username: string | null;
  credit_balance: number | null;
  role: UserRole;
};

type PurchaseResult = {
  transaction_id: string;
  status: string;
  credit_tier: number;
  credit_spent: number;
  rarity_id: string;
  rarity_code: string;
  rarity_name: string;
  credits_before: number;
  credits_after: number;
  expires_at: string;
};

export default function MemberHomePage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [buyingTier, setBuyingTier] = useState<number | null>(null);
  const [lastPurchase, setLastPurchase] = useState<PurchaseResult | null>(
    null,
  );
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [infoType, setInfoType] = useState<"success" | "error" | null>(
    null,
  );

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        console.error(userError);
        setError("Gagal membaca sesi login.");
        setLoading(false);
        return;
      }

      if (!user) {
        router.push("/member/login");
        return;
      }

      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("id, username, credit_balance, role")
        .eq("id", user.id)
        .maybeSingle<MemberProfile>();

      if (profErr) {
        console.error(profErr);
        setError("Gagal membaca profil member.");
        setLoading(false);
        return;
      }

      if (!prof) {
        setError("Profil belum dibuat untuk user ini.");
        setLoading(false);
        return;
      }

      if (prof.role !== "MEMBER") {
        setError("Halaman ini khusus untuk akun Member.");
        setLoading(false);
        return;
      }

      setProfile(prof);
      setLoading(false);
    }

    load();
  }, [router]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/member/login");
  }

  function showInfo(msg: string, type: "success" | "error") {
    setInfoMessage(msg);
    setInfoType(type);
    // auto clear setelah beberapa detik
    setTimeout(() => {
      setInfoMessage(null);
      setInfoType(null);
    }, 4000);
  }

  async function handleBuyBox(tier: number) {
    if (!profile) return;
    setBuyingTier(tier);
    setError(null);

    try {
      const { data, error } = await supabase.rpc("purchase_box", {
        p_credit_tier: tier,
      });

      if (error) {
        console.error(error);
        showInfo(
          error.message || "Gagal membeli box. Coba lagi nanti.",
          "error",
        );
        return;
      }

      if (!data || data.length === 0) {
        showInfo(
          "Tidak ada data transaksi yang dikembalikan.",
          "error",
        );
        return;
      }

      const result = data[0] as PurchaseResult;

      // update saldo di UI
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              credit_balance: result.credits_after,
            }
          : prev,
      );

      setLastPurchase(result);

      showInfo(
        `Berhasil membeli box ${result.credit_tier} credit. Rarity: ${result.rarity_name} (${result.rarity_code}).`,
        "success",
      );
    } catch (err: any) {
      console.error(err);
      showInfo(
        err?.message || "Gagal membeli box. Coba lagi nanti.",
        "error",
      );
    } finally {
      setBuyingTier(null);
    }
  }

  function formatExpire(dateStr: string) {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return dateStr;
    return d.toLocaleString("id-ID", {
      dateStyle: "short",
      timeStyle: "short",
    });
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-sm text-slate-300">
          Memuat data member...
        </p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-4">
        <p className="mb-4 rounded-lg border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-200">
          {error}
        </p>
        <button
          onClick={() => router.push("/member/login")}
          className="rounded-lg border border-slate-600 px-4 py-2 text-xs text-slate-200 hover:bg-slate-800 transition"
        >
          Kembali ke login member
        </button>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-sm text-slate-300">
          Profil tidak ditemukan.
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-start justify-center px-4 py-10">
      <div className="w-full max-w-3xl space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-slate-400">
              Member Site
            </p>
            <h1 className="text-2xl font-semibold">
              Masuk ke Dunia Fantasy
            </h1>
            <p className="text-sm text-slate-400">
              Beli mystery box dengan credit kamu. Setiap box punya peluang
              rarity yang berbeda.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2 text-right">
              <p className="text-xs text-slate-400">
                Login sebagai
              </p>
              <p className="text-sm font-semibold">
                {profile.username || "Member"}
              </p>
              <p className="text-xs text-emerald-300">
                {profile.credit_balance ?? 0} credit
              </p>
            </div>
            <button
              onClick={handleLogout}
              className="rounded-lg border border-slate-600 px-3 py-1 text-xs text-slate-200 hover:bg-slate-800 transition"
            >
              Logout
            </button>
          </div>
        </div>

        {/* Info message */}
        {infoMessage && infoType && (
          <div
            className={`rounded-lg border px-4 py-3 text-sm ${
              infoType === "success"
                ? "border-emerald-500/70 bg-emerald-950/40 text-emerald-200"
                : "border-red-500/70 bg-red-950/40 text-red-200"
            }`}
          >
            {infoMessage}
          </div>
        )}

        {/* Kartu box */}
        <section className="grid gap-4 md:grid-cols-3">
          {/* Box 1 credit */}
          <div className="rounded-2xl border border-slate-700 bg-gradient-to-b from-slate-900 via-slate-950 to-slate-950/90 p-4 flex flex-col justify-between">
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-slate-100">
                Box 1 Credit
              </h2>
              <p className="text-xs text-slate-400">
                Minimal dapat <span className="font-semibold">Common</span>.
                Cocok buat coba peruntungan.
              </p>
            </div>
            <button
              onClick={() => handleBuyBox(1)}
              disabled={buyingTier === 1}
              className="mt-4 w-full rounded-xl bg-violet-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-violet-400 disabled:opacity-60 disabled:cursor-not-allowed transition"
            >
              {buyingTier === 1 ? "Memproses..." : "Beli Box 1 Credit"}
            </button>
          </div>

          {/* Box 2 credit */}
          <div className="rounded-2xl border border-sky-700/70 bg-gradient-to-b from-slate-900 via-slate-950 to-slate-950/90 p-4 flex flex-col justify-between">
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-sky-100">
                Box 2 Credit
              </h2>
              <p className="text-xs text-slate-300">
                Start dari{" "}
                <span className="font-semibold text-sky-300">Rare</span> ke
                atas. Common tidak mungkin keluar.
              </p>
            </div>
            <button
              onClick={() => handleBuyBox(2)}
              disabled={buyingTier === 2}
              className="mt-4 w-full rounded-xl bg-sky-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-sky-400 disabled:opacity-60 disabled:cursor-not-allowed transition"
            >
              {buyingTier === 2 ? "Memproses..." : "Beli Box 2 Credit"}
            </button>
          </div>

          {/* Box 3 credit */}
          <div className="rounded-2xl border border-purple-700/70 bg-gradient-to-b from-slate-900 via-slate-950 to-slate-950/90 p-4 flex flex-col justify-between">
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-purple-100">
                Box 3 Credit
              </h2>
              <p className="text-xs text-slate-300">
                Start dari{" "}
                <span className="font-semibold text-purple-300">Epic</span>{" "}
                ke atas. Common &amp; Rare tidak mungkin keluar.
              </p>
            </div>
            <button
              onClick={() => handleBuyBox(3)}
              disabled={buyingTier === 3}
              className="mt-4 w-full rounded-xl bg-purple-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-purple-400 disabled:opacity-60 disabled:cursor-not-allowed transition"
            >
              {buyingTier === 3 ? "Memproses..." : "Beli Box 3 Credit"}
            </button>
          </div>
        </section>

        {/* Ringkasan pembelian terakhir */}
        {lastPurchase && (
          <section className="mt-4 rounded-2xl border border-slate-700 bg-slate-900/80 p-4 space-y-2">
            <h2 className="text-sm font-semibold">
              Pembelian Terakhir
            </h2>
            <p className="text-xs text-slate-300">
              Box <span className="font-semibold">{lastPurchase.credit_tier}</span> credit, rarity{" "}
              <span className="font-semibold">
                {lastPurchase.rarity_name} ({lastPurchase.rarity_code})
              </span>
              .
            </p>
            <p className="text-xs text-slate-400">
              Credit sebelum beli:{" "}
              <span className="font-semibold">
                {lastPurchase.credits_before}
              </span>{" "}
              • setelah beli:{" "}
              <span className="font-semibold">
                {lastPurchase.credits_after}
              </span>
            </p>
            <p className="text-xs text-slate-400">
              Box ini bisa dibuka sampai{" "}
              <span className="font-semibold">
                {formatExpire(lastPurchase.expires_at)}
              </span>
              .
            </p>
            <p className="text-[11px] text-slate-500">
              (Inventory & tombol buka box akan kita buat di langkah
              berikutnya.)
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
