"use client";

import { FormEvent, useEffect, useState } from "react";
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

  // State untuk modal topup
  const [topupMember, setTopupMember] = useState<MemberRow | null>(null);
  const [topupAmount, setTopupAmount] = useState("");
  const [topupNote, setTopupNote] = useState("");
  const [topupError, setTopupError] = useState<string | null>(null);
  const [topupLoading, setTopupLoading] = useState(false);

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

      // Update state members
      setMembers((prev) =>
        prev.map((m) =>
          m.id === topupMember.id
            ? { ...m, credit_balance: newBalance }
            : m
        )
      );

      closeTopupModal();
    } catch (err) {
      console.error(err);
      setTopupError("Terjadi kesalahan tak terduga.");
      setTopupLoading(false);
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
              Daftar member di tenant yang sama. Bisa topup credit dari Panel.
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
                  </
