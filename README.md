# Mystery Box Giveaway – Panel & Member (Checkpoint)

Project ini adalah sistem **website giveaway dengan konsep mystery box**:

- **Panel (Admin/CS)** untuk kelola tenant, member, credit, hadiah, dan probabilitas.
- **Member site** (tema fantasy RPG) untuk beli dan buka mystery box.

Dokumen ini adalah **checkpoint** kondisi project saat ini:  
apa saja yang sudah jadi, dan apa yang **belum** dikerjakan.

> Catatan: struktur & nama tabel di sini mengikuti implementasi di Supabase yang sudah dibuat selama pairing.

---

## 1. Tech Stack

- **Next.js 14** (App Router)
- **TypeScript**
- **Supabase**
  - Auth (email/password)
  - Postgres (schema + RLS)
  - RPC (planned / sebagian sudah ada)
- **Vercel** untuk deploy

---

## 2. High-level Konsep

### Multi-tenant

- Sistem mendukung beberapa **tenant**.
- **1 tenant = 1 panel + 1 member site** (secara konsep).
- Di DB ada tabel `tenants`, dengan minimal 1 tenant seed (mis. kode `MBOX1`).

### Role User

Enum `user_role` (di DB):

- `ADMIN`
- `CS`
- `MEMBER`

**Panel** hanya bisa diakses oleh `ADMIN` dan `CS`.  
**Member site** hanya bisa diakses oleh `MEMBER`.

### Auth & Login

- Panel login: **email + password**
  - contoh admin: `mugen8@tech.com` (disesuaikan dengan environment kamu).
- Member login: **username + password**
  - secara teknis di Supabase tetap **email**, dengan pola:
    - `username@member.local`
  - Panel saat membuat member baru akan:
    - generate auth user Supabase dengan email `username@member.local`,
    - simpan `username` di tabel `profiles`.

---

## 3. Schema Supabase (ringkasan)

### 3.1. Enum & helper

- `user_role`: `ADMIN | CS | MEMBER`
- `box_rarity_code`:  
  `COMMON | RARE | EPIC | SUPREME | LEGENDARY | SPECIAL_LEGENDARY`

Helper functions (dipakai di RLS):

- `current_profile_tenant_id() -> uuid`
- `current_profile_role() -> user_role`

Keduanya membaca row dari `public.profiles` berdasarkan `auth.uid()`.

---

### 3.2. Tabel inti

#### `public.tenants`

- `id` (uuid, PK)
- `code` (text, unik, mis. `MBOX1`)
- `name` (text)
- dll (bisa ditambah nanti: kontak WA, tema, dsb)

#### `public.profiles`

Mapping user Supabase ke tenant + role.

- `id` (uuid, PK, sama dengan `auth.users.id`)
- `tenant_id` (uuid, FK → `tenants.id`)
- `role` (`user_role`)
- `username` (text, optional, dipakai untuk MEMBER)
- `credit_balance` (bigint, default 0)
- `created_at`, `updated_at`

**RLS**:

- `ENABLE ROW LEVEL SECURITY`
- Policy SELECT:
  - user boleh baca **profil dirinya sendiri**.
  - `ADMIN`/`CS` boleh baca semua profil dalam **tenant yang sama**.
- Policy UPDATE:
  - user boleh update row-nya sendiri,
  - `ADMIN`/`CS` boleh update row profil di tenant yang sama  
    (dipakai untuk topup/adjust credit via RPC).

INSERT biasanya dilakukan via **service role** (supabase admin client) → bypass RLS.

#### `public.credit_ledger`

Mencatat mutasi credit setiap member.

Field inti (konsep):

- `id` (uuid, PK)
- `tenant_id` (uuid, FK → `tenants`)
- `member_profile_id` (uuid, FK → `profiles`)
- `admin_profile_id` (uuid, FK → `profiles`) – siapa yang melakukan topup/adjust
- `amount` / `delta` (bigint)
- `direction` / `type` (mis. `TOPUP`, `ADJUST_MINUS`, dll)
- `note` / `description`
- `created_at`

**RLS**:

- `ENABLE ROW LEVEL SECURITY`
- Policy SELECT:
  - member boleh baca ledger miliknya sendiri,
  - `ADMIN`/`CS` boleh baca semua ledger di tenant-nya.
- Policy INSERT:
  - hanya `ADMIN`/`CS` di tenant tersebut yang boleh insert  
    (dipakai oleh RPC topup/adjust).

> Detail schema tepatnya tersimpan di Supabase, tapi secara konsep ledger sudah dipakai di Panel untuk Topup/Adjust.

---

### 3.3. Tabel Box & Hadiah

#### `public.box_rarities`

Master rarity (global, semua tenant pakai).

- `id` (uuid, PK)
- `code` (`box_rarity_code`)
- `name` (Common, Rare, ...)
- `color_key` (string, mis. `green`, `blue`, dll)
- `sort_order` (integer – urutan tampilan)

Seed default:

- COMMON
- RARE
- EPIC
- SUPREME
- LEGENDARY
- SPECIAL_LEGENDARY

#### `public.box_rewards`

Hadiah per rarity per tenant (RNG 2).

- `id` (uuid, PK)
- `tenant_id` (uuid, FK → `tenants`)
- `rarity_id` (uuid, FK → `box_rarities`)
- `label` (text) – contoh: `Saldo 5k`, `HP Android`, `Fine Gold`
- `reward_type` (text) – `CASH` atau `ITEM`
- `amount` (bigint | null) – nominal kalau `CASH`
- `is_active` (boolean)
- `real_probability` (integer, default 0)
- `gimmick_probability` (integer, default 0)
- `created_at`

Seed default untuk tenant `MBOX1` (sesuai spek awal):

- Common: 5k, 10k, 15k
- Rare: 20k, 25k, 35k
- Epic: 50k, 75k
- Supreme: 100k, 150k
- Legendary: 200k, 250k
- Special Legendary: 300k, 500k, 1.000k, HP Android, Fine Gold

**RLS**:

- `ENABLE ROW LEVEL SECURITY`
- SELECT:
  - semua user (ADMIN/CS/MEMBER) cuma bisa baca row dengan `tenant_id = current_profile_tenant_id()`.
- UPDATE:
  - hanya `ADMIN` pada tenant tersebut.
- INSERT:
  - hanya `ADMIN` pada tenant tersebut  
    (dipakai saat admin menambah hadiah baru via Panel).

#### `public.box_credit_rarity_probs`

Konfigurasi probabilitas dapat rarity saat **beli box** (RNG 1).

- `id` (uuid, PK)
- `tenant_id` (uuid, FK → `tenants`)
- `credit_tier` (integer, `1 | 2 | 3`)
- `rarity_id` (uuid, FK → `box_rarities`)
- `is_active` (boolean)
- `real_probability` (integer, default 0)
- `gimmick_probability` (integer, default 0)
- `created_at`
- UNIQUE `(tenant_id, credit_tier, rarity_id)`

Seed awal untuk `MBOX1`:

- Tier 1 (1 credit): semua rarity ada, `is_active = true`.
- Tier 2 (2 credit): semua rarity, tapi:
  - `COMMON` → `is_active = false` (tidak ikut hitung).
- Tier 3 (3 credit): semua rarity, tapi:
  - `COMMON` & `RARE` → `is_active = false`.

**RLS**:

- `ENABLE ROW LEVEL SECURITY`
- SELECT:
  - semua user di tenant tsb bisa membaca.
- INSERT & UPDATE:
  - hanya `ADMIN` di tenant tsb.

---

## 4. Fitur Panel – Sudah Jadi ✅

### 4.1. Auth Panel

- Halaman `/panel/login`
  - Login dengan **email + password** (Supabase Auth).
- Layout Panel:
  - Sidebar kiri (desktop-friendly) dengan menu:
    - `Members`
    - `Boxes`
  - Header berisi info user yang sedang login + dropdown:
    - Ubah password sendiri
    - Logout
- Hanya `ADMIN` & `CS` yang bisa mengakses halaman Panel.

---

### 4.2. Halaman **Members** (`/panel/members`)

Fitur:

1. **List Member**
   - Tabel berisi:
     - username
     - email (internal, `username@member.local`)
     - role (MEMBER)
     - credit balance
     - kolom aksi
   - Filter di header:
     - search by username.

2. **New Member**
   - Tombol “New Member” → buka modal:
     - input `Username`
     - input `Password` + `Konfirmasi Password`
     - input optional `Initial credit`
   - Saat submit:
     - membuat user baru di Supabase Auth dengan email `username@member.local`.
     - membuat row di `profiles`:
       - `tenant_id` mengikuti admin/CS yang sedang login,
       - `role = MEMBER`,
       - `username`,
       - `credit_balance` sesuai initial credit.
     - kalau initial credit > 0, seharusnya juga mencatat entry di `credit_ledger` (behaviour tergantung implementasi RPC/route yang sudah dibuat).
   - Validasi:
     - username wajib,
     - password wajib,
     - password = konfirmasi password,
     - initial credit kalau diisi harus angka ≥ 0.

3. **Topup Credit Member**
   - Di setiap row member ada tombol **Topup**:
     - modal input nominal (positive),
     - optional note.
   - Saat submit:
     - update `profiles.credit_balance` member,
     - insert ke `credit_ledger` dengan tenant + siapa admin/CS yang melakukan.
   - RLS menjamin:
     - hanya `ADMIN`/`CS` di tenant sama yang boleh melakukan.

4. **Adjust (Minus) Credit Member**
   - Tombol **Adjust**:
     - modal input nominal minus (mengurangi credit),
     - misal karena koreksi manual.
   - Serupa dengan Topup, tapi arah mutasi kebalik.

5. **Reset Password Member**
   - Tombol **Password** di row member:
     - modal untuk set password baru.
   - Menggunakan Supabase Admin (service key) untuk update password Auth user tersebut.

6. **Ubah Password Admin/CS Sendiri**
   - Di header, dropdown user → menu `Password`:
     - modal untuk ganti password login panel sendiri.

7. **Logout**
   - Menu logout di dropdown user.

---

### 4.3. Halaman **Boxes** (`/panel/boxes`)

Halaman ini punya **dua blok besar**:

#### A. Konfigurasi Hadiah per Rarity (RNG 2 – saat buka box)

Untuk **setiap rarity** (Common, Rare, Epic, dst):

- Menampilkan card berisi:
  - badge rarity (warna sesuai tema),
  - kode rarity,
  - info:
    - total Real (aktif)
    - total Gimmick (aktif)

- Tabel hadiah per rarity:
  - kolom:
    - Hadiah (label)
    - Tipe (CASH / ITEM)
    - Nominal
    - Real (%) – input number
    - Gimmick (%) – input number
    - Status (Aktif / Non-aktif – toggle)
    - Aksi (Edit) – hanya untuk `ADMIN`
  - Admin bisa:
    - mengubah `Real %` dan `Gimmick %` untuk setiap hadiah,
    - mengaktifkan / menonaktifkan hadiah,
    - mengedit hadiah (nama, tipe, nominal) lewat modal,
    - menambah hadiah baru via tombol **“Tambah Hadiah”** yang:
      - memilih rarity tujuan,
      - input label hadiah,
      - pilih tipe CASH/ITEM,
      - input nominal (kalau CASH),
      - pilih status awal aktif/non-aktif.

- Aturan probabilitas (Real & Gimmick):
  - Hanya hadiah dengan `is_active = true` yang dihitung.
  - Total Real% (aktif) untuk 1 rarity **harus 100**.
  - Total Gimmick% (aktif) untuk 1 rarity **harus 100**.
  - Tombol **“Simpan konfigurasi”**:
    - **disable** kalau total Real ≠ 100 atau total Gimmick ≠ 100.
    - saat klik:
      - melakukan `UPDATE` ke `box_rewards` (tanpa `UPSERT`).
  - Gimmick % hanya untuk FE (teasing), **tidak** dipakai RNG di backend.

#### B. Probabilitas Rarity per Credit Tier (RNG 1 – saat beli box)

Bagian kedua di bawah:

- Tiga section:
  - Box 1 Credit
  - Box 2 Credit (mulai Rare)
  - Box 3 Credit (mulai Epic)
- Di setiap section:
  - tabel list rarity yang boleh:
    - Tier 1: semua rarity.
    - Tier 2: `COMMON` otomatis disembunyikan (tidak ikut UI & hitungan).
    - Tier 3: `COMMON` & `RARE` disembunyikan.
  - kolom:
    - Rarity (badge)
    - Real (%)
    - Gimmick (%)
    - Status (Aktif / Non-aktif)
  - Aturan:
    - hanya rarity `is_active = true` yang dihitung di total.
    - total Real% (aktif) untuk 1 tier **harus 100**.
    - total Gimmick% (aktif) untuk 1 tier **harus 100**.
  - Tombol **“Simpan konfigurasi”** per tier:
    - disable kalau total ≠ 100,
    - melakukan `UPDATE` ke `box_credit_rarity_probs` per row.

---

## 5. Fitur Member Site – Status Saat Ini

### Sudah ada ✅

- Halaman login member (path misalnya `/member/login`):
  - login menggunakan **username + password**,
  - di-backend tetap pakai Supabase Auth (email `username@member.local`).
- Supabase session sudah bisa dipakai di sisi member (basic auth flow).

### Belum dikerjakan ❌

- Halaman utama member (dashboard):
  - tampilan credit user,
  - daftar box (1/2/3 credit) yang bisa dibeli.
- Halaman toko / pembelian box:
  - tombol beli box per credit tier.
  - panggilan RPC `purchase_box`.
- Halaman inventory (box yang sudah dibeli, belum dibuka):
  - list box dengan sisa waktu (7 hari),
  - tombol Buka yang memanggil RPC `open_box`.
- Halaman / section history member:
  - list box yang sudah dibuka + hadiah yang didapat.
- **Animasi**:
  - animasi saat beli box (RNG rarity),
  - animasi saat buka box (RNG hadiah).
- Popup “Silahkan Hubungi Kami” setelah box dibuka:
  - redirect ke kontak admin (mis. link WhatsApp dari tabel `tenants`).

---

## 6. Konsep RNG & Probabilitas (Ringkasan)

**RNG 1 – Saat beli box**

- Input: pilihan member: box 1 credit / 2 credit / 3 credit.
- Sumber data:
  - tabel `box_credit_rarity_probs` (Real probability).
- Aturan:
  - Tier 1: boleh Common ke atas.
  - Tier 2: mulai dari Rare.
  - Tier 3: mulai dari Epic.
  - Hanya row `is_active = true` yang dipakai.
  - Total Real% per tier = **100**.
  - Gimmick% per tier hanya dipakai FE untuk `info persentase` dan animasi, tidak mempengaruhi RNG backend.

**RNG 2 – Saat buka box**

- Input: rarity yang sudah ditentukan saat beli.
- Sumber data:
  - tabel `box_rewards` untuk rarity tersebut (Real probability).
- Aturan:
  - Hanya hadiah `is_active = true` yang dihitung.
  - Total Real% per rarity = **100**.
  - Gimmick% per hadiah hanya untuk FE (teasing / info di UI).

---

## 7. Checkpoint – TODO / Belum Dikerjakan

Berikut ini daftar TODO penting yang **belum** diimplementasi per checkpoint ini:

### 7.1. Step 1 – Struktur transaksi box di Supabase

Belum ada tabel khusus untuk menyimpan transaksi mystery box.  
Rencana (nama bisa berubah):

- Tabel `box_transactions` (atau serupa) dengan kolom:
  - `id`
  - `tenant_id`
  - `member_profile_id`
  - `credit_tier` (1 / 2 / 3)
  - `credit_spent`
  - `credit_ledger_id` (relasi ke tabel ledger)
  - `rarity_id` (hasil RNG 1 saat beli)
  - `status` (`PURCHASED`, `OPENED`, `EXPIRED`)
  - `reward_id` (FK ke `box_rewards`, diisi saat box dibuka)
  - `expires_at` (7 hari sejak pembelian)
  - `opened_at`
  - `processed` (bool – sudah diproses admin/CS atau belum)
  - `processed_by_profile_id`
  - `processed_at`

