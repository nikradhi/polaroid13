// ============================================================
//  LOGIK PANEL SUPER ADMIN (untuk OWNER/pemilik sistem)
// ------------------------------------------------------------
//  - Log masuk guna Firebase Auth; disahkan sebagai super-admin
//    melalui koleksi admins/{uid}.
//  - Cipta akaun pelanggan (selepas bayaran manual disahkan) +
//    cipta dokumen majlis events/{id} dengan pakej & tarikh luput.
//  - Senarai semua majlis; aktif/nyahaktif; tukar pakej; set
//    tarikh luput; padam.
//
//  KESELAMATAN: semua tulisan events dikawal oleh Firestore rules
//  (hanya isAdmin() boleh cipta/padam/ubah bebas). Panel ini cuma UI.
// ============================================================

import {
  auth,
  db,
  configSiap,
  ciptaAkaunPelanggan,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  collection,
  doc,
  getDoc,
  getDocs,
  getCountFromServer,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  writeBatch,
} from "./firebase.js";
import { compressImej, blobKeBase64, FORMAT_UTAMA } from "./imej.js";
import { dalamTempohTangguh, HARI_TANGGUH } from "./majlis.js";
// Konfigurasi pakej — SATU SUMBER KEBENARAN (lihat js/packages.js).
// Nak laras had/tempoh pakej? Ubah di packages.js sahaja.
import {
  PAKEJ,
  HAD_TANPA_HAD,
  hadGambarDB,
  tempohHariPakej,
} from "./packages.js";

const SEHARI_MS = 24 * 60 * 60 * 1000;

// --- Indikator storan (kuota Firestore dikongsi SEMUA majlis) ---
const HAD_STORAN = 1024 * 1024 * 1024; // 1 GiB (had percuma Firestore)
// Anggaran satu gambar selepas compressImej() + base64, mengikut sasaran
// semasa dalam imej.js (WebP 720px / 60 KB -> ~82 KB base64). Gambar LAMA
// (JPEG 1080px) jauh lebih besar — tekan "Kira tepat" untuk angka sebenar.
const ANGGARAN_BAIT_SEGAMBAR = 85 * 1024;

// Gambar yang sudah WebP DAN di bawah saiz ini dilangkau semasa mampat
// semula — supaya alat itu idempoten dan tidak merosakkan kualiti berulang.
const HAD_LANGKAU_MAMPAT = 95 * 1024;

// --- Rujukan DOM: log masuk ---
const zonLogin = document.getElementById("zon-login");
const formLogin = document.getElementById("form-login");
const inputEmel = document.getElementById("input-emel");
const inputKataLaluan = document.getElementById("input-kata-laluan");
const ralatLogin = document.getElementById("ralat-login");
const butangLogin = document.getElementById("butang-login");

// --- Rujukan DOM: panel ---
const zonPanel = document.getElementById("zon-panel");
const emelAdmin = document.getElementById("emel-admin");
const butangKeluar = document.getElementById("butang-keluar");
const statSemua = document.getElementById("stat-semua");
const statAktif = document.getElementById("stat-aktif");
const statPremium = document.getElementById("stat-premium");
const senarai = document.getElementById("senarai");
const zonMemuat = document.getElementById("zon-memuat");
const zonKosong = document.getElementById("zon-kosong");
const storanTeks = document.getElementById("storan-teks");
const storanBar = document.getElementById("storan-bar");
const storanNota = document.getElementById("storan-nota");
const butangKiraStoran = document.getElementById("butang-kira-storan");

// --- Rujukan DOM: penyelenggaraan storan ---
const butangMampat = document.getElementById("butang-mampat");
const butangPurge = document.getElementById("butang-purge");
const selenggaraLog = document.getElementById("selenggara-log");

// --- Rujukan DOM: borang cipta ---
const formCipta = document.getElementById("form-cipta");
const cEmel = document.getElementById("c-emel");
const cKataLaluan = document.getElementById("c-kata-laluan");
const cNama = document.getElementById("c-nama");
const cPakej = document.getElementById("c-pakej");
const butangCipta = document.getElementById("butang-cipta");
const ciptaRalat = document.getElementById("cipta-ralat");
const ciptaJaya = document.getElementById("cipta-jaya");

// Langganan senarai (dua koleksi: events + eventsPrivate)
let unsubs = [];
let dataEvents = [];        // [{ id, ...medan event }]
let petaEmel = new Map();   // eventId -> ownerEmail (dari eventsPrivate)

let storanTepatBait = null;  // hasil "Kira tepat" (null = guna anggaran)
let storanTepatBil = 0;      // bilangan dokumen gambar yang diimbas
let storanTepatMasa = "";    // waktu imbasan (jam:minit)

