// ============================================================
//  INIT FIREBASE
// ------------------------------------------------------------
//  Import Firebase SDK terus dari CDN (tiada npm / langkah
//  build).
//
//  db = Firestore — menyimpan metadata DAN gambar (base64).
//
//  Sistem ini TIDAK menggunakan Firebase Storage. Gambar
//  di-compress kecil di client dan disimpan sebagai base64
//  terus dalam dokumen Firestore. Jadi anda TIDAK perlu
//  mengaktifkan Storage atau pelan Blaze (kad kredit).
//
//  Fungsi SDK yang diperlukan di-eksport semula dari sini supaya
//  fail lain (upload.js, gallery.js) cukup import dari "./firebase.js".
//
//  NOTA: Jika mahu naik taraf versi SDK, tukar nombor "10.14.1"
//        pada KEDUA-DUA URL import di bawah.
// ============================================================

import {
  initializeApp,
  deleteApp,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  getCountFromServer,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  serverTimestamp,
  onSnapshot,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  increment,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

import { firebaseConfig } from "./config.js";

// Amaran mesra jika kredential belum diisi
if (String(firebaseConfig.apiKey).includes("MASUKKAN_")) {
  console.warn(
    "[Polaroid Wedding] firebaseConfig belum diisi. " +
      "Sila kemas kini fail js/config.js dengan kredential projek Firebase anda."
  );
}

// Init app + Firestore
// (app dieksport supaya admin.js boleh getAuth(app) tanpa init kedua)
export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
// Auth utama (log masuk admin/pelanggan). Dieksport untuk kegunaan bersama.
export const auth = getAuth(app);

// Eksport semula fungsi SDK yang diguna oleh fail lain
export {
  // Firestore
  collection,
  addDoc,
  getDocs,
  getCountFromServer,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  serverTimestamp,
  onSnapshot,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  increment,
  writeBatch,
  // Auth
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
};

// Semakan ringkas sama ada config sudah diisi (diguna oleh UI)
export function configSiap() {
  return !String(firebaseConfig.apiKey).includes("MASUKKAN_");
}

// ------------------------------------------------------------
//  Cipta akaun pelanggan TANPA menukar sesi log masuk owner.
//
//  Masalah: createUserWithEmailAndPassword() pada `auth` utama akan
//  AUTO-LOG-MASUK sebagai pengguna baharu itu — jadi owner (super-admin)
//  akan "tertendang" dari sesinya. Penyelesaian: cipta pengguna pada
//  satu instance Firebase app KEDUA (sementara), kemudian buang app itu.
//  Sesi owner pada `auth` utama kekal tidak tersentuh.
//
//  Pulangan: { uid } pengguna baharu.
// ------------------------------------------------------------
export async function ciptaAkaunPelanggan(emel, kataLaluan) {
  // Nama unik untuk app sementara (Date.now tidak wajib — guna emel)
  const namaApp = "cipta-user-" + emel;
  const appKedua = initializeApp(firebaseConfig, namaApp);
  const authKedua = getAuth(appKedua);
  try {
    const kredensial = await createUserWithEmailAndPassword(
      authKedua,
      emel,
      kataLaluan
    );
    const uid = kredensial.user.uid;
    // Log keluar app sementara supaya tiada sesi tergantung
    await signOut(authKedua);
    return { uid };
  } finally {
    // Buang app sementara (bersihkan memori & sambungan)
    await deleteApp(appKedua);
  }
}
