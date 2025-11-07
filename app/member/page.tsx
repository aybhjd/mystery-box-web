"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

/* =========================
   Types
========================= */
type UserRole = "ADMIN" | "CS" | "MEMBER";

type MemberProfile = {
  id: string;
  username: string | null;
  credit_balance: number | null;
  role: UserRole;
};

type PurchaseResult = {
  transaction_id: string;
  credit_tier: number;
  credit_spent: number;
  credits_before?: number | null;
  credits_after?: number | null;
  rarity_id: string;
  rarity_code: string;
  rarity_name: string;
  expires_at: string;
};

type OpenBoxResult = {
  transaction_id: string;
  rarity_id: string;
  rarity_code: string;
  rarity_name: string;
  reward_id: string | null;
  reward_label: string;
  reward_type: "CASH" | "ITEM";
  reward_amount: number | null;
  opened_at: string;
  expires_at: string;
  credits_after?: number | null;
};

type InventoryBox = {
  id: string;
  credit_tier: number;
  status: "PURCHASED" | "OPENED" | "EXPIRED";
  expires_at: string;
  created_at: string;
  rarity_id: string | null;
};

/* =========================
   Helpers
========================= */
function formatDateTime(iso: string) {
  try {
    const d = new Date(iso);
    const dd = d.toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "2-digit" });
    const hh = d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
    return `${dd}, ${hh.replace(":", ".")}`;
  } catch {
    return iso;
  }
}

function formatIDR(n?: number | null) {
  if (n == null) return "—";
  try {
    return new Intl.NumberFormat("id-ID").format(n);
  } catch {
    return String(n);
  }
}

type RarityKey =
  | "COMMON"
  | "RARE"
  | "EPIC"
  | "SUPREME"
  | "LEGENDARY"
  | "SPECIAL_LEGENDARY";

const rarityPalette: Record<
  RarityKey,
  { text: string; from: string; to: string; ring: string }
> = {
  COMMON: { text: "#d9f99d", from: "#245a2c", to: "#0b2a17", ring: "#52d787" },
  RARE: { text: "#cfe8ff", from: "#0f3a7a", to: "#081a3a", ring: "#56ccf2" },
  EPIC: { text: "#f5d0fe", from: "#4a1460", to: "#1a0b2a", ring: "#c471ed" },
  SUPREME: { text: "#fff1b8", from: "#6a5210", to: "#2a2108", ring: "#f7d774" },
  LEGENDARY: { text: "#fff6cc", from: "#6b4a00", to: "#2a1b00", ring: "#f9d976" },
  SPECIAL_LEGENDARY: { text: "#ffffff", from: "#2a0b2a", to: "#0b0b2a", ring: "#ffffff" },
};

function toRarity(key: string): RarityKey {
  const k = (key || "").toUpperCase() as RarityKey;
  return (
    ["COMMON", "RARE", "EPIC", "SUPREME", "LEGENDARY", "SPECIAL_LEGENDARY"] as string[]
  ).includes(k)
    ? (k as RarityKey)
    : "COMMON";
}

function rarityBadgeClasses(colorKey?: string) {
  const base = "text-[10px] font-semibold px-2 py-[2px] rounded-full border";
  switch ((colorKey || "").toLowerCase()) {
    case "green": return `${base} text-green-200 border-green-400/40 bg-green-900/20`;
    case "blue": return `${base} text-sky-200 border-sky-400/40 bg-sky-900/20`;
    case "purple": return `${base} text-fuchsia-200 border-fuchsia-400/40 bg-fuchsia-900/20`;
    case "yellow": return `${base} text-amber-200 border-amber-400/40 bg-amber-900/20`;
    case "gold": return `${base} text-yellow-100 border-yellow-400/50 bg-yellow-900/20`;
    case "rainbow": return `${base} text-white border-white/50 bg-slate-50/5`;
    default: return `${base} text-slate-200 border-slate-400/40 bg-slate-900/40`;
  }
}

function badgeSrcFromCode(code: string) {
  const k = code?.toLowerCase() || "common";
  return `/fantasy/icons/badge_${k}.svg`;
}

/* =========================
   FX Overlay (assets & SFX)
========================= */
type FXBaseProps = {
  open: boolean;
  onClose: () => void;
  palette: { text: string; from: string; to: string; ring: string };
  title: string;
  subtitle?: string;
  rainbowRing?: boolean;
  durationMs?: number;
  chestSrc: string;
  showBadge?: string;
};