function hentikanLangganan() {
  unsubs.forEach((f) => { try { f(); } catch { /* abai */ } });
  unsubs = [];
  dataEvents = [];
  petaEmel = new Map();
  storanTepatBait = null;
  storanTepatBil = 0;
  storanTepatMasa = "";
}

// ------------------------------------------------------------
//  UTILITI
// ------------------------------------------------------------
function esc(s) {
  const d = document.createElement("div");
  d.textContent = s ?? "";
  return d.innerHTML;
}
// Terima Firestore Timestamp ATAU objek Date -> Date
function keDate(nilai) {
  if (!nilai) return null;
  if (typeof nilai.toDate === "function") return nilai.toDate();
  if (nilai instanceof Date) return nilai;
  return null;
}
function formatTarikh(nilai) {
  const dt = keDate(nilai);
  if (!dt) return "—";
  const p = (n) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}
// Untuk nilai <input type="date"> (yyyy-mm-dd)
function keNilaiInputTarikh(nilai) {
  const dt = keDate(nilai);
  if (!dt) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}
function sudahLuput(expiresAt) {
  const dt = keDate(expiresAt);
  return dt ? dt.getTime() < Date.now() : false;
}

// ------------------------------------------------------------
//  LOG MASUK + sahkan admin
// ------------------------------------------------------------
formLogin.addEventListener("submit", async (e) => {
  e.preventDefault();
  ralatLogin.classList.add("hidden");

  if (!configSiap()) {
    ralatLogin.textContent = "Sistem belum dikonfigurasi.";
    ralatLogin.classList.remove("hidden");
    return;
  }

  butangLogin.disabled = true;
  const teksAsal = butangLogin.textContent;
  butangLogin.textContent = "Sedang log masuk…";

  try {
    await signInWithEmailAndPassword(auth, inputEmel.value.trim(), inputKataLaluan.value);
    // onAuthStateChanged akan sahkan admin & papar panel
  } catch (err) {
    console.error("Ralat log masuk:", err);
    ralatLogin.textContent = mesejRalatAuth(err.code);
    ralatLogin.classList.remove("hidden");
    inputKataLaluan.value = "";
  } finally {
    butangLogin.disabled = false;
    butangLogin.textContent = teksAsal;
  }
});

function mesejRalatAuth(kod = "") {
  if (kod.includes("invalid-credential") || kod.includes("wrong-password") || kod.includes("user-not-found"))
    return "Emel atau kata laluan salah.";
  if (kod.includes("invalid-email")) return "Format emel tidak sah.";
  if (kod.includes("too-many-requests")) return "Terlalu banyak cubaan. Sila tunggu sebentar.";
  if (kod.includes("network")) return "Tiada sambungan internet.";
  if (kod.includes("operation-not-allowed")) return "Email/Password belum diaktifkan dalam Firebase Console.";
  if (kod.includes("configuration-not-found")) return "Firebase Authentication belum diaktifkan.";
  if (kod.includes("email-already-in-use")) return "Emel ini sudah digunakan oleh akaun lain.";
  if (kod.includes("weak-password")) return "Kata laluan terlalu lemah (min. 6 aksara).";
  return "Ralat. Sila cuba lagi.";
}

// ------------------------------------------------------------
//  LOG KELUAR
// ------------------------------------------------------------
butangKeluar.addEventListener("click", async () => {
  hentikanLangganan();
  await signOut(auth);
});

// ------------------------------------------------------------
//  PANTAU KEADAAN LOG MASUK + SAHKAN ADMIN
// ------------------------------------------------------------
onAuthStateChanged(auth, async (user) => {
  if (user) {
    // Sahkan pengguna ini benar-benar super-admin (ada di admins/{uid})
    const adalahAdmin = await sahkanAdmin(user.uid);
    if (!adalahAdmin) {
      // PENTING: JANGAN signOut() di sini. Sesi Firebase Auth dikongsi
      // seluruh origin (localStorage), jadi log keluar automatik akan
      // menendang pelanggan keluar dari tetapan.html / admin.html yang
      // mungkin terbuka di tab lain. Cukup tolak akses ke panel ini
      // sahaja, dan biar pengguna sendiri pilih untuk log keluar.
      hentikanLangganan();
      zonPanel.classList.add("hidden");
      zonLogin.classList.remove("hidden");
      papariBukanAdmin(user.email || "");
      return;
    }
    sembunyiBukanAdmin();
    zonLogin.classList.add("hidden");
    zonPanel.classList.remove("hidden");
    emelAdmin.textContent = user.email || "admin";
    mulaLangganan();
  } else {
    hentikanLangganan();
    sembunyiBukanAdmin();
    zonPanel.classList.add("hidden");
    zonLogin.classList.remove("hidden");
    senarai.innerHTML = "";
  }
});

