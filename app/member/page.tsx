"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type MemberProfile = {
  id: string;
  tenant_id: string;
  username: string | null;
  credit_balance: number | null;
};

type InventoryBox = {
  id: string;
  credit_tier: number;
  credit_spent: number;
  expires_at: string;
};

type LastOpenedBox = {
  id: string;
  credit_tier: number;
  rarity: string | null;
  reward_label: string | null;
  reward_nominal: number | null;
  opened_at: string | null;
};

type BannerState = {
  type: "success" | "error";
  message: string;
};

const BOX_CONFIGS = [
  {
    tier: 1,
    title: "Box 1 Credit",
    subtitle: "Start dari Common",
    description: "Minimal dapat Common. Cocok buat coba peruntungan.",
    border: "border-sky-400/60",
    halo: "shadow-[0_0_35px_rgba(56,189,248,0.45)]",
    headerGradient: "from-sky-500/80 via-violet-500/80 to-fuchsia-500/80",
  },
  {
    tier: 2,
    title: "Box 2 Credit",
    subtitle: "Start dari Rare",
    description: "Start dari Rare ke atas. Common tidak mungkin keluar.",
    border: "border-violet-400/70",
    halo: "shadow-[0_0_40px_rgba(139,92,246,0.55)]",
    headerGradient: "from-violet-500/80 via-fuchsia-500/80 to-rose-500/80",
  },
  {
    tier: 3,
    title: "Box 3 Credit",
    subtitle: "Start dari Epic",
    description:
      "Start dari Epic ke atas. Common & Rare tidak mungkin keluar.",
    border: "border-fuchsia-400/70",
    halo: "shadow-[0_0_45px_rgba(236,72,153,0.6)]",
    headerGradient: "from-fuchsia-500/80 via-pink-500/80 to-amber-400/80",
  },
];

