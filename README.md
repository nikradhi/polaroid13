# 💐 Polaroid Online Wedding — SaaS

Platform **multi-tenant** untuk majlis perkahwinan: tetamu **muat naik gambar + ucapan**
melalui telefon, dan gambar dipaparkan dalam **gaya polaroid klasik**.

Setiap pelanggan mendapat **majlis sendiri** dengan URL unik, tema warna, kod QR, dan
panel moderasi peribadi. Bayaran diuruskan **secara manual** (transfer bank/DuitNow) —
pemilik sistem mengesahkan bayaran, kemudian cipta & aktifkan akaun pelanggan.

Dibina tanpa langkah build — **HTML + Vanilla JS + Tailwind (CDN) + Firebase (Firestore sahaja)**.

> 📘 **Baru pertama kali menyediakan sistem?** Ikut [SETUP-SAAS.md](SETUP-SAAS.md) —
> panduan langkah demi langkah (deploy rules, lantik admin, cipta index).

---

## 👥 Tiga peranan

| Peranan | Halaman | Kegunaan |
|---|---|---|
| **Pemilik sistem** (anda) | `super-admin.html` | Cipta akaun pelanggan selepas bayaran, tetapkan pakej, aktif/nyahaktif, set tarikh luput |
| **Pelanggan** (pengantin) | `tetapan.html` | Pilih URL unik, nama pasangan, tarikh, tema warna, mesej aluan, dapat QR |
| | `admin.html` | Moderasi gambar majlis sendiri (luluskan/sembunyi/padam) |
| **Tetamu majlis** | `e.html?e=<slug>` | Landing bertema → muat naik gambar / lihat galeri |

### Aliran penuh

```
Pelanggan bayar (bank/DuitNow)
   ↓
Anda sahkan → super-admin.html → cipta akaun + pilih pakej
   ↓
Pelanggan log masuk tetapan.html → pilih URL (cth "ali-siti") + tema → dapat QR
   ↓
Tetamu imbas QR → e.html?e=ali-siti → muat naik gambar
   ↓
Galeri / Live Wall papar gambar · Pelanggan moderasi di admin.html
```

---

## 📦 Pakej & Had

| Ciri | Basic | Premium |
|---|---|---|
| Had gambar | **100** | Tanpa had |
| Tempoh aktif | **14 hari** | **30 hari** |
| Galeri polaroid | ✅ | ✅ |
| Live Wall (projektor) | ❌ | ✅ |
| Muat turun ZIP | ❌ | ✅ |
| Panel moderasi | ✅ | ✅ |

**Had gambar dan tarikh luput dikuatkuasakan dalam Firestore Security Rules** — bukan
frontend sahaja. Tetamu yang cuba memintas antara muka tetap ditolak oleh pelayan.

> Live Wall & muat turun ZIP ialah operasi *baca* sahaja, jadi gate **pakej** disekat di
> frontend. Yang dikuatkuasa oleh rules ialah **pemilikan**: muat turun ZIP berada dalam
> `tetapan.html` di belakang log masuk Firebase Auth, dan hanya pemilik majlis
> (`events.ownerUid == uid`) boleh mengaksesnya.

**Tempoh tangguh muat turun:** `expiresAt` menutup tingkap *muat naik tetamu*. Pemilik
masih boleh memuat turun gambarnya sehingga **30 hari selepas** `expiresAt`
(`HARI_TANGGUH` dalam [`js/majlis.js`](js/majlis.js)) — pengantin lazimnya kutip gambar
selepas majlis tamat. Selepas itu, hubungi admin untuk melanjutkan.

---

## 📁 Struktur Fail