// ------------------------------------------------------------
//  NOTIS "BUKAN SUPER-ADMIN"
// ------------------------------------------------------------
//  Dipapar menggantikan borang log masuk apabila pengguna yang sudah
//  log masuk bukan admin — tanpa memusnahkan sesi mereka.
//  Nota: emel dimasukkan guna textContent (bukan innerHTML) — elak XSS.
// ------------------------------------------------------------
let zonBukanAdmin = null;

function binaZonBukanAdmin() {
  const kotak = document.createElement("div");
  kotak.className = "hidden space-y-4";

  const amaran = document.createElement("div");
  amaran.className = "kotak-ralat";
  amaran.setAttribute("role", "alert");
  amaran.textContent = "Akaun ini bukan super-admin.";

  const nota = document.createElement("p");
  nota.className = "text-sm text-[#8a7a70]";
  nota.append("Anda log masuk sebagai ");
  const spanEmel = document.createElement("span");
  spanEmel.className = "font-medium";
  nota.append(spanEmel, ". Panel ini untuk pemilik sistem sahaja.");

  const pautTetapan = document.createElement("a");
  pautTetapan.href = "tetapan.html";
  pautTetapan.className = "btn-utama block rounded-xl py-3.5 text-center font-medium";
  pautTetapan.textContent = "Pergi ke Tetapan Majlis";

  const butangTukar = document.createElement("button");
  butangTukar.type = "button";
  butangTukar.className =
    "w-full rounded-xl border border-[#d9a5ac] px-4 py-3 text-sm font-medium text-[#b76e79] hover:bg-white/60 transition";
  butangTukar.textContent = "Log keluar & guna akaun lain";
  butangTukar.addEventListener("click", async () => {
    await signOut(auth);
  });

  kotak.append(amaran, nota, pautTetapan, butangTukar);
  formLogin.insertAdjacentElement("afterend", kotak);
  kotak.spanEmel = spanEmel;
  return kotak;
}

function papariBukanAdmin(emel) {
  if (!zonBukanAdmin) zonBukanAdmin = binaZonBukanAdmin();
  zonBukanAdmin.spanEmel.textContent = emel;
  zonBukanAdmin.classList.remove("hidden");
  formLogin.classList.add("hidden");
  ralatLogin.classList.add("hidden");
}

function sembunyiBukanAdmin() {
  if (zonBukanAdmin) zonBukanAdmin.classList.add("hidden");
  formLogin.classList.remove("hidden");
}

async function sahkanAdmin(uid) {
  try {
    const snap = await getDoc(doc(db, "admins", uid));
    return snap.exists();
  } catch {
    // Rules menolak baca jika bukan admin -> anggap bukan admin
    return false;
  }
}

// ------------------------------------------------------------
//  CIPTA AKAUN PELANGGAN + MAJLIS
// ------------------------------------------------------------
formCipta.addEventListener("submit", async (e) => {
  e.preventDefault();
  ciptaRalat.classList.add("hidden");
  ciptaJaya.classList.add("hidden");

  const emel = cEmel.value.trim();
  const kataLaluan = cKataLaluan.value;
  const nama = cNama.value.trim();
  const pakej = cPakej.value;
  const cfg = PAKEJ[pakej];

  if (!emel || kataLaluan.length < 6 || !cfg) {
    ciptaRalat.textContent = "Sila isi emel dan kata laluan (min. 6 aksara).";
    ciptaRalat.classList.remove("hidden");
    return;
  }

  butangCipta.disabled = true;
  const teksAsal = butangCipta.textContent;
  butangCipta.textContent = "Sedang mencipta…";

  try {
    // 1) Cipta akaun Auth pelanggan (guna app kedua supaya sesi owner kekal)
    const { uid } = await ciptaAkaunPelanggan(emel, kataLaluan);

    // 2) Cipta dokumen majlis events/{id} + maklumat peribadi (atomik).
    //    PENTING: emel pelanggan TIDAK disimpan dalam events kerana
    //    dokumen itu boleh dibaca awam (tetamu perlu baca event aktif).
    //    Ia disimpan dalam eventsPrivate/{id} yang hanya admin boleh baca.
    const ref = doc(collection(db, "events"));
    const batch = writeBatch(db);
    batch.set(ref, {
      ownerUid: uid,
      slug: "",                       // pelanggan pilih sendiri nanti
      coupleName: nama || "",
      weddingDate: "",
      themeColor: "#b76e79",
      welcomeMessage: "",
      package: pakej,
      status: "active",
      photoLimit: hadGambarDB(pakej),
      photoCount: 0,
      preModeration: false,
      expiresAt: new Date(Date.now() + cfg.tempohHari * SEHARI_MS),
      createdAt: serverTimestamp(),
      createdBy: auth.currentUser.uid,
    });
    batch.set(doc(db, "eventsPrivate", ref.id), {
      ownerEmail: emel,
      ownerUid: uid,
    });
    await batch.commit();

    ciptaJaya.innerHTML =
      `✓ Akaun <b>${esc(emel)}</b> (${cfg.nama}) dicipta.<br>` +
      `Beritahu pelanggan: log masuk di <b>tetapan.html</b> guna emel &amp; kata laluan ini untuk pilih URL &amp; tema majlis.`;
    ciptaJaya.classList.remove("hidden");
    formCipta.reset();
  } catch (err) {
    console.error("Ralat cipta pelanggan:", err);
    ciptaRalat.textContent = mesejRalatAuth(err.code) +
      (err.code ? "" : " (semak sambungan / rules Firestore)");
    ciptaRalat.classList.remove("hidden");
  } finally {
    butangCipta.disabled = false;
    butangCipta.textContent = teksAsal;
  }
});

