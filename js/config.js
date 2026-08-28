// ============================================================
//  KONFIGURASI FIREBASE
// ------------------------------------------------------------
//  Gantikan nilai di bawah dengan kredential projek Firebase
//  anda sendiri.
//
//  Cara dapat nilai ini:
//    1. Buka https://console.firebase.google.com
//    2. Pilih projek anda > ikon roda gigi > Project settings
//    3. Skrol ke bahagian "Your apps" > pilih app Web (</>)
//       (jika belum ada, klik "Add app" > Web dahulu)
//    4. Salin objek "firebaseConfig" yang ditunjukkan
//
//  PENTING:
//    - Nilai firebaseConfig ini MEMANG selamat didedah di
//      frontend — keselamatan sebenar datang dari "Security
//      Rules" (lihat firestore.rules & storage.rules).
// ============================================================

export const firebaseConfig = {
  apiKey: "AIzaSyAh3npq96CqxoV0dWSzqIpQd2X97P_XX5k",
  authDomain: "wedding-a182e.firebaseapp.com",
  projectId: "wedding-a182e",
  storageBucket: "wedding-a182e.firebasestorage.app",
  messagingSenderId: "155420042721",
  appId: "1:155420042721:web:97303062d4a7a65da19ea0"
};

// NOTA: Sistem ini menyimpan gambar (base64) terus dalam Firestore,
// jadi Firebase Storage TIDAK digunakan. Medan "storageBucket" di atas
// boleh diabaikan (tidak mengapa jika dibiarkan).

// Nama pengantin — dipaparkan pada halaman QR (ubah ikut suka)
export const NAMA_PENGANTIN = "Pengantin";

// NOTA: EXPORT_PASSWORD (kata laluan kongsi untuk muat turun ZIP) telah
// DIBUANG. Muat turun kini berada dalam Panel Tetapan (tetapan.html) dan
// dilindungi oleh log masuk Firebase Auth: hanya pemilik majlis
// (events.ownerUid == uid) boleh memuat turun gambar majlisnya.
// Lihat js/muat-turun.js + bolehMuatTurun() dalam js/majlis.js.

