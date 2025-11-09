"use client";

import { useEffect, useMemo, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type UserRole = "ADMIN" | "CS" | "MEMBER";

type PanelProfile = {
  id: string;
  tenant_id: string;
  role: UserRole;
  username: string | null;
};

type TxBase = {
  id: string;
  member_profile_id: string;
  credit_tier: number;
  credit_spent: number;
  status: "PURCHASED" | "OPENED" | "EXPIRED";
  expires_at: string;
  opened_at: string | null;
  processed: boolean;
  processed_at: string | null;
  processed_by_profile_id?: string | null;
  created_at: string;
  rarity_id: string;
  reward_id: string | null;
};

type MemberShort = {
  id: string;
  username: string | null;
};

type RarityShort = {
  id: string;
  code: string;
  name: string;
};

type RewardShort = {
  id: string;
  label: string;
  reward_type: string;
  amount: number | null;
};

type HistoryRow = TxBase & {
  member: MemberShort | null;
  rarity: RarityShort | null;
  reward: RewardShort | null;
};

export default function PanelHistoryPage() {
  const router = useRouter();

  // ---- session / profile ----
  const [profile, setProfile] = useState<PanelProfile | null>(null);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);

  // ---- rows ----
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loadingRows, setLoadingRows] = useState(true);
  const [rowsError, setRowsError] = useState<string | null>(null);

  // ---- filter (staged -> applied, NOT live) ----
  const [searchUsernameInput, setSearchUsernameInput] = useState("");
  const [statusInput, setStatusInput] = useState<"ALL" | "PURCHASED" | "OPENED" | "EXPIRED">("ALL");
  const [tierInput, setTierInput] = useState<"ALL" | "1" | "2" | "3">("ALL");
  const [dateStartInput, setDateStartInput] = useState<string>(""); // YYYY-MM-DD
  const [dateEndInput, setDateEndInput] = useState<string>("");     // YYYY-MM-DD

  const [appliedUsername, setAppliedUsername] = useState("");
  const [appliedStatus, setAppliedStatus] = useState<"ALL" | "PURCHASED" | "OPENED" | "EXPIRED">("ALL");
  const [appliedTier, setAppliedTier] = useState<"ALL" | "1" | "2" | "3">("ALL");
  const [appliedDateStart, setAppliedDateStart] = useState<string>("");
  const [appliedDateEnd, setAppliedDateEnd] = useState<string>("");

  // ---- pagination (25 rows) ----
  const PAGE_SIZE = 25;
  const [page, setPage] = useState(1);
  const FETCH_CHUNK = 1000;

  function applyFilters() {
    const isEmpty =
      searchUsernameInput.trim() === "" &&
      statusInput === "ALL" &&
      tierInput === "ALL" &&
      !dateStartInput &&
      !dateEndInput;

    setAppliedUsername(searchUsernameInput.trim());
    setAppliedStatus(statusInput);
    setAppliedTier(tierInput);
    setAppliedDateStart(dateStartInput);
    setAppliedDateEnd(dateEndInput);

    // reset ke halaman pertama setiap kali apply filter
    setPage(1);

    // klik/enter dengan filter kosong => reload data dari DB
    if (isEmpty) {
      void fetchRows();
    }
  }

  // ---- user header dropdown + self password modal ----
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [selfPwdModalOpen, setSelfPwdModalOpen] = useState(false);
  const [selfPwdNew, setSelfPwdNew] = useState("");
  const [selfPwdConfirm, setSelfPwdConfirm] = useState("");
  const [selfPwdError, setSelfPwdError] = useState<string | null>(null);
  const [selfPwdLoading, setSelfPwdLoading] = useState(false);
  const [showSelfPwdNew, setShowSelfPwdNew] = useState(false);
  const [showSelfPwdConfirm, setShowSelfPwdConfirm] = useState(false);

  function openSelfPasswordModal() {
    setSelfPwdModalOpen(true);
    setSelfPwdNew("");
    setSelfPwdConfirm("");
    setSelfPwdError(null);
    setUserMenuOpen(false);
  }
  function closeSelfPasswordModal() {
    setSelfPwdModalOpen(false);
    setSelfPwdNew("");
    setSelfPwdConfirm("");
    setSelfPwdError(null);
    setSelfPwdLoading(false);
    setShowSelfPwdNew(false);
    setShowSelfPwdConfirm(false);
  }
  async function handleSelfPasswordSubmit(e: FormEvent) {
    e.preventDefault();
    setSelfPwdError(null);
    if (!selfPwdNew || selfPwdNew.length < 6) {
      setSelfPwdError("Password minimal 6 karakter.");
      return;
    }
    if (selfPwdNew !== selfPwdConfirm) {
      setSelfPwdError("Konfirmasi password tidak sama.");
      return;
    }
    setSelfPwdLoading(true);
    const { error } = await supabase.auth.updateUser({ password: selfPwdNew });
    if (error) {
      setSelfPwdError(error.message || "Gagal mengubah password.");
      setSelfPwdLoading(false);
      return;
    }
    closeSelfPasswordModal();
  }
  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/panel/login");
  }

  // ---- ESC to close modal ----
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && selfPwdModalOpen) closeSelfPasswordModal();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selfPwdModalOpen]);

  // ---- load profile ----
  useEffect(() => {
    async function loadProfile() {
      setLoadingProfile(true);
      setProfileError(null);

      const { data: { user }, error: userErr } = await supabase.auth.getUser();
      if (userErr) {
        setProfileError("Gagal membaca sesi login.");
        setLoadingProfile(false);
        return;
      }
      if (!user) {
        router.push("/panel/login");
        return;
      }
      setCurrentUserEmail(user.email ?? null);

      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("id, tenant_id, role, username")
        .eq("id", user.id)
        .maybeSingle<PanelProfile>();

      if (profErr) {
        setProfileError("Gagal membaca profil.");
        setLoadingProfile(false);
        return;
      }
      if (!prof) {
        setProfileError("Profil belum dibuat untuk akun ini.");
        setLoadingProfile(false);
        return;
      }
      if (prof.role !== "ADMIN" && prof.role !== "CS") {
        setProfileError("Halaman ini hanya untuk Admin / CS.");
        setLoadingProfile(false);
        return;
      }

      setProfile(prof);
      setLoadingProfile(false);
    }
    loadProfile();
  }, [router]);

  // ---- load history rows ----
  async function fetchRows() {
    if (!profile) return;
    setLoadingRows(true);
    setRowsError(null);

    try {
      // --- ambil semua baris bertahap ---
      let from = 0;
      let batch: TxBase[] = [];
      const allBaseRows: TxBase[] = [];

      do {
        const { data, error } = await supabase
          .from("box_transactions")
          .select(`
            id,
            member_profile_id,
            credit_tier,
            credit_spent,
            status,
            expires_at,
            opened_at,
            processed,
            processed_at,
            processed_by_profile_id,
            created_at,
            rarity_id,
            reward_id
          `)
          .eq("tenant_id", profile.tenant_id)
          .order("created_at", { ascending: false })
          .range(from, from + FETCH_CHUNK - 1);

        if (error) throw error;

        batch = (data || []) as TxBase[];
        allBaseRows.push(...batch);
        from += FETCH_CHUNK;
      } while (batch.length === FETCH_CHUNK); // lanjut sampai batch terakhir < FETCH_CHUNK

      if (allBaseRows.length === 0) {
        setRows([]);
        setLoadingRows(false);
        return;
      }

      // --- join data member/rarity/reward seperti sebelumnya ---
      const memberIds = Array.from(new Set(allBaseRows.map((r) => r.member_profile_id)));
      const rarityIds = Array.from(new Set(allBaseRows.map((r) => r.rarity_id)));
      const rewardIds = Array.from(new Set(allBaseRows.map((r) => r.reward_id).filter((v): v is string => !!v)));

      const [
        { data: memberData, error: memberErr },
        { data: rarityData, error: rarityErr },
        { data: rewardData, error: rewardErr },
      ] = await Promise.all([
        memberIds.length
          ? supabase.from("profiles").select("id, username").in("id", memberIds)
          : Promise.resolve({ data: [] as MemberShort[], error: null }),
        rarityIds.length
          ? supabase.from("box_rarities").select("id, code, name").in("id", rarityIds)
          : Promise.resolve({ data: [] as RarityShort[], error: null }),
        rewardIds.length
          ? supabase.from("box_rewards").select("id, label, reward_type, amount").in("id", rewardIds)
          : Promise.resolve({ data: [] as RewardShort[], error: null }),
      ]);

      if (memberErr || rarityErr || rewardErr) {
        setRowsError("Gagal membaca data tambahan (member/rarity/reward).");
        setLoadingRows(false);
        return;
      }

      const memberMap = new Map((memberData || []).map((m) => [m.id, m as MemberShort]));
      const rarityMap = new Map((rarityData || []).map((r) => [r.id, r as RarityShort]));
      const rewardMap = new Map((rewardData || []).map((r) => [r.id, r as RewardShort]));

      const fullRows: HistoryRow[] = allBaseRows.map((r) => ({
        ...r,
        member: memberMap.get(r.member_profile_id) || null,
        rarity: rarityMap.get(r.rarity_id) || null,
        reward: r.reward_id ? rewardMap.get(r.reward_id) || null : null,
      }));

      setRows(fullRows);
      setLoadingRows(false);
    } catch (err) {
      console.error(err);
      setRowsError("Terjadi kesalahan saat membaca history transaksi.");
      setLoadingRows(false);
    }
  }

  // panggil sekali saat profil sudah ada
  useEffect(() => {
    if (profile) void fetchRows();
  }, [profile]);

  // ---- applied filtering (NOT live) ----
  const filteredRows = useMemo(() => {
    const hasDate = !!appliedDateStart || !!appliedDateEnd;
    const startMs = appliedDateStart
      ? new Date(`${appliedDateStart}T00:00:00`).getTime()
      : Number.NEGATIVE_INFINITY;
    const endMs = appliedDateEnd
      ? new Date(`${appliedDateEnd}T23:59:59.999`).getTime()
      : Number.POSITIVE_INFINITY;

    return rows.filter((row) => {
      if (appliedStatus !== "ALL" && row.status !== appliedStatus) return false;
      if (appliedTier !== "ALL" && row.credit_tier !== Number(appliedTier)) return false;
      if (appliedUsername) {
        const u = (row.member?.username || "").toLowerCase();
        if (!u.includes(appliedUsername.toLowerCase())) return false;
      }
      if (hasDate) {
        const created = new Date(row.created_at).getTime();
        if (!(created >= startMs && created <= endMs)) return false;
      }
      return true;
    });
  }, [rows, appliedStatus, appliedTier, appliedUsername, appliedDateStart, appliedDateEnd]);

  // clamp page jika jumlah hasil berubah
  useEffect(() => {
    const total = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
    if (page > total) setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredRows.length]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const startIndex = (page - 1) * PAGE_SIZE;
  const endIndex = Math.min(startIndex + PAGE_SIZE, filteredRows.length);

  const pagedRows = useMemo(() => {
    return filteredRows.slice(startIndex, endIndex);
  }, [filteredRows, startIndex, endIndex, page]);

  function formatDateTime(s?: string | null) {
    if (!s) return "-";
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return s;
    return d.toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" });
  }

  function statusLabel(row: HistoryRow) {
    if (row.status === "PURCHASED") return "Purchased";
    if (row.status === "OPENED") return "Opened";
    if (row.status === "EXPIRED") return "Expired";
    return row.status;
  }

  // ---- mark processed (one-way, no revert) ----
  const [processingId, setProcessingId] = useState<string | null>(null);

  async function markProcessed(row: HistoryRow) {
    if (!profile) return;
    if (row.processed) return; // already processed → do nothing
    setProcessingId(row.id);

    const nowIso = new Date().toISOString();

    try {
      const { error } = await supabase
        .from("box_transactions")
        .update({
          processed: true,
          processed_by_profile_id: profile.id,
          processed_at: nowIso,
        })
        .eq("id", row.id)
        .eq("processed", false); // guard, avoid accidental revert

      if (error) {
        console.error(error);
        return;
      }

      setRows((prev) =>
        prev.map((r) =>
          r.id === row.id ? { ...r, processed: true, processed_at: nowIso, processed_by_profile_id: profile.id } : r,
        ),
      );
    } catch (err) {
      console.error(err);
    } finally {
      setProcessingId(null);
    }
  }

  // ---------------- render ----------------

  if (loadingProfile) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-sm text-slate-300">Memuat profil admin / CS...</p>
      </main>
    );
  }

  if (profileError) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-4">
        <p className="mb-4 rounded-lg border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-200">
          {profileError}
        </p>
        <button
          onClick={() => router.push("/panel/login")}
          className="rounded-lg border border-slate-600 px-4 py-2 text-xs text-slate-200 hover:bg-slate-800 transition"
        >
          Kembali ke login panel
        </button>
      </main>
    );
  }

  const displayName = profile?.username || currentUserEmail || "Akun Panel";

  return (
    <main className="px-6 py-8">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-sky-400">Panel</p>
          <h1 className="text-xl font-semibold text-slate-50">History Transaksi Box</h1>
          <p className="text-xs text-slate-400">Riwayat pembelian dan pembukaan mystery box di tenant ini.</p>
        </div>

        {/* User dropdown (sama seperti Members/Ledger) */}
        <div className="relative inline-flex">
          <button
            type="button"
            onClick={() => setUserMenuOpen((v) => !v)}
            className="inline-flex items-center rounded-lg border border-slate-600 px-3 py-2 text-xs font-medium hover:bg-slate-800 transition"
          >
            <span className="mr-2 truncate max-w-[160px]">{displayName}</span>
            <span className="text-slate-400">▾</span>
          </button>
          {userMenuOpen && (
            <div className="absolute right-0 mt-2 w-44 rounded-xl border border-slate-700 bg-slate-900/95 shadow-lg text-xs overflow-hidden z-20">
              <button
                type="button"
                onClick={openSelfPasswordModal}
                className="w-full text-left px-3 py-2 hover:bg-slate-800"
              >
                Ubah password saya
              </button>
              <button
                type="button"
                onClick={() => {
                  setUserMenuOpen(false);
                  void handleLogout();
                }}
                className="w-full text-left px-3 py-2 hover:bg-slate-800 text-red-300"
              >
                Logout
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Filter bar (NOT live) */}
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-1 flex-col gap-2 md:flex-row md:items-end md:flex-wrap">
          <div className="flex-1 min-w-[240px]">
            <label className="mb-1 block text-xs text-slate-400">Filter username member</label>
            <div className="flex gap-2">
              <input
                value={searchUsernameInput}
                onChange={(e) => setSearchUsernameInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") applyFilters();
                }}
                placeholder="cari username..."
                className="w-full rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-xs text-slate-100 outline-none ring-0 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 max-w-xs"
              />
              <select
                value={statusInput}
                onChange={(e) => setStatusInput(e.target.value as any)}
                className="rounded-lg border border-slate-700 bg-slate-900/80 px-2 py-2 text-xs text-slate-100 outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
              >
                <option value="ALL">Semua</option>
                <option value="PURCHASED">Purchased</option>
                <option value="OPENED">Opened</option>
                <option value="EXPIRED">Expired</option>
              </select>
              <select
                value={tierInput}
                onChange={(e) => setTierInput(e.target.value as any)}
                className="rounded-lg border border-slate-700 bg-slate-900/80 px-2 py-2 text-xs text-slate-100 outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
              >
                <option value="ALL">Semua</option>
                <option value="1">1 credit</option>
                <option value="2">2 credit</option>
                <option value="3">3 credit</option>
              </select>
            </div>
          </div>

          {/* Date range */}
          <div className="flex items-end gap-2">
            <div>
              <label className="mb-1 block text-xs text-slate-400">Tanggal mulai</label>
              <input
                type="date"
                value={dateStartInput}
                onChange={(e) => setDateStartInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") applyFilters();
                })}
                className="rounded-lg border border-slate-700 bg-slate-900/80 px-2 py-2 text-xs text-slate-100 outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400">Tanggal akhir</label>
              <input
                type="date"
                value={dateEndInput}
                onChange={(e) => setDateEndInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") applyFilters();
                })}
                className="rounded-lg border border-slate-700 bg-slate-900/80 px-2 py-2 text-xs text-slate-100 outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
              />
            </div>
          </div>

          <div className="flex items-end">
            <button
              type="button"
              onClick={applyFilters}
              className="inline-flex items-center rounded-lg border border-sky-500/70 px-3 py-2 text-xs font-semibold text-sky-200 hover:bg-sky-500/10 transition"
              title="Cari"
            >
              Search
            </button>
          </div>
        </div>
      </div>

      {/* Tabel */}
      <div className="overflow-x-auto rounded-2xl border border-slate-700 bg-slate-950/60">
        <table className="min-w-full text-left text-xs text-slate-200">
          <thead className="border-b border-slate-800 bg-slate-900/70 text-[11px] uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">Username</th>
              <th className="px-2 py-3 text-center">Tier</th>
              <th className="px-2 py-3 text-center">Credit</th>
              <th className="px-2 py-3">Rarity</th>
              <th className="px-2 py-3">Reward</th>
              <th className="px-2 py-3">Status</th>
              <th className="px-2 py-3">Dibuat</th>
              <th className="px-2 py-3">Opened / Expired</th>
              <th className="px-2 py-3 text-center">Processed</th>
            </tr>
          </thead>
          <tbody>
            {loadingRows ? (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-slate-400">
                  Memuat history transaksi...
                </td>
              </tr>
            ) : rowsError ? (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-red-300">{rowsError}</td>
              </tr>
            ) : filteredRows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-slate-400">
                  Tidak ada transaksi yang cocok dengan filter.
                </td>
              </tr>
            ) : (
              pagedRows.map((row) => {
                const rarityText = row.rarity ? `${row.rarity.name} (${row.rarity.code})` : "-";
                let rewardText = "-";
                if (row.reward) {
                  if (row.reward.reward_type === "CASH") {
                    const amount = row.reward.amount || 0;
                    rewardText = `${row.reward.label} - Rp ${amount.toLocaleString("id-ID")}`;
                  } else {
                    rewardText = row.reward.label;
                  }
                }
                const canProcess = row.status === "OPENED" && !!row.reward_id;

                return (
                  <tr key={row.id} className="border-t border-slate-800/80 hover:bg-slate-900/60">
                    <td className="px-4 py-2 text-[11px]">{row.member?.username || "-"}</td>
                    <td className="px-2 py-2 text-center">{row.credit_tier}</td>
                    <td className="px-2 py-2 text-center">{row.credit_spent}</td>
                    <td className="px-2 py-2 text-[11px]">{rarityText}</td>
                    <td className="px-2 py-2 text-[11px]">{rewardText}</td>
                    <td className="px-2 py-2 text-[11px]">{statusLabel(row)}</td>
                    <td className="px-2 py-2 text-[11px]">{formatDateTime(row.created_at)}</td>
                    <td className="px-2 py-2 text-[11px]">
                      {row.status === "OPENED" ? formatDateTime(row.opened_at) : formatDateTime(row.expires_at)}
                    </td>
                    <td className="px-2 py-2 text-center">
                      {!canProcess ? (
                        <span className="text-[11px] text-slate-500">-</span>
                      ) : row.processed ? (
                        <span className="rounded-full border border-emerald-500/70 bg-emerald-900/40 px-3 py-1 text-[11px] font-medium text-emerald-200">
                          Sudah diproses
                        </span>
                      ) : (
                        <button
                          onClick={() => markProcessed(row)}
                          disabled={processingId === row.id}
                          className="rounded-full border border-slate-600 bg-slate-900/80 px-3 py-1 text-[11px] font-medium text-slate-100 hover:bg-slate-800 disabled:opacity-60 disabled:cursor-not-allowed transition"
                        >
                          {processingId === row.id ? "..." : "Process"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="mt-3 flex flex-col gap-2 items-center justify-between md:flex-row">
        <p className="text-[11px] text-slate-500">
          Menampilkan {filteredRows.length === 0 ? 0 : startIndex + 1}
          –{endIndex} dari {filteredRows.length} hasil (25/baris)
        </p>
        <div className="inline-flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="rounded-lg border border-slate-600 px-3 py-1.5 text-[11px] hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            ‹ Prev
          </button>
          <span className="text-[11px] text-slate-300">
            Halaman {page} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="rounded-lg border border-slate-600 px-3 py-1.5 text-[11px] hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            Next ›
          </button>
        </div>
      </div>

      {/* Modal Ubah Password Saya */}
      {selfPwdModalOpen && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-4"
          onClick={closeSelfPasswordModal}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900/95 p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold">Ubah password akun saya</h2>
            <form onSubmit={handleSelfPasswordSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="self-pwd-new">Password baru</label>
                <div className="relative">
                  <input
                    id="self-pwd-new"
                    type={showSelfPwdNew ? "text" : "password"}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2.5 text-sm pr-20 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                    value={selfPwdNew}
                    onChange={(e) => setSelfPwdNew(e.target.value)}
                    placeholder="min. 6 karakter"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSelfPwdNew((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-xs border border-slate-600 rounded px-2 py-1 hover:bg-slate-800"
                  >
                    {showSelfPwdNew ? "Sembunyi" : "Lihat"}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="self-pwd-confirm">Konfirmasi password baru</label>
                <div className="relative">
                  <input
                    id="self-pwd-confirm"
                    type={showSelfPwdConfirm ? "text" : "password"}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2.5 text-sm pr-20 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                    value={selfPwdConfirm}
                    onChange={(e) => setSelfPwdConfirm(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowSelfPwdConfirm((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-xs border border-slate-600 rounded px-2 py-1 hover:bg-slate-800"
                  >
                    {showSelfPwdConfirm ? "Sembunyi" : "Lihat"}
                  </button>
                </div>
              </div>

              {selfPwdError && (
                <p className="text-xs text-red-400 bg-red-950/40 border border-red-900/50 rounded-lg px-3 py-2">{selfPwdError}</p>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={closeSelfPasswordModal}
                  className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs hover:bg-slate-800 transition"
                  disabled={selfPwdLoading}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={selfPwdLoading}
                  className="rounded-lg bg-cyan-500 px-4 py-1.5 text-xs font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-60 disabled:cursor-not-allowed transition"
                >
                  {selfPwdLoading ? "Menyimpan..." : "Simpan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}

/* ---------------- helpers ---------------- */

function formatDateTime(s?: string | null) {
  if (!s) return "-";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" });
}