// ------------------------------------------------------------
//  LANGGANAN SENARAI MAJLIS (real-time)
// ------------------------------------------------------------
function mulaLangganan() {
  zonMemuat.classList.remove("hidden");

  // (1) Senarai majlis
  const qEvents = query(collection(db, "events"), orderBy("createdAt", "desc"));
  unsubs.push(onSnapshot(
    qEvents,
    (snap) => {
      dataEvents = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      paparSenarai();
    },
    (err) => {
      console.error("Ralat langganan senarai:", err);
      zonMemuat.classList.add("hidden");
      senarai.innerHTML =
        `<p class="text-center text-red-600 py-8">Gagal memuat senarai. Semak rules &amp; sambungan.</p>`;
    }
  ));

  // (2) Maklumat peribadi (emel pelanggan) — admin sahaja
  unsubs.push(onSnapshot(
    collection(db, "eventsPrivate"),
    (snap) => {
      petaEmel = new Map(snap.docs.map((d) => [d.id, d.data().ownerEmail]));
      paparSenarai();
    },
    (err) => {
      // Bukan kritikal — senarai tetap dipapar tanpa emel
      console.warn("Gagal memuat maklumat peribadi:", err);
    }
  ));
}

// ------------------------------------------------------------
//  PAPAR SENARAI (gabungan events + emel peribadi)
// ------------------------------------------------------------
function paparSenarai() {
  zonMemuat.classList.add("hidden");
  senarai.innerHTML = "";

  let aktif = 0, premium = 0;
  dataEvents.forEach((ev) => {
    if (ev.status === "active") aktif++;
    if (ev.package === "premium") premium++;
    // Emel dari koleksi peribadi; fallback ke medan lama (majlis sedia ada)
    const emel = petaEmel.get(ev.id) || ev.ownerEmail || "";
    senarai.appendChild(binaBaris(ev.id, ev, emel));
  });

  statSemua.textContent = dataEvents.length;
  statAktif.textContent = aktif;
  statPremium.textContent = premium;
  zonKosong.classList.toggle("hidden", dataEvents.length > 0);
  paparStoran();
}

// ------------------------------------------------------------
//  INDIKATOR STORAN FIRESTORE (global — semua majlis)
// ------------------------------------------------------------
//  Kuota 1 GB percuma dikongsi seluruh projek, jadi ia urusan
//  pemilik sistem (bukan pelanggan). Paparan lalai ialah ANGGARAN
//  dari kaunter events.photoCount — percuma, tiada bacaan tambahan.
//  Butang "Kira tepat" pula mengimbas koleksi photos sekali (mahal
//  dari segi egress) untuk jumlah bait sebenar.
// ------------------------------------------------------------
function paparStoran() {
  if (!storanTeks || !storanBar) return;

  const jumlahGambar = dataEvents.reduce((n, ev) => n + (ev.photoCount || 0), 0);
  const bytes = storanTepatBait ?? jumlahGambar * ANGGARAN_BAIT_SEGAMBAR;
  const mb = bytes / (1024 * 1024);
  const peratus = (bytes / HAD_STORAN) * 100;

  storanTeks.textContent = `≈ ${mb.toFixed(1)} MB / 1024 MB (${peratus.toFixed(1)}%)`;
  storanBar.style.width = Math.min(100, peratus).toFixed(1) + "%";

  // Warna ikut tahap penggunaan
  let warna = "bg-green-500";
  if (peratus >= 90) warna = "bg-red-500";
  else if (peratus >= 70) warna = "bg-amber-500";
  storanBar.className = `h-full rounded-full transition-all ${warna}`;

  if (storanNota) {
    // Dalam mod tepat, guna bilangan dokumen yang benar-benar diimbas —
    // kaunter photoCount tidak termasuk gambar majlis yang sudah dipadam.
    storanNota.textContent = storanTepatBait === null
      ? `Anggaran: ${jumlahGambar} gambar × ~85 KB. Tekan "Kira tepat" untuk angka sebenar. Had percuma Firestore = 1 GB.`
      : `Saiz sebenar ${storanTepatBil} gambar (imbasan pada ${storanTepatMasa}). Had percuma Firestore = 1 GB.`;
  }
}

