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
  code:
    | "COMMON"
    | "RARE"
    | "EPIC"
    | "SUPREME"
    | "LEGENDARY"
    | "SPECIAL_LEGENDARY";
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
  real_probability: number | null;
  gimmick_probability: number | null;
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
  const [savingRarityId, setSavingRarityId] = useState<string | null>(null);

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

      // 4) Ambil rewards per tenant (termasuk probabilitas)
      const { data: rewards, error: rewErr } = await supabase
        .from("box_rewards")
        .select(
          "id, rarity_id, label, reward_type, amount, is_active, real_probability, gimmick_probability"
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
      (rewards || []).forEach((raw) => {
        const r = raw as any as RewardRow;
        if (!byRarity[r.rarity_id]) byRarity[r.rarity_id] = [];
        byRarity[r.rarity_id].push({
          ...r,
          real_probability: r.real_probability ?? 0,
          gimmick_probability: r.gimmick_probability ?? 0
        });
      });

      const combined: RarityWithRewards[] = (rarities || []).map((raw) => {
        const rar = raw as any as RarityRow;
        return {
          ...rar,
          rewards: byRarity[rar.id] || []
        };
      });

      setRows(combined);
      setLoading(false);
    }

    load();
  }, [router]);

  const canEdit = profile?.role === "ADMIN";

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

  function handleRewardChange(
    rarityId: string,
    rewardId: string,
    field: "is_active" | "real_probability" | "gimmick_probability",
    value: boolean | number
  ) {
    setRows((prev) =>
      prev.map((rar) => {
        if (rar.id !== rarityId) return rar;
        return {
          ...rar,
          rewards: rar.rewards.map((rw) => {
            if (rw.id !== rewardId) return rw;

            if (field === "is_active") {
              return { ...rw, is_active: value as boolean };
            }

            let num = Number(value);
            if (!Number.isFinite(num) || num < 0) num = 0;
            if (num > 100) num = 100;

            if (field === "real_probability") {
              return { ...rw, real_probability: num };
            } else {
              return { ...rw, gimmick_probability: num };
            }
          })
        };
      })
    );
  }

  function getSums(rar: RarityWithRewards) {
    let real = 0;
    let gimmick = 0;
    for (const rw of rar.rewards) {
      if (!rw.is_active) continue;
      real += rw.real_probability ?? 0;
      gimmick += rw.gimmick_probability ?? 0;
    }
    return { real, gimmick };
  }

  async function handleSaveRarity(rarityId: string) {
    const rar = rows.find((r) => r.id === rarityId);
    if (!rar) return;

    const { real, gimmick } = getSums(rar);

    if (real !== 100 || gimmick !== 100) {
      alert(
        `Total probability untuk rarity ini harus 100%.\n\nReal sekarang: ${real}%, Gimmick sekarang: ${gimmick}%.`
      );
      return;
    }

    setSavingRarityId(rarityId);

    try {
      const payload = rar.rewards.map((rw) => ({
        id: rw.id,
        is_active: rw.is_active,
        real_probability: rw.real_probability ?? 0,
        gimmick_probability: rw.gimmick_probability ?? 0
      }));

      const { error: updErr } = await supabase
        .from("box_rewards")
        .upsert(payload, { onConflict: "id" });

      if (updErr) {
        console.error(updErr);
        alert(updErr.message || "Gagal menyimpan konfigurasi reward.");
      } else {
        // optional: kamu bisa tambahin toast sukses
      }
    } catch (e) {
      console.error(e);
      alert("Terjadi kesalahan tak terduga saat menyimpan.");
    } finally {
      setSavingRarityId(null);
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
              Master data rarity & hadiah per tenant. Di sini Admin bisa
              mengatur probabilitas <span className="font-semibold">real</span>{" "}
              &amp; <span className="font-semibold">gimmick</span> untuk setiap
              hadiah. Total probabilitas (yang aktif) harus tepat 100%.
            </p>
          </div>
          {!canEdit && (
            <span className="text-[11px] px-3 py-1 rounded-full border border-slate-600 text-slate-300">
              Mode baca saja (role CS)
            </span>
          )}
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
            {rows.map((rar) => {
              const { real, gimmick } = getSums(rar);
              const sumOk = real === 100 && gimmick === 100;

              return (
                <section
                  key={rar.id}
                  className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4 space-y-3"
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      {rarityBadge(rar)}
                      <span className="text-xs text-slate-400">
                        Kode: {rar.code}
                      </span>
                    </div>
                    <div className="flex flex-col items-start md:items-end gap-1">
                      <span className="text-[11px] text-slate-400">
                        Total Real (aktif):{" "}
                        <span
                          className={
                            real === 100
                              ? "text-emerald-300 font-semibold"
                              : "text-red-300 font-semibold"
                          }
                        >
                          {real}%
                        </span>
                      </span>
                      <span className="text-[11px] text-slate-400">
                        Total Gimmick (aktif):{" "}
                        <span
                          className={
                            gimmick === 100
                              ? "text-emerald-300 font-semibold"
                              : "text-red-300 font-semibold"
                          }
                        >
                          {gimmick}%
                        </span>
                      </span>
                    </div>
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
                            Real (%)
                          </th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-300">
                            Gimmick (%)
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
                              colSpan={6}
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
                              <td className="px-3 py-2 align-middle">
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  disabled={!canEdit}
                                  className="w-20 rounded-lg border border-slate-700 bg-slate-950/80 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 disabled:opacity-60"
                                  value={rw.real_probability ?? 0}
                                  onChange={(e) =>
                                    handleRewardChange(
                                      rar.id,
                                      rw.id,
                                      "real_probability",
                                      Number(e.target.value)
                                    )
                                  }
                                />
                              </td>
                              <td className="px-3 py-2 align-middle">
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  disabled={!canEdit}
                                  className="w-20 rounded-lg border border-slate-700 bg-slate-950/80 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 disabled:opacity-60"
                                  value={rw.gimmick_probability ?? 0}
                                  onChange={(e) =>
                                    handleRewardChange(
                                      rar.id,
                                      rw.id,
                                      "gimmick_probability",
                                      Number(e.target.value)
                                    )
                                  }
                                />
                              </td>
                              <td className="px-3 py-2 align-middle">
                                <button
                                  type="button"
                                  disabled={!canEdit}
                                  onClick={() =>
                                    handleRewardChange(
                                      rar.id,
                                      rw.id,
                                      "is_active",
                                      !rw.is_active
                                    )
                                  }
                                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] border ${
                                    rw.is_active
                                      ? "border-emerald-500/70 bg-emerald-900/60 text-emerald-200"
                                      : "border-slate-600 bg-slate-800 text-slate-300"
                                  } ${
                                    !canEdit
                                      ? "opacity-60 cursor-not-allowed"
                                      : "cursor-pointer"
                                  }`}
                                >
                                  {rw.is_active ? "Aktif" : "Non-aktif"}
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] text-slate-500">
                      Probabilitas dihitung hanya dari hadiah yang{" "}
                      <span className="font-semibold text-emerald-300">
                        Aktif
                      </span>
                      . Total <span className="font-semibold">Real</span> dan{" "}
                      <span className="font-semibold">Gimmick</span> masing-
                      masing harus tepat{" "}
                      <span className="font-semibold text-emerald-300">
                        100%
                      </span>
                      .
                    </p>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => handleSaveRarity(rar.id)}
                        disabled={
                          savingRarityId === rar.id || !rar.rewards.length || !sumOk
                        }
                        className="inline-flex items-center rounded-lg bg-cyan-500 px-4 py-1.5 text-xs font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed transition"
                      >
                        {savingRarityId === rar.id
                          ? "Menyimpan..."
                          : sumOk
                          ? "Simpan konfigurasi"
                          : "Total belum 100%"}
                      </button>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