```
/
├── super-admin.html      # Panel pemilik — urus akaun pelanggan & pakej
├── tetapan.html          # Dashboard pelanggan — customize majlis + QR
├── e.html                # Landing awam bertema (tetamu masuk di sini)
├── index.html            # Halaman muat naik (tetamu)
├── gallery.html          # Galeri polaroid
├── wall.html             # Live Wall real-time (Premium)
├── export.html           # (LAMA — stub yang mengalih ke tetapan.html)
├── admin.html            # Panel moderasi pelanggan
├── qr.html               # (LAMA — lihat nota di bawah)
├── js/
│   ├── config.js         # ← firebaseConfig (ISI DI SINI)
│   ├── firebase.js       # Init Firebase + eksport semula fungsi SDK
│   ├── majlis.js         # Modul kongsi multi-tenancy (baca ?e=, muat majlis, tema)
│   ├── polaroid.js       # Komponen polaroid (guna semula)
│   ├── imej.js           # Compress adaptif + tukar base64
│   ├── super-admin.js    # Logik panel pemilik
│   ├── tetapan.js        # Logik customize pelanggan (semakan slug, QR, muat turun ZIP)
│   ├── e.js              # Logik landing (slug → majlis)
│   ├── upload.js         # Logik muat naik (batch + kaunter)
│   ├── gallery.js        # Logik galeri
│   ├── wall.js           # Logik Live Wall
│   ├── muat-turun.js     # Pembina ZIP (gambar + senarai-ucapan.csv)
│   └── admin.js          # Logik moderasi per-majlis
├── firestore.rules       # Security rules (nadi keselamatan)
├── firestore.indexes.json# Definisi composite index
├── _redirects            # (Pilihan) URL cantik /e/slug — Netlify
├── vercel.json           # (Pilihan) URL cantik /e/slug — Vercel
├── SETUP-SAAS.md         # Panduan setup langkah demi langkah
└── README.md
```

> ⚠️ **`qr.html` ialah fail lama** dari sistem satu-majlis. Ia kini menerima
> `?e=<eventId>` dan menjana QR yang betul untuk majlis itu, tetapi jika dibuka
> **tanpa** `?e=`, QR-nya menghala ke `index.html` kosong (tetamu akan nampak
> "Pautan tidak lengkap"). Cara disyorkan: guna QR yang dijana dalam **`tetapan.html`**.

---

## 🗄️ Model Data (Firestore)

Semua dalam **Firestore sahaja** — tiada Firebase Storage, tiada pelan Blaze.
Gambar di-compress di client dan disimpan sebagai **base64** dalam dokumen.

| Koleksi | Kandungan | Siapa boleh baca |
|---|---|---|
| `admins/{uid}` | `{ role: "super" }` — wujud bermakna pemilik sistem | Admin sahaja |
| `events/{eventId}` | Majlis: `ownerUid, slug, coupleName, weddingDate, themeColor, latarId, welcomeMessage, package, status, photoLimit, photoCount, preModeration, expiresAt, createdAt, createdBy` | Admin, pemilik, atau sesiapa jika `status == "active"` |
| `eventsPrivate/{eventId}` | `{ ownerEmail, ownerUid }` — maklumat peribadi pelanggan | **Admin sahaja** |
| `slugs/{slug}` | `{ eventId }` — doc ID ialah slug, menjamin URL unik | Awam (perlu untuk landing) |
| `photos/{id}` | `name, message, image_url` (base64), `approved, likes, created_at, **eventId**` | Awam jika `approved == true` |

**Kunci multi-tenancy:** setiap gambar membawa `eventId`. Semua query galeri/wall/export/
moderasi menapis `where('eventId','==',...)`, jadi gambar majlis A tidak pernah bercampur
dengan majlis B.

**Kunci penguatkuasaan kuota:** `events.photoCount` ialah kaunter. Muat naik menulis
gambar **dan** menaikkan kaunter dalam **satu batch atomik**. Rules menggunakan
`getAfter()` untuk mengesahkan kaunter naik tepat +1 dan tidak melebihi `photoLimit`.
Firestore Rules tidak boleh mengira dokumen dalam koleksi — kaunter ini satu-satunya
cara penguatkuasaan sebenar.

> ✅ **Tiada Firebase Storage / pelan Blaze / kad kredit diperlukan.** Pelan percuma
> (Spark) memadai.

### 📦 Saiz gambar & kuota storan

Kerana gambar disimpan **dalam** dokumen Firestore, **saiz gambar = saiz pangkalan data**,
dan kuota 1 GB percuma dikongsi oleh SEMUA majlis.

[js/imej.js](js/imej.js) memampat setiap gambar ke **WebP, maksimum 720px, sasaran 60 KB**
(≈50–85 KB selepas base64). Pelayar lama tanpa sokongan WebP (Safari/iOS < 14) jatuh ke JPEG
secara automatik. Ukuran pada gambar sebenar: 200–525 KB → 49–74 KB, iaitu **~77% lebih kecil**;
1 GB memuatkan **~17,000 gambar** berbanding ~3,900 sebelum ini.

> ⚠️ Ini satu-satunya salinan — **ZIP muat turun Premium juga 720px**. Menaikkan
> `LEBAR_MAKS`/`SASARAN_BAIT` dalam `js/imej.js` menaikkan penggunaan kuota secara terus.