if (butangKiraStoran) {
  butangKiraStoran.addEventListener("click", async () => {
    if (!confirm(
      "Imbas SEMUA gambar untuk kira saiz sebenar?\n\n" +
      "Ini memuat turun setiap gambar sekali — makan kuota bacaan/egress Firestore. " +
      "Guna sekali-sekala sahaja."
    )) return;

    butangKiraStoran.disabled = true;
    const teksAsal = butangKiraStoran.textContent;
    butangKiraStoran.textContent = "Mengimbas…";
    try {
      const snap = await getDocs(collection(db, "photos"));
      let bytes = 0;
      snap.forEach((d) => {
        const p = d.data();
        // Panjang string base64 ≈ bait tersimpan (ASCII 1 bait/aksara)
        bytes += (p.image_url || p.thumb_url || "").length;
      });
      storanTepatBait = bytes;
      storanTepatBil = snap.size;
      const kini = new Date();
      const pad = (n) => String(n).padStart(2, "0");
      storanTepatMasa = `${pad(kini.getHours())}:${pad(kini.getMinutes())}`;
      paparStoran();
    } catch (err) {
      console.error("Ralat mengira storan:", err);
      alert("Gagal mengimbas gambar. Semak rules & sambungan.");
    } finally {
      butangKiraStoran.disabled = false;
      butangKiraStoran.textContent = teksAsal;
    }
  });
}

// ------------------------------------------------------------
//  PENYELENGGARAAN STORAN
// ------------------------------------------------------------
//  Gambar disimpan sebagai base64 dalam photos.image_url, jadi saiz
//  gambar = saiz pangkalan data. Dua alat di sini:
//    (a) mampat semula gambar lama -> WebP kecil (imej.js)
//    (b) padam gambar majlis yang sudah lepas tempoh tangguh
//  Kedua-duanya operasi admin: rules membenarkan melalui isAdmin().
// ------------------------------------------------------------
function lapor(mesej, sambung = false) {
  if (!selenggaraLog) return;
  selenggaraLog.classList.remove("hidden");
  selenggaraLog.textContent = sambung
    ? `${selenggaraLog.textContent}\n${mesej}`
    : mesej;
}
function mb(bait) {
  return (bait / (1024 * 1024)).toFixed(2) + " MB";
}
// Jeda ringkas supaya UI sempat melukis & tulisan tidak mencurah sekaligus
const jeda = (ms) => new Promise((r) => setTimeout(r, ms));