- RLS:
  - member hanya boleh melihat transaksi miliknya,
  - `ADMIN`/`CS` boleh melihat seluruh transaksi di tenant-nya,
  - `UPDATE processed` dan field admin hanya boleh oleh `ADMIN`/`CS`.

### 7.2. Step 2 – RPC untuk beli & buka box

Belum dibuat:

1. `purchase_box(credit_tier int)`
   - Validasi:
     - role user = MEMBER,
     - credit mencukupi,
     - tenant valid.
   - Logika:
     - ambil konfigurasi Real dari `box_credit_rarity_probs`,
     - RNG memilih `rarity_id` (RNG 1),
     - potong `credit_balance` member,
     - insert ke `credit_ledger`,
     - insert ke `box_transactions` dengan status `PURCHASED`, set `expires_at = now() + interval '7 days'`,
     - return ke FE (rarity, sisa credit, info transaksi).

2. `open_box(transaction_id uuid)`
   - Validasi:
     - transaksi milik user sekarang (member),
     - status `PURCHASED`,
     - belum expired (`now() < expires_at`).
   - Logika:
     - ambil hadiah dari `box_rewards` untuk `rarity_id` transaksi,
     - pakai Real probability → RNG pilih `reward_id`,
     - update `box_transactions`:
       - status `OPENED`,
       - set `reward_id`, `opened_at`,
     - return hadiah ke FE (label, type, nilai) untuk animasi.

> Gimmick prob tetap hanya untuk FE, **tidak** dipakai di fungsi-fungsi ini.

### 7.3. Step 3 – Halaman History di Panel

Belum dibuat:

- Menu `History` di sidebar panel.
- Halaman yang menampilkan daftar `box_transactions`:
  - filter berdasarkan username, status, credit tier, date range.
  - kolom:
    - username member,
    - credit spent,
    - kode transaksi / ID,
    - credit tier,
    - rarity,
    - reward (kalau sudah buka),
    - status (Purchased / Opened / Expired),
    - processed flag + siapa yang memproses.
- Tombol `Process`:
  - misalnya checkbox / tombol per row:
    - hanya `ADMIN`/`CS` yang bisa klik,
    - set `processed = true`, `processed_by_profile_id`, `processed_at`.

### 7.4. Step 4 – Member Site: store, inventory, animasi

Belum dibuat:

- **Store / Shop** (member):
  - tampilan 3 box (1 / 2 / 3 credit),
  - informasi credit member,
  - info persentase **gimmick** (teasing),
  - tombol beli yang memanggil RPC `purchase_box`.

- **Inventory**:
  - list box dengan status `PURCHASED` dan belum expired (7 hari),
  - countdown sisa waktu dari `expires_at`,
  - tombol `Buka` (call `open_box`),
  - jika sudah lewat 7 hari, status berubah `EXPIRED` dan box hilang dari inventory member (tapi tetap ada di DB / history panel).

- **History member**:
  - list box yang sudah dibuka,
  - hadiah yang didapat,
  - status processed oleh admin atau belum (opsional).

- **Animasi & UX**:
  - animasi beli box (RNG 1, reveal rarity dengan efek “wah” & “deg-degan”),
  - animasi buka box (RNG 2, reveal hadiah),
  - popup “Silahkan Hubungi Kami” setelah reveal hadiah:
    - link ke kontak admin (mis. WA) yang idealnya diambil dari konfigurasi tenant.

---

## 8. Cara Update README ke Depan

Setiap kali selesai 1 blok besar (mis. “Step 1 – Struktur transaksi box”):

- Tambahkan di README:
  - bagian “Sudah Jadi ✅” untuk fitur tersebut,
  - pindahkan poin dari “Belum dikerjakan ❌” ke deskripsi fitur yang sudah jadi,
  - beri tanggal checkpoint kalau perlu.

README ini jadi semacam **changelog high-level** versi human-friendly, supaya kita nggak “salah sambung timeline” waktu lanjut development berikutnya.

---
