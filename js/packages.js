// ============================================================
//  KONFIGURASI PAKEJ — SATU SUMBER KEBENARAN
// ------------------------------------------------------------
//  SEMUA had gambar, tempoh, dan keupayaan (ciri) setiap pakej
//  ditakrifkan DI SINI sahaja. Nak laras had Basic dari 300 ke
//  400? Ubah SATU nilai di bawah — tak perlu cari di fail lain.
//
//  Fail lain (super-admin.js, majlis.js, gating.js, tetapan.js)
//  IMPORT dari sini — jangan salin nilai ke tempat lain.
//
//  Nota medan:
//    - hadGambar: null  = "tanpa had" (Premium/Eksklusif).
//                 Dalam Firestore, photoLimit disimpan sebagai
//                 NOMBOR (HAD_TANPA_HAD) supaya rules boleh banding
//                 `photoCount <= photoLimit`. Guna hadGambarDB().
//    - ciri.*: bendera keupayaan. Semakan sebenar guna gating.js
//              (bolehGuna(ev, "namaCiri")), bukan baca terus di sini.
// ============================================================

// Ambang "tanpa had" — nombor besar yang disimpan pada photoLimit
// untuk pakej tanpa had, supaya Firestore rules (photoCount <= photoLimit)
// praktikal tidak pernah tercapai. Diselaraskan di seluruh sistem.
export const HAD_TANPA_HAD = 100000;

export const PAKEJ = {
  basic: {
    nama: "Basic",
    harga: 40,            // RM
    hadGambar: 300,       // had gambar
    tempohHari: 14,       // tempoh galeri aktif (hari)
    ciri: {
      galeriOnline:     true,
      qrCode:           true,
      moderasi:         true,
      downloadIndividu: true,
      downloadZip:      false,
      liveWall:         false,
      temaPraset:       true,
      kustomWarnaFont:  false,
      guestbook:        false,
      muzikLatar:       false,
      voiceRecording:   false, // akan datang
    },
  },

  premium: {
    nama: "Premium",
    harga: 50,            // RM
    hadGambar: null,      // tanpa had
    tempohHari: 60,
    ciri: {
      galeriOnline:     true,
      qrCode:           true,
      moderasi:         true,
      downloadIndividu: true,
      downloadZip:      true,
      liveWall:         true,
      temaPraset:       true,
      kustomWarnaFont:  true,
      guestbook:        true,
      muzikLatar:       false,
      voiceRecording:   false, // akan datang
    },
  },

  eksklusif: {
    nama: "Eksklusif",
    harga: 80,            // RM
    hadGambar: null,      // tanpa had
    tempohHari: 365,
    ciri: {
      galeriOnline:     true,
      qrCode:           true,
      moderasi:         true,
      downloadIndividu: true,
      downloadZip:      true,
      liveWall:         true,
      temaPraset:       true,
      kustomWarnaFont:  true,
      guestbook:        true,
      muzikLatar:       true,
      voiceRecording:   false, // akan datang (belum dibina)
    },
  },
};

// Pakej lalai bila medan `package` tiada / tak sah pada dokumen event.
export const PAKEJ_LALAI = "basic";

// Senarai ciri yang belum dibina — dipapar sebagai "Akan datang" di UI.
export const CIRI_AKAN_DATANG = ["muzikLatar", "voiceRecording"];

// ------------------------------------------------------------
//  No. WhatsApp admin untuk terima tempahan (halaman pakej.html).
//  Format antarabangsa TANPA '+' atau '0' di depan (untuk wa.me).
//  Contoh Malaysia: "60123456789".
//  No. admin: 018-905 4144 -> format wa.me (kod negara 60, buang '0' depan).
// ------------------------------------------------------------
export const NOMBOR_WHATSAPP = "60189054144";

// ------------------------------------------------------------
//  Label mesra Bahasa Melayu untuk setiap ciri — SATU SUMBER
//  KEBENARAN (diguna oleh tetapan.js & pakej.html). Kunci mesti
//  sepadan dengan kunci dalam PAKEJ[...].ciri.
// ------------------------------------------------------------
export const LABEL_CIRI = {
  galeriOnline:     "Galeri online",
  qrCode:           "Kod QR",
  moderasi:         "Moderasi gambar",
  downloadIndividu: "Muat turun gambar individu",
  downloadZip:      "Muat turun semua (ZIP)",
  liveWall:         "Live Wall (skrin majlis)",
  temaPraset:       "Tema pra-set",
  kustomWarnaFont:  "Kustom warna & font",
  guestbook:        "Ucapan/guestbook digital",
  muzikLatar:       "Muzik latar",
  voiceRecording:   "Voice recording tetamu",
};

