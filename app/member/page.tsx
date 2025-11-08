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
  try { return new Intl.NumberFormat("id-ID").format(n); } catch { return String(n); }
}

function clamp(n: number, a: number, b: number) { return Math.max(a, Math.min(b, n)); }
function rnd(min: number, max: number) { return Math.random() * (max - min) + min; }

type RarityKey = "COMMON" | "RARE" | "EPIC" | "SUPREME" | "LEGENDARY" | "SPECIAL_LEGENDARY";

const rarityPalette: Record<RarityKey, { text: string; from: string; to: string; ring: string }> = {
  COMMON: { text: "#d9f99d", from: "#245a2c", to: "#0b2a17", ring: "#52d787" },
  RARE: { text: "#cfe8ff", from: "#0f3a7a", to: "#081a3a", ring: "#56ccf2" },
  EPIC: { text: "#f5d0fe", from: "#4a1460", to: "#1a0b2a", ring: "#c471ed" },
  SUPREME: { text: "#fff1b8", from: "#6a5210", to: "#2a2108", ring: "#f7d774" },
  // Legendary → merah
  LEGENDARY: { text: "#fecaca", from: "#7f1d1d", to: "#2a0b0b", ring: "#ef4444" },
  // Special Legendary → white core; gradient accents ditangani di badge
  SPECIAL_LEGENDARY: { text: "#ffffff", from: "#1a1026", to: "#100a1a", ring: "#ffffff" },
};
function toRarity(key: string): RarityKey {
  const k = (key || "").toUpperCase() as RarityKey;
  return (["COMMON","RARE","EPIC","SUPREME","LEGENDARY","SPECIAL_LEGENDARY"] as string[]).includes(k) ? (k as RarityKey) : "COMMON";
}
function rarityBadgeClasses(colorKey?: string) {
  const base = "text-[10px] font-semibold px-2 py-[2px] rounded-full border";
  switch ((colorKey || "").toLowerCase()) {
    case "green": return `${base} text-green-200 border-green-400/40 bg-green-900/20`;
    case "blue": return `${base} text-sky-200 border-sky-400/40 bg-sky-900/20`;
    case "purple": return `${base} text-fuchsia-200 border-fuchsia-400/40 bg-fuchsia-900/20`;
    case "yellow": return `${base} text-amber-200 border-amber-400/40 bg-amber-900/20`;
    case "gold": return `${base} text-rose-200 border-rose-400/50 bg-rose-900/25`;
    case "rainbow":
      return `${base} border-white/50 bg-slate-900/30 text-transparent bg-clip-text bg-[linear-gradient(90deg,#34d399,#38bdf8,#a78bfa,#facc15,#ef4444)]`;
    default: return `${base} text-slate-200 border-slate-400/40 bg-slate-900/40`;
  }
}
function renderRarityBadge(colorKey?: string, label?: string) {
  const key = (colorKey || "").toLowerCase();

  // Khusus "rainbow": border gradasi + teks gradasi, inner gelap solid (tidak tembus)
  if (key === "rainbow") {
    return (
      // Outer = BORDER gradasi
      <span className="inline-flex rounded-full p-[2px] bg-[linear-gradient(90deg,#34d399,#38bdf8,#a78bfa,#fde047,#fb923c)]">
        {/* Inner = pill GELAP solid (jangan pakai /opacity) */}
        <span className="rounded-full bg-slate-950 px-2 py-[2px] text-[10px] font-semibold ring-1 ring-white/10 isolate">
          {/* Teks saja yang gradasi */}
          <span className="font-bold bg-clip-text text-transparent bg-[linear-gradient(90deg,#34d399,#38bdf8,#a78bfa,#fde047,#fb923c)]">
            {label ?? "Special Legendary"}
          </span>
        </span>
      </span>
    );
  }

  // Lainnya tetap seperti semula (kelas dari rarityBadgeClasses)
  return <span className={rarityBadgeClasses(colorKey)}>{label}</span>;
}
function badgeSrcFromCode(code: string) {
  const k = code?.toLowerCase() || "common";
  return `/fantasy/icons/badge_${k}.svg`;
}

