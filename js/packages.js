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
    harga: 55,            // RM
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