// ------------------------------------------------------------
//  hadGambarDB(idPakej) -> nombor untuk disimpan pada photoLimit.
//  Menukar hadGambar:null (tanpa had) kepada HAD_TANPA_HAD supaya
//  Firestore rules boleh banding `photoCount <= photoLimit`.
// ------------------------------------------------------------
export function hadGambarDB(idPakej) {
  const p = PAKEJ[idPakej] || PAKEJ[PAKEJ_LALAI];
  return p.hadGambar == null ? HAD_TANPA_HAD : p.hadGambar;
}

// ------------------------------------------------------------
//  tempohHariPakej(idPakej) -> bilangan hari tempoh aktif.
// ------------------------------------------------------------
export function tempohHariPakej(idPakej) {
  const p = PAKEJ[idPakej] || PAKEJ[PAKEJ_LALAI];
  return p.tempohHari;
}

// ------------------------------------------------------------
//  pakejTerendahUntukCiri(namaCiri) -> id pakej PALING murah yang
//  membuka ciri ini (ikut turutan basic -> premium -> eksklusif),
//  atau null jika tiada pakej menyokongnya. Diguna untuk susun
//  mesej naik taraf ("Ciri ini tersedia dalam pakej Premium ✨").
// ------------------------------------------------------------
export function pakejTerendahUntukCiri(namaCiri) {
  for (const id of Object.keys(PAKEJ)) {
    if (PAKEJ[id].ciri?.[namaCiri]) return id;
  }
  return null;
}

// ============================================================
//  PROMOSI HARGA — dikawal super-admin (dokumen Firestore settings/promo)
// ------------------------------------------------------------
//  Helper di bawah TULEN: terima objek `promo` (data settings/promo)
//  sebagai argumen — TIADA gandingan ke Firestore, supaya packages.js
//  kekal bebas Firebase dan boleh diimport di mana-mana.
//
//  Bentuk objek promo (semua medan pilihan / mungkin tiada):
//    { aktif: bool, tajuk: string, mula: Date|Timestamp,
//      tamat: Date|Timestamp, harga: { basic, premium, eksklusif } }
//
//  `mula`/`tamat` boleh jadi Date (dari <input type=date>) ATAU
//  Firestore Timestamp (ada .toDate()). keTarikh() menormalkan.
// ============================================================

// Tukar Date | Firestore Timestamp | null -> Date | null.
function keTarikh(nilai) {
  if (!nilai) return null;
  if (typeof nilai.toDate === "function") return nilai.toDate(); // Timestamp
  if (nilai instanceof Date) return nilai;
  return null;
}

// Adakah promo aktif pada masa `sekarang` (default: sekarang sebenar)?
// Aktif = suis induk hidup DAN sekarang dalam julat [mula, tamat].
export function promoAktifSekarang(promo, sekarang = new Date()) {
  if (!promo || promo.aktif !== true) return false;
  const mula = keTarikh(promo.mula);
  const tamat = keTarikh(promo.tamat);
  if (mula && sekarang < mula) return false;
  if (tamat && sekarang > tamat) return false;
  return true;
}

// Harga asal BERKUAT KUASA untuk satu pakej.
// Super-admin boleh override harga asal (settings/promo -> hargaAsal[id]);
// override ini berkuat kuasa SENTIASA (bukan terikat julat tarikh promo).
// Kosong / tak sah -> guna nilai lalai PAKEJ[id].harga dalam kod.
export function hargaAsalPakej(idPakej, cfg) {
  const p = PAKEJ[idPakej] || PAKEJ[PAKEJ_LALAI];
  const o = Number(cfg?.hargaAsal?.[idPakej]);
  return Number.isFinite(o) && o > 0 ? o : p.harga;
}