/* =========================
   Lightweight Modal
========================= */
function Modal({ open, onClose, title, children, widthClass = "max-w-md" }: { open: boolean; onClose: () => void; title: React.ReactNode; children: React.ReactNode; widthClass?: string; }) {
  return (
    <div className={`fixed inset-0 z-[70] transition-opacity duration-150 ${open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"}`} aria-hidden={!open}>
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[92%] ${widthClass} rounded-2xl border border-slate-700/70 bg-slate-950/95 p-4 transition-transform duration-150 ${open ? "scale-100" : "scale-95"}`}>
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-semibold text-slate-200">{title}</div>
          <button onClick={onClose} className="text-xs px-2 py-1 rounded-md border border-slate-600/60 hover:bg-slate-800/60">Tutup</button>
        </div>
        <div className="text-sm text-slate-300">{children}</div>
      </div>
    </div>
  );
}

/* =========================
   DELUXE FX Overlays (mobile-friendly) — staged suspense
========================= */
type FXBaseProps = {
  open: boolean; onClose: () => void;
  palette: { text: string; from: string; to: string; ring: string };
  title: string; subtitle?: string;
  chestNeutralSrc: string;
  chestRevealSrc: string;
  showBadge?: string;
  variant?: "purchase" | "open";
  stagingDurations?: { neutral: number; tease: number; reveal: number }; // ms per fase
};

function FXOverlay({
  open, onClose, palette, title, subtitle, chestNeutralSrc, chestRevealSrc, showBadge, variant = "purchase", stagingDurations
}: FXBaseProps) {
  const NEUTRAL_MS = stagingDurations?.neutral ?? (variant === "open" ? 650 : 520);
  const TEASE_MS   = stagingDurations?.tease   ?? (variant === "open" ? 900 : 820);
  const REVEAL_MS  = stagingDurations?.reveal  ?? (variant === "open" ? 950 : 720);

  const [phase, setPhase] = useState<0 | 1 | 2>(variant === "open" ? 1 : 0); // 0 neutral, 1 tease, 2 reveal
  const [isShaking, setIsShaking] = useState(false);

  useEffect(() => {
    if (!open) return;
    const start = variant === "open" ? 1 : 0; // buka box: mulai dari TEASE
    setPhase(start);
    setIsShaking(false);

    // total waktu menuju REVEAL
    const toReveal = variant === "open" ? TEASE_MS : NEUTRAL_MS + TEASE_MS;

    // mulai goyang sedikit sebelum REVEAL
    const SHAKE_MS = 800;
    const shakeAt = Math.max(0, toReveal - SHAKE_MS);

    const tShake = setTimeout(() => setIsShaking(true), shakeAt);
    const tNext  = setTimeout(() => setPhase(2), toReveal);
    const tClose = setTimeout(onClose, toReveal + REVEAL_MS);

    return () => { clearTimeout(tShake); clearTimeout(tNext); clearTimeout(tClose); };
  }, [open, variant, NEUTRAL_MS, TEASE_MS, REVEAL_MS, onClose]);

  const isNeutral = phase === 0;
  const isTease = phase === 1;
  const isReveal = phase === 2;

  // particles berdasarkan phase (sedikit → banyak)
  const sparks = useMemo(() => {
    if (!open) return [] as { tx: number; ty: number; delay: number; dur: number; size: number }[];
    const count = isNeutral ? 0 : isTease ? 10 : variant === "open" ? 34 : 22;
    const arr: { tx: number; ty: number; delay: number; dur: number; size: number }[] = [];
    for (let i = 0; i < count; i++) {
      const angle = rnd(0, Math.PI * 2);
      const dist = rnd(isTease ? 60 : 80, isTease ? 140 : 200);
      arr.push({ tx: Math.cos(angle) * dist, ty: Math.sin(angle) * dist, delay: Math.floor(rnd(0, 140)), dur: Math.floor(rnd(520, 900)), size: rnd(2, 4) });
    }
    return arr;
  }, [open, isNeutral, isTease, variant]);

  const confetti = useMemo(() => {
    if (!open || !isReveal || variant !== "open") return [] as { x: number; rot: number; delay: number; dur: number; w: number; h: number }[];
    const arr: { x: number; rot: number; delay: number; dur: number; w: number; h: number }[] = [];
    for (let i = 0; i < 26; i++) {
      arr.push({ x: rnd(-140, 140), rot: rnd(-120, 120), delay: Math.floor(rnd(0, 120)), dur: Math.floor(rnd(700, 1100)), w: rnd(4, 8), h: rnd(8, 16) });
    }
    return arr;
  }, [open, isReveal, variant]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[75] overflow-hidden">
      {/* flash hanya ketika transisi ke reveal */}
      {isReveal && <div className="absolute inset-0 pointer-events-none mix-blend-screen bg-white/80 animate-fx-flash" />}

      {/* background tint bertahap */}
      <div className="absolute inset-0"
        style={{
          background: isNeutral
            ? `linear-gradient(180deg, rgba(0,0,0,.78), rgba(0,0,0,.92))`
            : isTease
            ? `linear-gradient(180deg, rgba(0,0,0,.78), rgba(0,0,0,.92)), radial-gradient(700px 380px at 50% 48%, ${palette.from}44, transparent 70%)`
            : `linear-gradient(180deg, rgba(0,0,0,.78), rgba(0,0,0,.92)), radial-gradient(900px 500px at 50% 45%, ${palette.from}, ${palette.to} 70%)`
        }}
      />

      {/* rotating rays muncul di reveal (tease: samar) */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div
          className={`w-[120vmin] h-[120vmin] rounded-full blur-sm ${isNeutral ? 'opacity-0' : isTease ? 'opacity-8 animate-fx-rays-slow' : 'opacity-20 animate-fx-rays'}`}
          style={{ backgroundImage: `repeating-conic-gradient(from 0deg, ${palette.ring} 0deg 3deg, transparent 3deg 12deg)` }}
        />
      </div>

      {/* shockwave hanya di reveal */}
      {isReveal && (
        <>
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-[58vmin] h-[58vmin] rounded-full border-2 border-white/35 shadow-[0_0_120px_20px_rgba(255,255,255,.15)] animate-fx-wave" />
          </div>
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-[42vmin] h-[42vmin] rounded-full border-2 border-[${'${palette.ring}'}]/70 animate-fx-wave-del2" />
          </div>
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-[70vmin] h-[70vmin] rounded-full border border-white/20 animate-fx-wave-del3" />
          </div>
        </>
      )}

      {/* chest: neutral → glow (pulse) → shake → reveal (open) */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className={`relative ${isTease ? 'animate-fx-pulse' : ''}`}>
          <img
            src={isReveal ? chestRevealSrc : chestNeutralSrc}
            className={`w-[40vmin] max-w-[440px] chest-origin will-change-transform
              ${isReveal ? 'animate-fx-pop' : isTease ? 'opacity-95' : 'opacity-100'}
              ${isShaking && !isReveal ? 'animate-fx-shake' : ''}`}
          />
          {/* aura ring tipis saat tease */}
          {isTease && (
            <div className="absolute inset-0 -z-10 flex items-center justify-center pointer-events-none">
              <div className="w-[52vmin] h-[52vmin] rounded-full opacity-50 blur-lg"
                   style={{ background: `radial-gradient(circle, ${palette.ring}33 0%, transparent 60%)` }} />
            </div>
          )}
        </div>
      </div>

      {/* teks & badge */}
      {variant === "open" && isTease && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="mt-[30vmin] px-4 py-2 rounded-lg bg-black/30 border border-white/10
                          text-slate-200/90 text-sm font-medium animate-fx-suspense">
            Box Sedang dibuka…
          </div>
        </div>
      )}
      {isReveal && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="mt-[30vmin] px-6 py-4 rounded-2xl text-center">
            <div className="text-4xl md:text-5xl font-extrabold tracking-wide animate-fx-pop" style={{ color: palette.text }}>{title}</div>
            {subtitle && <div className="mt-1 text-base md:text-lg text-slate-200/90 animate-fx-pop-delayed">{subtitle}</div>}
            {showBadge && (
              <div className="mt-2 flex items-center justify-center animate-fx-pop-delayed">
                <img src={showBadge} alt="badge" className="h-8 opacity-95 drop-shadow-[0_0_12px_rgba(255,255,255,.5)]" />
              </div>
            )}
          </div>
        </div>
      )}

      {/* glints */}
      {!isNeutral && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className={`w-[60vmin] h-[60vmin] rounded-full bg-[radial-gradient(circle,rgba(255,255,255,.18)_0%,rgba(255,255,255,0)_60%)] ${isTease ? 'animate-fx-glint-soft' : 'animate-fx-glint'}`} />
        </div>
      )}

      {/* sparks */}
      <div className="absolute inset-0 pointer-events-none">
        {sparks.map((s, i) => (
          <span key={i}
            className="absolute left-1/2 top-1/2 block rounded-full opacity-0 will-change-transform"
            style={{
              width: `var(--sz)`, height: `var(--sz)`,
              // @ts-ignore
              ["--tx" as any]: `${'${s.tx}'}px`, ["--ty" as any]: `${'${s.ty}'}px`, ["--sz" as any]: `${'${s.size}'}px`,
              ["--dur" as any]: `${'${s.dur}'}ms`, ["--delay" as any]: `${'${s.delay}'}ms`,
              background: `radial-gradient(circle, #fff 0%, ${'${palette.ring}'} 60%, transparent 70%)`,
              boxShadow: "0 0 10px rgba(255,255,255,.25)",
              animation: "fx-spark var(--dur) ease-out var(--delay) both"
            }}
          />
        ))}
      </div>

      {/* confetti hanya reveal OPEN */}
      {isReveal && variant === "open" && (
        <div className="absolute inset-0 pointer-events-none">
          {confetti.map((c, i) => (
            <span key={i}
              className="absolute left-1/2 top-1/2 block origin-center opacity-0 will-change-transform"
              style={{
                // @ts-ignore
                ["--x" as any]: `${'${c.x}'}px`, ["--rot" as any]: `${'${c.rot}'}deg`, ["--dur" as any]: `${'${c.dur}'}ms`, ["--delay" as any]: `${'${c.delay}'}ms`,
                width: `${'${c.w}'}px`, height: `${'${c.h}'}px`,
                background: i % 5 === 0 ? "#fde047" : i % 5 === 1 ? "#60a5fa" : i % 5 === 2 ? "#34d399" : i % 5 === 3 ? "#f472b6" : "#f97316",
                borderRadius: "2px",
                animation: "fx-confetti var(--dur) cubic-bezier(.2,.7,0,1) var(--delay) both",
                boxShadow: "0 0 10px rgba(0,0,0,.25)"
              }}
            />
          ))}
        </div>
      )}

      {/* CSS animations (scoped global) */}
      <style jsx global>{`
        @keyframes fx-flash { 0%{opacity:0} 12%{opacity:.95} 100%{opacity:0} }
        .animate-fx-flash{animation:fx-flash .18s ease-out both}

        @keyframes fx-suspense { 0%{opacity:.25} 50%{opacity:1} 100%{opacity:.25} }
        .animate-fx-suspense{ animation: fx-suspense 1s ease-in-out infinite }

        @keyframes fx-pop { 0%{transform:translateY(8px) scale(.92);opacity:0} 100%{transform:translateY(0) scale(1);opacity:1} }
        @keyframes fx-pop-delayed { 0%{transform:translateY(8px);opacity:0} 100%{transform:translateY(0);opacity:1} }
        .animate-fx-pop{animation:fx-pop .28s ease both}
        .animate-fx-pop-delayed{animation:fx-pop-delayed .4s ease .08s both}

        @keyframes fx-rays-spin { 0%{transform:rotate(0)} 100%{transform:rotate(360deg)} }
        .animate-fx-rays{animation:fx-rays-spin 1.8s linear both}
        .animate-fx-rays-slow{animation:fx-rays-spin 4s linear both}

        @keyframes fx-wave { 0%{transform:scale(.6);opacity:.0;filter:blur(6px)} 30%{opacity:.7} 100%{transform:scale(1.35);opacity:0;filter:blur(10px)} }
        .animate-fx-wave{animation:fx-wave 1.1s ease-out both}
        .animate-fx-wave-del2{animation:fx-wave 1.2s ease-out .06s both}
        .animate-fx-wave-del3{animation:fx-wave 1.35s ease-out .12s both}

        @keyframes fx-glint { 0%{transform:scale(.9);opacity:.0} 40%{opacity:.5} 100%{transform:scale(1.1);opacity:0} }
        .animate-fx-glint{animation:fx-glint 1.2s ease-out .05s both}
        @keyframes fx-glint-soft { 0%{transform:scale(.96);opacity:.0} 40%{opacity:.35} 100%{transform:scale(1.04);opacity:0} }
        .animate-fx-glint-soft{animation:fx-glint-soft 1s ease-out .05s both}

        @keyframes fx-pulse { 0%{ transform: scale(1); filter: drop-shadow(0 0 0 rgba(255,255,255,.0)) } 50%{ transform: scale(1.02); filter: drop-shadow(0 0 18px rgba(255,255,255,.25)) } 100%{ transform: scale(1) filter: drop-shadow(0 0 0 rgba(255,255,255,.0)) } }
        .animate-fx-pulse{ animation: fx-pulse 860ms ease-in-out infinite }

        /* >>> Goyang sebelum reveal */
        @keyframes fx-shake {
          0%   { transform: translate3d(0,0,0) rotate(0) scale(1); }
          10%  { transform: translate3d(-8px, 2px,0) rotate(-4deg) scale(1.01); }
          20%  { transform: translate3d(10px,-3px,0) rotate( 3deg); }
          30%  { transform: translate3d(-10px,3px,0) rotate(-3.5deg); }
          40%  { transform: translate3d( 9px,-2px,0) rotate( 3deg); }
          50%  { transform: translate3d(-8px, 2px,0) rotate(-2.5deg); }
          60%  { transform: translate3d( 6px,-2px,0) rotate( 2deg); }
          70%  { transform: translate3d(-5px, 1px,0) rotate(-1.5deg); }
          80%  { transform: translate3d( 4px,-1px,0) rotate( 1deg); }
          90%  { transform: translate3d(-2px, 0px,0) rotate(-.5deg); }
          100% { transform: translate3d(0,0,0) rotate(0) scale(1); }
        }
        .animate-fx-shake{
          animation: fx-shake .65s cubic-bezier(.36,.07,.19,.97) both;
          animation-iteration-count: 1; /* goyang 2x */
          will-change: transform;
        }

        .chest-origin { transform-origin: 50% 85%; backface-visibility: hidden; }

        @keyframes fx-spark { 0%{transform:translate(0,0) scale(.5);opacity:0} 12%{opacity:1} 100%{transform:translate(var(--tx),var(--ty)) scale(1);opacity:0} }

        @keyframes fx-confetti { 0%{ transform:translateX(calc(var(--x))) translateY(-20px) rotate(0deg); opacity:0 } 10%{ opacity:1 } 100%{ transform:translateX(calc(var(--x) * 1.2)) translateY(260px) rotate(var(--rot)); opacity:0 } }
      `}</style>
    </div>
  );
}