function FXOverlay({
  open,
  onClose,
  palette,
  title,
  subtitle,
  rainbowRing = false,
  durationMs = 1700,
  chestSrc,
  showBadge,
}: FXBaseProps) {
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(onClose, durationMs);
    return () => clearTimeout(t);
  }, [open, onClose, durationMs]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] pointer-events-none">
      <div
        className="absolute inset-0"
        style={{
          background:
            `radial-gradient(1200px 600px at 50% 45%, ${palette.from}, ${palette.to} 70%, rgba(0,0,0,0.96) 100%), url('/fantasy/bg.svg') center/cover no-repeat`,
        }}
      />
      <img
        src="/fantasy/chest/chest_glow.svg"
        alt=""
        className="absolute inset-0 w-full h-full object-cover opacity-70"
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
      />
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
      <div className="absolute inset-0 flex items-center justify-center">
        <img
          src={chestSrc}
          alt=""
          className="w-[38vmin] max-w-[420px] drop-shadow-[0_0_18px_rgba(0,0,0,.5)] animate-fx-pop"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
        />
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-[24vmin] h-[24vmin] rounded-full bg-white/25 blur-[40px] animate-fx-burst" />
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="mt-[28vmin] px-6 py-4 rounded-2xl text-center">
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
          {showBadge && (
            <div className="mt-2 flex items-center justify-center animate-fx-pop-delayed">
              <img
                src={showBadge}
                alt="rarity badge"
                className="h-8 opacity-90"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
              />
            </div>
          )}
        </div>
      </div>

      <style jsx global>{`
        @keyframes fx-burst { 0%{transform:scale(.35);opacity:0} 40%{opacity:.75} 100%{transform:scale(1.35);opacity:0} }
        @keyframes fx-rotate-slow { 0%{transform:rotate(0)} 100%{transform:rotate(360deg)} }
        @keyframes fx-pop { 0%{transform:translateY(8px) scale(.98);opacity:0} 40%{opacity:1} 100%{transform:translateY(0) scale(1);opacity:1} }
        @keyframes fx-pop-delayed { 0%{transform:translateY(8px);opacity:0} 50%{opacity:1} 100%{transform:translateY(0);opacity:1} }
        .animate-fx-burst { animation: fx-burst 1.2s ease-out both }
        .animate-fx-rotate-slow { animation: fx-rotate-slow 6s linear infinite }
        .animate-fx-pop { animation: fx-pop .6s ease both }
        .animate-fx-pop-delayed { animation: fx-pop-delayed .9s ease .15s both }
      `}</style>
    </div>
  );
}

function PurchaseRarityFX({
  open,
  rarityCode,
  rarityName,
  onClose,
}: { open: boolean; rarityCode: string; rarityName: string; onClose: () => void; }) {
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
      durationMs={1700}
      chestSrc="/fantasy/chest/chest_closed.svg"
      showBadge={badgeSrcFromCode(rarityCode)}
    />
  );
}

function OpenRewardFX({
  open,
  rarityCode,
  rarityName,
  rewardLabel,
  rewardType,
  rewardAmount,
  onClose,
}: {
  open: boolean;
  rarityCode: string;
  rarityName: string;
  rewardLabel: string;
  rewardType: string;
  rewardAmount: number | null;
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
      durationMs={1800}
      chestSrc="/fantasy/chest/chest_open.svg"
      showBadge={badgeSrcFromCode(rarityCode)}
    />
  );
}

