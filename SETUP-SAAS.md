# Panduan Setup SaaS — Polaroid Online Wedding

Panduan langkah demi langkah untuk owner (anda). Ikut ikut peringkat. Anda **tidak perlu** pakar coding — cuma salin/klik ikut arahan.

---

## PERINGKAT (a) — Model data + Security Rules + set admin

Fail yang berkaitan: `firestore.rules`, `firestore.indexes.json`, `js/firebase.js` (sudah dikemas kini oleh Claude).

### Langkah 1 — Deploy Security Rules baharu

1. Buka https://console.firebase.google.com → pilih projek anda (`wedding-a182e`).
2. Menu kiri → **Firestore Database** → tab **Rules**.
3. **Padam semua** teks sedia ada dalam kotak, kemudian buka fail `firestore.rules` (dalam folder projek anda), salin **semua** kandungannya, dan tampal ke dalam kotak.
   > Nota: Firebase Console tidak kisah komen `//` di bahagian atas — biarkan.
4. Klik **Publish**. Tunggu "Rules published".

### Langkah 2 — Lantik diri anda sebagai super-admin

1. Console → **Authentication** → tab **Users** → **Add user**.
   - Emel: emel anda (cth `nikradhi@gmail.com`)
   - Kata laluan: pilih kata laluan kuat
   - Klik **Add user**.
2. Selepas pengguna tercipta, **salin UID** pengguna itu (klik pada baris pengguna → salin nilai "User UID").
3. Console → **Firestore Database** → tab **Data** → **Start collection**.
   - Collection ID: `admins`
   - Document ID: **tampal UID** yang anda salin tadi (WAJIB sama)
   - Tambah medan: `role` (type: string) = `super`
   - Klik **Save**.

Siap — anda kini super-admin. Rules akan kenali anda automatik.

### Langkah 3 — Cipta composite indexes

Query multi-tenant perlukan index. **Cara paling mudah:** biar sistem beritahu anda bila diperlukan —
buka halaman galeri/panel kali pertama, tekan **F12 → Console**, klik pautan "Create index" yang Firestore papar, klik **Create**, tunggu ~1 minit.

Senarai penuh index ada dalam fail `firestore.indexes.json` (jika mahu buat manual di Firestore → **Indexes → Composite → Add index**).

### Cara uji peringkat (a) berjaya

- Rules ter-publish tanpa ralat merah di Console.
- Ada dokumen di `admins/{UID-anda}` dengan `role: super`.
- (Ujian penuh log masuk akan datang di peringkat (b) bila panel super-admin siap.)

> ⚠️ **Penting:** Selepas peringkat (a), **upload gambar cara lama akan gagal** — sebab rules kini WAJIBkan setiap gambar ada `eventId` dan terikat pada event aktif. Ini dijangka. Upload akan berfungsi semula selepas peringkat (b)+(d) siap (bila ada event untuk di-upload). Jangan risau — projek ini kosong/ujian, tiada data hilang.

> 🔄 **Kemas kini rules (privasi emel):** `firestore.rules` telah dikemas kini untuk menambah koleksi `eventsPrivate`. Emel pelanggan kini disimpan di situ (admin sahaja boleh baca), **bukan** dalam `events` yang boleh dibaca awam. **Publish semula rules** selepas sebarang kemas kini fail ini.

---

## PERINGKAT (b) — Panel Super Admin

Fail baharu: `super-admin.html`, `js/super-admin.js`.

**Syarat:** Firebase Console → **Authentication** → **Sign-in method** → **Email/Password** mesti **Enabled**. (Ia sama seperti yang diperlukan `admin.html`.)

### Cara guna & uji

1. Hidangkan projek secara HTTP (bukan `file://`):
   ```
   npx serve .
   ```
   (atau `python -m http.server 8000`) — kemudian buka `http://localhost:3000/super-admin.html` (atau port yang dipapar).
2. **Log masuk** guna emel + kata laluan admin yang anda cipta di peringkat (a).
   - Jika akaun anda **bukan** dalam koleksi `admins` → sistem tolak dengan mesej "Akaun ini bukan super-admin." (betul).
3. **Cipta pelanggan ujian:**
   - Isi emel (cth `ujian@test.com`), kata laluan sementara (min. 6 aksara), nama pasangan, pilih **Basic**.
   - Klik **Cipta Akaun & Majlis** → nampak mesej hijau berjaya.
   - Ulang sekali lagi dengan pakej **Premium**.
4. **Senarai majlis** akan muncul di bawah dengan lencana pakej & status.

### Apa yang patut anda nampak kalau berjaya

- Firebase Console → **Authentication → Users**: ada pengguna pelanggan baharu.
- Firestore → **events**: ada dokumen baharu (`ownerUid`, `package`, `status:"active"`, `photoLimit` 100/100000, `expiresAt`, dll).
- Anda (owner) **masih log masuk** selepas cipta pelanggan (sesi tidak tertukar — ini sebab guna "app kedua").
- Butang **Nyahaktif/Aktifkan**, dropdown **pakej**, dan medan **tarikh Tamat** pada setiap baris berfungsi (ubah nilai di Firestore).