function PurchaseRarityFX({ open, rarityCode, rarityName, onClose }:{ open:boolean; rarityCode:string; rarityName:string; onClose:()=>void; }) {
  const pal = rarityPalette[toRarity(rarityCode)];
  return (
    <FXOverlay
      open={open} onClose={onClose} palette={pal}
      title={rarityName.toUpperCase()} subtitle="Rarity Ditemukan!"
      chestNeutralSrc="/fantasy/chest/chest_closed.svg"
      chestRevealSrc="/fantasy/chest/chest_closed.svg"
      showBadge={badgeSrcFromCode(rarityCode)} variant="purchase"
    />
  );
}
function OpenRewardFX({ open, rarityCode, rarityName, rewardLabel, rewardType, rewardAmount, onClose }:{ open:boolean; rarityCode:string; rarityName:string; rewardLabel:string; rewardType:string; rewardAmount:number|null; onClose:()=>void; }) {
  const pal = rarityPalette[toRarity(rarityCode)];
  const value = rewardType === "CASH" ? `+${formatIDR(rewardAmount)} saldo` : rewardLabel;
  return (
    <FXOverlay
      open={open} onClose={onClose} palette={pal}
      title={rewardLabel} subtitle={`Hadiah • ${rarityName} • ${value}`}
      chestNeutralSrc="/fantasy/chest/chest_closed.svg"
      chestRevealSrc="/fantasy/chest/chest_open.svg"
      showBadge={badgeSrcFromCode(rarityCode)} variant="open"
    />
  );
}

