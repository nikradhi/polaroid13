// ============================================================
//  MODUL KONGSI: MAJLIS (multi-tenancy)
// ------------------------------------------------------------
//  Semua halaman awam (upload, galeri, wall, export) dan panel
//  moderasi perlu tahu "majlis mana" yang sedang dipapar.
//  Modul ini menyeragamkan:
//    - baca eventId dari URL (?e=...)
//    - muat dokumen majlis
//    - semak status/tempoh/pakej
//    - terap tema warna majlis
//
//  Nota: halaman landing (e.html) menerima SLUG, manakala
//  sub-halaman menerima EVENT ID. Lihat js/e.js.
// ============================================================

import { db, doc, getDoc } from "./firebase.js";
import { terapTemaMajlis } from "./tema.js";
// Ambang "tanpa had" — SATU SUMBER KEBENARAN dalam js/packages.js.
// Kekal di-eksport semula di sini supaya pemanggil sedia ada
// (yang import { HAD_TANPA_HAD } from "./majlis.js") tidak rosak.
// PENTING: majlis.js import dari packages.js SAHAJA (bukan gating.js)
// untuk elak pusingan import (gating.js -> majlis.js).
import { HAD_TANPA_HAD, PAKEJ, PAKEJ_LALAI } from "./packages.js";
export { HAD_TANPA_HAD };

// Tempoh tangguh muat turun: pengantin masih boleh kutip gambar
// selama 30 hari SELEPAS majlis tamat tempoh. (expiresAt menutup
// tingkap muat naik tetamu, bukan hak pemilik mengambil gambarnya.)
export const HARI_TANGGUH = 30;
const SEHARI_MS = 24 * 60 * 60 * 1000;

const BULAN_MS = ["Januari","Februari","Mac","April","Mei","Jun","Julai","Ogos","September","Oktober","November","Disember"];

// ------------------------------------------------------------
//  Format weddingDate ("yyyy-mm-dd") -> "12 Ogos 2026".
//  Pulangkan "" jika kosong, atau teks asal jika format lain.
// ------------------------------------------------------------
export function formatTarikhMajlis(s) {
  if (!s) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return s;
  const hari = parseInt(m[3], 10);
  const bulan = BULAN_MS[parseInt(m[2], 10) - 1] || "";
  return `${hari} ${bulan} ${m[1]}`;
}

// ------------------------------------------------------------
//  Baca eventId dari URL: ?e=<eventId>
// ------------------------------------------------------------
export function dapatEventId() {
  const p = new URLSearchParams(location.search);
  return (p.get("e") || "").trim();
}

// ------------------------------------------------------------
//  Muat dokumen majlis. Pulangkan { id, ...data } atau null.
//  Melontar ralat jika rules menolak (cth majlis tidak aktif).
// ------------------------------------------------------------
export async function muatEvent(eventId) {
  const snap = await getDoc(doc(db, "events", eventId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

// ------------------------------------------------------------
//  Semakan status
// ------------------------------------------------------------
// Tukar medan expiresAt (Firestore Timestamp / Date) kepada Date, atau null.
export function tarikhLuput(ev) {
  const t = ev?.expiresAt;
  return t?.toDate ? t.toDate() : (t instanceof Date ? t : null);
}

export function sudahLuput(ev) {
  const dt = tarikhLuput(ev);
  return dt ? dt.getTime() < Date.now() : false;
}

export function majlisAktif(ev) {
  return !!ev && ev.status === "active" && !sudahLuput(ev);
}

export function adalahPremium(ev) {
  return ev?.package === "premium";
}

// Semakan ciri ringkas tanpa bergantung pada gating.js (elak pusingan
// import). Untuk semakan umum di halaman lain, guna bolehGuna() dari
// js/gating.js — ini versi dalaman untuk bolehMuatTurun sahaja.
function cirianEvent(ev, namaCiri) {
  const id = PAKEJ[ev?.package] ? ev.package : PAKEJ_LALAI;
  return !!PAKEJ[id].ciri?.[namaCiri];
}

export function kuotaPenuh(ev) {
  if (!ev) return false;
  const had = Number(ev.photoLimit ?? 0);
  const kira = Number(ev.photoCount ?? 0);
  return had > 0 && kira >= had;
}

// ------------------------------------------------------------
//  KELAYAKAN MUAT TURUN ZIP
// ------------------------------------------------------------
//  Satu sumber kebenaran untuk gate muat turun (diguna oleh
//  tetapan.js). Pemilikan sebenar (ownerUid == uid) dikuatkuasa
//  oleh Firestore rules; fungsi ini menguatkuasa syarat PRODUK:
//  langganan aktif, dalam tempoh tangguh, dan pakej Premium.
// ------------------------------------------------------------

// Adakah masih dalam tempoh tangguh (expiresAt + HARI_TANGGUH)?
// Tiada expiresAt = tiada had, anggap masih boleh.
export function dalamTempohTangguh(ev) {
  const dt = tarikhLuput(ev);
  if (!dt) return true;
  return Date.now() <= dt.getTime() + HARI_TANGGUH * SEHARI_MS;
}

// Pulangkan { boleh, sebab } — `sebab` ialah mesej Bahasa Melayu
// untuk dipapar bila muat turun tidak dibenarkan.
export function bolehMuatTurun(ev) {
  if (!ev) {
    return { boleh: false, sebab: "Majlis tidak dijumpai." };
  }
  if (ev.status !== "active") {
    return {
      boleh: false,
      sebab: "Langganan anda tidak aktif. Sila hubungi admin.",
    };
  }
  if (!dalamTempohTangguh(ev)) {
    return {
      boleh: false,
      sebab: `Tempoh muat turun telah tamat (${HARI_TANGGUH} hari selepas majlis). Hubungi admin untuk melanjutkan.`,
    };
  }
  if (!cirianEvent(ev, "downloadZip")) {
    return {
      boleh: false,
      sebab: "Muat turun ZIP hanya untuk pakej Premium ke atas. Naik taraf untuk menggunakan ciri ini.",
    };
  }
  return { boleh: true, sebab: "" };
}

// ------------------------------------------------------------
//  Terap tema majlis pada halaman
// ------------------------------------------------------------
//  Kerja sebenar ada dalam js/tema.js (warna + font + variable).
//  Fungsi ini kekal di sini dengan NAMA & TANDATANGAN yang sama
//  supaya keempat-empat tempat panggilan sedia ada (gallery.js,
//  upload.js, wall.js, e.js) tidak perlu diubah langsung.
//
//  Pulangkan warna utama (string) — sama seperti sebelum ini.
// ------------------------------------------------------------
export function terapTema(ev) {
  return terapTemaMajlis(ev).utama;
}

// ------------------------------------------------------------
//  Mesej ralat seragam (Bahasa Melayu) mengikut keadaan majlis
// ------------------------------------------------------------
export function mesejMajlisTakBoleh(ev) {
  if (!ev) return "Majlis tidak dijumpai. Sila imbas semula kod QR.";
  if (sudahLuput(ev)) return "Majlis ini telah tamat tempoh. Terima kasih!";
  if (ev.status !== "active") return "Majlis ini belum diaktifkan.";
  return "Majlis ini tidak tersedia.";
}
