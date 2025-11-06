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

type InventoryBox = {
  id: string;
  credit_tier: number;
  status: "PURCHASED" | "OPENED" | "EXPIRED";
  expires_at: string;
  created_at: string;
  rarity?: {
    code: string;
    name: string;
  } | null;
};

type OpenBoxResult = {
  transaction_id: string;
  status: string;
  rarity_id: string;
  rarity_code: string;
  rarity_name: string;
  reward_id: string;
  reward_label: string;
  reward_type: string;
  reward_amount: number;
  opened_at: string;
  expires_at: string;
};

type OpenedBoxInfo = OpenBoxResult & { credit_tier: number };

type InfoType = "success" | "error";

type PurchasePopupState = {
  tier: number;
  rarity_name: string;
  rarity_code: string;
};

type OpenPopupState = {
  tier: number;
  rarity_name: string;
  rarity_code: string;
  reward_label: string;
  reward_type: string;
  reward_amount: number;
};

function rarityBadgeClasses(code?: string | null): string {
  const c = code?.toUpperCase();
  switch (c) {
    case "COMMON":
      return "border-emerald-500/60 bg-emerald-900/40 text-emerald-200";
    case "RARE":
      return "border-sky-400/70 bg-sky-900/50 text-sky-200";
    case "EPIC":
      return "border-violet-400/80 bg-violet-900/60 text-violet-200";
    case "SUPREME":
      return "border-amber-400/80 bg-amber-900/60 text-amber-200";
    case "LEGENDARY":
      return "border-orange-400/80 bg-orange-900/70 text-orange-200";
    case "SPECIAL_LEGENDARY":
    case "SLEGEND":
    case "SLEGENDARY":
      return "border-fuchsia-400/80 bg-gradient-to-r from-fuchsia-500/30 via-amber-400/30 to-sky-400/30 text-amber-50";
    default:
      return "border-slate-500/70 bg-slate-800/70 text-slate-100";
  }
}

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
  const [infoType, setInfoType] = useState<InfoType | null>(null);

  // inventory box yang belum dibuka
  const [inventory, setInventory] = useState<InventoryBox[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [inventoryError, setInventoryError] = useState<string | null>(
    null,
  );
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [lastOpened, setLastOpened] = useState<OpenedBoxInfo | null>(null);

  // animasi / popup
  const [purchasePopup, setPurchasePopup] =
    useState<PurchasePopupState | null>(null);
  const [openPopup, setOpenPopup] = useState<OpenPopupState | null>(
    null,
  );

  // ------------------- load profil member -------------------

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

  // ------------------- inventory: load dari box_transactions -------------------

  async function reloadInventory() {
    if (!profile) return;

    setInventoryLoading(true);
    setInventoryError(null);

    try {
      const nowIso = new Date().toISOString();

      const { data, error } = await supabase
        .from("box_transactions")
        .select(
          `
          id,
          credit_tier,
          status,
          expires_at,
          created_at,
          rarity:box_rarities(
            code,
            name
          )
        `,
        )
        .eq("member_profile_id", profile.id)
        .eq("status", "PURCHASED")
        .gt("expires_at", nowIso)
        .order("created_at", { ascending: false });

      if (error) {
        console.error(error);
        setInventoryError("Gagal membaca inventory box.");
        setInventoryLoading(false);
        return;
      }

      setInventory((data || []) as InventoryBox[]);
      setInventoryLoading(false);
    } catch (err) {
      console.error(err);
      setInventoryError("Terjadi kesalahan saat membaca inventory box.");
      setInventoryLoading(false);
    }
  }

  useEffect(() => {
    if (!profile) return;
    reloadInventory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  // ------------------- util -------------------

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/member/login");
  }

  function showInfo(msg: string, type: InfoType) {
    setInfoMessage(msg);
    setInfoType(type);
    setTimeout(() => {
      setInfoMessage(null);
      setInfoType(null);
    }, 4000);
  }

  function formatDateTime(dateStr: string) {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return dateStr;
    return d.toLocaleString("id-ID", {
      dateStyle: "short",
      timeStyle: "short",
    });
  }

  function formatRupiah(n: number) {
    return n.toLocaleString("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    });
  }

  // ------------------- beli box (purchase_box) -------------------

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

      // refresh inventory dari database
      await reloadInventory();

      showInfo(
        `Berhasil membeli box ${result.credit_tier} credit. Rarity: ${result.rarity_name} (${result.rarity_code}).`,
        "success",
      );

      // popup animasi "box dibeli"
      setPurchasePopup({
        tier: result.credit_tier,
        rarity_name: result.rarity_name,
        rarity_code: result.rarity_code,
      });
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

  // ------------------- buka box (open_box) -------------------

  async function handleOpenBox(box: InventoryBox) {
    if (!profile) return;
    setOpeningId(box.id);

    try {
      const { data, error } = await supabase.rpc("open_box", {
        p_transaction_id: box.id,
      });

      if (error) {
        console.error(error);
        showInfo(
          error.message || "Gagal membuka box. Coba lagi nanti.",
          "error",
        );
        // kalau error (mis. hangus), refresh inventory supaya row hilang
        await reloadInventory();
        return;
      }

      if (!data || data.length === 0) {
        showInfo(
          "Tidak ada data hasil buka box yang dikembalikan.",
          "error",
        );
        await reloadInventory();
        return;
      }

      const result = data[0] as OpenBoxResult;

      // update inventory (remove box yang baru dibuka)
      setInventory((prev) => prev.filter((b) => b.id !== box.id));

      // simpan info box terakhir dibuka (untuk ditampilkan di bawah)
      const opened: OpenedBoxInfo = {
        ...result,
        credit_tier: box.credit_tier,
      };
      setLastOpened(opened);

      showInfo(
        `Box ${box.credit_tier} credit terbuka! Rarity: ${result.rarity_name} (${result.rarity_code}) — Hadiah: ${result.reward_label}`,
        "success",
      );

      // popup animasi "box terbuka"
      setOpenPopup({
        tier: box.credit_tier,
        rarity_name: result.rarity_name,
        rarity_code: result.rarity_code,
        reward_label: result.reward_label,
        reward_type: result.reward_type,
        reward_amount: result.reward_amount,
      });
    } catch (err: any) {
      console.error(err);
      showInfo(
        err?.message || "Gagal membuka box. Coba lagi nanti.",
        "error",
      );
      await reloadInventory();
    } finally {
      setOpeningId(null);
    }
  }

  // ------------------- render -------------------

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#02010a] text-slate-200">
        <p className="text-sm">Memuat data member...</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center bg-[#02010a] px-4 text-slate-100">
        <p className="mb-4 rounded-xl border border-red-900/70 bg-red-950/60 px-4 py-3 text-sm text-red-100 shadow-lg shadow-red-900/50">
          {error}
        </p>
        <button
          onClick={() => router.push("/member/login")}
          className="rounded-full border border-slate-600 px-4 py-2 text-xs text-slate-200 hover:bg-slate-800 transition"
        >
          Kembali ke login member
        </button>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#02010a] text-slate-200">
        <p className="text-sm">Profil tidak ditemukan.</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#02010a] text-slate-50">
      <div className="relative min-h-screen overflow-hidden">
        {/* background fantasy glow */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(129,140,248,0.18),_transparent_60%),radial-gradient(circle_at_bottom,_rgba(236,72,153,0.18),_transparent_60%)] opacity-90" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(15,23,42,0.9),rgba(3,7,18,0.98))]" />

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
                Beli mystery box dengan credit kamu. Setiap box punya peluang
                rarity yang berbeda. Semakin tinggi tier, semakin besar peluang
                rarity tinggi.
              </p>
            </div>

            <div className="flex flex-col items-end gap-2">
              <div className="rounded-2xl border border-slate-700/80 bg-slate-900/90 px-4 py-3 text-right shadow-lg shadow-sky-900/40">
                <p className="text-[11px] uppercase tracking-wide text-slate-400">
                  Login sebagai
                </p>
                <p className="mt-0.5 text-sm font-semibold text-slate-50">
                  {profile.username || "Member"}
                </p>
                <p className="mt-2 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-500 px-3 py-1 text-[11px] font-medium text-white shadow-md shadow-fuchsia-700/40">
                  <span>✨</span>
                  <span>{profile.credit_balance ?? 0} credit</span>
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

          {/* Info message */}
          {infoMessage && infoType && (
            <div
              className={`mb-4 rounded-xl border px-4 py-3 text-sm shadow-lg ${
                infoType === "success"
                  ? "border-emerald-500/70 bg-emerald-950/50 text-emerald-100 shadow-emerald-900/40"
                  : "border-rose-500/70 bg-rose-950/60 text-rose-100 shadow-rose-900/40"
              }`}
            >
              {infoMessage}
            </div>
          )}

          {/* Kartu box (beli) */}
          <section className="mb-8">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">
                Pilih Box
              </h2>
              <p className="text-[11px] text-slate-500">
                Credit akan dipakai untuk membeli Mystery Box (1 / 2 / 3
                credit).
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {/* Box 1 */}
              <div className="group relative overflow-hidden rounded-2xl border border-sky-400/60 bg-slate-950/80 px-4 py-4 shadow-lg shadow-sky-900/50 transition hover:-translate-y-1 hover:shadow-2xl">
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-slate-900/60 via-slate-900/10 to-slate-950/90" />
                <div className="relative z-10 flex h-full flex-col justify-between">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-sky-500/80 via-violet-500/80 to-fuchsia-500/80 px-3 py-1 text-[11px] font-semibold text-white">
                      <span>🎁</span>
                      <span>Box 1 Credit</span>
                    </div>
                    <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-300">
                      Start dari Common
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      Minimal dapat <span className="font-semibold">Common</span>.
                      Cocok buat coba peruntungan.
                    </p>
                  </div>
                  <button
                    onClick={() => handleBuyBox(1)}
                    disabled={buyingTier === 1}
                    className="mt-4 w-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-fuchsia-800/50 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {buyingTier === 1 ? "Memproses..." : "Beli Box 1 Credit"}
                  </button>
                </div>
              </div>

              {/* Box 2 */}
              <div className="group relative overflow-hidden rounded-2xl border border-violet-400/70 bg-slate-950/80 px-4 py-4 shadow-lg shadow-violet-900/60 transition hover:-translate-y-1 hover:shadow-2xl">
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-slate-900/60 via-slate-900/10 to-slate-950/90" />
                <div className="relative z-10 flex h-full flex-col justify-between">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-500/80 via-fuchsia-500/80 to-rose-500/80 px-3 py-1 text-[11px] font-semibold text-white">
                      <span>🎁</span>
                      <span>Box 2 Credit</span>
                    </div>
                    <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-300">
                      Start dari Rare
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      Start dari <span className="font-semibold">Rare</span> ke
                      atas. Common tidak mungkin keluar.
                    </p>
                  </div>
                  <button
                    onClick={() => handleBuyBox(2)}
                    disabled={buyingTier === 2}
                    className="mt-4 w-full rounded-full bg-gradient-to-r from-sky-500 to-violet-500 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-violet-800/50 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {buyingTier === 2 ? "Memproses..." : "Beli Box 2 Credit"}
                  </button>
                </div>
              </div>

              {/* Box 3 */}
              <div className="group relative overflow-hidden rounded-2xl border border-fuchsia-400/70 bg-slate-950/80 px-4 py-4 shadow-lg shadow-fuchsia-900/70 transition hover:-translate-y-1 hover:shadow-2xl">
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-slate-900/60 via-slate-900/10 to-slate-950/90" />
                <div className="relative z-10 flex h-full flex-col justify-between">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-fuchsia-500/80 via-pink-500/80 to-amber-400/80 px-3 py-1 text-[11px] font-semibold text-white">
                      <span>🎁</span>
                      <span>Box 3 Credit</span>
                    </div>
                    <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-300">
                      Start dari Epic
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      Start dari <span className="font-semibold">Epic</span> ke
                      atas. Common &amp; Rare tidak mungkin keluar.
                    </p>
                  </div>
                  <button
                    onClick={() => handleBuyBox(3)}
                    disabled={buyingTier === 3}
                    className="mt-4 w-full rounded-full bg-gradient-to-r from-fuchsia-500 to-amber-400 px-4 py-2 text-sm font-semibold text-slate-900 shadow-md shadow-amber-700/50 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {buyingTier === 3 ? "Memproses..." : "Beli Box 3 Credit"}
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* Inventory box */}
          <section className="mb-8 rounded-2xl border border-slate-700/80 bg-slate-950/80 px-4 py-4 shadow-inner shadow-slate-900/80">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-slate-100">
                  Inventory Box Kamu
                </h2>
                <p className="text-[11px] text-slate-400">
                  Box bisa disimpan maksimal 7 hari. Setelah itu akan hangus
                  otomatis.
                </p>
              </div>
              <p className="text-[11px] text-slate-500">
                {inventory.length} box menunggu dibuka
              </p>
            </div>

            {inventoryError && (
              <p className="mb-2 rounded-lg border border-red-900/60 bg-red-950/50 px-3 py-2 text-[11px] text-red-200">
                {inventoryError}
              </p>
            )}

            {inventoryLoading ? (
              <p className="text-xs text-slate-400">
                Memuat inventory box...
              </p>
            ) : inventory.length === 0 ? (
              <p className="text-xs text-slate-400">
                Kamu belum punya box yang menunggu dibuka.
              </p>
            ) : (
              <ul className="space-y-2">
                {inventory.map((box) => (
                  <li
                    key={box.id}
                    className={`flex flex-col gap-3 rounded-xl border border-slate-700/70 bg-slate-900/80 px-3 py-3 text-xs text-slate-100 transition sm:flex-row sm:items-center sm:justify-between ${
                      openingId === box.id
                        ? "border-amber-400/80 animate-pulse"
                        : ""
                    }`}
                  >
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-slate-50">
                        Box {box.credit_tier} Credit
                      </p>
                      {box.rarity && (
                        <span
                          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${rarityBadgeClasses(
                            box.rarity.code,
                          )}`}
                        >
                          {box.rarity.name} ({box.rarity.code})
                        </span>
                      )}
                      <p className="text-[11px] text-slate-400">
                        Kadaluarsa:{" "}
                        <span className="font-medium text-slate-100">
                          {formatDateTime(box.expires_at)}
                        </span>
                      </p>
                    </div>
                    <button
                      onClick={() => handleOpenBox(box)}
                      disabled={openingId === box.id}
                      className="rounded-full bg-gradient-to-r from-amber-400 to-amber-500 px-4 py-1.5 text-[11px] font-semibold text-slate-900 shadow-md shadow-amber-700/50 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {openingId === box.id ? "Membuka..." : "Buka Box"}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Pembelian terakhir */}
          {lastPurchase && (
            <section className="mb-4 rounded-2xl border border-slate-700/80 bg-slate-950/80 px-4 py-4 shadow-inner shadow-slate-900/80">
              <h2 className="text-sm font-semibold text-slate-100">
                Pembelian Terakhir
              </h2>
              <p className="mt-1 text-xs text-slate-300">
                Box{" "}
                <span className="font-semibold">
                  {lastPurchase.credit_tier}
                </span>{" "}
                credit, rarity{" "}
                <span className="font-semibold text-fuchsia-200">
                  {lastPurchase.rarity_name} ({lastPurchase.rarity_code})
                </span>
                .
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Credit sebelum beli:{" "}
                <span className="font-semibold">
                  {lastPurchase.credits_before}
                </span>{" "}
                • setelah beli:{" "}
                <span className="font-semibold">
                  {lastPurchase.credits_after}
                </span>
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Box ini bisa dibuka sampai{" "}
                <span className="font-semibold">
                  {formatDateTime(lastPurchase.expires_at)}
                </span>
                .
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                (Inventory & tombol buka box tersedia di bagian atas.)
              </p>
            </section>
          )}

          {/* Box terakhir dibuka */}
          {lastOpened && (
            <section className="mb-4 rounded-2xl border border-amber-500/70 bg-gradient-to-br from-amber-900/70 via-amber-950/90 to-slate-950/95 px-4 py-4 shadow-[0_0_40px_rgba(245,158,11,0.45)]">
              <h2 className="text-sm font-semibold text-amber-100">
                Box Terakhir Dibuka
              </h2>
              <p className="mt-1 text-xs text-amber-100">
                Box{" "}
                <span className="font-semibold">
                  {lastOpened.credit_tier}
                </span>{" "}
                credit dengan rarity{" "}
                <span className="font-semibold">
                  {lastOpened.rarity_name} ({lastOpened.rarity_code})
                </span>
                .
              </p>
              <p className="mt-1 text-xs text-amber-100">
                Hadiah:{" "}
                <span className="font-semibold">
                  {lastOpened.reward_label}
                </span>
                {lastOpened.reward_type === "CASH" &&
                  ` (${formatRupiah(lastOpened.reward_amount)})`}
              </p>
              <p className="mt-1 text-[11px] text-amber-200">
                Dibuka pada{" "}
                <span className="font-semibold">
                  {formatDateTime(lastOpened.opened_at)}
                </span>
                .
              </p>
              <p className="mt-1 text-[11px] text-amber-200">
                Setelah ini, hadiah akan ditindaklanjuti oleh Admin / CS via
                kontak yang disediakan di member site.
              </p>
            </section>
          )}
        </div>

        {/* Popup: Box Dibeli */}
        {purchasePopup && (
          <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <div className="relative w-full max-w-md rounded-3xl border border-fuchsia-400/80 bg-gradient-to-b from-slate-950 via-fuchsia-950/70 to-slate-950 px-6 py-6 text-center shadow-[0_0_60px_rgba(217,70,239,0.7)]">
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <span className="h-32 w-32 animate-ping rounded-full bg-fuchsia-400/40" />
              </div>
              <div className="relative z-10">
                <div className="mx-auto mb-3 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-fuchsia-400 via-violet-500 to-sky-500 text-4xl shadow-lg shadow-fuchsia-900/70 animate-bounce">
                  📦
                </div>
                <p className="text-xs uppercase tracking-[0.25em] text-fuchsia-300">
                  Box Dibeli!
                </p>
                <h3 className="mt-2 text-lg font-semibold text-slate-50">
                  Box {purchasePopup.tier} credit berhasil dibeli
                </h3>
                <p className="mt-2 text-sm text-slate-200">
                  Rarity box ini:{" "}
                  <span className="font-semibold text-fuchsia-200">
                    {purchasePopup.rarity_name} ({purchasePopup.rarity_code})
                  </span>
                </p>
                <p className="mt-2 text-sm text-slate-200">
                  Box baru sudah masuk ke{" "}
                  <span className="font-semibold">Inventory</span> kamu.
                </p>
                <p className="mt-1 text-[11px] text-slate-300">
                  Kamu bisa membukanya kapan saja sebelum kadaluarsa.
                </p>
                <button
                  onClick={() => setPurchasePopup(null)}
                  className="mt-4 rounded-full border border-slate-600/80 bg-slate-900/80 px-5 py-2 text-xs font-semibold text-slate-100 hover:border-fuchsia-400 hover:bg-slate-900 transition"
                >
                  Oke, mengerti
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Popup: Box Terbuka */}
        {openPopup && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm">
            <div className="relative w-full max-w-md rounded-3xl border border-amber-400/80 bg-gradient-to-b from-slate-950 via-amber-950/70 to-slate-950 px-6 py-6 text-center shadow-[0_0_60px_rgba(245,158,11,0.7)]">
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <span className="h-32 w-32 animate-ping rounded-full bg-amber-400/40" />
              </div>
              <div className="relative z-10">
                <div className="mx-auto mb-3 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-amber-400 via-orange-500 to-amber-700 text-4xl shadow-lg shadow-amber-900/70 animate-bounce">
                  🧰
                </div>
                <p className="text-xs uppercase tracking-[0.25em] text-amber-300">
                  Box Terbuka!
                </p>
                <h3 className="mt-2 text-lg font-semibold text-slate-50">
                  Box {openPopup.tier} credit berhasil dibuka
                </h3>
                <p className="mt-2 text-sm text-slate-200">
                  Rarity:{" "}
                  <span className="font-semibold text-amber-200">
                    {openPopup.rarity_name} ({openPopup.rarity_code})
                  </span>
                </p>
                <p className="mt-1 text-sm text-slate-200">
                  Hadiah:{" "}
                  <span className="font-semibold text-amber-200">
                    {openPopup.reward_label}
                  </span>
                  {openPopup.reward_type === "CASH" &&
                    ` (${formatRupiah(openPopup.reward_amount)})`}
                </p>
                <p className="mt-3 text-[11px] text-slate-300">
                  Silahkan hubungi Admin / CS untuk klaim hadiah. (Link kontak
                  bisa kamu tambahkan di member site.)
                </p>
                <button
                  onClick={() => setOpenPopup(null)}
                  className="mt-4 rounded-full border border-slate-600/80 bg-slate-900/80 px-5 py-2 text-xs font-semibold text-slate-100 hover:border-amber-400 hover:bg-slate-900 transition"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
