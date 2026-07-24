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