**Dua tetapan Console yang berkaitan:**

1. **Kecualikan `image_url` daripada indeks.** Firestore mengindeks setiap medan secara
   automatik (ASC + DESC) dan entri indeks itu dikira sebagai storan, walaupun tiada query
   menggunakannya untuk blob gambar. Firestore Database → Indexes → **Single field** →
   *Add exemption* → Collection ID `photos`, Field path `image_url` → matikan semua.
   (Rujukan: [firestore.indexes.json](firestore.indexes.json) `fieldOverrides`.)
2. **Guna alat penyelenggaraan** dalam `super-admin.html` untuk mengecilkan gambar sedia ada
   (*Mampat semula*) dan membuang gambar majlis yang sudah tamat (*Padam gambar majlis
   tamat*) — memadam ialah satu-satunya operasi yang benar-benar **menurunkan** storan.

> ⚠️ **Setiap kali `firestore.rules` diubah, publish semula** di Firebase Console.

---

## 🔗 Cara URL berfungsi

Landing majlis guna **slug**, sub-halaman guna **eventId**:

```
e.html?e=ali-siti                    ← QR menghala ke sini (slug)
   ↓ e.js: slugs/ali-siti → eventId
index.html?e=<eventId>               ← butang "Muat Naik Gambar"
gallery.html?e=<eventId>             ← butang "Lihat Galeri"
wall.html?e=<eventId>                ← Live Wall (Premium)
```

**Muat turun ZIP tiada dalam senarai ini** — ia bukan pautan awam. Pemilik majlis log
masuk di `tetapan.html`, dan majlisnya dicari melalui `where('ownerUid','==',uid)`;
tiada `?e=` yang boleh diubah untuk menyentuh majlis orang lain.

**(Pilihan) URL cantik `laman.com/e/ali-siti`:** fail [`_redirects`](_redirects) (Netlify)
dan [`vercel.json`](vercel.json) sudah disediakan — cukup deploy folder ini. Kedua-dua
bentuk URL berfungsi serentak.

---

## 🚀 Setup Ringkas

Panduan penuh: **[SETUP-SAAS.md](SETUP-SAAS.md)**. Ringkasannya:

1. **Cipta projek Firebase** → daftar App Web → salin `firebaseConfig` ke
   [`js/config.js`](js/config.js).
2. **Aktifkan Firestore** (mod production) dan **Authentication → Email/Password**.
3. **Publish [`firestore.rules`](firestore.rules)** (Firestore → tab Rules → Publish).
4. **Lantik diri sebagai admin:** Authentication → Add user → salin **UID** →
   Firestore → cipta koleksi `admins` → Document ID = UID → medan `role` = `super`.
5. **Cipta 2 composite index** (lihat bawah).
6. Buka `super-admin.html` → log masuk → cipta pelanggan pertama.

### Composite index yang diperlukan

Definisi ada dalam [`firestore.indexes.json`](firestore.indexes.json). Cara paling mudah:
buka halaman berkenaan, tekan **F12 → Console**, klik pautan "Create index" yang
Firestore papar, tunggu sehingga status bertukar **Enabled**.

| Koleksi | Medan | Diguna oleh |
|---|---|---|
| `photos` | `eventId` ↑, `approved` ↑, `created_at` ↓ | Galeri, Live Wall, Export |
| `photos` | `eventId` ↑, `created_at` ↓ | Panel moderasi |
| `events` | `ownerUid` ↑, `createdAt` ↓ | Senarai majlis pelanggan (jika perlu) |

---

## 💻 Jalankan Secara Lokal

Projek guna **ES modules**, jadi ia mesti dihidangkan melalui HTTP (bukan `file://`):

```bash
npx serve .              # Cara 1: Node
python -m http.server 8000   # Cara 2: Python 3
```

Buka `http://localhost:8000/super-admin.html` (atau port yang ditunjukkan).

---

## 🌐 Deploy Percuma

**Netlify (drag-and-drop):** https://app.netlify.com/drop → seret **seluruh folder**.

**Vercel:** push ke GitHub → Import di https://vercel.com/new → preset **Other**
(tiada build) → Deploy.

Kedua-duanya menyokong fail rewrite yang disertakan untuk URL cantik `/e/slug`.

---

## 🔒 Keselamatan

Semua dikuatkuasakan di **Firestore Security Rules**, bukan frontend sahaja:

- **Pengasingan tenant** — pelanggan hanya boleh mengubah majlis miliknya
  (`ownerUid == request.auth.uid`).
- **Anti naik-taraf sendiri** — pelanggan tidak boleh mengubah `package`, `status`,
  `photoLimit`, `photoCount`, atau `expiresAt`. Hanya medan customize dibenarkan.
- **Had gambar & tempoh** — dikuatkuasa melalui kaunter + `getAfter()` (lihat atas).
  Tetamu tidak boleh melebihi kuota, melangkau kaunter, atau menurunkan kaunter.
- **URL unik** — `slugs/{slug}` guna slug sebagai doc ID; rules menolak `create` jika
  slug sudah wujud. Mustahil dua majlis berkongsi URL.
- **Admin** — dikenal pasti melalui koleksi `admins/{uid}`. **Tiada sesiapa** boleh
  menulis ke `admins` dari client (`allow write: if false`) — urus di Console sahaja.
- **Privasi emel** — emel pelanggan disimpan dalam `eventsPrivate` yang hanya admin
  boleh baca, **bukan** dalam `events` yang boleh dibaca awam.
- **Gambar tersembunyi** — `photos` dengan `approved == false` hanya boleh dibaca oleh
  super-admin atau pemilik majlis gambar itu. Pelanggan A yang log masuk **tidak** boleh
  membaca gambar tersembunyi pelanggan B.
- **Muat turun ZIP** — berada dalam `tetapan.html` di belakang log masuk Firebase Auth.
  Tiada kata laluan kongsi; `request.auth.uid` disahkan secara kriptografi dan tidak
  boleh dipalsukan dari browser console (berbeza dengan "ID pelanggan" yang ditaip).
- **XSS** — teks pengguna dipapar guna `textContent` (polaroid.js) atau helper `esc()`
  (admin.js), tidak pernah `innerHTML` mentah.

### Had yang perlu anda tahu

- `firebaseConfig` **memang selamat** didedah di client — keselamatan datang dari rules.
- **Anti-spam upload** (cooldown localStorage + honeypot) ialah halangan client sahaja,
  boleh dipintas. Had kuota di rules ialah perlindungan sebenar.
- Gating **pakej** (Live Wall & ZIP untuk Premium) dan **tempoh tangguh 30 hari** ialah
  gate produk di frontend. Yang dikuatkuasa server ialah **pemilikan** — lihat di bawah.
- **Galeri majlis memang awam.** Tetamu perlu melihatnya tanpa log masuk, jadi gambar
  `approved == true` boleh dibaca sesiapa yang tahu `eventId`. Gate muat turun ialah gate
  *ciri/langganan*, bukan gate kerahsiaan — orang yang berkeras masih boleh kikis gambar
  diluluskan melalui query galeri. Ini sifat semula jadi galeri kahwin awam.
  Gambar **tersembunyi** (`approved == false`) pula dilindungi sepenuhnya oleh rules.

---

## ✅ Senarai Semak Ujian

**Panel pemilik (`super-admin.html`)**
- [ ] Log masuk dengan akaun bukan-admin → ditolak "Akaun ini bukan super-admin."
- [ ] Cipta pelanggan → akaun muncul di Authentication → Users, majlis di `events`.
- [ ] Anda **kekal log masuk** selepas cipta pelanggan (sesi tidak tertukar).
- [ ] Basic → `photoLimit: 100`, luput 14 hari. Premium → tanpa had, 30 hari.
- [ ] Butang Nyahaktif/Aktifkan, tukar pakej, set tarikh luput berfungsi.
- [ ] **Kira tepat** → papar saiz storan sebenar semua gambar.
- [ ] **Mampat semula** → laporan "sebelum → selepas"; jalankan kali kedua, semua dilangkau.
- [ ] **Semak & padam** → hanya majlis lepas tempoh tangguh 30 hari disenaraikan; selepas
      padam, `photoCount` majlis itu jadi 0.
- [ ] Butang **↻** di sebelah kiraan gambar menyelaraskan `photoCount` dengan gambar sebenar.

**Customize pelanggan (`tetapan.html`)**
- [ ] Taip URL → papar **"✓ tersedia"** atau **"✗ sudah diambil"** secara langsung.
- [ ] Sempang boleh ditaip (cth `ali-siti`), huruf besar & simbol dibersihkan automatik.
- [ ] Slug milik majlis lain ditolak semasa taip **dan** semasa simpan.
- [ ] Simpan → `slugs/{slug}` dicipta, `events` dikemas kini, QR muncul.
- [ ] **Muat turun ZIP (Premium aktif)** → fail `gambar-<slug>.zip` mengandungi JPEG +
      `senarai-ucapan.csv`; bar progres bergerak.