// Kira harga berkesan untuk satu pakej.
// `cfg` = data dokumen settings/promo (harga asal override + promo).
// Pulang { asal, promo, adaPromo }:
//   - asal    : harga asal berkuat kuasa (override admin atau lalai).
//   - promo   : harga promo (RM) jika sah & lebih murah, jika tidak null.
//   - adaPromo: true bila harga promo dikenakan.
// Penjaga: promo hanya dikira bila promoAktifSekarang() DAN
// 0 < harga[id] < asal (elak "diskaun" yang menaikkan harga).
export function hargaPakej(idPakej, cfg, sekarang = new Date()) {
  const asal = hargaAsalPakej(idPakej, cfg);
  if (promoAktifSekarang(cfg, sekarang)) {
    const hp = Number(cfg.harga?.[idPakej]);
    if (Number.isFinite(hp) && hp > 0 && hp < asal) {
      return { asal, promo: hp, adaPromo: true };
    }
  }
  return { asal, promo: null, adaPromo: false };
}

// ============================================================
//  BUTIRAN PAKEJ — dikawal super-admin (dokumen settings/pakej)
// ------------------------------------------------------------
//  Sama corak dengan promosi harga di atas: helper TULEN yang
//  terima objek `cfg` (data dokumen settings/pakej) sebagai
//  argumen — TIADA gandingan Firestore. Super-admin boleh custom
//  nama, had gambar, tempoh, senarai ciri & lencana setiap pakej;
//  override menindih nilai lalai PAKEJ[id] dalam kod.
//
//  Bentuk cfg (semua medan pilihan / mungkin tiada):
//    { pakej: { basic: { nama, hadGambar: number|null, tempohHari,
//                        ciri: {kunci:bool}, badge }, premium:{…}, … } }
// ============================================================

// null (tanpa had) dibenarkan; selain itu int positif atau fallback.
function nomborHad(nilai, fallback) {
  if (nilai === null) return null;
  const n = Number(nilai);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

// Int positif atau fallback (untuk tempohHari).
function intPositif(nilai, fallback) {
  const n = Number(nilai);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

// Objek pakej BERKESAN: default PAKEJ[id] ditindih override tervalidasi.
// Gabung `ciri` PER-KUNCI supaya kunci ciri baharu (belum ada dalam
// override lama) sentiasa fallback ke nilai lalai.
export function pakejEfektif(idPakej, cfg) {
  const asas = PAKEJ[idPakej] || PAKEJ[PAKEJ_LALAI];
  const o = cfg?.pakej?.[idPakej] || {};

  const nama =
    typeof o.nama === "string" && o.nama.trim() ? o.nama.trim() : asas.nama;
  const hadGambar =
    "hadGambar" in o ? nomborHad(o.hadGambar, asas.hadGambar) : asas.hadGambar;
  const tempohHari = intPositif(o.tempohHari, asas.tempohHari);

  const ciri = { ...asas.ciri };
  if (o.ciri && typeof o.ciri === "object") {
    for (const k of Object.keys(asas.ciri)) {
      if (typeof o.ciri[k] === "boolean") ciri[k] = o.ciri[k];
    }
  }

  return { ...asas, nama, hadGambar, tempohHari, ciri };
}

// Pintasan untuk medan tunggal (elak bina objek penuh bila tak perlu).
export function ciriEfektif(idPakej, cfg) {
  return pakejEfektif(idPakej, cfg).ciri;
}
export function tempohHariEfektif(idPakej, cfg) {
  return pakejEfektif(idPakej, cfg).tempohHari;
}

// Had gambar BERKESAN untuk disimpan pada photoLimit (null -> HAD_TANPA_HAD).
export function hadGambarDBEfektif(idPakej, cfg) {
  const h = pakejEfektif(idPakej, cfg).hadGambar;
  return h == null ? HAD_TANPA_HAD : h;
}

// Lencana BERKESAN untuk satu pakej: "popular" | "akanDatang" | "".
// Default kekalkan tingkah laku semasa supaya tiada regresi bila
// belum ada override (premium=Popular, eksklusif=Akan datang).
export function badgePakej(idPakej, cfg) {
  const b = cfg?.pakej?.[idPakej]?.badge;
  if (b === "popular" || b === "akanDatang" || b === "") return b;
  if (idPakej === "premium") return "popular";
  if (idPakej === "eksklusif") return "akanDatang";
  return "";
}
