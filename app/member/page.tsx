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

// ==== Fantasy FX (Starter Pack, no assets) ==================================

type RarityKey =
  | "COMMON"
  | "RARE"
  | "EPIC"
  | "SUPREME"
  | "LEGENDARY"
  | "SPECIAL_LEGENDARY";

const rarityPalette: Record<RarityKey, {
  text: string;
  from: string; // radial center
  to: string;   // radial edge
  ring: string; // ring accent
}> = {
  COMMON:           { text: "#d9f99d", from: "#245a2c", to: "#0b2a17", ring: "#52d787" },
  RARE:             { text: "#cfe8ff", from: "#0f3a7a", to: "#081a3a", ring: "#56ccf2" },
  EPIC:             { text: "#f5d0fe", from: "#4a1460", to: "#1a0b2a", ring: "#c471ed" },
  SUPREME:          { text: "#fff1b8", from: "#6a5210", to: "#2a2108", ring: "#f7d774" },
  LEGENDARY:        { text: "#fff6cc", from: "#6b4a00", to: "#2a1b00", ring: "#f9d976" },
  SPECIAL_LEGENDARY:{ text: "#ffffff", from: "#2a0b2a", to: "#0b0b2a", ring: "#ffffff" },
};

function toRarity(key: string): RarityKey {
  const k = (key || "").toUpperCase() as RarityKey;
  return (["COMMON","RARE","EPIC","SUPREME","LEGENDARY","SPECIAL_LEGENDARY"] as string[]).includes(k)
    ? (k as RarityKey)
    : "COMMON";
}

function formatIDR(n?: number | null) {
  if (n == null) return "—";
  try {
    return new Intl.NumberFormat("id-ID").format(n);
  } catch { return String(n); }
}

// --- Overlay base ---
type FXBaseProps = {
  open: boolean;
  onClose: () => void;
  palette: ReturnType<typeof toRarity> extends never ? never : { text: string; from: string; to: string; ring: string };
  title: string;
  subtitle?: string;
  rainbowRing?: boolean;
  durationMs?: number;
};