> Nota: pelanggan **belum** boleh guna majlis lagi sehingga mereka pilih URL (slug) di peringkat (c). Ini normal.

---

## PERINGKAT (c) — Halaman customize pelanggan + landing bertema

Fail baharu: `tetapan.html`, `js/tetapan.js`, `e.html`, `js/e.js`, `_redirects`, `vercel.json`.

### Cara guna & uji

1. Hidangkan projek (`npx serve .`) — **penting**, guna HTTP, bukan `file://`.
2. Buka `http://localhost:3000/tetapan.html`.
3. **Log masuk sebagai pelanggan** — guna emel & kata laluan pelanggan ujian yang anda cipta di peringkat (b).
4. **Pilih URL unik:**
   - Taip di kotak URL (cth `ali-siti`). Sistem paksa format bersih (huruf kecil, '-').
   - Perhatikan status langsung: **✓ tersedia** atau **✗ sudah diambil**.
   - Uji: cipta pelanggan kedua, cuba guna slug yang sama → patut nampak **✗ sudah diambil**.
5. Isi **nama pasangan**, **tarikh**, pilih **tema warna** (swatch atau pilih sendiri), **mesej aluan**.
6. Klik **Simpan Tetapan** → mesej hijau "✓ Tetapan disimpan!".
7. **Kod QR** muncul di bawah — ia menuding ke `e.html?e=<slug>`.
8. Buka pautan di bawah QR (atau `http://localhost:3000/e.html?e=<slug-anda>`) → nampak **landing bertema** dengan warna & mesej yang anda pilih.

### Apa yang patut anda nampak kalau berjaya

- Firestore → **slugs**: ada dokumen baharu (ID = slug anda) → `{ eventId }`.
- Firestore → **events**: dokumen majlis dikemas kini (`slug`, `coupleName`, `themeColor`, dll).
- Landing `e.html?e=<slug>` papar nama pasangan, tarikh, mesej aluan, warna tema, dan butang "Muat Naik Gambar" / "Lihat Galeri" (butang Live Wall muncul untuk pakej **Premium** sahaja).
- Slug yang sudah diambil orang lain → ditolak semasa taip **dan** semasa simpan.

> ⚠️ Butang "Muat Naik Gambar" & "Lihat Galeri" pada landing masih belum berfungsi penuh sehingga **Peringkat (d)** (halaman `index.html`/`gallery.html` di-skop ikut event). Ini normal buat masa ini.

---

## PERINGKAT (d) — Multi-tenancy pada halaman sedia ada

Fail baharu: `js/majlis.js` (modul kongsi).
Fail diubah: `js/upload.js`, `js/gallery.js`, `js/wall.js`, `js/export.js`, `js/admin.js`, `index.html`, `gallery.html`, `admin.html`.

Semua halaman kini terikat pada satu majlis melalui `?e=<eventId>`.

### 🔴 WAJIB DULU — Cipta 2 composite index

Klik kedua-dua pautan ini (log masuk akaun Firebase anda), kemudian klik **Create index** dan tunggu ~1–2 minit setiap satu:

1. **Galeri / Live Wall / Export** (`eventId` + `approved` + `created_at`):
   https://console.firebase.google.com/v1/r/project/wedding-a182e/firestore/indexes?create_composite=Ckxwcm9qZWN0cy93ZWRkaW5nLWExODJlL2RhdGFiYXNlcy8oZGVmYXVsdCkvY29sbGVjdGlvbkdyb3Vwcy9waG90b3MvaW5kZXhlcy9fEAEaDAoIYXBwcm92ZWQQARoLCgdldmVudElkEAEaDgoKY3JlYXRlZF9hdBACGgwKCF9fbmFtZV9fEAI

2. **Panel Moderasi** (`eventId` + `created_at`):
   https://console.firebase.google.com/v1/r/project/wedding-a182e/firestore/indexes?create_composite=Ckxwcm9qZWN0cy93ZWRkaW5nLWExODJlL2RhdGFiYXNlcy8oZGVmYXVsdCkvY29sbGVjdGlvbkdyb3Vwcy9waG90b3MvaW5kZXhlcy9fEAEaCwoHZXZlbnRJZBABGg4KCmNyZWF0ZWRfYXQQAhoMCghfX25hbWVfXxAC

Status index boleh disemak di Firestore → **Indexes**. Tunggu sehingga "Building" bertukar "Enabled".

### Cara uji peringkat (d)

1. Buka landing majlis: `e.html?e=<slug>` → klik **Muat Naik Gambar**.
2. Hantar gambar → mesej "Terima Kasih!". Semak Firestore: dokumen `photos` baharu ada medan `eventId`, dan `events.photoCount` naik +1.
3. Klik **Lihat Galeri** → gambar muncul. Buka galeri majlis LAIN → gambar itu **tidak** muncul (pengasingan tenant).
4. `admin.html` → log masuk emel majlis → nampak gambar majlis sendiri sahaja; tajuk papar nama pasangan.
5. Togol **Pra-moderasi** → gambar baharu jadi "Disembunyikan" sehingga diluluskan.