/* =========================
   Page
========================= */
export default function MemberHomePage() {
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

  const [rarityMap, setRarityMap] = useState< Record<string, { code: string; name: string; color_key: string; sort_order?: number }> >({});

  // sfx
  const sfxClick = useRef<HTMLAudioElement | null>(null);
  const sfxWhoosh = useRef<HTMLAudioElement | null>(null);
  const sfxReveal = useRef<HTMLAudioElement | null>(null);
  const sfxCoin = useRef<HTMLAudioElement | null>(null);
  const sfxError = useRef<HTMLAudioElement | null>(null);

  // >>> BGM
  const bgmRef = useRef<HTMLAudioElement | null>(null);
  const [bgmMuted, setBgmMuted] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);

  useEffect(() => {
    // === SFX ===
    sfxClick.current  = new Audio("/fantasy/sfx/ui_click.wav");
    sfxWhoosh.current = new Audio("/fantasy/sfx/whoosh_buy.wav");
    sfxReveal.current = new Audio("/fantasy/sfx/reveal_burst.wav");
    sfxCoin.current   = new Audio("/fantasy/sfx/coin_sparkle.wav");
    sfxError.current  = new Audio("/fantasy/sfx/error_buzz.wav");
    [sfxWhoosh, sfxReveal, sfxCoin].forEach(ref => { if (ref.current) ref.current.volume = 0.60; });

    // === BGM (try autoplay) ===
    const bgm = new Audio("/fantasy/music/bgm.mp3");
    bgm.loop = true;
    const savedVol = Number(localStorage.getItem("bgmVol") ?? "0.85");
    bgm.volume = isNaN(savedVol) ? 0.18 : Math.min(1, Math.max(0, savedVol));
    bgm.muted  = localStorage.getItem("bgmMuted") === "1";
    bgmRef.current = bgm;
    setBgmMuted(bgm.muted);

    // Coba autoplay sekarang
    const tryAutoplay = async () => {
      try {
        await bgm.play();          // kalau lolos policy, langsung jalan
        setAutoplayBlocked(false);
      } catch {
        // diblokir → tunggu 1x interaksi
        setAutoplayBlocked(true);
        const start = () => {
          bgmRef.current?.play().catch(()=>{});
          setAutoplayBlocked(false);
          window.removeEventListener("pointerdown", start);
          window.removeEventListener("keydown", start);
        };
        window.addEventListener("pointerdown", start, { once: true });
        window.addEventListener("keydown", start, { once: true });
      }
    };
    tryAutoplay();

    // Pause saat tab disembunyikan (opsional)
    const onVis = () => {
      const el = bgmRef.current;
      if (!el) return;
      if (document.hidden) el.pause();
      else el.play().catch(()=>{});
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      document.removeEventListener("visibilitychange", onVis);
      try { bgm.pause(); } catch {}
      bgm.src = "";
      bgmRef.current = null;
    };
  }, []);

  const play = (
    ref: React.MutableRefObject<HTMLAudioElement | null>,
    reset = true
  ) => {
    try {
      const el = ref.current;
      if (!el) return;
      if (reset) el.currentTime = 0;   // biar bisa “spam” bunyi cepat
      // el.play() bisa throw di Safari, jadi bungkus try/catch
      el.play().catch(() => {});
    } catch {}
  };

  // auth & profile
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) { router.push("/login"); return; }
      const { data: p, error } = await supabase
        .from("profiles").select("id, username, credit_balance, role").eq("id", userData.user.id).single();
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
      const { data, error } = await supabase.from("box_rarities").select("id, code, name, color_key, sort_order");
      if (!error && data && alive) {
        const map = Object.fromEntries(data.map(r => [r.id, { code: r.code, name: r.name, color_key: r.color_key, sort_order: (r as any).sort_order ?? 0 }]));
        setRarityMap(map);
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
  const [fxOpen, setFxOpen] = useState<{ rarity_code: string; rarity_name: string; reward_label: string; reward_type: string; reward_amount: number | null; } | null>(null);

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

    play(sfxReveal);
    if (result.reward_type === "CASH") play(sfxCoin);

    setFxOpen({ rarity_code: result.rarity_code, rarity_name: result.rarity_name, reward_label: result.reward_label, reward_type: result.reward_type, reward_amount: result.reward_amount ?? null });

    setInventory(prev => prev.filter(i => i.id !== box.id));
    if (typeof result.credits_after === "number") {
      setProfile(p => (p ? { ...p, credit_balance: result.credits_after ?? p.credit_balance } : p));
    }
    setOpeningId(null);
    setLastOpened(result);
  };

  /* ========= Drop Info (fast modal) ========= */
  const [tierInfo, setTierInfo] = useState<{open:boolean; loading?:boolean; tier?: number; rows?: Array<{ code:string; name:string; color_key:string; prob:number; sort?:number }>}>({open:false});
  const [rarityInfo, setRarityInfo] = useState<{open:boolean; loading?:boolean; rarityId?:string; title?:string; rows?: Array<{ label:string; display:string; prob:number }>}>({open:false});

  const loadTierInfo = async (tier: number) => {
    setTierInfo({ open: true, loading: true, tier, rows: [] });
    const { data, error } = await supabase
      .from("box_credit_rarity_probs")
      .select("rarity_id, gimmick_probability, is_active, credit_tier")
      .eq("credit_tier", tier)
      .eq("is_active", true);
    if (error) { setTierInfo({ open:true, loading:false, tier, rows:[] }); return; }
    const rows = (data ?? []).map(r => {
      const rar = rarityMap[(r as any).rarity_id] || { code:"?", name:"?", color_key:"", sort_order: 0 };
      return { code: rar.code, name: rar.name, color_key: rar.color_key, prob: (r as any).gimmick_probability ?? 0, sort: rar.sort_order ?? 0 };
    })
    // urut: paling umum di atas → paling langka paling bawah
    .sort((a,b) => (a.sort ?? 0) - (b.sort ?? 0));
    setTierInfo({ open:true, loading:false, tier, rows });
  };

  const loadRarityInfo = async (rarityId: string) => {
    const rar = rarityMap[rarityId];
    setRarityInfo({ open:true, loading:true, rarityId, title: rar ? `Drop ${rar.name}` : "Drop Reward", rows: [] });
    const { data, error } = await supabase
      .from("box_rewards")
      .select("label, reward_type, amount, gimmick_probability, is_active")
      .eq("rarity_id", rarityId)
      .eq("is_active", true);
    if (error) { setRarityInfo({ open:true, loading:false, rarityId, title: rar ? `Drop ${rar.name}` : "Drop Reward", rows: [] }); return; }
    const rows = (data ?? []).map(r => ({
      label: r.label,
      display: r.reward_type === "CASH" && r.amount != null ? `${r.label} (Rp ${new Intl.NumberFormat('id-ID').format(Number(r.amount))})` : r.label,
      prob: (r as any).gimmick_probability ?? 0,
    })).sort((a,b) => b.prob - a.prob);
    setRarityInfo({ open:true, loading:false, rarityId, title: rar ? `Drop ${rar.name}` : "Drop Reward", rows });
  };

  /* ========= UI ========= */
  if (loading) {
    return (
      <main className="min-h-screen bg-black text-slate-100 p-6"><div className="max-w-5xl mx-auto">Memuat...</div></main>
    );
  }
  if (!profile) {
    return (
      <main className="min-h-screen bg-black text-slate-100 p-6"><div className="max-w-5xl mx-auto">Tidak bisa membaca profil.</div></main>
    );
  }

  // SWAP warna Tier-2 dan Tier-3
  const tierStyles: Record<number, { frameFrom: string; frameTo: string; btnFrom: string; btnTo: string; ribbon: string; }> = {
    1: { frameFrom: "#8b5cf2AA", frameTo: "#22d3ee44", btnFrom: "#8b5cf2", btnTo: "#a78bfa", ribbon: "from-violet-300/90 to-cyan-300/80" },
    2: { frameFrom: "#f59e0bAA", frameTo: "#f97316AA", btnFrom: "#f59e0b", btnTo: "#f97316", ribbon: "from-amber-300/90 to-pink-300/80" },
    3: { frameFrom: "#f43f5eAA", frameTo: "#ec4899AA", btnFrom: "#f43f5e", btnTo: "#ec4899", ribbon: "from-rose-300/90 to-fuchsia-300/85" },
  };

  return (
    <main className="relative min-h-screen text-slate-100 isolate">
      {/* Fixed background (cross-browser, aman di iOS/Android/Desktop) */}
      <div
        aria-hidden="true"
        className="fixed inset-0 -z-10 bg-cover bg-center bg-no-repeat transform-gpu will-change-transform"
        style={{ backgroundImage: "url('/fantasy/bg.jpg')" }}
      />
      {/* Fixed gradient tint di atas image, tetap di belakang konten */}
      <div
        aria-hidden="true"
        className="fixed inset-0 -z-10 pointer-events-none"
        style={{ background: "linear-gradient(180deg, rgba(7,11,19,.35), rgba(7,11,19,.56))" }}
      />

      <div className="relative z-10 max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[10px] tracking-[0.28em] uppercase text-slate-300/80">MEMBER SITE</div>
            <h1 className="mt-1 text-4xl md:text-5xl font-extrabold tracking-widest leading-none bg-clip-text text-transparent [background-size:200%_100%] animate-[shimmer_7s_linear_infinite]" style={{ backgroundImage: "linear-gradient(90deg,#a78bfa 0%,#f472b6 35%,#fde68a 75%,#a78bfa 100%)" }}>
              MYSTERY BOX
            </h1>
            <p className="mt-2 text-sm text-slate-200/85">Buka BOX, kejar hadiah Langka, dan claim hadiahmu.</p>
            <div className="mt-4 h-[2px] w-44 rounded-full bg-gradient-to-r from-fuchsia-400/80 via-amber-300/90 to-transparent" />
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="text-xs text-slate-300/80 text-right w-full">Login sebagai</div>
            <div className="px-2 py-[2px] rounded-lg border border-slate-600/60 bg-slate-900/40">
              <span className="text-emerald-300 font-semibold">{profile.username || "member"}</span>
              <span className="ml-2 text-emerald-400/90">{formatIDR(profile.credit_balance)} credit</span>
            </div>
            <button
              onClick={() => {
                if (!bgmRef.current) return;
                const next = !bgmRef.current.muted;
                bgmRef.current.muted = next;
                setBgmMuted(next);
                localStorage.setItem("bgmMuted", next ? "1" : "0");
              }}
              className="text-xs rounded-md border border-slate-600/60 px-2 py-1 hover:bg-slate-800/50"
              title={bgmMuted ? "Nyalakan musik" : "Matikan musik"}
            >
              {bgmMuted ? "🎵 Off" : "🎵 On"}
            </button>
            <button onClick={async () => { await supabase.auth.signOut(); router.push("/member/login"); }} className="text-xs rounded-md border border-slate-600/60 px-2 py-1 hover:bg-slate-800/50">Logout</button>
          </div>
        </div>

        {/* Cards */}
        <div className="grid md:grid-cols-3 gap-4 mt-8">
          {[1, 2, 3].map((tier) => {
            const s = tierStyles[tier];
            return (
              <div key={tier} className="group relative rounded-2xl p-[2px]" style={{ background: `linear-gradient(180deg, ${s.frameFrom}, ${s.frameTo})` }}>
                <div className="rounded-2xl border border-slate-700/60 bg-slate-950/85 p-4">
                  {/* Ribbon */}
                  <div className={`inline-flex items-center gap-1 rounded-full text-[10px] px-2 py-[2px] font-semibold bg-gradient-to-r ${s.ribbon} text-slate-900`}>
                    {tier === 1 ? "TIER 1 • Starter" : tier === 2 ? "TIER 2 • Advance" : "TIER 3 • Elite"}
                  </div>

                  <div className="mt-2 text-lg font-semibold">Box {tier} Credit</div>
                  <p className="text-xs text-slate-300 mt-1">
                    {tier === 1 && "Minimal dapat Common. Cocok buat coba peruntungan."}
                    {tier === 2 && "Start dari Rare ke atas. Common tidak mungkin keluar."}
                    {tier === 3 && "Start dari Epic ke atas. Common & Rare tidak mungkin keluar."}
                  </p>

                  {/* Ikon BOX (center) – klik untuk Drop Info tier */}
                  <div className="mt-4 flex justify-center">
                    <button type="button" aria-label="Lihat Drop Info" onClick={() => loadTierInfo(tier)} className="rounded-2xl border border-slate-700/60 bg-slate-900/80 px-3 py-2 hover:bg-slate-800/80">
                      <img src="/fantasy/chest/chest_closed.svg" alt="" className="h-14 md:h-16 will-change-transform" />
                    </button>
                  </div>

                  <button onClick={() => { play(sfxClick); handlePurchase(tier as 1 | 2 | 3); }} className="mt-4 w-full rounded-full text-black font-semibold py-2" style={{ background: `linear-gradient(90deg, ${s.btnFrom}, ${s.btnTo})` }}>
                    Beli Box {tier} Credit
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Only error notification */}
        {infoType === "error" && infoMessage && (
          <div className="mt-4 rounded-lg px-3 py-2 text-sm bg-rose-500/10 border border-rose-500/30 text-rose-200">{infoMessage}</div>
        )}

        {/* Inventory */}
        <div className="mt-8 rounded-2xl border border-slate-700/70 bg-slate-950/80">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/70">
            <div className="text-sm font-semibold text-slate-200">Inventory Box Kamu</div>
            <div className="text-xs text-slate-300">{inventory.length} box menunggu dibuka</div>
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
                  <li key={box.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-100 flex items-center gap-2">
                        Box {box.credit_tier} Credit
                        {rar && renderRarityBadge(rar.color_key, rar.name)}
                      </p>
                      <p className="text-[11px] text-slate-400">Kadaluarsa: <span className="font-medium">{formatDateTime(box.expires_at)}</span></p>
                    </div>
                    <div className="shrink-0 flex items-center">
                      {box.rarity_id && (
                        <button onClick={() => loadRarityInfo(box.rarity_id!)} className="mr-2 rounded-full border border-slate-600/60 px-3 py-1 text-[11px] hover:bg-slate-800/50">Info</button>
                      )}
                      <button onClick={() => handleOpenBox(box)} disabled={openingId === box.id} className="rounded-full bg-amber-500 hover:bg-amber-400 text-black text-[12px] font-semibold px-3 py-1.5 disabled:opacity-60">
                        {openingId === box.id ? "Membuka…" : "Buka Box"}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Pembelian Terakhir */}
        {(lastPurchase || lastOpened) && (
          <div className="mt-6 rounded-2xl border border-slate-700/70 bg-slate-950/80 p-4">
            <div className="text-sm font-semibold text-slate-200 mb-2">Pembelian Terakhir</div>
            {lastPurchase ? (
              <div className="text-xs text-slate-300">
                Box {lastPurchase.credit_tier} credit, rarity <span className="font-semibold">{lastPurchase.rarity_name} ({lastPurchase.rarity_code})</span>.
                <div className="mt-1 text-slate-400">Credit sebelum beli: <span className="font-medium">{formatIDR(lastPurchase.credits_before)}</span> • setelah beli: <span className="font-medium">{formatIDR(lastPurchase.credits_after)}</span></div>
                <div className="text-slate-400">Box ini bisa dibuka sampai <span className="font-medium">{formatDateTime(lastPurchase.expires_at)}</span>.</div>
              </div>
            ) : (
              <div className="text-xs text-slate-400">—</div>
            )}

            {lastOpened && (
              <>
                <div className="mt-4 text-sm font-semibold text-slate-200">Box Terakhir Dibuka</div>
                <div className="text-xs text-slate-300">Rarity {lastOpened.rarity_name} • Hadiah <span className="font-semibold">{lastOpened.reward_label}</span>{lastOpened.reward_type === "CASH" && <> (+{formatIDR(lastOpened.reward_amount)} saldo)</>}</div>
              </>
            )}
          </div>
        )}
      </div>

      {/* MODALS: Drop Info */}
      <Modal open={tierInfo.open} onClose={() => setTierInfo({open:false})} title={`Drop Info • Box ${tierInfo.tier ?? ""} Credit`}>
        {tierInfo.loading ? (
          <div className="text-slate-400">Memuat…</div>
        ) : (!tierInfo.rows || tierInfo.rows.length === 0) ? (
          <div className="text-slate-400">Belum ada data.</div>
        ) : (
          <ul className="space-y-2">
            {tierInfo.rows.map((r, idx) => (
              <li key={idx} className="flex items-center justify-between">
                <div className="flex items-center gap-2">{renderRarityBadge(r.color_key, r.name)}</div>
                <div className="font-semibold">{r.prob}%</div>
              </li>
            ))}
          </ul>
        )}
      </Modal>

      <Modal
        open={rarityInfo.open}
        onClose={() => setRarityInfo({ open: false })}
        title={
          <div className="flex items-center gap-2">
            <span>Drop</span>
            {rarityInfo.rarityId && rarityMap[rarityInfo.rarityId] &&
              renderRarityBadge(
                rarityMap[rarityInfo.rarityId].color_key,
                rarityMap[rarityInfo.rarityId].name
              )}
          </div>
        }
      >
        {rarityInfo.loading ? (
          <div className="text-slate-400">Memuat…</div>
        ) : (!rarityInfo.rows || rarityInfo.rows.length === 0) ? (
          <div className="text-slate-400">Belum ada data.</div>
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
      </Modal>

      {/* FX Overlays */}
      <PurchaseRarityFX open={!!fxPurchase} rarityCode={fxPurchase?.code ?? ""} rarityName={fxPurchase?.name ?? ""} onClose={() => { setFxPurchase(null); if (profile?.id) reloadInventory(profile.id); }} />
      <OpenRewardFX open={!!fxOpen} rarityCode={fxOpen?.rarity_code ?? ""} rarityName={fxOpen?.rarity_name ?? ""} rewardLabel={fxOpen?.reward_label ?? ""} rewardType={fxOpen?.reward_type ?? ""} rewardAmount={fxOpen?.reward_amount ?? null} onClose={() => setFxOpen(null)} />

      {/* shimmer keyframes */}
      <style jsx global>{`
        @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
      `}</style>
    </main>
  );
}