- [ ] **Basic** → butang nyahdaya + "hanya untuk pakej Premium".
- [ ] **Majlis dinyahaktifkan** → butang nyahdaya + "Langganan anda tidak aktif".
- [ ] `expiresAt` 10 hari lalu → butang **masih** aktif (dalam tempoh tangguh 30 hari).
- [ ] `expiresAt` 40 hari lalu → butang nyahdaya + mesej tempoh muat turun tamat.
- [ ] Buka `export.html` lama → dialih ke `tetapan.html`.

**Landing (`e.html?e=<slug>`)**
- [ ] Papar nama pasangan, tarikh (Bahasa Melayu), mesej aluan, warna tema.
- [ ] Butang **Live Wall** muncul untuk Premium sahaja.
- [ ] Majlis nyahaktif / tamat tempoh → mesej mesra, bukan ralat teknikal.

**Muat naik (`index.html?e=<eventId>`)**
- [ ] Tanpa `?e=` → "Pautan tidak lengkap. Sila imbas kod QR majlis."
- [ ] Hantar gambar → mesej terima kasih; `photos` dapat dokumen baharu dengan `eventId`;
      `events.photoCount` naik +1.
- [ ] Kuota penuh → borang disekat, papar "Kuota gambar penuh".
- [ ] Pra-moderasi HIDUP → gambar baharu masuk `approved: false`.
- [ ] **Sebelum ambil gambar** → butang **Ambil gambar** & **Galeri** sudah kelihatan;
      **Buang gambar** tersorok.
- [ ] **Ambil semula** → selepas pilih, label butang bertukar "Ambil semula"; tekan lagi
      → preview bertukar, nama & ucapan yang ditaip **kekal**.
- [ ] Pilih **fail yang sama** sekali lagi → preview tetap dimuat semula.
- [ ] **Buang gambar** → zon putus-putus kembali; hantar tanpa gambar → "Sila pilih atau
      ambil gambar dahulu."
- [ ] Fail bukan imej / >15 MB semasa ambil semula → ditolak, gambar sedia ada **kekal**.
- [ ] **Telefon:** "Ambil gambar" buka kamera; "Galeri" buka galeri (bukan kamera).

**Galeri & Live Wall**
- [ ] Galeri majlis A **tidak** memaparkan gambar majlis B (pengasingan tenant).
- [ ] Live Wall pakej Basic → "Naik taraf ke Premium".
- [ ] Galeri awam (tanpa log masuk) masih berfungsi selepas rules dikemas kini.
- [ ] **Pintasan console** — log masuk sebagai pelanggan B, cuba query `photos` bagi
      `eventId` majlis A tanpa penapis `approved` → ditolak `permission-denied`.

**Moderasi (`admin.html`)**
- [ ] Log masuk pelanggan → nampak **hanya** gambar majlis sendiri; tajuk papar nama pasangan.
- [ ] Sembunyikan → gambar hilang dari galeri awam; Luluskan → muncul semula.
- [ ] Togol pra-moderasi tersimpan ke `events.preModeration`.

**Keselamatan**
- [ ] Ucapan mengandungi `<script>` dipapar sebagai teks biasa.
- [ ] Matikan internet → cuba hantar → "Tiada sambungan internet…".

---

## 🛠️ Nota Penyelenggaraan

- **Naik taraf Firebase SDK:** tukar nombor versi (`10.14.1`) pada **kedua-dua** URL
  import dalam [`js/firebase.js`](js/firebase.js).
- **Bahasa:** semua kod, komen, dan teks antara muka dalam **Bahasa Melayu**
  (cth `tunjukStatus`, `butangHantar`, `gagal`/`berjaya`). Kekalkan konvensyen ini.
- **Cache pelayar:** selepas mengemas kini fail `.js`, pelawat lama mungkin masih
  menggunakan versi cache. Netlify/Vercel biasanya menguruskan ini, tetapi jika perlu
  paksa, tambah `?v=2` pada `<script src="...">`.
- **Menukar had pakej:** ubah objek `PAKEJ` dalam
  [`js/super-admin.js`](js/super-admin.js) (had gambar & bilangan hari).