### Gating pakej yang sudah aktif

| Ciri | Basic | Premium |
|---|---|---|
| Had gambar | 100 (dikuatkuasa **rules**) | Tanpa had |
| Tempoh aktif | 14 hari (dikuatkuasa **rules**) | 30 hari |
| Live Wall | ❌ "Naik taraf ke Premium" | ✅ |
| Muat turun ZIP | ❌ "Naik taraf ke Premium" | ✅ |

---

## PERINGKAT (e) — Muat turun ZIP dikunci kepada pemilik majlis

Fail baharu: `js/muat-turun.js` (pembina ZIP).
Fail diubah: `firestore.rules`, `js/majlis.js`, `js/tetapan.js`, `tetapan.html`, `js/config.js`, `export.html` (jadi stub).
Fail dibuang: `js/export.js`.

**Apa yang berubah:** dulu `export.html` dilindungi `EXPORT_PASSWORD` — satu kata laluan **kongsi** yang terdedah dalam view-source. Sesiapa yang tahu kata laluan itu boleh muat turun ZIP **mana-mana** majlis dengan menukar `?e=` pada URL.

Sekarang muat turun berada di dalam **Panel Tetapan** (`tetapan.html`), di belakang log masuk Firebase Auth yang sedia ada. Majlis pelanggan dicari melalui `where('ownerUid','==',uid)` — tiada `?e=` yang boleh diubah untuk menyentuh majlis orang lain.

> **Tiada koleksi `subscribers` baharu.** Langganan pelanggan diwakili oleh dokumen `events` sedia ada: `ownerUid` (akaun Auth), `status`, `expiresAt`, `package`. Anda tetap uruskannya secara manual di `super-admin.html` seperti biasa.

### 🔴 WAJIB — Publish rules yang dikemas kini

Firebase Console → Firestore Database → tab **Rules** → salin `firestore.rules` → **Publish**.

Perubahan rules: gambar `approved == false` (tersembunyi) kini hanya boleh dibaca oleh super-admin atau pemilik majlis gambar itu. Sebelum ini **mana-mana** pengguna log masuk boleh membaca gambar tersembunyi **semua** pelanggan — itu kebocoran silang-pelanggan yang kini ditutup.

### Syarat kelayakan muat turun

Diuruskan oleh `bolehMuatTurun()` dalam `js/majlis.js` — satu sumber kebenaran:

| Semakan | Mesej jika gagal |
|---|---|
| `status === 'active'` | "Langganan anda tidak aktif. Sila hubungi admin." |
| Dalam **30 hari** selepas `expiresAt` | "Tempoh muat turun telah tamat (30 hari selepas majlis)…" |
| `package === 'premium'` | "Muat turun ZIP hanya untuk pakej Premium…" |

**Kenapa tempoh tangguh 30 hari?** `expiresAt` menutup tingkap *muat naik tetamu*. Pengantin lazimnya kutip gambar **selepas** majlis tamat — menyekat pada `expiresAt` akan menghalang mereka daripada gambar mereka sendiri. Ubah `HARI_TANGGUH` dalam `js/majlis.js` jika mahu tempoh lain.

### Cara uji peringkat (e)

1. Log masuk `tetapan.html` sebagai pelanggan **Premium aktif** → kad 📦 **Muat Turun Gambar** aktif → klik → dapat `gambar-<slug>.zip` (JPEG + `senarai-ucapan.csv`).
2. Log masuk sebagai pelanggan **Basic** → butang nyahdaya + "hanya untuk pakej Premium".
3. Set `expiresAt` majlis ke **10 hari lalu** (Console) → muat semula → butang **masih** aktif (tempoh tangguh).
4. Set `expiresAt` ke **40 hari lalu** → butang nyahdaya + mesej tempoh tamat.
5. Nyahaktifkan majlis di `super-admin.html` → butang nyahdaya + "Langganan anda tidak aktif".
6. **Ujian pintasan:** log masuk sebagai pelanggan B, buka console (F12), cuba query `photos` bagi `eventId` majlis A tanpa penapis `approved` → **ditolak** `permission-denied`.
7. Buka `gallery.html?e=<eventId>` **tanpa** log masuk → galeri awam masih berfungsi (tiada regresi).
8. Buka `export.html` lama → dialih ke `tetapan.html`.

> ⚠️ Ujian 6 & 7 paling penting: ia mengesahkan rules baharu menutup kebocoran **tanpa** memecahkan galeri awam.

---

## (PILIHAN) URL cantik `laman.com/e/ali-siti`

Anda pilih format **query param** (`e.html?e=ali-siti`) yang berfungsi tanpa config. Jika nanti anda mahu URL lebih cantik `/e/ali-siti`:
- **Netlify:** fail `_redirects` sudah disediakan — cukup deploy folder ini.
- **Vercel:** fail `vercel.json` sudah disediakan.
- QR tetap guna `e.html?e=<slug>` yang sentiasa berfungsi (kedua-dua bentuk URL menuju ke tempat sama).
