// ============================================================
//  MUAT TURUN GAMBAR SEBAGAI ZIP
// ------------------------------------------------------------
//  Modul boleh guna semula — dipanggil dari panel tetapan
//  (tetapan.js) selepas pemilik majlis log masuk & lulus gate
//  kelayakan (lihat bolehMuatTurun() dalam majlis.js).
//
//  Apa yang dibina:
//    - gambar JPEG (satu fail setiap polaroid)
//    - senarai-ucapan.csv (nama + ucapan + tarikh)
//
//  NOTA: Gambar disimpan sebagai base64 (data URI) dalam medan
//  image_url. JSZip menerima base64 terus dengan { base64: true }.
//  JSZip dimuat melalui <script> CDN pada halaman (global JSZip).
//
//  KESELAMATAN: modul ini TIDAK menguatkuasa akses. Ia dipanggil
//  hanya selepas gate lulus; pemilikan sebenar dikuatkuasa oleh
//  Firestore rules (lihat firestore.rules).
// ============================================================

import {
  db,
  collection,
  getDocs,
  query,
  where,
  orderBy,
} from "./firebase.js";

// ------------------------------------------------------------
//  UTILITI: sanitize nama untuk nama fail
// ------------------------------------------------------------
export function namaBersih(nama) {
  return (nama || "tetamu")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // huruf/nombor sahaja
    .replace(/^-+|-+$/g, "")     // buang sengkang tepi
    .slice(0, 40) || "tetamu";
}

// ------------------------------------------------------------
//  UTILITI: sambungan fail dari MIME data URI
// ------------------------------------------------------------
//  cth "data:image/webp;base64,..." -> "webp"
//      "data:image/jpeg;base64,..." -> "jpg"
//  Gambar baharu ialah WebP; gambar lama JPEG. Kedua-duanya wujud
//  serentak dalam satu majlis, jadi jangan andaikan satu format.
// ------------------------------------------------------------
export function sambunganDari(dataUri) {
  const padanan = /^data:image\/([a-z0-9.+-]+)\s*;/i.exec(dataUri || "");
  const jenis = padanan ? padanan[1].toLowerCase() : "jpeg";
  if (jenis === "jpeg" || jenis === "jpg") return "jpg";
  if (jenis === "svg+xml") return "svg";
  return jenis; // webp, png, gif, avif …
}