// --- (a) Mampat semula semua gambar sedia ada ---
async function mampatSemula() {
  const snap = await getDocs(collection(db, "photos"));
  const jumlah = snap.size;
  lapor(`Menyemak ${jumlah} gambar…`);

  let diproses = 0, dilangkau = 0, gagal = 0;
  let baitSebelum = 0, baitSelepas = 0;

  for (const d of snap.docs) {
    const url = d.data().image_url || "";
    baitSebelum += url.length;

    // Sudah kecil & sudah WebP -> tiada gunanya diproses semula
    if (!url || (url.startsWith(`data:${FORMAT_UTAMA}`) && url.length <= HAD_LANGKAU_MAMPAT)) {
      baitSelepas += url.length;
      dilangkau++;
    } else {
      try {
        const blob = await (await fetch(url)).blob();
        const kecil = await compressImej(blob);
        const urlBaru = await blobKeBase64(kecil);
        // Jangan tulis jika tiada penjimatan (cth gambar sudah optimum)
        if (urlBaru.length >= url.length) {
          baitSelepas += url.length;
          dilangkau++;
        } else {
          await updateDoc(doc(db, "photos", d.id), { image_url: urlBaru });
          baitSelepas += urlBaru.length;
          diproses++;
        }
      } catch (err) {
        console.error("Gagal mampat", d.id, err);
        baitSelepas += url.length;
        gagal++;
      }
      await jeda(60);
    }

    const siap = diproses + dilangkau + gagal;
    if (siap % 5 === 0 || siap === jumlah) {
      lapor(`Memproses ${siap}/${jumlah}… (dimampat ${diproses}, dilangkau ${dilangkau}${gagal ? `, gagal ${gagal}` : ""})`);
    }
  }

  const jimat = baitSebelum - baitSelepas;
  const peratus = baitSebelum ? Math.round((jimat / baitSebelum) * 100) : 0;
  lapor(
    `✓ Selesai. ${diproses} gambar dimampat, ${dilangkau} dilangkau` +
    (gagal ? `, ${gagal} gagal` : "") + ".\n" +
    `Storan: ${mb(baitSebelum)} → ${mb(baitSelepas)} (jimat ${mb(jimat)}, ${peratus}%).`
  );

  // Segarkan indikator storan dengan angka sebenar yang baru dikira
  storanTepatBait = baitSelepas;
  storanTepatBil = jumlah;
  const kini = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  storanTepatMasa = `${pad(kini.getHours())}:${pad(kini.getMinutes())}`;
  paparStoran();
}

if (butangMampat) {
  butangMampat.addEventListener("click", async () => {
    if (!confirm(
      "Mampat semula SEMUA gambar kepada WebP 720px?\n\n" +
      "• Gambar dimuat turun, dimampat, dan ditulis semula — kualiti asal TIDAK boleh dipulihkan.\n" +
      "• Gambar yang sudah kecil akan dilangkau.\n" +
      "• Operasi ini memakan kuota bacaan & tulisan Firestore."
    )) return;

    butangMampat.disabled = true;
    const teksAsal = butangMampat.textContent;
    butangMampat.textContent = "Memampat…";
    try {
      await mampatSemula();
    } catch (err) {
      console.error("Ralat mampat semula:", err);
      lapor("✗ Gagal. Semak konsol pelayar & sambungan.", true);
    } finally {
      butangMampat.disabled = false;
      butangMampat.textContent = teksAsal;
    }
  });
}

// --- (b) Padam gambar majlis yang sudah tamat tempoh tangguh ---
async function cariMajlisBolehPadam() {
  const senarai = [];
  for (const ev of dataEvents) {
    if (dalamTempohTangguh(ev)) continue; // masih dalam tempoh — jangan sentuh
    const kira = await getCountFromServer(
      query(collection(db, "photos"), where("eventId", "==", ev.id))
    );
    const bil = kira.data().count;
    if (bil > 0) senarai.push({ ev, bil });
  }
  return senarai;
}

async function padamGambarMajlis(eventId) {
  // Padam berperingkat: Firestore hadkan 500 operasi setiap writeBatch.
  let jumlahDipadam = 0;
  for (;;) {
    const snap = await getDocs(
      query(collection(db, "photos"), where("eventId", "==", eventId))
    );
    if (snap.empty) break;
    const kumpulan = snap.docs.slice(0, 400);
    const batch = writeBatch(db);
    kumpulan.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    jumlahDipadam += kumpulan.length;
    if (kumpulan.length === snap.size) break;
  }
  // Kaunter kuota mesti turun sekali — jika tidak, pelanggan kekal "penuh"
  await updateDoc(doc(db, "events", eventId), { photoCount: 0 });
  return jumlahDipadam;
}

if (butangPurge) {
  butangPurge.addEventListener("click", async () => {
    butangPurge.disabled = true;
    const teksAsal = butangPurge.textContent;
    butangPurge.textContent = "Menyemak…";
    try {
      lapor("Mencari majlis yang sudah lepas tempoh tangguh…");
      const calon = await cariMajlisBolehPadam();
      if (!calon.length) {
        lapor(`Tiada majlis yang layak dipadam (semua masih dalam tempoh ${HARI_TANGGUH} hari selepas tamat).`);
        return;
      }

      const ringkasan = calon
        .map((c) => `• ${c.ev.coupleName || c.ev.id} — ${c.bil} gambar (tamat ${formatTarikh(c.ev.expiresAt)})`)
        .join("\n");
      const jumlahGambar = calon.reduce((n, c) => n + c.bil, 0);

      if (!confirm(
        `Padam ${jumlahGambar} gambar daripada ${calon.length} majlis tamat tempoh?\n\n` +
        ringkasan +
        `\n\nDokumen majlis & akaun pelanggan TIDAK dipadam — gambar sahaja. Tidak boleh dipulihkan.`
      )) {
        lapor("Dibatalkan.");
        return;
      }

      butangPurge.textContent = "Memadam…";
      let siap = 0;
      for (const c of calon) {
        lapor(`Memadam gambar "${c.ev.coupleName || c.ev.id}" (${c.bil})…`);
        siap += await padamGambarMajlis(c.ev.id);
      }
      lapor(`✓ Selesai. ${siap} gambar dipadam daripada ${calon.length} majlis.\nTekan "Kira tepat" untuk melihat storan terkini.`);
      storanTepatBait = null; // angka lama tidak lagi sah
      paparStoran();
    } catch (err) {
      console.error("Ralat memadam:", err);
      lapor("✗ Gagal memadam. Semak konsol pelayar & sambungan.", true);
    } finally {
      butangPurge.disabled = false;
      butangPurge.textContent = teksAsal;
    }
  });
}