/* =========================
   Aurora BG + shimmer
========================= */
function AuroraLayer() {
  return (
    <div className="absolute inset-0 z-0 pointer-events-none">
      {/* Grid bintang (di paling bawah) */}
      <div className="absolute inset-0 opacity-[0.06] bg-[radial-gradient(circle_at_1px_1px,white_1px,transparent_1px)] [background-size:24px_24px]" />

      {/* Aurora blobs — lebih besar & terang */}
      <div
        className="absolute -top-40 -left-48 w-[70rem] h-[70rem] rounded-full blur-[180px] opacity-80"
        style={{ background: "radial-gradient(closest-side, #8b5cf2aa, transparent 70%)" }}
      />
      <div
        className="absolute -top-32 right-[-10rem] w-[64rem] h-[64rem] rounded-full blur-[180px] opacity-70"
        style={{ background: "radial-gradient(closest-side, #22d3eeaa, transparent 70%)" }}
      />
      <div
        className="absolute bottom-[-14rem] left-1/3 w-[72rem] h-[72rem] rounded-full blur-[200px] opacity-65"
        style={{ background: "radial-gradient(closest-side, #f59e0baa, transparent 70%)" }}
      />

      {/* Sapu vertikal halus */}
      <div
        className="absolute inset-x-0 top-24 h-[32rem] opacity-35"
        style={{
          background:
            "linear-gradient(115deg, transparent 20%, rgba(139,92,246,.20) 40%, rgba(34,211,238,.18) 60%, transparent 80%)",
          filter: "blur(24px)",
        }}
      />
    </div>
  );
}

function Modal({
  open, onClose, title, children, widthClass = "max-w-md"
}: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; widthClass?: string; }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className={`relative w-full ${widthClass} mx-4 rounded-2xl border border-slate-700/70 bg-slate-950/90 backdrop-blur p-4`}>
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-semibold text-slate-200">{title}</div>
          <button onClick={onClose} className="text-xs px-2 py-1 rounded-md border border-slate-600/60 hover:bg-slate-800/60">
            Tutup
          </button>
        </div>
        <div className="text-sm text-slate-300">{children}</div>
      </div>
    </div>
  );
}