// ------------------------------------------------------------
//  UTILITI: escape medan CSV (petikan, koma, baris baru)
// ------------------------------------------------------------
function selCsv(nilai) {
  const s = String(nilai ?? "");
  if (/[",\n\r]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

// ------------------------------------------------------------
//  UTILITI: format tarikh dari Firestore Timestamp
// ------------------------------------------------------------
function formatTarikh(created_at) {
  try {
    const d = created_at?.toDate ? created_at.toDate() : null;
    if (!d) return "";
    // cth 2026-07-20 14:32
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(
      d.getHours()
    )}:${p(d.getMinutes())}`;
  } catch {
    return "";
  }
}

// ------------------------------------------------------------
//  BINA & CETUSKAN MUAT TURUN ZIP
// ------------------------------------------------------------
//  Parameter:
//    eventId  — majlis yang hendak dimuat turun
//    slug     — (pilihan) untuk nama fail: gambar-<slug>.zip
//    onStatus(mesej, jenis) — 'info' | 'gagal' | 'berjaya'
//    onProgres(peratus)     — 0-100 semasa mampatan
//
//  Pulangan: { jumlah } bilangan gambar dalam ZIP.
//  Melontar Error jika gagal (pemanggil papar mesej).
// ------------------------------------------------------------
// ------------------------------------------------------------
//  PENCETUS MUAT TURUN (kongsi)
// ------------------------------------------------------------
//  URL objek dibiarkan HIDUP selepas klik supaya pelayar sempat
//  menyimpan fail. Disimpan dalam Map bertanda KUNCI supaya setiap
//  sumber muat turun bebas antara satu sama lain:
//
//    kunci "zip"      -> muat turun ZIP dalam tetapan.js
//    kunci <photoId>  -> muat turun satu gambar dalam gallery.js
//
//  Tanpa kunci berasingan, memuat turun satu gambar akan membatalkan
//  URL ZIP dan mematikan pautan sandaran (#mt-pautan).
// ------------------------------------------------------------
const urlHidup = new Map(); // kunci -> objectURL

function bersihkanUrl(kunci) {
  const lama = urlHidup.get(kunci);
  if (lama) {
    URL.revokeObjectURL(lama);
    urlHidup.delete(kunci);
  }
}

function bersihkanSemuaUrl() {
  urlHidup.forEach((u) => URL.revokeObjectURL(u));
  urlHidup.clear();
}
window.addEventListener("pagehide", bersihkanSemuaUrl);

// Tukar data URI base64 -> Blob (tanpa fetch, supaya berfungsi luar talian)
function dataUriKeBlob(dataUri) {
  const koma = dataUri.indexOf(",");
  const kepala = dataUri.slice(0, koma);
  const jenis = (/data:([^;,]+)/i.exec(kepala) || [])[1] || "application/octet-stream";
  const binari = atob(dataUri.slice(koma + 1));
  const bait = new Uint8Array(binari.length);
  for (let i = 0; i < binari.length; i++) bait[i] = binari.charCodeAt(i);
  return new Blob([bait], { type: jenis });
}

/**
 * Cetuskan muat turun satu fail dengan selamat.
 *
 * @param {Blob|string} sumber  Blob, atau data URI ("data:image/webp;base64,…")
 * @param {string} nama         Nama fail (mesti ada sambungan yang betul)
 * @param {{kunci?: string}} opsyen
 * @returns {string} objectURL yang masih hidup (boleh dipakai untuk pautan sandaran)
 */
export function cetusMuatTurun(sumber, nama, { kunci = "lalai" } = {}) {
  const blob = typeof sumber === "string" ? dataUriKeBlob(sumber) : sumber;

  // Buang URL LAMA bagi kunci ini sahaja — bukan yang baharu, bukan kunci lain.
  bersihkanUrl(kunci);

  const url = URL.createObjectURL(blob);
  urlHidup.set(kunci, url);

  const a = document.createElement("a");
  a.href = url;
  a.download = nama;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();

  // PENTING — dua perkara yang TIDAK boleh dibuat serta-merta di sini:
  //
  //  1. a.remove()  — Chrome memproses muat turun secara TAK SEGERAK.
  //     Jika anchor dibuang dahulu, atribut `download` hilang dan fail
  //     disimpan dengan nama UUID blob tanpa sambungan.
  //
  //  2. URL.revokeObjectURL() — membatalkan URL sebelum pelayar sempat
  //     membaca blob akan menggugurkan muat turun tanpa sebarang ralat.
  //
  // Jadi anchor dibuang melalui pemasa, dan URL dibiarkan hidup sehingga
  // muat turun seterusnya bagi kunci yang sama, atau halaman ditutup.
  setTimeout(() => a.remove(), 60000);

  return url;
}

export async function muatTurunZipMajlis(
  eventId,
  {
    slug = "",
    onStatus = () => {},
    onProgres = () => {},
    onSandaran = () => {},
  } = {}
) {
  if (!navigator.onLine) {
    throw new Error("TIADA_INTERNET");
  }
  if (typeof JSZip === "undefined") {
    throw new Error("JSZIP_TIADA");
  }

  // 1) Ambil semua gambar diluluskan bagi majlis ini
  //    (corak query sama seperti galeri, tanpa limit)
  onStatus("Mengambil senarai gambar…", "info");
  const snap = await getDocs(
    query(
      collection(db, "photos"),
      where("eventId", "==", eventId),
      where("approved", "==", true),
      orderBy("created_at", "desc")
    )
  );

  if (snap.empty) {
    onStatus("Belum ada gambar untuk dimuat turun.", "info");
    return { jumlah: 0 };
  }

  // 2) Bina ZIP
  const zip = new JSZip();
  const barisCsv = ["bil,nama,ucapan,tarikh"]; // header
  let i = 0;

  snap.forEach((d) => {
    const row = d.data();
    i++;
    const nombor = String(i).padStart(3, "0");

    // Gambar base64 dari image_url; fallback thumb_url untuk dokumen lama
    const url = row.image_url || row.thumb_url || "";
    const koma = url.indexOf(",");
    if (url.startsWith("data:") && koma !== -1) {
      const base64 = url.slice(koma + 1);
      // Sambungan fail MESTI ikut MIME sebenar data URI. Gambar kini
      // disimpan sebagai WebP (lihat js/imej.js), bukan JPEG — fail WebP
      // yang dinamakan .jpg TIDAK boleh dibuka oleh aplikasi gambar.
      const namaFail = `${nombor}-${namaBersih(row.name)}.${sambunganDari(url)}`;
      zip.file(namaFail, base64, { base64: true });
    }
    // Baris CSV (walaupun imej tak sah, rekod ucapan tetap disimpan)
    barisCsv.push(
      [
        selCsv(nombor),
        selCsv(row.name),
        selCsv(row.message),
        selCsv(formatTarikh(row.created_at)),
      ].join(",")
    );
  });

  // Tambah CSV (BOM UTF-8 supaya betul dalam Excel)
  zip.file("senarai-ucapan.csv", "﻿" + barisCsv.join("\r\n"));

  // 3) Jana ZIP dengan progres
  onStatus(`Memampatkan ${i} gambar…`, "info");
  const blob = await zip.generateAsync(
    { type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } },
    (meta) => onProgres(meta.percent)
  );

  // 4) Cetuskan muat turun (guna pencetus kongsi — lihat cetusMuatTurun)
  const namaZip = slug ? `gambar-${namaBersih(slug)}.zip` : "wedding-photos.zip";
  const urlZip = cetusMuatTurun(blob, namaZip, { kunci: "zip" });

  onStatus(`Berjaya! ${i} gambar disediakan sebagai ${namaZip}`, "berjaya");
  // Beri pautan sandaran: jika pelayar menyekat klik automatik, pengguna
  // boleh klik sendiri. Ini juga bukti muat turun benar-benar tersedia.
  onSandaran({ url: urlZip, nama: namaZip, saiz: blob.size });

  return { jumlah: i, nama: namaZip, saiz: blob.size };
}

// ------------------------------------------------------------
//  Terjemah ralat kepada mesej Bahasa Melayu
// ------------------------------------------------------------
export function mesejRalatMuatTurun(err) {
  const m = String(err?.message || "");
  if (m === "TIADA_INTERNET") return "Tiada sambungan internet. Sila cuba lagi.";
  if (m === "JSZIP_TIADA")
    return "Pustaka ZIP gagal dimuat. Semak sambungan & muat semula halaman.";
  if (m.includes("index"))
    return "Perlu index Firestore. Buka konsol (F12) & klik pautan untuk menciptanya.";
  if (err?.code === "permission-denied")
    return "Akses ditolak. Pastikan anda log masuk sebagai pemilik majlis ini.";
  return "Maaf, gagal memuat turun. Sila cuba lagi.";
}