// ------------------------------------------------------------
//  BINA SATU BARIS MAJLIS (kad — mobile-first)
// ------------------------------------------------------------
function binaBaris(id, ev, emel = "") {
  const luput = sudahLuput(ev.expiresAt);
  const kad = document.createElement("div");
  kad.className = "rounded-2xl border bg-white/70 p-4 " +
    (ev.status === "active" && !luput ? "border-[#e5d5ca]" : "border-amber-300");

  // Lencana status
  let lencanaStatus;
  if (luput) {
    lencanaStatus = `<span class="rounded-full bg-amber-100 text-amber-700 text-xs px-2 py-0.5">Tamat tempoh</span>`;
  } else if (ev.status === "active") {
    lencanaStatus = `<span class="rounded-full bg-green-100 text-green-700 text-xs px-2 py-0.5">Aktif</span>`;
  } else {
    lencanaStatus = `<span class="rounded-full bg-gray-200 text-gray-600 text-xs px-2 py-0.5">Nyahaktif</span>`;
  }
  // Lencana pakej (3 tier). Warna berbeza supaya mudah dikenali.
  const gayaPakej = {
    eksklusif: "bg-[#efe3c8] text-[#9a7b2e]",
    premium:   "bg-[#f3dfe3] text-[#b76e79]",
    basic:     "bg-[#eee6de] text-[#8a7a70]",
  };
  const idPakej = PAKEJ[ev.package] ? ev.package : "basic";
  const lencanaPakej =
    `<span class="rounded-full ${gayaPakej[idPakej] || gayaPakej.basic} text-xs px-2 py-0.5">${PAKEJ[idPakej].nama}</span>`;

  const hadTeks = ev.photoLimit >= HAD_TANPA_HAD ? "∞" : ev.photoLimit;
  const slugTeks = ev.slug
    ? `<a href="e.html?e=${encodeURIComponent(ev.slug)}" target="_blank" class="text-[#b76e79] hover:underline">/e/${esc(ev.slug)}</a>`
    : `<span class="text-[#a09088] italic">belum ditetapkan</span>`;

  kad.innerHTML = `
    <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
      <div class="min-w-0">
        <p class="font-medium text-[#5a4a42] truncate">${esc(ev.coupleName) || "(tiada nama)"}</p>
        <p class="text-xs text-[#a09088] truncate">${esc(emel)}</p>
      </div>
      <div class="flex items-center gap-1.5 shrink-0">${lencanaPakej} ${lencanaStatus}</div>
    </div>

    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-[#8a7a70] mb-3">
      <div><span class="block text-[#a09088]">URL</span>${slugTeks}</div>
      <div>
        <span class="block text-[#a09088]">Gambar</span>${ev.photoCount ?? 0} / ${hadTeks}
        <button data-act="kaunter" title="Selaraskan kaunter dengan bilangan gambar sebenar"
          class="ml-1 text-[#b76e79] hover:underline">↻</button>
      </div>
      <div><span class="block text-[#a09088]">Tamat</span>${formatTarikh(ev.expiresAt)}</div>
      <div><span class="block text-[#a09088]">ID majlis</span><code class="text-[10px]">${esc(id)}</code></div>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <button data-act="status" class="rounded-lg px-3 py-1.5 text-sm font-medium ${
        ev.status === "active"
          ? "bg-gray-100 text-gray-700 hover:bg-gray-200"
          : "bg-green-50 text-green-700 hover:bg-green-100"
      }">${ev.status === "active" ? "Nyahaktif" : "Aktifkan"}</button>

      <select data-act="pakej" class="rounded-lg border border-[#e5d5ca] bg-white px-2 py-1.5 text-sm">
        ${Object.keys(PAKEJ).map((k) =>
          `<option value="${k}" ${idPakej === k ? "selected" : ""}>${PAKEJ[k].nama}</option>`
        ).join("")}
      </select>

      <label class="flex items-center gap-1 text-sm text-[#8a7a70]">
        Tamat:
        <input data-act="tarikh" type="date" value="${keNilaiInputTarikh(ev.expiresAt)}"
          class="rounded-lg border border-[#e5d5ca] bg-white px-2 py-1 text-sm" />
      </label>

      <button data-act="padam" class="ml-auto rounded-lg px-3 py-1.5 text-sm font-medium bg-red-50 text-red-600 hover:bg-red-100">Padam</button>
    </div>
  `;

  // --- Toggle status aktif/nyahaktif ---
  kad.querySelector('[data-act="status"]').addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      await updateDoc(doc(db, "events", id), {
        status: ev.status === "active" ? "inactive" : "active",
      });
    } catch (err) {
      console.error(err);
      alert("Gagal menukar status.");
      btn.disabled = false;
    }
  });

  // --- Selaraskan kaunter kuota dengan bilangan gambar sebenar ---
  //     Perlu kerana memadam gambar TIDAK menurunkan photoCount
  //     (dan rules tidak benarkan pemilik majlis membetulkannya sendiri).
  kad.querySelector('[data-act="kaunter"]').addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    const teksAsal = btn.textContent;
    btn.textContent = "…";
    try {
      const kira = await getCountFromServer(
        query(collection(db, "photos"), where("eventId", "==", id))
      );
      const sebenar = kira.data().count;
      if (sebenar === (ev.photoCount ?? 0)) {
        alert(`Kaunter sudah tepat (${sebenar} gambar).`);
        return;
      }
      if (!confirm(`Kaunter menunjukkan ${ev.photoCount ?? 0}, gambar sebenar ${sebenar}. Selaraskan?`)) return;
      await updateDoc(doc(db, "events", id), { photoCount: sebenar });
    } catch (err) {
      console.error(err);
      alert("Gagal menyelaraskan kaunter.");
    } finally {
      btn.disabled = false;
      btn.textContent = teksAsal;
    }
  });

  // --- Tukar pakej (naik/turun taraf) — kemas kini photoLimit sekali ---
  kad.querySelector('[data-act="pakej"]').addEventListener("change", async (e) => {
    const pakejBaru = e.currentTarget.value;
    const cfg = PAKEJ[pakejBaru];
    if (!cfg) return;
    const hadBaru = hadGambarDB(pakejBaru);
    if (!confirm(`Tukar pakej kepada ${cfg.nama}? Had gambar akan jadi ${cfg.hadGambar == null ? "tanpa had" : cfg.hadGambar}.`)) {
      e.currentTarget.value = idPakej; // pulih pilihan
      return;
    }
    try {
      await updateDoc(doc(db, "events", id), {
        package: pakejBaru,
        photoLimit: hadBaru,
      });
    } catch (err) {
      console.error(err);
      alert("Gagal menukar pakej.");
      e.currentTarget.value = idPakej;
    }
  });

  // --- Set tarikh luput ---
  kad.querySelector('[data-act="tarikh"]').addEventListener("change", async (e) => {
    const nilai = e.currentTarget.value; // yyyy-mm-dd
    if (!nilai) return;
    // Tetapkan ke hujung hari itu (23:59) supaya majlis aktif sepanjang hari tamat
    const tarikh = new Date(nilai + "T23:59:59");
    try {
      await updateDoc(doc(db, "events", id), { expiresAt: tarikh });
    } catch (err) {
      console.error(err);
      alert("Gagal menetapkan tarikh luput.");
    }
  });

  // --- Padam majlis (kekal) ---
  kad.querySelector('[data-act="padam"]').addEventListener("click", async (e) => {
    if (!confirm(
      `Padam majlis "${ev.coupleName || emel || id}" secara KEKAL?\n\n` +
      `Nota: gambar sedia ada & akaun log masuk pelanggan TIDAK dipadam automatik. ` +
      `Untuk sekat sementara, guna "Nyahaktif" sahaja.`
    )) return;
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      // Buang slug (jika ada) supaya boleh diguna semula
      if (ev.slug) {
        try { await deleteDoc(doc(db, "slugs", ev.slug)); } catch { /* abai */ }
      }
      // Buang maklumat peribadi pelanggan
      try { await deleteDoc(doc(db, "eventsPrivate", id)); } catch { /* abai */ }
      await deleteDoc(doc(db, "events", id));
    } catch (err) {
      console.error(err);
      alert("Gagal memadam majlis.");
      btn.disabled = false;
    }
  });

  return kad;
}
