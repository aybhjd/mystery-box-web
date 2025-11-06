"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type CurrentProfile = {
  id: string;
  tenant_id: string | null;
  role: "ADMIN" | "CS" | "MEMBER";
  username: string | null;
};

type MemberRow = {
  id: string;
  username: string | null;
  credit_balance: number;
  created_at: string;
};

async function getAccessToken() {
  const {
    data: { session }
  } = await supabase.auth.getSession();
  if (!session) {
    throw new Error("No active session");
  }
  return session.access_token;
}

export default function PanelMembersPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [currentProfile, setCurrentProfile] = useState<CurrentProfile | null>(
    null
  );
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Topup state
  const [topupMember, setTopupMember] = useState<MemberRow | null>(null);
  const [topupAmount, setTopupAmount] = useState("");
  const [topupNote, setTopupNote] = useState("");
  const [topupError, setTopupError] = useState<string | null>(null);
  const [topupLoading, setTopupLoading] = useState(false);

  // New member state
  const [newMemberOpen, setNewMemberOpen] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newInitialCredit, setNewInitialCredit] = useState("");
  const [newMemberError, setNewMemberError] = useState<string | null>(null);
  const [newMemberLoading, setNewMemberLoading] = useState(false);

  // Password state
  const [pwdMember, setPwdMember] = useState<MemberRow | null>(null);
  const [pwdNew, setPwdNew] = useState("");
  const [pwdConfirm, setPwdConfirm] = useState("");
  const [pwdError, setPwdError] = useState<string | null>(null);
  const [pwdLoading, setPwdLoading] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);

      // 1) Cek user login
      const {
        data: { user },
        error: userError
      } = await supabase.auth.getUser();

      if (userError) {
        console.error(userError);
        setError("Gagal membaca sesi login.");
        setLoading(false);
        return;
      }

      if (!user) {
        router.push("/panel/login");
        return;
      }

      // 2) Ambil profile current user
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id, tenant_id, role, username")
        .eq("id", user.id)
        .maybeSingle<CurrentProfile>();

      if (profileError) {
        console.error(profileError);
        setError("Gagal membaca profil.");
        setLoading(false);
        return;
      }

      if (!profile) {
        setError("Profil belum dibuat untuk user ini.");
        setLoading(false);
        return;
      }

      if (!profile.tenant_id) {
        setError("User ini belum terhubung ke tenant mana pun.");
        setLoading(false);
        return;
      }

      if (profile.role !== "ADMIN" && profile.role !== "CS") {
        setError("Hanya Admin / CS yang boleh mengakses halaman member.");
        setLoading(false);
        return;
      }

      setCurrentProfile(profile);

      // 3) Ambil semua member di tenant
      const { data: memberRows, error: membersError } = await supabase
        .from("profiles")
        .select("id, username, credit_balance, created_at")
        .eq("tenant_id", profile.tenant_id)
        .eq("role", "MEMBER")
        .order("created_at", { ascending: true });

      if (membersError) {
        console.error(membersError);
        setError("Gagal mengambil daftar member.");
        setLoading(false);
        return;
      }

      setMembers(memberRows ?? []);
      setLoading(false);
    }

    load();
  }, [router]);

  function formatDate(iso: string) {
    try {
      const d = new Date(iso);
      return d.toLocaleString("id-ID", {
        dateStyle: "short",
        timeStyle: "short"
      });
    } catch {
      return iso;
    }
  }

  const filteredMembers = members.filter((m) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const uname = (m.username ?? "").toLowerCase();
    return uname.includes(q);
  });

  // Topup
  function openTopupModal(member: MemberRow) {
    setTopupMember(member);
    setTopupAmount("");
    setTopupNote("");
    setTopupError(null);
  }

  function closeTopupModal() {
    setTopupMember(null);
    setTopupAmount("");
    setTopupNote("");
    setTopupError(null);
    setTopupLoading(false);
  }

  async function handleTopupSubmit(e: FormEvent) {
    e.preventDefault();
    if (!topupMember) return;

    setTopupError(null);

    const amountInt = parseInt(topupAmount, 10);
    if (!Number.isFinite(amountInt) || amountInt <= 0) {
      setTopupError("Jumlah credit harus lebih besar dari 0.");
      return;
    }

    setTopupLoading(true);

    try {
      const { data, error: rpcError } = await supabase.rpc(
        "perform_credit_topup",
        {
          p_member_id: topupMember.id,
          p_amount: amountInt,
          p_description: topupNote || null
        }
      );

      if (rpcError) {
        console.error(rpcError);
        setTopupError(rpcError.message || "Gagal melakukan topup.");
        setTopupLoading(false);
        return;
      }

      const newBalance =
        Array.isArray(data) && data.length > 0 && data[0].new_balance != null
          ? (data[0].new_balance as number)
          : topupMember.credit_balance + amountInt;

      setMembers((prev) =>
        prev.map((m) =>
          m.id === topupMember.id ? { ...m, credit_balance: newBalance } : m
        )
      );

      closeTopupModal();
    } catch (err) {
      console.error(err);
      setTopupError("Terjadi kesalahan tak terduga.");
      setTopupLoading(false);
    }
  }

  // New member
  function openNewMemberModal() {
    setNewMemberOpen(true);
    setNewUsername("");
    setNewPassword("");
    setNewInitialCredit("");
    setNewMemberError(null);
  }

  function closeNewMemberModal() {
    setNewMemberOpen(false);
    setNewUsername("");
    setNewPassword("");
    setNewInitialCredit("");
    setNewMemberError(null);
    setNewMemberLoading(false);
  }

  async function handleNewMemberSubmit(e: FormEvent) {
    e.preventDefault();
    setNewMemberError(null);

    const username = newUsername.trim();
    const password = newPassword;
    const initialCredit = newInitialCredit.trim()
      ? parseInt(newInitialCredit, 10)
      : 0;

    if (!username) {
      setNewMemberError("Username wajib diisi.");
      return;
    }
    if (!password) {
      setNewMemberError("Password wajib diisi.");
      return;
    }
    if (Number.isNaN(initialCredit) || initialCredit < 0) {
      setNewMemberError("Initial credit harus angka 0 atau lebih.");
      return;
    }

    setNewMemberLoading(true);

    try {
      const token = await getAccessToken();

      const res = await fetch("/api/panel/members/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ username, password, initialCredit })
      });

      const json = await res.json();

      if (!res.ok) {
        setNewMemberError(json.error || "Gagal membuat member.");
        setNewMemberLoading(false);
        return;
      }

      const created: MemberRow = json.member;

      setMembers((prev) => [...prev, created]);
      closeNewMemberModal();
    } catch (err) {
      console.error(err);
      setNewMemberError("Terjadi kesalahan tak terduga.");
      setNewMemberLoading(false);
    }
  }

  // Password member
  function openPasswordModal(member: MemberRow) {
    setPwdMember(member);
    setPwdNew("");
    setPwdConfirm("");
    setPwdError(null);
  }

  function closePasswordModal() {
    setPwdMember(null);
    setPwdNew("");
    setPwdConfirm("");
    setPwdError(null);
    setPwdLoading(false);
  }

  async function handlePasswordSubmit(e: FormEvent) {
    e.preventDefault();
    if (!pwdMember) return;

    setPwdError(null);

    if (!pwdNew) {
      setPwdError("Password baru wajib diisi.");
      return;
    }
    if (pwdNew !== pwdConfirm) {
      setPwdError("Konfirmasi password tidak sama.");
      return;
    }

    setPwdLoading(true);

    try {
      const token = await getAccessToken();

      const res = await fetch("/api/panel/members/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          memberId: pwdMember.id,
          newPassword: pwdNew
        })
      });

      const json = await res.json();

      if (!res.ok) {
        setPwdError(json.error || "Gagal mengubah password.");
        setPwdLoading(false);
        return;
      }

      closePasswordModal();
    } catch (err) {
      console.error(err);
      setPwdError("Terjadi kesalahan tak terduga.");
      setPwdLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-start justify-center px-4 py-10">
      <div className="w-full max-w-5xl space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-slate-400">
              Panel
            </p>
            <h1 className="text-2xl font-semibold">Members</h1>
            <p className="text-sm text-slate-400">
              Daftar member di tenant yang sama. Bisa topup, buat member baru,
              dan ubah password member.
            </p>
          </div>

          <button
            type="button"
            onClick={openNewMemberModal}
            className="rounded-lg border border-emerald-500/70 px-4 py-2 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/10 transition"
          >
            New Member
          </button>
        </div>

        {/* Filter username */}
        <div className="max-w-sm">
          <label className="block text-xs font-medium text-slate-300 mb-1">
            Filter username
          </label>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="cari username..."
            className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400"
          />
        </div>

        {loading && (
          <p className="text-sm text-slate-300">Memuat data member...</p>
        )}

        {!loading && error && (
          <p className="text-sm text-red-400 bg-red-950/40 border border-red-900/50 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        {!loading && !error && (
          <div className="overflow-x-auto rounded-2xl border border-slate-700 bg-slate-900/70">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-900/90 border-b border-slate-700/80">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">
                    Username
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">
                    Credit
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-300">
                    Dibuat
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-slate-300">
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredMembers.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-6 text-center text-slate-400"
                    >
                      Tidak ada member yang cocok dengan filter.
                    </td>
                  </tr>
                ) : (
                  filteredMembers.map((m) => (
                    <tr
                      key={m.id}
                      className="border-t border-slate-800/80 hover:bg-slate-800/60"
                    >
                      <td className="px-4 py-3 align-middle">
                        {m.username ?? "—"}
                      </td>
                      <td className="px-4 py-3 align-middle">
                        {m.credit_balance} credit
                      </td>
                      <td className="px-4 py-3 align-middle text-slate-400">
                        {formatDate(m.created_at)}
                      </td>
                      <td className="px-4 py-3 align-middle text-right space-x-2">
                        <button
                          type="button"
                          onClick={() => openTopupModal(m)}
                          className="inline-flex items-center rounded-lg border border-emerald-500/60 px-3 py-1.5 text-xs font-medium text-emerald-200 hover:bg-emerald-500/10 transition"
                        >
                          Topup
                        </button>
                        <button
                          type="button"
                          className="inline-flex items-center rounded-lg border border-amber-500/60 px-3 py-1.5 text-xs font-medium text-amber-200 opacity-60 cursor-not-allowed"
                          title="Adjust (-) belum diaktifkan (next step)"
                        >
                          Adjust (-)
                        </button>
                        <button
                          type="button"
                          onClick={() => openPasswordModal(m)}
                          className="inline-flex items-center rounded-lg border border-slate-500/70 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700/60 transition"
                        >
                          Password
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Topup */}
      {topupMember && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900/95 p-6 space-y-4">
            <h2 className="text-lg font-semibold">
              Topup Credit – {topupMember.username ?? "Tanpa username"}
            </h2>
            <p className="text-xs text-slate-400">
              Credit saat ini:{" "}
              <span className="font-mono text-emerald-300">
                {topupMember.credit_balance}
              </span>
            </p>

            <form onSubmit={handleTopupSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="topup-amount">
                  Jumlah credit
                </label>
                <input
                  id="topup-amount"
                  type="number"
                  min={1}
                  step={1}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  placeholder="contoh: 10"
                  value={topupAmount}
                  onChange={(e) => setTopupAmount(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="topup-note">
                  Catatan (opsional)
                </label>
                <textarea
                  id="topup-note"
                  rows={2}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 resize-none"
                  placeholder="mis. Topup manual dari CS"
                  value={topupNote}
                  onChange={(e) => setTopupNote(e.target.value)}
                />
              </div>

              {topupError && (
                <p className="text-xs text-red-400 bg-red-950/40 border border-red-900/50 rounded-lg px-3 py-2">
                  {topupError}
                </p>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={closeTopupModal}
                  className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs hover:bg-slate-800 transition"
                  disabled={topupLoading}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={topupLoading || !topupAmount}
                  className="rounded-lg bg-emerald-500 px-4 py-1.5 text-xs font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60 disabled:cursor-not-allowed transition"
                >
                  {topupLoading ? "Memproses..." : "Simpan Topup"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal New Member */}
      {newMemberOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900/95 p-6 space-y-4">
            <h2 className="text-lg font-semibold">New Member</h2>
            <p className="text-xs text-slate-400">
              Email internal akan otomatis dibuat sebagai{" "}
              <span className="font-mono">username@member.local</span>.
            </p>

            <form onSubmit={handleNewMemberSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="nm-username">
                  Username
                </label>
                <input
                  id="nm-username"
                  type="text"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                  placeholder="contoh: hero123"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="nm-password">
                  Password awal
                </label>
                <input
                  id="nm-password"
                  type="password"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <label
                  className="text-sm font-medium"
                  htmlFor="nm-initial-credit"
                >
                  Initial credit (opsional)
                </label>
                <input
                  id="nm-initial-credit"
                  type="number"
                  min={0}
                  step={1}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
                  placeholder="0"
                  value={newInitialCredit}
                  onChange={(e) => setNewInitialCredit(e.target.value)}
                />
              </div>

              {newMemberError && (
                <p className="text-xs text-red-400 bg-red-950/40 border border-red-900/50 rounded-lg px-3 py-2">
                  {newMemberError}
                </p>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={closeNewMemberModal}
                  className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs hover:bg-slate-800 transition"
                  disabled={newMemberLoading}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={
                    newMemberLoading || !newUsername.trim() || !newPassword
                  }
                  className="rounded-lg bg-cyan-500 px-4 py-1.5 text-xs font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-60 disabled:cursor-not-allowed transition"
                >
                  {newMemberLoading ? "Membuat..." : "Simpan Member"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Password Member */}
      {pwdMember && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900/95 p-6 space-y-4">
            <h2 className="text-lg font-semibold">
              Ubah Password – {pwdMember.username ?? "Tanpa username"}
            </h2>

            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="pwd-new">
                  Password baru
                </label>
                <input
                  id="pwd-new"
                  type="password"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                  value={pwdNew}
                  onChange={(e) => setPwdNew(e.target.value)}
                  placeholder="••••••••"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium" htmlFor="pwd-confirm">
                  Konfirmasi password
                </label>
                <input
                  id="pwd-confirm"
                  type="password"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                  value={pwdConfirm}
                  onChange={(e) => setPwdConfirm(e.target.value)}
                  placeholder="••••••••"
                />
              </div>

              {pwdError && (
                <p className="text-xs text-red-400 bg-red-950/40 border border-red-900/50 rounded-lg px-3 py-2">
                  {pwdError}
                </p>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={closePasswordModal}
                  className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs hover:bg-slate-800 transition"
                  disabled={pwdLoading}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={pwdLoading || !pwdNew || !pwdConfirm}
                  className="rounded-lg bg-sky-500 px-4 py-1.5 text-xs font-semibold text-slate-950 hover:bg-sky-400 disabled:opacity-60 disabled:cursor-not-allowed transition"
                >
                  {pwdLoading ? "Menyimpan..." : "Simpan Password"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