/* =========================
   Page
========================= */
export default function MemberHomePage() {
  const [tierInfo, setTierInfo] = useState<{open:boolean; tier?: number; rows?: Array<{ code:string; name:string; color_key:string; prob:number; sort?:number }>}>({open:false});
  const [rarityInfo, setRarityInfo] = useState<{open:boolean; rarityId?:string; title?:string; rows?: Array<{ label:string; display:string; prob:number }>}>({open:false});

  const loadTierInfo = async (tier: number) => {
    const { data, error } = await supabase
      .from("box_credit_rarity_probs")
      .select("rarity_id, gimmick_probability, is_active, credit_tier")
      .eq("credit_tier", tier)
      .eq("is_active", true);
    if (error) { setTierInfo({open:true, tier, rows:[]}); return; }
    const rows = (data ?? []).map(r => {
      const rar = rarityMap[r.rarity_id] || { code:"?", name:"?", color_key:"", sort_order:999 };
      return { code: rar.code, name: rar.name, color_key: rar.color_key, prob: (r as any).gimmick_probability ?? 0, sort: rar.sort_order };
    });
    // urut dari langka → umum (sort_order makin besar = makin umum di datamu)
    rows.sort((a,b) => (a.sort ?? 0) - (b.sort ?? 0));
    setTierInfo({ open:true, tier, rows });
  };

  const loadRarityInfo = async (rarityId: string) => {
    const rar = rarityMap[rarityId];
    const { data, error } = await supabase
      .from("box_rewards")
      .select("label, reward_type, amount, gimmick_probability, is_active")
      .eq("rarity_id", rarityId)
      .eq("is_active", true);
    if (error) { setRarityInfo({open:true, rows:[], title: rar ? `Drop ${rar.name}` : "Drop Reward"}); return; }
    const rows = (data ?? []).map(r => ({
      label: r.label,
      display: r.reward_type === "CASH" && r.amount != null ? `${r.label} (Rp ${new Intl.NumberFormat('id-ID').format(Number(r.amount))})` : r.label,
      prob: (r as any).gimmick_probability ?? 0,
    })).sort((a,b) => b.prob - a.prob);
    setRarityInfo({ open:true, rarityId, title: rar ? `Drop ${rar.name}` : "Drop Reward", rows });
  };
  const router = useRouter();

  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [infoType, setInfoType] = useState<"success" | "error" | null>(null);

  const [inventory, setInventory] = useState<InventoryBox[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [inventoryError, setInventoryError] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);

  const [lastPurchase, setLastPurchase] = useState<PurchaseResult | null>(null);
  const [lastOpened, setLastOpened] = useState<OpenBoxResult | null>(null);

  const [rarityMap, setRarityMap] = useState<Record<string, { code: string; name: string; color_key: string }>>({});

  // SFX
  const sfxClick = useRef<HTMLAudioElement | null>(null);
  const sfxWhoosh = useRef<HTMLAudioElement | null>(null);
  const sfxRumble = useRef<HTMLAudioElement | null>(null);
  const sfxReveal = useRef<HTMLAudioElement | null>(null);
  const sfxCoin = useRef<HTMLAudioElement | null>(null);
  const sfxError = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    sfxClick.current = new Audio("/fantasy/sfx/ui_click.wav");
    sfxWhoosh.current = new Audio("/fantasy/sfx/whoosh_buy.wav");
    sfxRumble.current = new Audio("/fantasy/sfx/chest_rumble.wav");
    sfxReveal.current = new Audio("/fantasy/sfx/reveal_burst.wav");
    sfxCoin.current = new Audio("/fantasy/sfx/coin_sparkle.wav");
    sfxError.current = new Audio("/fantasy/sfx/error_buzz.wav");
  }, []);

  const play = (ref: React.MutableRefObject<HTMLAudioElement | null>, delay = 0) => {
    const a = ref.current;
    if (!a) return;
    const run = () => { try { a.currentTime = 0; a.play().catch(() => {}); } catch {} };
    delay ? setTimeout(run, delay) : run();
  };

  // auth & profile
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) { router.push("/login"); return; }
      const { data: p, error } = await supabase
        .from("profiles")
        .select("id, username, credit_balance, role")
        .eq("id", userData.user.id)
        .single();
      if (error || !p) { setInfoType("error"); setInfoMessage("Gagal membaca profil member."); setLoading(false); return; }
      if (p.role !== "MEMBER") { router.push("/"); return; }
      if (!alive) return;
      setProfile(p);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [router]);

  // rarity map
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error } = await supabase
        .from("box_rarities")
        .select("id, code, name, color_key, sort_order");
      if (!error && data && alive) {
        const map = Object.fromEntries(
          data.map(r => [r.id, { code: r.code, name: r.name, color_key: r.color_key, sort_order: r.sort_order }])
        );
        setRarityMap(map as any);
      }
    })();
    return () => { alive = false; };
  }, []);

  const nowIso = useMemo(() => new Date().toISOString(), []);

  // inventory
  const reloadInventory = async (memberId: string) => {
    setInventoryLoading(true);
    setInventoryError(null);
    const { data, error } = await supabase
      .from("box_transactions")
      .select("id, credit_tier, status, expires_at, created_at, rarity_id")
      .eq("member_profile_id", memberId)
      .eq("status", "PURCHASED")
      .gt("expires_at", nowIso)
      .order("created_at", { ascending: false });
    if (error) { setInventoryError("Gagal membaca inventory box."); setInventoryLoading(false); return; }
    setInventory((data ?? []) as any);
    setInventoryLoading(false);
  };

  useEffect(() => { if (profile?.id) reloadInventory(profile.id); }, [profile?.id]); // eslint-disable-line

  // overlays
  const [fxPurchase, setFxPurchase] = useState<{ code: string; name: string } | null>(null);
  const [fxOpen, setFxOpen] = useState<{
    rarity_code: string; rarity_name: string; reward_label: string; reward_type: string; reward_amount: number | null;
  } | null>(null);

  // purchase
  const handlePurchase = async (tier: 1 | 2 | 3) => {
    if (!profile) return;
    setInfoMessage(null); setInfoType(null);
    play(sfxClick);
    const { data, error } = await supabase.rpc("purchase_box", { p_credit_tier: tier });
    if (error || !data || !Array.isArray(data) || data.length === 0) {
      setInfoType("error"); setInfoMessage(error?.message || "Gagal membeli box."); play(sfxError); return;
    }
    const result = data[0] as PurchaseResult;

    if (typeof result.credits_after === "number") {
      setProfile(p => (p ? { ...p, credit_balance: result.credits_after ?? p.credit_balance } : p));
    } else {
      const { data: p } = await supabase.from("profiles").select("id, username, credit_balance, role").eq("id", profile.id).single();
      if (p) setProfile(p as any);
    }

    setLastPurchase(result);
    setFxPurchase({ code: result.rarity_code, name: result.rarity_name });
    play(sfxWhoosh);

    await reloadInventory(profile.id);
  };

  // open
  const handleOpenBox = async (box: InventoryBox) => {
    if (!profile) return;
    setOpeningId(box.id);
    setInfoMessage(null); setInfoType(null);
    play(sfxClick);

    const { data, error } = await supabase.rpc("open_box", { p_transaction_id: box.id });
    if (error || !data || data.length === 0) {
      setInfoType("error"); setInfoMessage(error?.message || "Gagal membuka box."); play(sfxError);
      setOpeningId(null); return;
    }
    const result = data[0] as OpenBoxResult;

    play(sfxRumble);
    play(sfxReveal, 250);
    if (result.reward_type === "CASH") play(sfxCoin, 520);

    setFxOpen({
      rarity_code: result.rarity_code,
      rarity_name: result.rarity_name,
      reward_label: result.reward_label,
      reward_type: result.reward_type,
      reward_amount: result.reward_amount ?? null,
    });

    setInventory(prev => prev.filter(i => i.id !== box.id));
    if (typeof result.credits_after === "number") {
      setProfile(p => (p ? { ...p, credit_balance: result.credits_after ?? p.credit_balance } : p));
    }
    setOpeningId(null);
    setLastOpened(result);
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 text-slate-100 p-6">
        <div className="max-w-5xl mx-auto">Memuat...</div>
      </main>
    );
  }
  if (!profile) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 text-slate-100 p-6">
        <div className="max-w-5xl mx-auto">Tidak bisa membaca profil.</div>
      </main>
    );
  }

  /* Tier styles for cards */
  const tierStyles: Record<number, {
    frameFrom: string; frameTo: string; btnFrom: string; btnTo: string; glow: string; ribbon: string;
  }> = {
    1: {
      frameFrom: "#8b5cf2AA", frameTo: "#22d3ee33",
      btnFrom: "#8b5cf2", btnTo: "#a78bfa",
      glow: "shadow-[0_10px_32px_-8px_rgba(139,92,246,.35)]",
      ribbon: "from-violet-400/80 to-cyan-300/70"
    },
    2: {
      // frame gradasi crimson → magenta (beda banget dari oranye Tier 3)
      frameFrom: "#f43f5eAA", frameTo: "#ec4899AA",
      // tombol merah → magenta
      btnFrom: "#f43f5e", btnTo: "#ec4899",
      glow: "shadow-[0_10px_32px_-8px_rgba(236,72,153,.35)]",
      // ribbon rose → fuchsia (bukan amber)
      ribbon: "from-rose-300/90 to-fuchsia-300/85",
    },
    3: {
      frameFrom: "#f97316AA", frameTo: "#f59e0b88",
      btnFrom: "#f97316", btnTo: "#f59e0b",
      glow: "shadow-[0_10px_32px_-8px_rgba(245,158,11,.40)]",
      ribbon: "from-amber-300/90 to-pink-300/80"
    }
  };

  return (
    <main className="relative min-h-screen bg-[radial-gradient(1400px_700px_at_50%_-10%,#0b1220_0%,#090f1a_55%,#070b13_100%)] text-slate-100 overflow-x-hidden">
      {/* Aurora (z-0) + content (z-10) supaya pasti terlihat */}
      <div className="relative">
        <AuroraLayer />
        <div className="relative z-10 max-w-5xl mx-auto px-4 py-8">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[8px] tracking-[0.28em] uppercase text-slate-400">MEMBER SITE</div>

              <h1
                className="mt-1 text-4xl md:text-5xl font-extrabold tracking-widest leading-none bg-clip-text text-transparent
                           [background-size:200%_100%] animate-[shimmer_7s_linear_infinite]"
                style={{
                  backgroundImage:
                    "linear-gradient(90deg,#a78bfa 0%,#f472b6 35%,#fde68a 75%,#a78bfa 100%)",
                }}
              >
                MYSTERY BOX
              </h1>

              <p className="mt-2 text-sm text-slate-300/80">
                Buka BOX, kejar hadiah Langka, dan claim hadiahmu.
              </p>

              <div className="mt-4 h-[2px] w-44 rounded-full bg-gradient-to-r from-fuchsia-400/80 via-amber-300/90 to-transparent shadow-[0_0_18px_rgba(249,115,22,.35)]" />
            </div>

            <div className="flex flex-col items-end gap-2">
              <div className="text-xs text-slate-400 text-right w-full">Login sebagai</div>
              <div className="px-2 py-[2px] rounded-lg border border-slate-600/60 bg-slate-900/40 backdrop-blur">
                <span className="text-emerald-300 font-semibold">{profile.username || "member"}</span>
                <span className="ml-2 text-emerald-400/90">{formatIDR(profile.credit_balance)} credit</span>
              </div>
              <button
                onClick={async () => { await supabase.auth.signOut(); router.push("/login"); }}
                className="text-xs rounded-md border border-slate-600/60 px-2 py-1 hover:bg-slate-800/50"
              >
                Logout
              </button>
            </div>
          </div>

          {/* Cards */}
          <div className="grid md:grid-cols-3 gap-4 mt-8">
            {[1, 2, 3].map((tier) => {
              const s = tierStyles[tier];
              return (
                <div key={tier}
                  className="group relative rounded-2xl p-[2px]"
                  style={{ background: `linear-gradient(180deg, ${s.frameFrom}, ${s.frameTo})` }}
                >
                  <div className="rounded-2xl border border-slate-700/60 bg-slate-950/80 p-4 group-hover:shadow-[0_0_0_1px_rgba(255,255,255,.08)] transition-shadow">
                    {/* Ribbon */}
                    <div className={`inline-flex items-center gap-1 rounded-full text-[10px] px-2 py-[2px] font-semibold
                                    bg-gradient-to-r ${s.ribbon} text-slate-900`}>
                      {tier === 1 ? "TIER 1 • Starter" : tier === 2 ? "TIER 2 • Advance" : "TIER 3 • Elite"}
                    </div>

                    <img src="/fantasy/chest/chest_glow.svg" alt="" className="absolute -top-6 -left-6 w-16 opacity-30 pointer-events-none" />
                    <div className="mt-2 text-lg font-semibold">Box {tier} Credit</div>
                    <p className="text-xs text-slate-400 mt-1">
                      {tier === 1 && "Minimal dapat Common. Cocok buat coba peruntungan."}
                      {tier === 2 && "Start dari Rare ke atas. Common tidak mungkin keluar."}
                      {tier === 3 && "Start dari Epic ke atas. Common & Rare tidak mungkin keluar."}
                    </p>

                    <button
                      onClick={() => { play(sfxClick); handlePurchase(tier as 1 | 2 | 3); }}
                      className={`mt-4 w-full rounded-full text-black font-semibold py-2 ${s.glow}`}
                      style={{
                        background: `linear-gradient(90deg, ${s.btnFrom}, ${s.btnTo})`,
                      }}
                    >
                      Beli Box {tier} Credit
                    </button>
                    {/* Ikon box – klik untuk lihat Drop Info tier */}
                    <button
                      type="button"
                      onClick={() => loadTierInfo(tier)}
                      className="absolute right-3 -bottom-4 md:right-4 md:bottom-4 rounded-xl bg-slate-950/70 border border-slate-700/60 p-2 hover:bg-slate-900/80"
                      aria-label="Lihat Drop Info"
                    >
                      <img src="/fantasy/chest/chest_closed.svg" alt="" className="w-12 md:w-14 drop-shadow-[0_6px_18px_rgba(0,0,0,.45)]" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Only error notification */}
          {infoType === "error" && infoMessage && (
            <div className="mt-4 rounded-lg px-3 py-2 text-sm bg-rose-500/10 border border-rose-500/30 text-rose-200">
              {infoMessage}
            </div>
          )}

          {/* Inventory */}
          <div className="mt-8 rounded-2xl border border-slate-700/70 bg-slate-950/70 backdrop-blur">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/70">
              <div className="text-sm font-semibold text-slate-200">Inventory Box Kamu</div>
              <div className="text-xs text-slate-400">{inventory.length} box menunggu dibuka</div>
            </div>

            {inventoryLoading ? (
              <div className="px-4 py-6 text-sm text-slate-400">Memuat inventory…</div>
            ) : inventoryError ? (
              <div className="px-4 py-6 text-sm text-rose-300">{inventoryError}</div>
            ) : inventory.length === 0 ? (
              <div className="px-4 py-6 text-sm text-slate-400">Belum ada box.</div>
            ) : (
              <ul className="divide-y divide-slate-800/70">
                {inventory.map((box) => {
                  const rar = box.rarity_id ? rarityMap[box.rarity_id] : undefined;
                  return (
                    <li key={box.id} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-900/40">
                      <div>
                        <p className="text-xs font-semibold text-slate-100 flex items-center gap-2">
                          Box {box.credit_tier} Credit
                          {rar && <span className={rarityBadgeClasses(rar.color_key)}>{rar.name}</span>}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          Kadaluarsa: <span className="font-medium">{formatDateTime(box.expires_at)}</span>
                        </p>
                      </div>
                      {box.rarity_id && (
                        <button
                          onClick={() => loadRarityInfo(box.rarity_id!)}
                          className="mr-2 rounded-full border border-slate-600/60 px-3 py-1 text-[11px] hover:bg-slate-800/50"
                        >
                          Info
                        </button>
                      )}
                      <button
                        onClick={() => handleOpenBox(box)}
                        disabled={openingId === box.id}
                        className="rounded-full bg-amber-500 hover:bg-amber-400 text-black text-[12px] font-semibold px-3 py-1.5 disabled:opacity-60 shadow-[0_8px_24px_-6px_rgba(245,158,11,.45)]"
                      >
                        {openingId === box.id ? "Membuka…" : "Buka Box"}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Pembelian Terakhir */}
          {(lastPurchase || lastOpened) && (
            <div className="mt-6 rounded-2xl border border-slate-700/70 bg-slate-950/70 p-4">
              <div className="text-sm font-semibold text-slate-200 mb-2">Pembelian Terakhir</div>
              {lastPurchase ? (
                <div className="text-xs text-slate-300">
                  Box {lastPurchase.credit_tier} credit, rarity{" "}
                  <span className="font-semibold">{lastPurchase.rarity_name} ({lastPurchase.rarity_code})</span>.
                  <div className="mt-1 text-slate-400">
                    Credit sebelum beli: <span className="font-medium">{formatIDR(lastPurchase.credits_before)}</span> •
                    setelah beli: <span className="font-medium">{formatIDR(lastPurchase.credits_after)}</span>
                  </div>
                  <div className="text-slate-400">
                    Box ini bisa dibuka sampai <span className="font-medium">{formatDateTime(lastPurchase.expires_at)}</span>.
                  </div>
                </div>
              ) : (
                <div className="text-xs text-slate-400">—</div>
              )}

              {lastOpened && (
                <>
                  <div className="mt-4 text-sm font-semibold text-slate-200">Box Terakhir Dibuka</div>
                  <div className="text-xs text-slate-300">
                    Rarity {lastOpened.rarity_name} • Hadiah <span className="font-semibold">{lastOpened.reward_label}</span>
                    {lastOpened.reward_type === "CASH" && <> (+{formatIDR(lastOpened.reward_amount)} saldo)</>}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* POPUP: Drop Info by Tier */}
      <Modal open={tierInfo.open} onClose={() => setTierInfo({open:false})} title={`Drop Info • Box ${tierInfo.tier ?? ""} Credit`}>
        {(!tierInfo.rows || tierInfo.rows.length === 0) ? (
          <div className="text-slate-400 text-sm">Belum ada data.</div>
        ) : (
          <ul className="space-y-2">
            {tierInfo.rows.map((r, idx) => (
              <li key={idx} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={rarityBadgeClasses(r.color_key)}>{r.name}</span>
                </div>
                <div className="font-semibold">{r.prob}%</div>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 text-[11px] text-slate-500">* Angka ini untuk tampilan (gimmick). RNG asli menggunakan real_probability.</div>
      </Modal>

      {/* POPUP: Drop Info by Rarity (inventory) */}
      <Modal open={rarityInfo.open} onClose={() => setRarityInfo({open:false})} title={rarityInfo.title ?? "Drop Reward"}>
        {(!rarityInfo.rows || rarityInfo.rows.length === 0) ? (
          <div className="text-slate-400 text-sm">Belum ada data.</div>
        ) : (
          <ul className="space-y-2">
            {rarityInfo.rows.map((r, idx) => (
              <li key={idx} className="flex items-center justify-between">
                <div>{r.display}</div>
                <div className="font-semibold">{r.prob}%</div>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 text-[11px] text-slate-500">* Angka ini untuk tampilan (gimmick). RNG asli menggunakan real_probability.</div>
      </Modal>

      {/* FX Overlays */}
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

      {/* shimmer keyframes */}
      <style jsx global>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </main>
  );
}
