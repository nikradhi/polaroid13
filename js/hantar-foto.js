// ============================================================
//  LOGIK HANTAR FOTO — SATU-SATUNYA LALUAN TULIS KE `photos`
// ------------------------------------------------------------
//  Pustaka TULEN: tiada DOM, tiada elemen, tiada teks butang.
//  Dikongsi oleh DUA laluan muat naik:
//    - js/upload.js     (gambar biasa dari kamera/galeri telefon)
//    - js/photobooth.js (jalur 3-syot dari kamera dalam browser)
//
//  KENAPA DIKONGSI, bukan disalin — dua perkara ini WAJIB sama:
//
//  1. KUNCI_COOLDOWN. Kunci berbeza = lubang spam: tetamu boleh
//     selang-seli Gambar/Photobooth tanpa jeda langsung.
//
//  2. writeBatch atomik. firestore.rules menuntut kaunter majlis
//     naik TEPAT +1 dalam commit yang SAMA dengan dokumen foto
//     (evAfter().photoCount == ev().photoCount + 1). Laluan tulis
//     berasingan bukan sekadar tak kemas — ia DITOLAK oleh server.
//
//  Nota: fungsi hantarFoto() terima Blob yang SUDAH DIMAMPAT.
//  Setiap pemanggil kawal sasaran mampatannya sendiri (gambar biasa
//  guna lalai imej.js; jalur photobooth guna SASARAN_JALUR).
// ============================================================

import {
  db,
  configSiap,
  collection,
  doc,
  serverTimestamp,
  writeBatch,
  increment,
} from "./firebase.js";
import { blobKeBase64 } from "./imej.js";
import { majlisAktif, mesejMajlisTakBoleh } from "./majlis.js";
import { bolehUploadLagi } from "./gating.js";

// --- Had & tetapan yang DIKONGSI kedua-dua laluan ---
export const SAIZ_FAIL_MAKS = 15 * 1024 * 1024; // 15 MB sebelum compress
export const HAD_UCAPAN = 120; // aksara
export const COOLDOWN_MS = 45 * 1000; // jeda minimum antara upload (anti-spam)
export const KUNCI_COOLDOWN = "polaroid_upload_terakhir"; // kunci localStorage

// ------------------------------------------------------------
//  semakKelayakanMajlis({eventId, majlis}) -> { boleh, sebab }
//  Majlis ini layak menerima gambar baharu? Dipanggil SEBELUM
//  memasang apa-apa borang — pemanggil sembunyikan butang bila
//  boleh=false supaya tetamu tak keliru.
// ------------------------------------------------------------
export function semakKelayakanMajlis({ eventId, majlis } = {}) {
  if (!eventId || !majlis) {
    return { boleh: false, sebab: "Majlis tidak dijumpai." };
  }
  if (!majlisAktif(majlis)) {
    return { boleh: false, sebab: mesejMajlisTakBoleh(majlis) };
  }
  if (!bolehUploadLagi(majlis)) {
    return {
      boleh: false,
      sebab:
        "Ruang gambar untuk majlis ini sudah penuh. Terima kasih kerana berkongsi detik indah bersama! 💛",
    };
  }
  return { boleh: true, sebab: "" };
}

// ------------------------------------------------------------
//  bakiCooldown() -> berapa SAAT lagi sebelum boleh hantar.
//  0 = boleh hantar sekarang.
//  (Halangan sisi-klien sahaja — boleh dipintas, bukan kawalan sebenar.)
// ------------------------------------------------------------
export function bakiCooldown() {
  const terakhir = Number(localStorage.getItem(KUNCI_COOLDOWN) || 0);
  if (!terakhir) return 0;
  const baki = COOLDOWN_MS - (Date.now() - terakhir);
  return baki > 0 ? Math.ceil(baki / 1000) : 0;
}

// ------------------------------------------------------------
//  semakBolehHantar() -> { boleh, sebab }
//  Semakan saat-akhir sebelum menulis: talian + konfigurasi.
// ------------------------------------------------------------
export function semakBolehHantar() {
  if (!navigator.onLine) {
    return {
      boleh: false,
      sebab: "Tiada sambungan internet. Sila semak talian anda dan cuba lagi.",
    };
  }
  if (!configSiap()) {
    return {
      boleh: false,
      sebab: "Sistem belum dikonfigurasi. Sila hubungi penganjur majlis.",
    };
  }
  return { boleh: true, sebab: "" };
}

// ------------------------------------------------------------
//  hantarFoto({eventId, nama, ucapan, blob}) -> foto baharu
//
//  blob : Blob YANG SUDAH DIMAMPAT (pemanggil urus compressImej).
//  Pulangkan objek siap untuk galeri: {id, name, message, image_url, likes}
//
//  Autolulus: semua gambar terus tampil (tiada pra-moderasi).
// ------------------------------------------------------------
export async function hantarFoto({ eventId, nama, ucapan, blob } = {}) {
  const imageUrl = await blobKeBase64(blob);

  const refFoto = doc(collection(db, "photos"));
  const batch = writeBatch(db);
  batch.set(refFoto, {
    name: nama,
    message: ucapan || null,
    image_url: imageUrl,
    approved: true,
    likes: 0,
    created_at: serverTimestamp(),
    eventId,
  });
  // WAJIB dalam batch yang sama — lihat nota (2) di kepala fail.
  batch.update(doc(db, "events", eventId), { photoCount: increment(1) });
  await batch.commit();

  // Rekod masa untuk cooldown (dikongsi kedua-dua laluan)
  localStorage.setItem(KUNCI_COOLDOWN, String(Date.now()));

  return {
    id: refFoto.id,
    name: nama,
    message: ucapan || "",
    image_url: imageUrl,
    likes: 0,
  };
}

// ------------------------------------------------------------
//  mesejRalatHantar(err) -> teks Bahasa Melayu untuk dipapar.
// ------------------------------------------------------------
export function mesejRalatHantar(err) {
  if (err?.code === "permission-denied") {
    return (
      "Maaf, majlis ini sudah tidak menerima gambar baharu " +
      "(kuota penuh atau tempoh telah tamat)."
    );
  }
  return "Maaf, gambar gagal dihantar. Sila cuba lagi sebentar.";
}
