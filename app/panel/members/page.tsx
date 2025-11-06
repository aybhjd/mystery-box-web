"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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

export default function PanelMembersPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [currentProfile, setCurrentProfile] = useState<CurrentProfile | null>(
    null
  );
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [error, setError] = useState<string | null>(null);

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

      // 2) Ambil profile current user (untuk tenant & role)
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

      // 3) Ambil semua member di tenant yang sama
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
              Daftar member di tenant yang sama. Nanti di sini kita tambah
              topup credit & detail riwayat.
            </p>
          </div>

          <Link
            href="/panel/dashboard"
            className="text-xs rounded-lg border border-slate-600 px-3 py-1.5 hover:bg-slate-800 transition"
          >
            Kembali ke Dashboard
          </Link>
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
                {members.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-6 text-center text-slate-400"
                    >
                      Belum ada member di tenant ini.
                    </td>
                  </tr>
                ) : (
                  members.map((m) => (
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
                      <td className="px-4 py-3 align-middle text-right">
                        <button
                          type="button"
                          className="inline-flex items-center rounded-lg border border-emerald-500/60 px-3 py-1.5 text-xs font-medium text-emerald-200 hover:bg-emerald-500/10 cursor-not-allowed opacity-60"
                          title="Topup belum diaktifkan (next step)"
                        >
                          Topup (soon)
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
    </main>
  );
}
