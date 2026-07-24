// ============================================================
//  MODUL GATING — SATU-SATUNYA TEMPAT SEMAKAN PAKEJ
// ------------------------------------------------------------
//  Semua halaman (upload, galeri, wall, tema, tetapan) rujuk
//  fungsi di sini untuk tahu "boleh guna ciri ini atau tidak".
//  JANGAN tulis logik semakan pakej berselerak di merata tempat.
//
//  Sumber kebenaran keupayaan pakej ada di js/packages.js.
//  Logik tarikh/status majlis diguna semula dari js/majlis.js
//  (import satu-arah: gating.js -> majlis.js, TIADA pusingan balik).
//
//  PENTING: gating sisi-klien ini untuk UI/pengalaman pengguna.
//  Kuota gambar, tempoh luput & pemilikan ZIP turut dikuatkuasa
//  di server (firestore.rules) — itu yang tak boleh dilangkau.
// ============================================================

import {
  PAKEJ,
  PAKEJ_LALAI,
  HAD_TANPA_HAD,
  pakejTerendahUntukCiri,
  CIRI_AKAN_DATANG,
} from "./packages.js";
import { sudahLuput, kuotaPenuh } from "./majlis.js";

// ------------------------------------------------------------
//  pakejEvent(ev) -> id pakej yang sah ("basic" | "premium" |
//  "eksklusif"). Default "basic" jika medan tiada / tak dikenali.
// ------------------------------------------------------------
export function pakejEvent(ev) {
  const id = ev?.package;
  return PAKEJ[id] ? id : PAKEJ_LALAI;
}

// ------------------------------------------------------------
//  bolehGuna(ev, namaCiri) -> true/false untuk mana-mana ciri.
//  Contoh: bolehGuna(ev, "downloadZip"), bolehGuna(ev, "liveWall").
// ------------------------------------------------------------
export function bolehGuna(ev, namaCiri) {
  const id = pakejEvent(ev);
  return !!PAKEJ[id].ciri?.[namaCiri];
}

// ------------------------------------------------------------
//  bolehUploadLagi(ev) -> masih ada baki kuota gambar?
//  (Semakan kuota SAHAJA — status/tempoh disemak berasingan.)
// ------------------------------------------------------------
export function bolehUploadLagi(ev) {
  return !kuotaPenuh(ev);
}

// ------------------------------------------------------------
//  bakiGambar(ev) -> berapa lagi gambar boleh dimuat naik.
//  Pulangkan Infinity untuk pakej tanpa had.
// ------------------------------------------------------------
export function bakiGambar(ev) {
  const had = Number(ev?.photoLimit ?? 0);
  const kira = Number(ev?.photoCount ?? 0);
  if (!had || had >= HAD_TANPA_HAD) return Infinity;
  return Math.max(0, had - kira);
}

// ------------------------------------------------------------
//  tanpaHad(ev) -> adakah pakej ini tanpa had gambar?
// ------------------------------------------------------------
export function tanpaHad(ev) {
  const had = Number(ev?.photoLimit ?? 0);
  return !had || had >= HAD_TANPA_HAD;
}

// ------------------------------------------------------------
//  sudahTamatTempoh(ev) -> adakah expiresAt sudah lepas?
//  (Bungkus sudahLuput dari majlis.js untuk nama yang jelas.)
// ------------------------------------------------------------
export function sudahTamatTempoh(ev) {
  return sudahLuput(ev);
}

// ------------------------------------------------------------
//  namaPakej(ev) -> nama paparan pakej ("Basic"/"Premium"/…).
// ------------------------------------------------------------
export function namaPakej(ev) {
  return PAKEJ[pakejEvent(ev)].nama;
}

// ------------------------------------------------------------
//  mesejNaikTaraf(namaCiri) -> teks mesra Bahasa Melayu untuk
//  dipapar bila sesuatu ciri dikunci. Mesej menyebut pakej
//  TERENDAH yang membuka ciri itu, atau "akan datang" jika
//  ciri belum dibina.
// ------------------------------------------------------------
export function mesejNaikTaraf(namaCiri) {
  if (CIRI_AKAN_DATANG.includes(namaCiri)) {
    return "Ciri ini akan datang ✨";
  }
  const id = pakejTerendahUntukCiri(namaCiri);
  if (!id) return "Ciri ini belum tersedia.";
  return `Ciri ini tersedia dalam pakej ${PAKEJ[id].nama} ✨`;
}
