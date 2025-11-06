"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type CurrentProfile = {
  id: string;
  tenant_id: string | null;
  role: "ADMIN" | "CS" | "MEMBER";
  username: string | null;
};

type RarityRow = {
  id: string;
  code: "COMMON" | "RARE" | "EPIC" | "SUPREME" | "LEGENDARY" | "SPECIAL_LEGENDARY";
  name: string;
  color_key: string;
  sort_order: number;
};

type RewardRow = {
  id: string;
  rarity_id: string;
  label: string;
  reward_type: string;
  amount: number | null;
  is_active: boolean;
};

type RarityWithRewards = RarityRow & {
  rewards: RewardRow[];
};

export default function PanelBoxesPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<CurrentProfile | null>(null);
  const [rows, setRows] = useState<RarityWithRewards[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);

      // 1) Cek user
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

      // 2) Ambil profile (tenant + role)
      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("id, tenant_id, role, username")
        .eq("id", user.id)
        .maybeSingle<CurrentProfile>();

      if (profErr) {
        console.error(profErr);
        setError("Gagal membaca profil.");
        setLoading(false);
        return;
      }

      if (!prof) {
        setError("Profil belum dibuat untuk user ini.");
        setLoading(false);
        return;
      }

      if (!prof.tenant_id) {
        setError("User ini belum terhubung ke tenant mana pun.");
        setLoading(false);
        return;
      }

      if (prof.role !== "ADMIN" && prof.role !== "CS") {
        setError("Hanya Admin / CS yang boleh mengakses konfigurasi box.");
        setLoading(false);
        return;
      }

      setProfile(prof);

      // 3) Ambil master rarity
      const { data: rarities, error: rarErr } = await supabase
        .from("box_rarities")
        .select("id, code, name, color_key, sort_order")
        .order("sort_order", { ascending: true });

      if (rarErr) {
        console.error(rarErr);
        setError("Gagal mengambil data rarity.");
        setLoading(false);
        return;
      }

      // 4) Ambil rewards per tenant
      const { data: rewards, error: rewErr } = await supabase
        .from("box_rewards")
        .select(
          "id, rarity_id, label, reward_type, amount, is_active"
        )
        .eq("tenant_id", prof.tenant_id)
        .order("rarity_id", { ascending: true });

      if (rewErr) {
        console.error(rewErr);
        setError("Gagal mengambil daftar hadiah.");
        setLoading(false);
        return;
      }

      const byRarity: Record<string, RewardRow[]> = {};
      (rewards || []).forEach((r) => {
        if (!byRarity[r.rarity_id]) byRarity[r.rarity_id] = [];
        byRarity[r.rarity_id].push(r);
      });

      const combined: RarityWithRewards[] = (rarities || []).map((rar) => ({
        ...rar,
        rewards: byRarity[rar.id] || []
      }));

      setRows(combined);
      setLoading(false);
    }

    load();
  }, [router]);

  function formatAmount(amount: number | null, reward_type: string) {
    if (reward_type === "CASH" && amount != null) {
      return new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        minimumFractionDigits: 0
      }).format(amount);
    }
    return "-";
  }

  function rarityBadge(r: RarityRow) {
    const base =
      "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold";
    switch (r.code) {
      case "COMMON":
        return (
          <span className={`${base} bg-emerald-900/50 text-emerald-300`}>
            Common
          </span>
        );
      case "RARE":
        return (
          <span className={`${base} bg-sky-900/60 text-sky-300`}>Rare</span>
        );
      case "EPIC":
        return (
          <span className={`${base} bg-purple-900/60 text-purple-300`}>
            Epic
          </span>
        );
      case "SUPREME":
        return (
          <span className={`${base} bg-yellow-900/60 text-yellow-300`}>
            Supreme
          </span>
        );
      case "LEGENDARY":
        return (
          <span className={`${base} bg-amber-900/70 text-amber-300`}>
            Legendary
          </span>
        );
      case "SPECIAL_LEGENDARY":
        return (
          <span className={`${base} bg-pink-900/70 text-pink-200`}>
            Special Legendary
          </span>
        );
      default:
        return (
          <span className={`${base} bg-slate-800 text-slate-200`}>
            {r.name}
          </span>
        );
    }
  }

  return (
    <main className="min-h-screen flex items-start justify-center px-4 py-10">
      <div className="w-full max-w-5xl space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-slate-400">
              Panel
            </p>
            <h1 className="text-2xl font-semibold">Box & Rewards</h1>
            <p className="text-sm text-slate-400">
              Master data rarity & hadiah per tenant. Nanti di sini kita atur
              probabilitas real & gimmick (beli box dan buka box).
            </p>
          </div>
        </div>

        {loading && (
          <p className="text-sm text-slate-300">Memuat konfigurasi box...</p>
        )}

        {!loading && error && (
          <p className="text-sm text-red-400 bg-red-950/40 border border-red-900/50 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        {!loading && !error && (
          <div className="space-y-4">
            {rows.map((rar) => (
              <section
                key={rar.id}
                className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4 space-y-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {rarityBadge(rar)}
                    <span className="text-xs text-slate-400">
                      Kode: {rar.code}
                    </span>
                  </div>
                  <span className="text-xs text-slate-500">
                    Urutan tampilan: {rar.sort_order}
                  </span>
                </div>

                <div className="rounded-xl border border-slate-700/80 bg-slate-950/50 overflow-hidden">
                  <table className="min-w-full text-xs">
                    <thead className="bg-slate-900/90 border-b border-slate-700/80">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-slate-300">
                          Hadiah
                        </th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-300">
                          Tipe
                        </th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-300">
                          Nominal
                        </th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-300">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rar.rewards.length === 0 ? (
                        <tr>
                          <td
                            colSpan={4}
                            className="px-3 py-3 text-center text-slate-400"
                          >
                            Belum ada reward untuk rarity ini.
                          </td>
                        </tr>
                      ) : (
                        rar.rewards.map((rw) => (
                          <tr
                            key={rw.id}
                            className="border-t border-slate-800/80"
                          >
                            <td className="px-3 py-2 align-middle">
                              {rw.label}
                            </td>
                            <td className="px-3 py-2 align-middle text-slate-300">
                              {rw.reward_type}
                            </td>
                            <td className="px-3 py-2 align-middle">
                              {formatAmount(rw.amount, rw.reward_type)}
                            </td>
                            <td className="px-3 py-2 align-middle text-slate-300">
                              {rw.is_active ? (
                                <span className="inline-flex items-center rounded-full bg-emerald-900/60 text-emerald-300 px-2 py-0.5">
                                  Aktif
                                </span>
                              ) : (
                                <span className="inline-flex items-center rounded-full bg-slate-800 text-slate-300 px-2 py-0.5">
                                  Non-aktif
                                </span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <p className="text-[11px] text-slate-500">
                  Catatan: konfigurasi probabilitas (real & gimmick) untuk hadiah
                  ini akan ditambahkan di tahap berikutnya. Saat ini ini masih
                  view-only master data.
                </p>
              </section>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