function FXOverlay({
  open, onClose, palette, title, subtitle, rainbowRing=false, durationMs=1600
}: FXBaseProps) {
  // auto close
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(onClose, durationMs);
    return () => clearTimeout(t);
  }, [open, onClose, durationMs]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] pointer-events-none">
      {/* backdrop glow */}
      <div
        className="absolute inset-0 animate-fx-fade"
        style={{
          background:
            `radial-gradient(1200px 600px at 50% 45%, ${palette.from}, ${palette.to} 70%, rgba(0,0,0,0.96) 100%)`,
        }}
      />
      {/* swirling ring */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div
          className="w-[68vmin] h-[68vmin] rounded-full blur-[2px] opacity-90 animate-fx-rotate-slow"
          style={{
            background: rainbowRing
              ? "conic-gradient(from 0deg, #ff005e, #ff9a00, #f7f700, #00e91d, #00e5ff, #7a5cff, #ff00e7, #ff005e)"
              : `conic-gradient(from 0deg, transparent 30%, ${palette.ring}, transparent 70%)`,
            maskImage: "radial-gradient(circle, transparent 60%, black 60%)",
          }}
        />
      </div>
      {/* burst */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-[22vmin] h-[22vmin] rounded-full bg-white/30 blur-[30px] animate-fx-burst" />
      </div>
      {/* title */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="px-6 py-4 rounded-2xl text-center">
          <div
            className="text-4xl md:text-5xl font-extrabold tracking-wide drop-shadow-[0_0_12px_rgba(255,255,255,.35)] animate-fx-pop"
            style={{ color: palette.text }}
          >
            {title}
          </div>
          {subtitle && (
            <div className="mt-1 text-base md:text-lg text-slate-200/90 animate-fx-pop-delayed">
              {subtitle}
            </div>
          )}
        </div>
      </div>

      {/* inline keyframes so tailwind config tak perlu diubah */}
      <style jsx global>{`
        @keyframes fx-fade { 0%{opacity:0} 12%{opacity:1} 88%{opacity:1} 100%{opacity:0} }
        @keyframes fx-burst { 0%{transform:scale(.35);opacity:.0} 40%{opacity:.75} 100%{transform:scale(1.35);opacity:0} }
        @keyframes fx-rotate-slow { 0%{transform:rotate(0)} 100%{transform:rotate(360deg)} }
        @keyframes fx-pop { 0%{transform:translateY(8px) scale(.98);opacity:0}
                             40%{opacity:1}
                             100%{transform:translateY(0) scale(1);opacity:1} }
        @keyframes fx-pop-delayed { 0%{transform:translateY(8px);opacity:0}
                                    50%{opacity:1}
                                    100%{transform:translateY(0);opacity:1} }
        .animate-fx-fade{animation:fx-fade 1.6s ease both}
        .animate-fx-burst{animation:fx-burst 1.2s ease-out both}
        .animate-fx-rotate-slow{animation:fx-rotate-slow 6s linear infinite}
        .animate-fx-pop{animation:fx-pop .6s ease both}
        .animate-fx-pop-delayed{animation:fx-pop-delayed .9s ease .15s both}
      `}</style>
    </div>
  );
}

// --- Specific overlays ---
function PurchaseRarityFX({ open, rarityCode, rarityName, onClose }:{
  open: boolean; rarityCode: string; rarityName: string; onClose: () => void;
}) {
  const pal = rarityPalette[toRarity(rarityCode)];
  const isRainbow = toRarity(rarityCode) === "SPECIAL_LEGENDARY";
  return (
    <FXOverlay
      open={open}
      onClose={onClose}
      palette={pal}
      rainbowRing={isRainbow}
      title={rarityName.toUpperCase()}
      subtitle="Rarity Ditemukan!"
      durationMs={1600}
    />
  );
}

function OpenRewardFX({ open, rarityCode, rarityName, rewardLabel, rewardType, rewardAmount, onClose }:{
  open: boolean; rarityCode: string; rarityName: string;
  rewardLabel: string; rewardType: string; rewardAmount: number | null;
  onClose: () => void;
}) {
  const pal = rarityPalette[toRarity(rarityCode)];
  const value = rewardType === "CASH" ? `+${formatIDR(rewardAmount)} saldo` : rewardLabel;
  const isRainbow = toRarity(rarityCode) === "SPECIAL_LEGENDARY";
  return (
    <FXOverlay
      open={open}
      onClose={onClose}
      palette={pal}
      rainbowRing={isRainbow}
      title={rewardLabel}
      subtitle={`Hadiah • ${rarityName} • ${value}`}
      durationMs={1700}
    />
  );
}
// ==== End Fantasy FX =========================================================

export default function MemberHomePage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [buyingTier, setBuyingTier] = useState<number | null>(null);
  const [lastPurchase, setLastPurchase] = useState<PurchaseResult | null>(
    null,
  );

  // FX states (starter pack)
  const [fxPurchase, setFxPurchase] = useState<{ code: string; name: string } | null>(null);
  const [fxOpen, setFxOpen] = useState<{
    rarity_code: string; rarity_name: string; reward_label: string; reward_type: string; reward_amount: number | null;
  } | null>(null);

  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [infoType, setInfoType] = useState<"success" | "error" | null>(
    null,
  );

  // inventory box yang belum dibuka
  const [inventory, setInventory] = useState<InventoryBox[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [inventoryError, setInventoryError] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [lastOpened, setLastOpened] = useState<OpenedBoxInfo | null>(null);

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
          "id, credit_tier, status, expires_at, created_at",
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

  function showInfo(msg: string, type: "success" | "error") {
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

      // trigger rarity reveal FX
      setFxPurchase({ code: result.rarity_code, name: result.rarity_name });

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

      // trigger reward reveal FX
      setFxOpen({
        rarity_code: result.rarity_code,
        rarity_name: result.rarity_name,
        reward_label: result.reward_label,
        reward_type: result.reward_type,
        reward_amount: result.reward_amount ?? null,
      });

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

        {/* Kartu box (beli) */}
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

        {/* Inventory box */}
        <section className="mt-4 rounded-2xl border border-slate-700 bg-slate-900/80 p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold">
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
            <p className="rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-[11px] text-red-200">
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
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-700/70 bg-slate-950/80 px-3 py-3"
                >
                  <div>
                    <p className="text-xs font-semibold text-slate-100">
                      Box {box.credit_tier} Credit
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Kadaluarsa:{" "}
                      <span className="font-medium">
                        {formatDateTime(box.expires_at)}
                      </span>
                    </p>
                  </div>
                  <button
                    onClick={() => handleOpenBox(box)}
                    disabled={openingId === box.id}
                    className="rounded-xl bg-amber-400 px-3 py-2 text-[11px] font-semibold text-slate-950 hover:bg-amber-300 disabled:opacity-60 disabled:cursor-not-allowed transition"
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
          <section className="mt-4 rounded-2xl border border-slate-700 bg-slate-900/80 p-4 space-y-2">
            <h2 className="text-sm font-semibold">
              Pembelian Terakhir
            </h2>
            <p className="text-xs text-slate-300">
              Box{" "}
              <span className="font-semibold">
                {lastPurchase.credit_tier}
              </span>{" "}
              credit, rarity{" "}
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
                {formatDateTime(lastPurchase.expires_at)}
              </span>
              .
            </p>
            <p className="text-[11px] text-slate-500">
              (Inventory & tombol buka box tersedia di bagian atas.)
            </p>
          </section>
        )}

        {/* Box terakhir dibuka */}
        {lastOpened && (
          <section className="mt-2 rounded-2xl border border-amber-500/70 bg-amber-950/40 p-4 space-y-2">
            <h2 className="text-sm font-semibold text-amber-100">
              Box Terakhir Dibuka
            </h2>
            <p className="text-xs text-amber-100">
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
            <p className="text-xs text-amber-100">
              Hadiah:{" "}
              <span className="font-semibold">
                {lastOpened.reward_label}
              </span>
              {lastOpened.reward_type === "CASH" &&
                ` (Rp ${lastOpened.reward_amount.toLocaleString(
                  "id-ID",
                )})`}
            </p>
            <p className="text-[11px] text-amber-200">
              Dibuka pada{" "}
              <span className="font-semibold">
                {formatDateTime(lastOpened.opened_at)}
              </span>
              .
            </p>
            <p className="text-[11px] text-amber-200">
              Setelah ini, hadiah akan ditindaklanjuti oleh Admin / CS via
              kontak yang disediakan di member site.
            </p>
          </section>
        )}
      </div>
      {/* === Fantasy FX Overlays (Starter Pack) === */}
      <PurchaseRarityFX
        open={!!fxPurchase}
        rarityCode={fxPurchase?.code ?? ""}
        rarityName={fxPurchase?.name ?? ""}
        onClose={() => setFxPurchase(null)}
      />

      <OpenRewardFX
        open={!!fxOpen}
        rarityCode={fxOpen?.rarity_code ?? ""}
        rarityName={fxOpen?.rarity_name ?? ""}
        rewardLabel={fxOpen?.reward_label ?? ""}
        rewardType={fxOpen?.reward_type ?? ""}
        rewardAmount={fxOpen?.reward_amount ?? null}
        onClose={() => setFxOpen(null)}
      />
    </main>
  );
}
