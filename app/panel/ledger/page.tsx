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

type LedgerBase = {
  id: string;
  tenant_id: string;
  member_profile_id: string | null;
  delta: number;
  balance_after: number;
  kind: "TOPUP" | "ADJUSTMENT" | "BOX_PURCHASE" | string;
  description: string | null;
  created_by_profile_id: string | null;
  created_at: string;
};

type MemberShort = {
  id: string;
  username: string | null;
};

type CreatorShort = {
  id: string;
  username: string | null;
};

type LedgerRow = LedgerBase & {
  member: MemberShort | null;
  created_by: CreatorShort | null;
};

export default function PanelLedgerPage() {
  const router = useRouter();

  // ---- session / profile ----
  const [profile, setProfile] = useState<PanelProfile | null>(null);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);

  // ---- rows ----
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [loadingRows, setLoadingRows] = useState(true);
  const [rowsError, setRowsError] = useState<string | null>(null);

  // ---- filter (staged -> applied, NOT live) ----
  const [filterUsername, setFilterUsername] = useState("");
  const [filterKind, setFilterKind] = useState<"ALL" | "TOPUP" | "ADJUSTMENT" | "BOX_PURCHASE">("ALL");
  const [filterDateStart, setFilterDateStart] = useState<string>(""); // YYYY-MM-DD
  const [filterDateEnd, setFilterDateEnd] = useState<string>("");     // YYYY-MM-DD

  const [appliedUsername, setAppliedUsername] = useState("");
  const [appliedKind, setAppliedKind] = useState<"ALL" | "TOPUP" | "ADJUSTMENT" | "BOX_PURCHASE">("ALL");
  const [appliedDateStart, setAppliedDateStart] = useState<string>("");
  const [appliedDateEnd, setAppliedDateEnd] = useState<string>("");

  function applyFilters() {
    const isEmpty =
      filterUsername.trim() === "" &&
      filterKind === "ALL" &&
      !filterDateStart &&
      !filterDateEnd;

    setAppliedUsername(filterUsername.trim());
    setAppliedKind(filterKind);
    setAppliedDateStart(filterDateStart);
    setAppliedDateEnd(filterDateEnd);

    // setiap apply, kembali ke halaman 1
    setPage(1);

    // jika semua filter kosong → reload dari DB
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

  // ---- pagination ----
  const PAGE_SIZE = 25;
  const FETCH_CHUNK = 1000;
  const [page, setPage] = useState(1);

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

  // ---- load ledger rows (ambil semua, bertahap) ----
  async function fetchRows() {
    if (!profile) return;
    setLoadingRows(true);
    setRowsError(null);

    try {
      // ambil semua baris bertahap
      let from = 0;
      let batch: LedgerBase[] = [];
      const allBaseRows: LedgerBase[] = [];

      do {
        const { data, error } = await supabase
          .from("credit_ledger")
          .select(`
            id,
            tenant_id,
            member_profile_id,
            delta,
            balance_after,
            kind,
            description,
            created_by_profile_id,
            created_at
          `)
          .eq("tenant_id", profile.tenant_id)
          .order("created_at", { ascending: false })
          .range(from, from + FETCH_CHUNK - 1);

        if (error) throw error;
        batch = (data || []) as LedgerBase[];
        allBaseRows.push(...batch);
        from += FETCH_CHUNK;
      } while (batch.length === FETCH_CHUNK);

      if (allBaseRows.length === 0) {
        setRows([]);
        setLoadingRows(false);
        return;
      }

      const memberIds = Array.from(
        new Set(allBaseRows.map(r => r.member_profile_id).filter((v): v is string => !!v))
      );
      const creatorIds = Array.from(
        new Set(allBaseRows.map(r => r.created_by_profile_id).filter((v): v is string => !!v))
      );

      const [
        { data: memberData, error: memberErr },
        { data: creatorData, error: creatorErr },
      ] = await Promise.all([
        memberIds.length
          ? supabase.from("profiles").select("id, username").in("id", memberIds)
          : Promise.resolve({ data: [] as MemberShort[], error: null }),
        creatorIds.length
          ? supabase.from("profiles").select("id, username").in("id", creatorIds)
          : Promise.resolve({ data: [] as CreatorShort[], error: null }),
      ]);

      if (memberErr || creatorErr) {
        setRowsError("Gagal membaca data tambahan (member/pembuat).");
        setLoadingRows(false);
        return;
      }

      const memberMap = new Map((memberData || []).map((m) => [m.id, m as MemberShort]));
      const creatorMap = new Map((creatorData || []).map((c) => [c.id, c as CreatorShort]));

      const fullRows: LedgerRow[] = allBaseRows.map((r) => ({
        ...r,
        member: r.member_profile_id ? memberMap.get(r.member_profile_id) || null : null,
        created_by: r.created_by_profile_id ? creatorMap.get(r.created_by_profile_id) || null : null,
      }));

      setRows(fullRows);
      setLoadingRows(false);
    } catch (err) {
      console.error(err);
      setRowsError("Terjadi kesalahan saat membaca ledger.");
      setLoadingRows(false);
    }
  }

  // panggil sekali saat profil sudah ada
  useEffect(() => {
    if (profile) void fetchRows();
  }, [profile]);

  // ---- applied filtering (NOT live) ----
  const filteredRows = useMemo(() => {
    const hasDateFilter = !!appliedDateStart || !!appliedDateEnd;
    const startMs = appliedDateStart
      ? new Date(`${appliedDateStart}T00:00:00`).getTime()
      : Number.NEGATIVE_INFINITY;
    const endMs = appliedDateEnd
      ? new Date(`${appliedDateEnd}T23:59:59.999`).getTime()
      : Number.POSITIVE_INFINITY;

    return rows
      .filter((row) => ["TOPUP", "ADJUSTMENT", "BOX_PURCHASE"].includes(row.kind))
      .filter((row) => (appliedKind === "ALL" ? true : row.kind === appliedKind))
      .filter((row) => {
        if (!appliedUsername) return true;
        const u = (row.member?.username || "").toLowerCase();
        return u.includes(appliedUsername.toLowerCase());
      })
      .filter((row) => {
        if (!hasDateFilter) return true;
        const created = new Date(row.created_at).getTime();
        return created >= startMs && created <= endMs;
      });
  }, [rows, appliedKind, appliedUsername, appliedDateStart, appliedDateEnd]);

  const displayName = profile?.username || currentUserEmail || "Akun Panel";

  // pastikan page valid saat jumlah hasil berubah
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

  // ---- render ----
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

  return (
    <main className="px-6 py-8">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-sky-400">Panel</p>
          <h1 className="text-xl font-semibold text-slate-50">Ledger Credit Member</h1>
          <p className="text-xs text-slate-400">
            Riwayat semua mutasi credit (topup, adjust, dan pembelian box) di WEB ini.
          </p>
        </div>

        {/* User dropdown (sama seperti Members) */}
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
                value={filterUsername}
                onChange={(e) => setFilterUsername(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") applyFilters();
                }}
                placeholder="cari username..."
                className="w-full rounded-lg border border-slate-700 bg-slate-900/80 px-3 py-2 text-xs text-slate-100 outline-none ring-0 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 max-w-xs"
              />
              <select
                value={filterKind}
                onChange={(e) => setFilterKind(e.target.value as any)}
                className="rounded-lg border border-slate-700 bg-slate-900/80 px-2 py-2 text-xs text-slate-100 outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
              >
                <option value="ALL">Semua</option>
                <option value="TOPUP">Topup</option>
                <option value="ADJUSTMENT">Adjustment (-)</option>
                <option value="BOX_PURCHASE">Beli box</option>
              </select>
            </div>
          </div>

          {/* Date range */}
          <div className="flex items-end gap-2">
            <div>
              <label className="mb-1 block text-xs text-slate-400">Tanggal mulai</label>
              <input
                type="date"
                value={filterDateStart}
                onChange={(e) => setFilterDateStart(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") applyFilters();
                }}
                className="rounded-lg border border-slate-700 bg-slate-900/80 px-2 py-2 text-xs text-slate-100 outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-400">Tanggal akhir</label>
              <input
                type="date"
                value={filterDateEnd}
                onChange={(e) => setFilterDateEnd(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") applyFilters();
                }}
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

      {/* Tabel ledger */}
      <div className="overflow-x-auto rounded-2xl border border-slate-700 bg-slate-950/60">
        <table className="min-w-full text-left text-xs text-slate-200">
          <thead className="border-b border-slate-800 bg-slate-900/70 text-[11px] uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-4 py-3">Waktu</th>
              <th className="px-2 py-3">Username</th>
              <th className="px-2 py-3 text-center">Mutasi</th>
              <th className="px-2 py-3 text-center">Saldo Akhir</th>
              <th className="px-2 py-3">Jenis</th>
              <th className="px-2 py-3">Keterangan</th>
              <th className="px-2 py-3">Dibuat oleh</th>
            </tr>
          </thead>
          <tbody>
            {loadingRows ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-slate-400">
                  Memuat data ledger...
                </td>
              </tr>
            ) : rowsError ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-red-300">
                  {rowsError}
                </td>
              </tr>
            ) : filteredRows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-slate-400">
                  Tidak ada mutasi yang cocok dengan filter.
                </td>
              </tr>
            ) : (
              pagedRows.map((row) => (
                <tr key={row.id} className="border-t border-slate-800/80 hover:bg-slate-900/60">
                  <td className="px-4 py-2 text-[11px]">{formatDateTime(row.created_at)}</td>
                  <td className="px-2 py-2 text-[11px]">{row.member?.username || "—"}</td>
                  <td className={`px-2 py-2 text-center text-[11px] font-semibold ${deltaClass(row.delta)}`}>
                    {deltaText(row.delta)}
                  </td>
                  <td className="px-2 py-2 text-center text-[11px]">{row.balance_after} credit</td>
                  <td className="px-2 py-2 text-[11px]">
                    <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold ${kindBadgeClass(row.kind)}`}>
                      {formatKind(row.kind)}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-[11px]">{row.description || "—"}</td>
                  <td className="px-2 py-2 text-[11px]">{row.created_by?.username || "—"}</td>
                </tr>
              ))
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
                <p className="text-xs text-red-400 bg-red-950/40 border border-red-900/50 rounded-lg px-3 py-2">
                  {selfPwdError}
                </p>
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

/* ----------------------- helpers ----------------------- */

function formatDateTime(dateStr: string) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" });
}

function formatKind(kind: string) {
  if (kind === "TOPUP") return "Topup";
  if (kind === "ADJUSTMENT") return "Adjustment (-)";
  if (kind === "BOX_PURCHASE") return "Beli box";
  return kind;
}

function kindBadgeClass(kind: string) {
  if (kind === "TOPUP") return "border-emerald-500/60 bg-emerald-950/50 text-emerald-200";
  if (kind === "ADJUSTMENT" || kind === "BOX_PURCHASE")
    return "border-rose-500/60 bg-rose-950/50 text-rose-200";
  return "border-slate-500/60 bg-slate-900/60 text-slate-200";
}

function deltaText(delta: number) {
  const sign = delta > 0 ? "+" : delta < 0 ? "-" : "";
  const abs = Math.abs(delta);
  return `${sign}${abs} credit`;
}

function deltaClass(delta: number) {
  if (delta > 0) return "text-emerald-300";
  if (delta < 0) return "text-rose-300";
  return "text-slate-200";
}
