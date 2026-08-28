// ============================================================
//  FUNGSI SERVERLESS — TETAPKAN KATA LALUAN PELANGGAN
// ------------------------------------------------------------
//  Satu-satunya bahagian "backend" dalam projek ini.
//
//  KENAPA WUJUD: Firebase SDK sisi-klien TIDAK boleh menukar kata
//  laluan pengguna lain tanpa kelayakan semasa pengguna itu. Hanya
//  Admin SDK boleh. Ia perlukan akaun perkhidmatan, dan akaun
//  perkhidmatan memintas SEMUA firestore.rules — jadi ia TIDAK BOLEH
//  sesekali sampai ke pelayar. Kelayakan hidup dalam ENV Vercel.
//
//  SENI BINA: tapak sendiri kekal di GitHub Pages
//  (polaroid.murahboss.my). Hanya fail ini di-deploy ke projek Vercel
//  berasingan, jadi panggilan dari panel adalah SILANG-ASAL dan
//  preflight CORS wajib dilayan (lihat ASAL_DIBENAR).
//
//  Butang "Reset kata laluan" (emel) dalam panel TIDAK menggunakan
//  fungsi ini — ia kekal zero-backend melalui sendPasswordResetEmail().
//  Fungsi ini untuk pelanggan yang tidak dapat akses emelnya.
//
//  PLATFORM: Vercel Node runtime (CommonJS). Netlify Functions guna
//  format BERBEZA (Request/Response) — perlu ditulis semula jika hos
//  fungsi ini bertukar.
// ============================================================

const { initializeApp, getApps, cert } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");

// Sama seperti syarat Firebase Auth & borang cipta akaun dalam panel.
const PANJANG_MIN_KL = 6;
const PANJANG_MAKS_KL = 200;

// Asal yang dibenarkan memanggil fungsi ini. Ini pertahanan BERLAPIS
// sahaja — CORS dikuatkuasakan oleh pelayar, bukan oleh curl. Pagar
// sebenar ialah token admin + semakan admins/{uid} di bawah.
const ASAL_DIBENAR = new Set([
  "https://polaroid.murahboss.my",
  "http://localhost:3000",   // npx serve .
  "http://localhost:8000",   // python -m http.server
]);

// --- Init sekali sahaja: bekas serverless DIGUNA SEMULA antara
//     panggilan, dan initializeApp() kedua kali campak ralat
//     "app already exists".
function apl() {
  if (getApps().length) return getApps()[0];
  // Kunci peribadi boleh ditampal ke UI Vercel dalam dua bentuk: baris
  // baharu sebenar, atau "\n" literal seperti dalam fail JSON. replace()
  // membetulkan bentuk kedua dan jadi no-op untuk bentuk pertama.
  const kunciPeribadi = (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !kunciPeribadi) {
    throw new Error("ENV_TIDAK_LENGKAP");
  }
  return initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: kunciPeribadi,
    }),
  });
}

function gagal(res, status, kod, mesej) {
  res.status(status).json({ ok: false, kod, mesej });
}

function huraiBadan(badan) {
  if (typeof badan === "string") {
    try { return JSON.parse(badan); } catch { return {}; }
  }
  return badan || {};
}