export default function MemberHomePage() {
  const router = useRouter();

  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [inventory, setInventory] = useState<InventoryBox[]>([]);
  const [lastOpened, setLastOpened] = useState<LastOpenedBox | null>(null);

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<BannerState | null>(null);

  // ------- helpers format -------

  function formatDateTime(dateStr: string | null | undefined) {
    if (!dateStr) return "-";
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return dateStr;
    return d.toLocaleString("id-ID", {
      dateStyle: "short",
      timeStyle: "short",
    });
  }

  function formatRupiah(n: number | null | undefined) {
    if (typeof n !== "number") return "";
    return n.toLocaleString("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    });
  }

  const lastRewardText = lastOpened
    ? (() => {
        const label = lastOpened.reward_label || "";
        const nominal =
          typeof lastOpened.reward_nominal === "number"
            ? formatRupiah(lastOpened.reward_nominal)
            : "";
        if (label && nominal) return `${label} (${nominal})`;
        if (label) return label;
        if (nominal) return nominal;
        return "-";
      })()
    : "";

  // ------- fetch data utama -------

  async function fetchAllForMember(uid: string) {
    const nowIso = new Date().toISOString();
    setError(null);

    // Profil
    const { data: prof, error: profErr } = await supabase
      .from("profiles")
      .select("id, tenant_id, username, credit_balance")
      .eq("id", uid)
      .maybeSingle<MemberProfile>();

    if (profErr) {
      console.error(profErr);
      setError("Gagal membaca profil member.");
    }
    if (prof) {
      setProfile(prof);
    }

    // Inventory (box purchased & belum expired)
    const { data: invData, error: invErr } = await supabase
      .from("box_transactions")
      .select("id, credit_tier, credit_spent, expires_at, status")
      .eq("member_profile_id", uid)
      .eq("status", "PURCHASED")
      .gt("expires_at", nowIso)
      .order("created_at", { ascending: false });

    if (invErr) {
      console.error(invErr);
    }
    setInventory((invData || []) as InventoryBox[]);

    // Box terakhir dibuka
    const { data: lastData, error: lastErr } = await supabase
      .from("box_transactions")
      .select(
        "id, credit_tier, rarity, reward_label, reward_nominal, opened_at, status",
      )
      .eq("member_profile_id", uid)
      .eq("status", "OPENED")
      .order("opened_at", { ascending: false })
      .limit(1)
      .maybeSingle<LastOpenedBox>();

    if (lastErr) {
      console.error(lastErr);
    }
    setLastOpened(lastData || null);
  }

  // ------- init (cek auth + load data) -------

  useEffect(() => {
    let cancelled = false;

    async function init() {
      setLoading(true);
      setError(null);
      setBanner(null);

      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();

      if (userErr) {
        console.error(userErr);
        setError("Gagal membaca sesi login.");
        setLoading(false);
        return;
      }

      if (!user) {
        router.push("/member/login");
        return;
      }

      if (cancelled) return;

      setMemberId(user.id);
      await fetchAllForMember(user.id);

      if (!cancelled) {
        setLoading(false);
      }
    }

    init();

    return () => {
      cancelled = true;
    };
  }, [router]);

  // ------- actions -------

  async function handlePurchase(tier: number) {
    if (!memberId) return;
    setActionLoading(true);
    setBanner(null);

    try {
      const { data, error: rpcError } = await supabase.rpc("purchase_box", {
        p_credit_tier: tier,
      });

      if (rpcError) {
        console.error(rpcError);
        setBanner({
          type: "error",
          message: rpcError.message || "Gagal membeli box.",
        });
        return;
      }

      await fetchAllForMember(memberId);

      const row = Array.isArray(data) ? (data as any[])[0] : (data as any);
      const finalTier = row?.credit_tier ?? tier;

      setBanner({
        type: "success",
        message: `Berhasil membeli box ${finalTier} credit. Semoga beruntung!`,
      });
    } catch (e) {
      console.error(e);
      setBanner({
        type: "error",
        message: "Terjadi kesalahan saat membeli box.",
      });
    } finally {
      setActionLoading(false);
    }
  }

  async function handleOpenBox(boxId: string, creditTier: number) {
    if (!memberId) return;
    setActionLoading(true);
    setBanner(null);

    try {
      const { data, error: rpcError } = await supabase.rpc("open_box", {
        p_transaction_id: boxId,
      });

      if (rpcError) {
        console.error(rpcError);
        setBanner({
          type: "error",
          message: rpcError.message || "Gagal membuka box.",
        });
        return;
      }

      const row = Array.isArray(data) ? (data as any[])[0] : (data as any);

      await fetchAllForMember(memberId);

      const rarity = row?.rarity || "???";
      const rewardLabel = row?.reward_label || "";
      const rewardNominal =
        typeof row?.reward_nominal === "number"
          ? row.reward_nominal
          : null;

      let hadiahText = rewardLabel;
      if (rewardNominal) {
        const nominalStr = formatRupiah(rewardNominal);
        hadiahText = rewardLabel
          ? `${rewardLabel} (${nominalStr})`
          : nominalStr;
      }

      setBanner({
        type: "success",
        message: `Box ${creditTier} credit terbuka! Rarity: ${rarity}. Hadiah: ${
          hadiahText || "-"
        }`,
      });
    } catch (e) {
      console.error(e);
      setBanner({
        type: "error",
        message: "Terjadi kesalahan saat membuka box.",
      });
    } finally {
      setActionLoading(false);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/member/login");
  }

  // ------- render -------

  if (loading) {
    return (
      <main className="min-h-screen bg-[#02010a] text-slate-50">
        <div className="flex min-h-screen items-center justify-center">
          <p className="text-sm text-slate-300">
            Memuat data member...
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#02010a] text-slate-50">
      <div className="relative min-h-screen overflow-hidden">
        {/* Glow / starfield background */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(129,140,248,0.18),_transparent_60%),radial-gradient(circle_at_bottom,_rgba(236,72,153,0.18),_transparent_60%)] opacity-90" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(15,23,42,0.8),rgba(15,23,42,0.95))]" />

        <div className="relative z-10 mx-auto flex min-h-screen max-w-5xl flex-col px-4 py-6 sm:px-6 lg:px-8">
          {/* Header */}
          <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-sky-400/80">
                Member Site
              </p>
              <h1 className="mt-2 bg-gradient-to-r from-sky-300 via-fuchsia-400 to-amber-300 bg-clip-text text-3xl font-semibold text-transparent sm:text-4xl">
                Masuk ke Dunia Fantasy
              </h1>
              <p className="mt-2 max-w-xl text-sm text-slate-300">
                Beli mystery box dengan credit kamu. Setiap box punya
                peluang rarity yang berbeda. Semakin tinggi tier,
                semakin besar peluang rarity tinggi.
              </p>
            </div>

            <div className="flex flex-col items-end gap-2">
              <div className="rounded-2xl border border-slate-700/80 bg-slate-900/80 px-4 py-3 text-right shadow-lg shadow-sky-900/40">
                <p className="text-[11px] uppercase tracking-wide text-slate-400">
                  Login sebagai
                </p>
                <p className="mt-0.5 text-sm font-semibold text-slate-50">
                  {profile?.username ?? "-"}
                </p>
                <p className="mt-2 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-500 px-3 py-1 text-[11px] font-medium text-white shadow-md shadow-fuchsia-700/40">
                  <span>✨</span>
                  <span>{profile?.credit_balance ?? 0} credit</span>
                </p>
              </div>
              <button
                onClick={handleLogout}
                className="rounded-full border border-slate-600/80 px-4 py-1.5 text-xs text-slate-200 transition hover:border-fuchsia-400 hover:bg-slate-900/80"
              >
                Logout
              </button>
            </div>
          </header>

          {/* Banner error / info */}
          {error && (
            <div className="mb-4 rounded-xl border border-rose-500/70 bg-rose-950/40 px-4 py-3 text-sm text-rose-100 shadow-lg shadow-rose-900/40">
              {error}
            </div>
          )}
          {banner && (
            <div
              className={`mb-5 rounded-xl border px-4 py-3 text-sm shadow-lg ${
                banner.type === "success"
                  ? "border-emerald-500/70 bg-emerald-950/40 text-emerald-100 shadow-emerald-900/40"
                  : "border-rose-500/70 bg-rose-950/40 text-rose-100 shadow-rose-900/40"
              }`}
            >
              {banner.message}
            </div>
          )}

          {/* Section pilih box */}
          <section className="mb-8">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">
                Pilih Box
              </h2>
              <p className="text-[11px] text-slate-500">
                Credit kamu akan dipakai untuk membeli Mystery Box (1 /
                2 / 3 credit).
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {BOX_CONFIGS.map((box) => (
                <div
                  key={box.tier}
                  className={`group relative overflow-hidden rounded-2xl border ${box.border} bg-slate-950/80 px-4 py-4 shadow-lg ${box.halo} transition-transform hover:-translate-y-0.5`}
                >
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-slate-900/40 via-slate-900/10 to-slate-950/80" />
                  <div className="relative z-10">
                    <div
                      className={`inline-flex items-center gap-2 rounded-full bg-gradient-to-r ${box.headerGradient} px-3 py-1 text-[11px] font-semibold text-white`}
                    >
                      <span>🎁</span>
                      <span>{box.title}</span>
                    </div>

                    <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-300">
                      {box.subtitle}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {box.description}
                    </p>

                    <button
                      onClick={() => handlePurchase(box.tier)}
                      disabled={actionLoading}
                      className="mt-4 w-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-fuchsia-800/50 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {actionLoading
                        ? "Memproses..."
                        : `Beli Box ${box.tier} Credit`}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Inventory */}
          <section className="mb-8">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">
                  Inventory Box Kamu
                </h2>
                <p className="mt-1 text-[11px] text-slate-400">
                  Box bisa disimpan maksimal 7 hari. Setelah itu akan
                  hangus otomatis.
                </p>
              </div>
              {inventory.length > 0 && (
                <p className="text-[11px] text-slate-400">
                  {inventory.length} box menunggu dibuka
                </p>
              )}
            </div>

            <div className="space-y-2 rounded-2xl border border-slate-700/80 bg-slate-950/70 px-4 py-4 shadow-inner shadow-slate-900/80">
              {inventory.length === 0 ? (
                <p className="text-xs text-slate-400">
                  Belum ada box yang menunggu dibuka. Coba beli box
                  dulu di atas.
                </p>
              ) : (
                inventory.map((box) => (
                  <div
                    key={box.id}
                    className="flex flex-col gap-3 rounded-xl border border-slate-700/70 bg-slate-900/70 px-3 py-3 text-xs text-slate-100 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-50">
                        Box {box.credit_tier} Credit
                      </p>
                      <p className="mt-1 text-[11px] text-slate-400">
                        Kadaluarsa:{" "}
                        <span className="text-slate-200">
                          {formatDateTime(box.expires_at)}
                        </span>
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <p className="text-[11px] text-slate-400">
                        Telah dibayar:{" "}
                        <span className="text-slate-100">
                          {box.credit_spent} credit
                        </span>
                      </p>
                      <button
                        onClick={() =>
                          handleOpenBox(box.id, box.credit_tier)
                        }
                        disabled={actionLoading}
                        className="rounded-full bg-gradient-to-r from-amber-400 to-amber-500 px-4 py-1.5 text-xs font-semibold text-slate-900 shadow-md shadow-amber-700/50 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {actionLoading ? "Memproses..." : "Buka Box"}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Box terakhir dibuka */}
          {lastOpened && (
            <section className="mb-4">
              <div className="rounded-2xl border border-amber-500/70 bg-gradient-to-br from-amber-900/70 via-amber-950/90 to-slate-950/95 px-4 py-4 shadow-[0_0_45px_rgba(245,158,11,0.45)] sm:px-6 sm:py-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-amber-300">
                  Box Terakhir Dibuka
                </p>
                <p className="mt-2 text-sm font-semibold text-slate-50">
                  Box {lastOpened.credit_tier} credit dengan rarity{" "}
                  <span className="text-amber-300">
                    {lastOpened.rarity || "-"}
                  </span>
                </p>
                <p className="mt-2 text-sm text-slate-200">
                  Hadiah:{" "}
                  <span className="font-semibold text-amber-200">
                    {lastRewardText}
                  </span>
                </p>
                <p className="mt-1 text-[11px] text-slate-300">
                  Dibuka pada:{" "}
                  <span className="text-slate-100">
                    {formatDateTime(lastOpened.opened_at)}
                  </span>
                </p>
                <p className="mt-3 text-[11px] text-amber-100/90">
                  Setelah ini, hadiah akan ditindaklanjuti oleh Admin /
                  CS via kontak yang disediakan di member site.
                </p>
              </div>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
