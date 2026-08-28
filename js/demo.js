// ============================================================
//  MAJLIS DEMO — logik khusus galeri percubaan awam
// ------------------------------------------------------------
//  Majlis demo ditanda dengan medan atas `isDemo: true` pada
//  dokumen events (diset oleh super-admin sahaja — ia tiada dalam
//  hasOnly() pemilik dalam firestore.rules).
//
//  Satu tugas: PANGKAS gambar lama supaya demo awam tidak menelan
//  kuota Firestore 1 GB yang dikongsi dengan majlis PELANGGAN SEBENAR.
//  Setiap gambar ~85 KB base64; tanpa pemangkasan, satu demo yang
//  dipaut dari halaman utama boleh membesar tanpa henti. photoLimit
//  demo sengaja dibiar tinggi supaya penguji tidak pernah nampak
//  mesej "kuota penuh" — had sebenar di sini.
//
//  NOTA: modul ini pernah menjejak "gambar yang pelayar ini muat naik"
//  dalam localStorage untuk mengehadkan butang padam kepada gambar
//  sendiri. Itu dibuang: rules memang membenarkan sesiapa memadam
//  mana-mana gambar majlis demo, jadi tapisan UI itu menyembunyikan
//  ciri daripada pelawat tanpa melindungi apa-apa.
// ============================================================

import {
  db,
  collection,
  getDocs,
  getCountFromServer,
  query,
  where,
  orderBy,
  limit,
  doc,
  writeBatch,
} from "./firebase.js";

// Berapa gambar demo disimpan. 150 x ~85 KB ~ 13 MB — terkunci selamanya.
export const HAD_DEMO = 150;

// Buang beberapa lebihan sekali gus supaya kita tidak menjalankan
// pemangkasan pada setiap muat naik sebaik had dicapai.
const PANGKAS_SEKALI = 20;

// ------------------------------------------------------------
//  PANGKAS GAMBAR DEMO LAMA
// ------------------------------------------------------------
//  Dipanggil selepas muat naik berjaya pada majlis demo. Tidak
//  melontar: kegagalan pemangkasan tidak boleh merosakkan muat naik
//  yang baru sahaja berjaya untuk penguji.
//
//  Kaunter events.photoCount SENGAJA tidak disentuh — laluan tetamu
//  dalam firestore.rules hanya membenarkan +1, tidak pernah -1. Kaunter
//  akan hanyut ke atas; itu tidak mengapa kerana photoLimit demo ialah
//  100000, dan "Padam SEMUA gambar" super-admin menetapkannya ke 0.
//
//  Pulangkan bilangan yang dipadam (0 jika tiada apa-apa dibuat).
// ------------------------------------------------------------
export async function pangkasDemo(eventId) {
  if (!eventId) return 0;
  try {
    const kira = await getCountFromServer(
      query(collection(db, "photos"), where("eventId", "==", eventId))
    );
    const jumlah = kira.data().count;
    if (jumlah <= HAD_DEMO) return 0;

    // Buang lebihan + satu kumpulan tambahan, supaya pemangkasan tidak
    // berjalan semula pada setiap muat naik seterusnya.
    const lebihan = Math.min(jumlah - HAD_DEMO + PANGKAS_SEKALI, 400);

    // Paling lama dahulu. Firestore boleh mengimbas indeks komposit
    // secara SONGSANG apabila setiap arah orderBy dibalikkan, jadi
    // indeks (eventId ASC, created_at DESC) yang sedia ada melayan
    // orderBy asc ini juga — tiada indeks baharu diperlukan.
    const snap = await getDocs(
      query(
        collection(db, "photos"),
        where("eventId", "==", eventId),
        orderBy("created_at", "asc"),
        limit(lebihan)
      )
    );
    if (snap.empty) return 0;

    const batch = writeBatch(db); // had Firestore 500 operasi/batch
    snap.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    return snap.size;
  } catch (err) {
    console.error("Ralat memangkas gambar demo:", err);
    return 0;
  }
}