module.exports = async function handler(req, res) {
  // --- (0) CORS. Echo asal yang SPESIFIK, bukan "*": permintaan
  //         membawa header Authorization, dan "*" tidak sah bersama
  //         kelayakan pada sesetengah konfigurasi. Vary: Origin supaya
  //         cache CDN tidak menghidangkan header asal yang salah.
  const asal = req.headers.origin || "";
  if (ASAL_DIBENAR.has(asal)) {
    res.setHeader("Access-Control-Allow-Origin", asal);
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Max-Age", "86400");
  }
  res.setHeader("Vary", "Origin");

  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return gagal(res, 405, "kaedah", "Kaedah tidak dibenarkan.");
  }

  // --- (1) Token pemanggil. Semakan MURAH ini didahulukan supaya
  //         trafik tanpa token tidak pernah menyentuh Firestore.
  const kepala = req.headers.authorization || "";
  const token = kepala.startsWith("Bearer ") ? kepala.slice(7).trim() : "";
  if (!token) return gagal(res, 401, "tiada-token", "Tiada token pengesahan. Sila log masuk semula.");

  let auth, dbAdmin;
  try {
    const a = apl();
    auth = getAuth(a);
    dbAdmin = getFirestore(a);
  } catch (err) {
    console.error("Init admin gagal:", err);
    return gagal(res, 500, "config", "Pelayan belum dikonfigurasikan (akaun perkhidmatan tiada).");
  }

  let pemanggil;
  try {
    // checkRevoked = true: token yang sudah dibatalkan (log keluar paksa,
    // akaun dinyahdayakan) ditolak, bukan hanya token yang tamat tempoh.
    pemanggil = await auth.verifyIdToken(token, true);
  } catch {
    return gagal(res, 401, "token-tidak-sah", "Sesi tamat atau tidak sah. Sila log masuk semula.");
  }

  // --- (2) KEBENARAN: pemanggil MESTI super-admin sebenar. Disemak di
  //         pelayan terhadap admins/{uid} — JANGAN sesekali percaya
  //         bendera "saya admin" yang dihantar client. admins/{uid}
  //         ialah write:false dalam firestore.rules, jadi tiada siapa
  //         boleh melantik diri sendiri; itu yang menjadikan pintu ini
  //         kukuh.
  const snapAdmin = await dbAdmin.doc(`admins/${pemanggil.uid}`).get();
  if (!snapAdmin.exists) {
    return gagal(res, 403, "bukan-admin", "Akaun anda bukan super-admin.");
  }

  // --- (3) Input
  const badan = huraiBadan(req.body);
  const eventId = String(badan.eventId || "").trim();
  const kataLaluanBaru = String(badan.kataLaluanBaru || "");

  if (!eventId) return gagal(res, 400, "tiada-event", "ID majlis tiada.");
  if (kataLaluanBaru.length < PANJANG_MIN_KL) {
    return gagal(res, 400, "kl-pendek", `Kata laluan mesti sekurang-kurangnya ${PANJANG_MIN_KL} aksara.`);
  }
  if (kataLaluanBaru.length > PANJANG_MAKS_KL || kataLaluanBaru.trim() === "") {
    return gagal(res, 400, "kl-tidak-sah", "Kata laluan tidak sah.");
  }

  // --- (4) SASARAN ditentukan oleh PELAYAN, bukan oleh client. Client
  //         hanya boleh MENAMAKAN majlis; pemilik majlis itu datang
  //         daripada events/{eventId}.ownerUid. Tanpa ini, seorang admin
  //         boleh menamakan sebarang UID.
  const snapEvent = await dbAdmin.doc(`events/${eventId}`).get();
  if (!snapEvent.exists) return gagal(res, 404, "majlis-tiada", "Majlis tidak dijumpai.");
  const ownerUid = snapEvent.get("ownerUid");
  if (!ownerUid) {
    return gagal(res, 409, "tiada-pemilik", "Majlis ini tiada akaun pemilik (ownerUid). Tiada kata laluan untuk ditetapkan.");
  }

  // Jangan benarkan seorang admin menukar kata laluan admin lain di sini.
  const snapSasaranAdmin = await dbAdmin.doc(`admins/${ownerUid}`).get();
  if (snapSasaranAdmin.exists) {
    return gagal(res, 403, "sasaran-admin", "Akaun ini akaun admin — tukar kata laluannya melalui Firebase Console.");
  }

  // --- (5) Tetapkan
  try {
    await auth.updateUser(ownerUid, { password: kataLaluanBaru });
    // Batalkan semua sesi sedia ada: tujuan reset ialah supaya kata
    // laluan LAMA (dan peranti lama) benar-benar tidak lagi berkuasa.
    await auth.revokeRefreshTokens(ownerUid);
  } catch (err) {
    console.error("updateUser gagal:", err && err.code, err && err.message);
    if (err && err.code === "auth/user-not-found") {
      return gagal(res, 404, "akaun-tiada", "Akaun log masuk pelanggan tidak dijumpai.");
    }
    if (err && err.code === "auth/invalid-password") {
      return gagal(res, 400, "kl-tidak-sah", "Kata laluan ditolak Firebase (min. 6 aksara).");
    }
    return gagal(res, 500, "gagal-set", "Gagal menetapkan kata laluan. Cuba lagi.");
  }

  // Jangan pulangkan maklumat peribadi yang panel belum ada.
  return res.status(200).json({ ok: true });
};
