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
  sendPasswordResetEmail,
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
  increment,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  writeBatch,
} from "./firebase.js";
import { compressImej, blobKeBase64, FORMAT_UTAMA } from "./imej.js";
import { dalamTempohTangguh, HARI_TANGGUH } from "./majlis.js";
import { muatTurunZipMajlis, mesejRalatMuatTurun } from "./muat-turun.js";
// Konfigurasi pakej — SATU SUMBER KEBENARAN (lihat js/packages.js).
// Nak laras had/tempoh pakej? Ubah di packages.js sahaja.
import {
  PAKEJ,
  HAD_TANPA_HAD,
  LABEL_CIRI,
  CIRI_AKAN_DATANG,
  pakejEfektif,
  ciriEfektif,
  tempohHariEfektif,
  hadGambarDBEfektif,
  badgePakej,
} from "./packages.js";

const SEHARI_MS = 24 * 60 * 60 * 1000;

// Berapa majlis setiap halaman (pagination sisi-klien).
const SAIZ_HALAMAN = 10;

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
const zonTiadaCarian = document.getElementById("zon-tiada-carian");
const inputCari = document.getElementById("input-cari");
const filterStatus = document.getElementById("filter-status");
const filterPakej = document.getElementById("filter-pakej");
const zonPagination = document.getElementById("pagination");
const storanTeks = document.getElementById("storan-teks");
const storanBar = document.getElementById("storan-bar");
const storanNota = document.getElementById("storan-nota");
const butangKiraStoran = document.getElementById("butang-kira-storan");

// --- Rujukan DOM: penyelenggaraan storan ---
const butangMampat = document.getElementById("butang-mampat");
const butangPurge = document.getElementById("butang-purge");
const selenggaraLog = document.getElementById("selenggara-log");

// --- Rujukan DOM: urus gambar pelanggan ---
const gCari = document.getElementById("g-cari");
const gSenarai = document.getElementById("g-senarai");
const gPanel = document.getElementById("g-panel");
const gInfo = document.getElementById("g-info");
const gZip = document.getElementById("g-zip");
const gPadamSemua = document.getElementById("g-padam-semua");
const gStatus = document.getElementById("g-status");
const gGrid = document.getElementById("g-grid");

// --- Rujukan DOM: borang cipta ---
const formCipta = document.getElementById("form-cipta");
const cEmel = document.getElementById("c-emel");
const cKataLaluan = document.getElementById("c-kata-laluan");
const cNama = document.getElementById("c-nama");
const cTelefon = document.getElementById("c-telefon");
const cPakej = document.getElementById("c-pakej");
const butangCipta = document.getElementById("butang-cipta");
const ciptaRalat = document.getElementById("cipta-ralat");
const ciptaJaya = document.getElementById("cipta-jaya");

// --- Rujukan DOM: borang harga & promosi ---
const formPromo = document.getElementById("form-promo");
const promoPakej = document.getElementById("promo-pakej"); // bekas blok per-pakej
const pAktif = document.getElementById("p-aktif");
const pTajuk = document.getElementById("p-tajuk");
const pMula = document.getElementById("p-mula");
const pTamat = document.getElementById("p-tamat");
const butangSimpanPromo = document.getElementById("butang-simpan-promo");
const promoRalat = document.getElementById("promo-ralat");
const promoJaya = document.getElementById("promo-jaya");

// --- Rujukan DOM: borang butiran pakej ---
const formButiran = document.getElementById("form-butiran");
const butiranPakej = document.getElementById("butiran-pakej"); // bekas blok per-pakej
const butangSimpanButiran = document.getElementById("butang-simpan-butiran");
const butiranRalat = document.getElementById("butiran-ralat");
const butiranJaya = document.getElementById("butiran-jaya");

// --- Rujukan DOM: side navigation ---
const butangNav = Array.from(document.querySelectorAll("[data-sek]"));
const seksyen = {
  papan: document.getElementById("sek-papan"),
  selenggara: document.getElementById("sek-selenggara"),
  gambar: document.getElementById("sek-gambar"),
  cipta: document.getElementById("sek-cipta"),
  harga: document.getElementById("sek-harga"),
  pakej: document.getElementById("sek-pakej"),
  senarai: document.getElementById("sek-senarai"),
};
const tajukSeksyen = document.getElementById("tajuk-seksyen");
const butangMenu = document.getElementById("butang-menu");
const navSisi = document.getElementById("nav-sisi");
const navOverlay = document.getElementById("nav-overlay");

// ------------------------------------------------------------
//  SIDE NAVIGATION (tukar seksyen + laci mobile)
// ------------------------------------------------------------
//  Setiap butang nav (data-sek) memaparkan satu #sek-* pada satu
//  masa. Seksyen tersembunyi tetap diisi data di latar oleh logik
//  sedia ada, jadi bertukar view tidak perlu muat semula apa-apa.
// ------------------------------------------------------------
function tukarSeksyen(nama) {
  if (!seksyen[nama]) nama = "papan"; // fallback jika hash tak sah
  for (const [kunci, el] of Object.entries(seksyen)) {
    if (el) el.classList.toggle("hidden", kunci !== nama);
  }
  let label = "";
  for (const btn of butangNav) {
    const aktif = btn.dataset.sek === nama;
    if (aktif) {
      btn.setAttribute("aria-current", "page");
      label = btn.textContent.trim();
    } else {
      btn.removeAttribute("aria-current");
    }
  }
  if (tajukSeksyen && label) tajukSeksyen.textContent = label;
  if (location.hash.slice(1) !== nama) {
    history.replaceState(null, "", "#" + nama);
  }
  tutupLaci();
}

function bukaLaci() {
  navSisi?.classList.add("buka");
  navOverlay?.classList.remove("hidden");
}
function tutupLaci() {
  navSisi?.classList.remove("buka");
  navOverlay?.classList.add("hidden");
}

butangNav.forEach((btn) =>
  btn.addEventListener("click", () => tukarSeksyen(btn.dataset.sek))
);
butangMenu?.addEventListener("click", bukaLaci);
navOverlay?.addEventListener("click", tutupLaci);
window.addEventListener("hashchange", () => tukarSeksyen(location.hash.slice(1)));

// Config butiran pakej (settings/pakej) — dimuat sekali di init.
// null = belum dimuat / tiada override -> resolver fallback ke lalai kod.
let cfgPakejSemasa = null;

// Langganan senarai (dua koleksi: events + eventsPrivate)
let unsubs = [];
let dataEvents = [];        // [{ id, ...medan event }]
let petaEmel = new Map();   // eventId -> ownerEmail (dari eventsPrivate)
let petaTelefon = new Map();// eventId -> telefon (dari eventsPrivate)

let istilahCari = "";              // teks carian semasa (huruf kecil)
let statusPilih = "";              // penapis status: "" | "active" | "inactive" | "luput"
let pakejPilih = "";               // penapis jenis pakej: "" | id pakej
let halamanSemasa = 1;             // halaman aktif (pagination sisi-klien, mula 1)

let storanTepatBait = null;  // hasil "Kira tepat" (null = guna anggaran)
let storanTepatBil = 0;      // bilangan dokumen gambar yang diimbas
let storanTepatMasa = "";    // waktu imbasan (jam:minit)

function hentikanLangganan() {
  unsubs.forEach((f) => { try { f(); } catch { /* abai */ } });
  unsubs = [];
  dataEvents = [];
  petaEmel = new Map();
  petaTelefon = new Map();
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
    tukarSeksyen(location.hash.slice(1) || "papan");
    mulaLangganan();
    muatPromo();
    muatButiranPakej();
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
  const telefon = cTelefon.value.trim();
  const pakej = cPakej.value;
  const cfg = PAKEJ[pakej];

  if (!emel || kataLaluan.length < 6 || !cfg) {
    ciptaRalat.textContent = "Sila isi emel dan kata laluan (min. 6 aksara).";
    ciptaRalat.classList.remove("hidden");
    return;
  }
  if (!telefon) {
    ciptaRalat.textContent = "Sila isi no. telefon pelanggan.";
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
      photoLimit: hadGambarDBEfektif(pakej, cfgPakejSemasa),
      photoCount: 0,
      preModeration: false,
      // Snapshot keupayaan pakej BERKESAN (override super-admin) supaya
      // gating berkuat kuasa sebenar untuk majlis ini walau butiran pakej
      // diubah kemudian. Majlis lama tanpa medan ini fallback ke lalai kod.
      ciri: ciriEfektif(pakej, cfgPakejSemasa),
      expiresAt: new Date(Date.now() + tempohHariEfektif(pakej, cfgPakejSemasa) * SEHARI_MS),
      createdAt: serverTimestamp(),
      createdBy: auth.currentUser.uid,
    });
    batch.set(doc(db, "eventsPrivate", ref.id), {
      ownerEmail: emel,
      ownerUid: uid,
      telefon,
    });
    await batch.commit();

    ciptaJaya.innerHTML =
      `✓ Akaun <b>${esc(emel)}</b> (${pakejEfektif(pakej, cfgPakejSemasa).nama}) dicipta.<br>` +
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
//  HARGA & PROMOSI PAKEJ (dokumen settings/promo)
// ------------------------------------------------------------
//  Satu dokumen global; baca awam (tetamu perlu nampak harga di
//  pakej.html), tulis admin sahaja (dikuatkuasa Firestore rules).
//
//  Dua lapis:
//    - hargaAsal[id] : override harga asal, berkuat kuasa SENTIASA.
//    - harga[id]     : harga promo, dipapar hanya dalam julat tarikh.
//
//  Blok input per-pakej dibina dinamik ke dalam #promo-pakej supaya
//  id konsisten dan menambah pakej baharu = tiada ubah HTML.
// ------------------------------------------------------------

// Baca satu input harga -> nombor sah (>0) atau null (kosong/tak sah).
function bacaHargaInput(el) {
  if (!el) return null;
  const v = el.value.trim();
  if (v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Rujukan input untuk satu pakej (dibina oleh binaBarisPromo).
function inputPakej(id) {
  return {
    asal: document.getElementById(`pa-${id}`),
    promoCek: document.getElementById(`promo-${id}`),
    promo: document.getElementById(`pp-${id}`),
    prev: document.getElementById(`prev-${id}`),
  };
}

// Kemas kini pratonton jimat untuk satu pakej (dipanggil pada setiap input).
function kemasPratonton(id) {
  const el = inputPakej(id);
  if (!el.prev) return;
  const lalai = PAKEJ[id].harga;
  const asal = bacaHargaInput(el.asal) ?? lalai;       // harga asal berkuat kuasa
  const cek = el.promoCek?.checked;
  el.promo.disabled = !cek;                            // input promo aktif bila dicek sahaja
  if (!cek) { el.prev.textContent = ""; return; }
  const promo = bacaHargaInput(el.promo);
  if (promo == null) { el.prev.textContent = "Isi harga promo."; el.prev.className = pratontonKelas("samar"); return; }
  if (promo >= asal) {
    el.prev.textContent = `Harga promo mesti kurang dari harga asal (RM${asal}).`;
    el.prev.className = pratontonKelas("ralat");
    return;
  }
  const jimat = asal - promo;
  const peratus = Math.round((jimat / asal) * 100);
  el.prev.textContent = `Jimat RM${jimat} (${peratus}%) — RM${asal} → RM${promo}`;
  el.prev.className = pratontonKelas("ok");
}

function pratontonKelas(jenis) {
  const asas = "text-xs mt-1 ";
  if (jenis === "ok") return asas + "text-green-600";
  if (jenis === "ralat") return asas + "text-red-600";
  return asas + "text-[#a09088]";
}

// Bina blok input untuk semua pakej ke dalam #promo-pakej.
function binaBarisPromo() {
  if (!promoPakej) return;
  promoPakej.innerHTML = "";
  Object.keys(PAKEJ).forEach((id) => {
    const p = PAKEJ[id];
    const blok = document.createElement("div");
    blok.className = "rounded-xl border border-[#e5d5ca] bg-white/60 p-4";
    blok.innerHTML =
      `<p class="font-medium text-sm mb-2">${p.nama} <span class="text-[#a09088] font-normal">· lalai RM${p.harga}</span></p>` +
      `<div class="grid sm:grid-cols-2 gap-3">` +
        `<div>` +
          `<label class="block text-xs font-medium mb-1">Harga asal (RM)</label>` +
          `<input id="pa-${id}" type="number" min="1" step="1" class="input-elok" placeholder="lalai RM${p.harga} — kosong = guna lalai" />` +
        `</div>` +
        `<div>` +
          `<label class="inline-flex items-center gap-2 text-xs font-medium mb-1">` +
            `<input id="promo-${id}" type="checkbox" class="h-4 w-4 rounded border-[#d9a5ac] text-[#b76e79]" /> Promo` +
          `</label>` +
          `<input id="pp-${id}" type="number" min="1" step="1" class="input-elok" placeholder="harga promo" disabled />` +
        `</div>` +
      `</div>` +
      `<p id="prev-${id}" class="text-xs mt-1 text-[#a09088]"></p>`;
    promoPakej.appendChild(blok);

    // Pendengar pratonton langsung
    const el = inputPakej(id);
    el.asal?.addEventListener("input", () => kemasPratonton(id));
    el.promo?.addEventListener("input", () => kemasPratonton(id));
    el.promoCek?.addEventListener("change", () => kemasPratonton(id));
  });
}
binaBarisPromo();

// Isi borang dari settings/promo (jika ada).
async function muatPromo() {
  try {
    const snap = await getDoc(doc(db, "settings", "promo"));
    if (!snap.exists()) return;
    const p = snap.data();
    pAktif.checked = p.aktif === true;
    pTajuk.value = p.tajuk || "";
    pMula.value = keNilaiInputTarikh(p.mula);
    pTamat.value = keNilaiInputTarikh(p.tamat);
    Object.keys(PAKEJ).forEach((id) => {
      const el = inputPakej(id);
      if (el.asal) el.asal.value = p.hargaAsal?.[id] ?? "";
      const hp = p.harga?.[id];
      if (el.promoCek) el.promoCek.checked = hp != null;
      if (el.promo) el.promo.value = hp ?? "";
      kemasPratonton(id);
    });
  } catch (err) {
    console.warn("Gagal memuat harga/promosi:", err);
  }
}

formPromo.addEventListener("submit", async (e) => {
  e.preventDefault();
  promoRalat.classList.add("hidden");
  promoJaya.classList.add("hidden");

  // Kumpul harga asal (override) + harga promo per pakej.
  const hargaAsal = {};   // override harga asal (berkuat kuasa sentiasa)
  const harga = {};       // harga promo (dalam julat tarikh)
  for (const id of Object.keys(PAKEJ)) {
    const el = inputPakej(id);
    const asalOverride = bacaHargaInput(el.asal);
    if (asalOverride != null) hargaAsal[id] = asalOverride;

    if (el.promoCek?.checked) {
      const hp = bacaHargaInput(el.promo);
      if (hp == null) {
        promoRalat.textContent = `Isi harga promo untuk pakej ${PAKEJ[id].nama}.`;
        promoRalat.classList.remove("hidden");
        return;
      }
      const asalBerkuatKuasa = asalOverride ?? PAKEJ[id].harga;
      if (hp >= asalBerkuatKuasa) {
        promoRalat.textContent = `Harga promo ${PAKEJ[id].nama} (RM${hp}) mesti kurang dari harga asal (RM${asalBerkuatKuasa}).`;
        promoRalat.classList.remove("hidden");
        return;
      }
      harga[id] = hp;
    }
  }

  // Tarikh: mula = awal hari, tamat = hujung hari (selari corak expiresAt).
  const mula = pMula.value ? new Date(pMula.value + "T00:00:00") : null;
  const tamat = pTamat.value ? new Date(pTamat.value + "T23:59:59") : null;

  if (pAktif.checked) {
    if (!mula || !tamat) {
      promoRalat.textContent = "Sila isi tarikh mula & tamat untuk promosi aktif.";
      promoRalat.classList.remove("hidden");
      return;
    }
    if (tamat < mula) {
      promoRalat.textContent = "Tarikh tamat mesti selepas tarikh mula.";
      promoRalat.classList.remove("hidden");
      return;
    }
    if (Object.keys(harga).length === 0) {
      promoRalat.textContent = "Tanda & isi sekurang-kurangnya satu harga promo pakej.";
      promoRalat.classList.remove("hidden");
      return;
    }
  }

  butangSimpanPromo.disabled = true;
  const teksAsal = butangSimpanPromo.textContent;
  butangSimpanPromo.textContent = "Sedang menyimpan…";

  try {
    // Tulis PENUH (tanpa merge) supaya override/promo yang dikosongkan
    // benar-benar dipadam (merge nested tak memadam kunci).
    await setDoc(doc(db, "settings", "promo"), {
      hargaAsal,
      aktif: pAktif.checked,
      tajuk: pTajuk.value.trim(),
      mula,
      tamat,
      harga,
      dikemasOleh: auth.currentUser.uid,
      dikemasPada: serverTimestamp(),
    });

    promoJaya.textContent = pAktif.checked
      ? "✓ Disimpan. Harga asal dikemas & promosi aktif dalam julat tarikh ditetapkan."
      : "✓ Disimpan. Harga asal dikemas; promosi kini tidak aktif.";
    promoJaya.classList.remove("hidden");
  } catch (err) {
    console.error("Ralat simpan harga/promosi:", err);
    promoRalat.textContent = "Gagal menyimpan (semak sambungan / rules Firestore).";
    promoRalat.classList.remove("hidden");
  } finally {
    butangSimpanPromo.disabled = false;
    butangSimpanPromo.textContent = teksAsal;
  }
});

// ============================================================
//  BUTIRAN PAKEJ (dokumen settings/pakej)
// ------------------------------------------------------------
//  Super-admin custom nama / had gambar / tempoh / senarai ciri /
//  lencana setiap pakej. Satu dokumen global; baca awam (tetamu di
//  pakej.html perlu nampak butiran), tulis admin sahaja (rules).
//
//  Blok input per-pakej dibina dinamik ke dalam #butiran-pakej.
//  Nilai berkesan (lalai ditindih override) dikira di packages.js.
// ------------------------------------------------------------

// Rujukan input untuk satu pakej (dibina oleh binaBarisButiran).
function inputButiran(id) {
  return {
    nama: document.getElementById(`bn-${id}`),
    unl: document.getElementById(`bh-unl-${id}`),
    had: document.getElementById(`bh-${id}`),
    tempoh: document.getElementById(`bt-${id}`),
    badge: document.getElementById(`bb-${id}`),
    ciri: (k) => document.getElementById(`bc-${id}-${k}`),
  };
}

// Baca satu input nombor -> int positif atau null (kosong/tak sah).
function bacaIntInput(el) {
  if (!el) return null;
  const v = el.value.trim();
  if (v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

// Toggle: bila "Tanpa had" dicek, lumpuhkan input had.
function kemasHadButiran(id) {
  const el = inputButiran(id);
  if (el.had && el.unl) el.had.disabled = el.unl.checked;
}

// Bina blok input untuk semua pakej ke dalam #butiran-pakej.
function binaBarisButiran() {
  if (!butiranPakej) return;
  butiranPakej.innerHTML = "";
  Object.keys(PAKEJ).forEach((id) => {
    const p = PAKEJ[id];
    const blok = document.createElement("div");
    blok.className = "rounded-xl border border-[#e5d5ca] bg-white/60 p-4";

    const ciriHtml = Object.keys(LABEL_CIRI).map((k) => {
      const hint = CIRI_AKAN_DATANG.includes(k) ? " (akan datang)" : "";
      return (
        `<label class="inline-flex items-center gap-2 text-xs">` +
          `<input id="bc-${id}-${k}" type="checkbox" class="h-4 w-4 rounded border-[#d9a5ac] text-[#b76e79]" /> ` +
          `${LABEL_CIRI[k]}${hint}` +
        `</label>`
      );
    }).join("");

    blok.innerHTML =
      `<p class="font-medium text-sm mb-2">${p.nama} <span class="text-[#a09088] font-normal">· lalai</span></p>` +
      `<div class="grid sm:grid-cols-2 gap-3 mb-3">` +
        `<div>` +
          `<label class="block text-xs font-medium mb-1">Nama pakej</label>` +
          `<input id="bn-${id}" type="text" maxlength="40" class="input-elok" placeholder="lalai: ${p.nama}" />` +
        `</div>` +
        `<div>` +
          `<label class="block text-xs font-medium mb-1">Lencana</label>` +
          `<select id="bb-${id}" class="input-elok">` +
            `<option value="">Tiada</option>` +
            `<option value="popular">Popular</option>` +
            `<option value="akanDatang">Akan datang</option>` +
          `</select>` +
        `</div>` +
        `<div>` +
          `<label class="block text-xs font-medium mb-1">Had gambar</label>` +
          `<label class="inline-flex items-center gap-2 text-xs mb-1">` +
            `<input id="bh-unl-${id}" type="checkbox" class="h-4 w-4 rounded border-[#d9a5ac] text-[#b76e79]" /> Tanpa had` +
          `</label>` +
          `<input id="bh-${id}" type="number" min="1" step="1" class="input-elok" placeholder="cth: 300" />` +
        `</div>` +
        `<div>` +
          `<label class="block text-xs font-medium mb-1">Tempoh aktif (hari)</label>` +
          `<input id="bt-${id}" type="number" min="1" step="1" class="input-elok" placeholder="cth: 14" />` +
        `</div>` +
      `</div>` +
      `<p class="text-xs font-medium mb-1.5">Ciri disertakan</p>` +
      `<div class="grid sm:grid-cols-2 gap-x-4 gap-y-1.5">${ciriHtml}</div>`;

    butiranPakej.appendChild(blok);

    const el = inputButiran(id);
    el.unl?.addEventListener("change", () => kemasHadButiran(id));
  });
}
binaBarisButiran();

// Isi borang dari settings/pakej (guna nilai BERKESAN supaya kotak
// dipenuhi walaupun override tiada — pratonton yang jelas untuk admin).
async function muatButiranPakej() {
  try {
    const snap = await getDoc(doc(db, "settings", "pakej"));
    cfgPakejSemasa = snap.exists() ? snap.data() : null;
  } catch (err) {
    console.warn("Gagal memuat butiran pakej:", err);
    cfgPakejSemasa = null;
  }

  Object.keys(PAKEJ).forEach((id) => {
    const el = inputButiran(id);
    const eff = pakejEfektif(id, cfgPakejSemasa);
    if (el.nama) el.nama.value = eff.nama;
    if (el.unl) el.unl.checked = eff.hadGambar == null;
    if (el.had) el.had.value = eff.hadGambar == null ? "" : eff.hadGambar;
    if (el.tempoh) el.tempoh.value = eff.tempohHari;
    if (el.badge) el.badge.value = badgePakej(id, cfgPakejSemasa);
    Object.keys(LABEL_CIRI).forEach((k) => {
      const cek = el.ciri(k);
      if (cek) cek.checked = !!eff.ciri[k];
    });
    kemasHadButiran(id);
  });

  isiPilihanPakej(); // segarkan label penapis pakej ikut nama efektif
}

formButiran.addEventListener("submit", async (e) => {
  e.preventDefault();
  butiranRalat.classList.add("hidden");
  butiranJaya.classList.add("hidden");

  // Kumpul butiran berkesan setiap pakej.
  const pakej = {};
  for (const id of Object.keys(PAKEJ)) {
    const el = inputButiran(id);
    const nama = el.nama?.value.trim();
    if (!nama) {
      butiranRalat.textContent = `Sila isi nama untuk pakej ${PAKEJ[id].nama}.`;
      butiranRalat.classList.remove("hidden");
      return;
    }

    const tanpaHad = !!el.unl?.checked;
    let hadGambar = null;
    if (!tanpaHad) {
      hadGambar = bacaIntInput(el.had);
      if (hadGambar == null) {
        butiranRalat.textContent = `Isi had gambar (nombor positif) untuk pakej ${nama}, atau tanda "Tanpa had".`;
        butiranRalat.classList.remove("hidden");
        return;
      }
    }

    const tempohHari = bacaIntInput(el.tempoh);
    if (tempohHari == null) {
      butiranRalat.textContent = `Isi tempoh aktif (hari, nombor positif) untuk pakej ${nama}.`;
      butiranRalat.classList.remove("hidden");
      return;
    }

    const ciri = {};
    Object.keys(LABEL_CIRI).forEach((k) => {
      ciri[k] = !!el.ciri(k)?.checked;
    });

    const badgeVal = el.badge?.value;
    const badge = ["", "popular", "akanDatang"].includes(badgeVal) ? badgeVal : "";

    pakej[id] = { nama, hadGambar, tempohHari, ciri, badge };
  }

  butangSimpanButiran.disabled = true;
  const teksAsal = butangSimpanButiran.textContent;
  butangSimpanButiran.textContent = "Sedang menyimpan…";

  try {
    // Tulis PENUH (tanpa merge) supaya ciri yang dimatikan benar-benar off.
    const data = {
      pakej,
      dikemasOleh: auth.currentUser.uid,
      dikemasPada: serverTimestamp(),
    };
    await setDoc(doc(db, "settings", "pakej"), data);

    // Segarkan config dalam-ingatan + render semula senarai (nama pakej).
    cfgPakejSemasa = data;
    isiPilihanPakej(); // segarkan label penapis pakej
    paparSenarai();

    butiranJaya.textContent =
      "✓ Butiran pakej disimpan. Dipapar di halaman jualan & kad pelanggan; berkuat kuasa pada majlis baharu.";
    butiranJaya.classList.remove("hidden");
  } catch (err) {
    console.error("Ralat simpan butiran pakej:", err);
    butiranRalat.textContent = "Gagal menyimpan (semak sambungan / rules Firestore).";
    butiranRalat.classList.remove("hidden");
  } finally {
    butangSimpanButiran.disabled = false;
    butangSimpanButiran.textContent = teksAsal;
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
      petaTelefon = new Map(snap.docs.map((d) => [d.id, d.data().telefon || ""]));
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
//  Carian & pagination dibuat sisi-klien ke atas dataEvents yang
//  sudah dilanggan real-time (onSnapshot) — jadi kemas kini langsung
//  kekal berfungsi tanpa bacaan Firestore tambahan.

// Emel majlis (koleksi peribadi; fallback ke medan lama pada majlis sedia ada)
function emelEvent(ev) {
  return petaEmel.get(ev.id) || ev.ownerEmail || "";
}

// No. telefon majlis (koleksi peribadi — admin sahaja)
function telefonEvent(ev) {
  return petaTelefon.get(ev.id) || "";
}

// Tukar no. telefon Malaysia -> format wa.me antarabangsa (cth. "60123456789").
// Buang bukan-digit; "0xx" -> "60xx". Pulang "" jika tiada digit.
function keWaMe(tel) {
  let d = (tel || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("0")) d = "60" + d.slice(1);
  return d;
}

// Tapis ikut carian teks + penapis status + penapis jenis pakej (semua bergabung AND)
function tapisEvents() {
  return dataEvents.filter((ev) => {
    // Carian teks: padan pada nama pasangan / emel / telefon / slug
    if (istilahCari) {
      const teks = [ev.coupleName, emelEvent(ev), telefonEvent(ev), ev.slug]
        .filter(Boolean).join(" ").toLowerCase();
      if (!teks.includes(istilahCari)) return false;
    }
    // Status: 3 keadaan berasingan — luput diutamakan (padan lencana kad)
    if (statusPilih) {
      const luput = sudahLuput(ev.expiresAt);
      const keadaan = luput ? "luput" : (ev.status === "active" ? "active" : "inactive");
      if (keadaan !== statusPilih) return false;
    }
    // Jenis pakej: normalisasi ke "basic" bila hilang/tak sah (sama seperti binaBaris)
    if (pakejPilih) {
      const idPakej = PAKEJ[ev.package] ? ev.package : "basic";
      if (idPakej !== pakejPilih) return false;
    }
    return true;
  });
}

function paparSenarai() {
  zonMemuat.classList.add("hidden");
  senarai.innerHTML = "";

  // Stat dikira dari KESELURUHAN dataEvents — tidak terjejas carian/halaman
  let aktif = 0, premium = 0;
  dataEvents.forEach((ev) => {
    if (ev.status === "active") aktif++;
    if (ev.package === "premium") premium++;
  });
  statSemua.textContent = dataEvents.length;
  statAktif.textContent = aktif;
  statPremium.textContent = premium;

  const tertapis = tapisEvents();

  // Pagination: hadkan halaman semasa dalam julat sah, potong tetingkap halaman
  const jumlahHalaman = Math.max(1, Math.ceil(tertapis.length / SAIZ_HALAMAN));
  if (halamanSemasa > jumlahHalaman) halamanSemasa = jumlahHalaman;
  const mula = (halamanSemasa - 1) * SAIZ_HALAMAN;
  tertapis.slice(mula, mula + SAIZ_HALAMAN).forEach((ev) => {
    senarai.appendChild(binaBaris(ev.id, ev, emelEvent(ev)));
  });

  // Zon kosong (tiada majlis langsung) vs tiada hasil carian
  zonKosong.classList.toggle("hidden", dataEvents.length > 0);
  if (zonTiadaCarian) {
    zonTiadaCarian.classList.toggle(
      "hidden", !(dataEvents.length > 0 && tertapis.length === 0)
    );
  }
  binaPagination(jumlahHalaman);
  paparStoran();
}

// Hasilkan senarai nombor halaman (tetingkap: 1, semasa±1, akhir + elipsis)
function nomborHalaman(semasa, jumlah) {
  const set = new Set([1, jumlah, semasa, semasa - 1, semasa + 1]);
  const senaraiN = [...set].filter((n) => n >= 1 && n <= jumlah).sort((a, b) => a - b);
  const hasil = [];
  let prev = 0;
  senaraiN.forEach((n) => {
    if (n - prev > 1) hasil.push("…");
    hasil.push(n);
    prev = n;
  });
  return hasil;
}

// Bina kawalan pagination (Sebelum / nombor / Seterusnya)
function binaPagination(jumlahHalaman) {
  if (!zonPagination) return;
  zonPagination.innerHTML = "";
  // Sembunyi jika hanya satu halaman (atau kosong)
  if (jumlahHalaman <= 1) {
    zonPagination.classList.add("hidden");
    return;
  }
  zonPagination.classList.remove("hidden");

  const asasBtn =
    "min-w-[2.25rem] rounded-lg border border-[#e5d5ca] px-3 py-1.5 text-sm transition";
  const bolehKlik = "bg-white/70 text-[#8a7a70] hover:bg-white";
  const aktifKls = "bg-[#b76e79] border-[#b76e79] text-white font-medium";
  const matiKls = "opacity-40 cursor-not-allowed";

  const tambahBtn = (label, kePutus, { aktif = false, mati = false } = {}) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.className = `${asasBtn} ${aktif ? aktifKls : bolehKlik} ${mati ? matiKls : ""}`;
    if (mati || aktif) b.disabled = mati;
    if (!mati && kePutus != null) {
      b.addEventListener("click", () => pergiHalaman(kePutus));
    }
    zonPagination.appendChild(b);
  };

  tambahBtn("‹", halamanSemasa - 1, { mati: halamanSemasa <= 1 });
  nomborHalaman(halamanSemasa, jumlahHalaman).forEach((n) => {
    if (n === "…") {
      const s = document.createElement("span");
      s.textContent = "…";
      s.className = "px-1 text-[#a09088] select-none";
      zonPagination.appendChild(s);
    } else {
      tambahBtn(String(n), n, { aktif: n === halamanSemasa });
    }
  });
  tambahBtn("›", halamanSemasa + 1, { mati: halamanSemasa >= jumlahHalaman });
}

// Tukar halaman + render semula; skrol ke atas senarai untuk konteks
function pergiHalaman(n) {
  halamanSemasa = n;
  paparSenarai();
  senarai.scrollIntoView({ behavior: "smooth", block: "start" });
}

// Isi pilihan penapis pakej (label ikut nama pakej efektif — boleh di-override admin)
function isiPilihanPakej() {
  if (!filterPakej) return;
  filterPakej.innerHTML =
    `<option value="">Semua pakej</option>` +
    Object.keys(PAKEJ).map((k) =>
      `<option value="${k}" ${pakejPilih === k ? "selected" : ""}>${esc(pakejEfektif(k, cfgPakejSemasa).nama)}</option>`
    ).join("");
}
isiPilihanPakej();

// --- Carian: reset ke halaman pertama setiap kali istilah berubah ---
if (inputCari) {
  inputCari.addEventListener("input", () => {
    istilahCari = inputCari.value.trim().toLowerCase();
    halamanSemasa = 1;
    paparSenarai();
  });
}

// --- Penapis status & jenis pakej: reset ke halaman pertama ---
if (filterStatus) {
  filterStatus.addEventListener("change", () => {
    statusPilih = filterStatus.value;
    halamanSemasa = 1;
    paparSenarai();
  });
}
if (filterPakej) {
  filterPakej.addEventListener("change", () => {
    pakejPilih = filterPakej.value;
    halamanSemasa = 1;
    paparSenarai();
  });
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
//  URUS GAMBAR PELANGGAN (cari -> lihat -> ZIP -> padam)
// ------------------------------------------------------------
//  Super-admin pilih seorang pelanggan (ikut emel/telefon/nama/slug),
//  lihat SEMUA gambar (termasuk tersembunyi), muat turun ZIP, atau padam.
//  Guna semula dataEvents (real-time) + emelEvent/telefonEvent +
//  padamGambarMajlis + muatTurunZipMajlis — tiada bacaan tambahan.

let eventIdGambar = null; // majlis yang sedang dipapar dalam seksyen ini

function eventById(id) {
  return dataEvents.find((ev) => ev.id === id) || null;
}

// Status/progres untuk seksyen ini (elemen #g-status)
function gLapor(mesej) {
  if (!gStatus) return;
  gStatus.textContent = mesej;
  gStatus.classList.remove("hidden");
}

// --- Carian pelanggan (nama / emel / telefon / slug) ---
function cariPelanggan(terma) {
  const t = terma.trim().toLowerCase();
  if (!t) return [];
  return dataEvents.filter((ev) => {
    const teks = [ev.coupleName, emelEvent(ev), telefonEvent(ev), ev.slug]
      .filter(Boolean).join(" ").toLowerCase();
    return teks.includes(t);
  });
}

function paparSenaraiPelanggan(terma) {
  if (!gSenarai) return;
  gSenarai.innerHTML = "";
  const t = (terma || "").trim();
  if (!t) {
    gSenarai.innerHTML =
      `<p class="text-xs text-[#a09088]">Taip emel, no. telefon, nama pasangan, atau slug untuk mencari.</p>`;
    return;
  }
  const hasil = cariPelanggan(t);
  if (!hasil.length) {
    gSenarai.innerHTML =
      `<p class="text-xs text-[#a09088]">Tiada pelanggan padanan untuk "${esc(t)}".</p>`;
    return;
  }
  hasil.slice(0, 20).forEach((ev) => {
    const baris = document.createElement("div");
    baris.className =
      "flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#e5d5ca] bg-white/60 p-3";
    baris.innerHTML = `
      <div class="min-w-0 text-sm">
        <p class="font-medium truncate">${esc(ev.coupleName || "(tanpa nama)")}</p>
        <p class="text-xs text-[#a09088] truncate">${esc(emelEvent(ev) || "—")} · ${esc(telefonEvent(ev) || "tiada telefon")}</p>
        <p class="text-xs text-[#a09088]">${esc(ev.package || "—")} · ${ev.status === "active" ? "aktif" : "tidak aktif"} · ${ev.photoCount || 0} gambar</p>
      </div>
      <button type="button" data-act="pilih" data-id="${esc(ev.id)}"
        class="rounded-lg border border-[#d9a5ac] px-3 py-1.5 text-xs font-medium text-[#b76e79] hover:bg-white/60 transition shrink-0">
        Lihat gambar
      </button>`;
    gSenarai.appendChild(baris);
  });
  if (hasil.length > 20) {
    const nota = document.createElement("p");
    nota.className = "text-xs text-[#a09088]";
    nota.textContent = `Menunjukkan 20 daripada ${hasil.length} padanan — perhalusi carian.`;
    gSenarai.appendChild(nota);
  }
}

if (gCari) {
  gCari.addEventListener("input", () => paparSenaraiPelanggan(gCari.value));
}
if (gSenarai) {
  paparSenaraiPelanggan(""); // teks bantuan awal
  gSenarai.addEventListener("click", (e) => {
    const btn = e.target.closest('[data-act="pilih"]');
    if (btn) pilihPelanggan(btn.dataset.id);
  });
}

async function pilihPelanggan(id) {
  const ev = eventById(id);
  if (!ev) return;
  eventIdGambar = id;
  gPanel.classList.remove("hidden");
  gStatus.classList.add("hidden");
  gInfo.innerHTML = `
    <p class="font-medium">${esc(ev.coupleName || "(tanpa nama)")}</p>
    <p class="text-xs text-[#a09088]">${esc(emelEvent(ev) || "—")} · ${esc(telefonEvent(ev) || "tiada telefon")}</p>`;
  await muatGambarPelanggan(id);
}

async function muatGambarPelanggan(id) {
  gGrid.innerHTML = `<p class="col-span-full text-xs text-[#a09088]">Memuat gambar…</p>`;
  try {
    // Tanpa tapis approved — super-admin nampak SEMUA (sama seperti admin.js).
    const snap = await getDocs(
      query(
        collection(db, "photos"),
        where("eventId", "==", id),
        orderBy("created_at", "desc")
      )
    );
    if (snap.empty) {
      gGrid.innerHTML = `<p class="col-span-full text-xs text-[#a09088]">Tiada gambar untuk pelanggan ini.</p>`;
      return;
    }
    gGrid.innerHTML = "";
    snap.forEach((d) => gGrid.appendChild(binaKadGambar(d.id, d.data())));
  } catch (err) {
    console.error("Ralat memuat gambar:", err);
    const hint = String(err?.message || err).toLowerCase().includes("index")
      ? " (indeks Firestore mungkin diperlukan — semak konsol untuk pautan)"
      : "";
    gGrid.innerHTML = `<p class="col-span-full text-xs text-red-600">✗ Gagal memuat gambar.${hint}</p>`;
  }
}

function binaKadGambar(fotoId, p) {
  const url = p.image_url || p.thumb_url || "";
  const kad = document.createElement("div");
  kad.className =
    "relative rounded-xl overflow-hidden border border-[#e5d5ca] bg-white/60";
  kad.dataset.foto = fotoId;

  const img = document.createElement("img");
  img.src = url;
  img.alt = p.name || "Gambar tetamu";
  img.loading = "lazy";
  img.className = "w-full aspect-square object-cover";
  kad.appendChild(img);

  if (p.approved === false) {
    const badge = document.createElement("span");
    badge.className =
      "absolute top-1 left-1 rounded bg-amber-500/90 text-white text-[10px] px-1.5 py-0.5";
    badge.textContent = "Tersembunyi";
    kad.appendChild(badge);
  }

  const nama = document.createElement("p");
  nama.className = "px-2 py-1 text-[11px] text-[#6a5a52] truncate";
  nama.textContent = p.name || "Tetamu"; // textContent — elak XSS
  kad.appendChild(nama);

  const btn = document.createElement("button");
  btn.type = "button";
  btn.dataset.act = "padam-satu";
  btn.dataset.foto = fotoId;
  btn.title = "Padam gambar ini";
  btn.className =
    "absolute top-1 right-1 rounded-full bg-white/90 border border-red-300 text-red-600 w-6 h-6 text-xs leading-none hover:bg-red-50 transition";
  btn.textContent = "✕";
  kad.appendChild(btn);

  return kad;
}

// Delegasi: padam satu gambar
if (gGrid) {
  gGrid.addEventListener("click", async (e) => {
    const btn = e.target.closest('[data-act="padam-satu"]');
    if (!btn || !eventIdGambar) return;
    const fotoId = btn.dataset.foto;
    if (!confirm("Padam gambar ini? Tidak boleh dipulihkan.")) return;
    btn.disabled = true;
    try {
      await deleteDoc(doc(db, "photos", fotoId));
      // Susutkan kaunter kuota — pemilik tak boleh betulkannya sendiri
      await updateDoc(doc(db, "events", eventIdGambar), {
        photoCount: increment(-1),
      });
      gGrid.querySelector(`[data-foto="${CSS.escape(fotoId)}"]`)?.remove();
      storanTepatBait = null; // angka storan lama tidak lagi sah
      if (!gGrid.children.length) {
        gGrid.innerHTML = `<p class="col-span-full text-xs text-[#a09088]">Tiada gambar untuk pelanggan ini.</p>`;
      }
    } catch (err) {
      console.error("Ralat padam gambar:", err);
      alert("Gagal memadam gambar. Semak konsol pelayar & sambungan.");
      btn.disabled = false;
    }
  });
}

// Muat turun SEMUA gambar (termasuk tersembunyi) sebagai ZIP
if (gZip) {
  gZip.addEventListener("click", async () => {
    if (!eventIdGambar) return;
    const ev = eventById(eventIdGambar);
    gZip.disabled = true;
    const teksAsal = gZip.textContent;
    gZip.textContent = "Menyediakan…";
    try {
      const hasil = await muatTurunZipMajlis(eventIdGambar, {
        slug: ev?.slug || ev?.coupleName || eventIdGambar,
        termasukSemua: true,
        onStatus: (m) => gLapor(m),
        onProgres: (pct) => gLapor(`Memampatkan… ${Math.round(pct)}%`),
        onSandaran: ({ url, nama }) => {
          // Pautan sandaran jika pelayar menyekat muat turun automatik
          gStatus.insertAdjacentHTML(
            "beforeend",
            ` <a href="${url}" download="${esc(nama)}" class="underline text-[#b76e79]">Klik di sini jika muat turun tak bermula.</a>`
          );
        },
      });
      if (hasil.jumlah === 0) gLapor("Tiada gambar untuk dimuat turun.");
    } catch (err) {
      console.error("Ralat muat turun ZIP:", err);
      gLapor("✗ " + mesejRalatMuatTurun(err));
    } finally {
      gZip.disabled = false;
      gZip.textContent = teksAsal;
    }
  });
}

// Padam SEMUA gambar pelanggan (guna semula padamGambarMajlis)
if (gPadamSemua) {
  gPadamSemua.addEventListener("click", async () => {
    if (!eventIdGambar) return;
    const ev = eventById(eventIdGambar);
    const nama = ev?.coupleName || eventIdGambar;
    if (!confirm(`Padam SEMUA gambar pelanggan "${nama}"?\n\nTidak boleh dipulihkan.`)) return;
    gPadamSemua.disabled = true;
    const teksAsal = gPadamSemua.textContent;
    gPadamSemua.textContent = "Memadam…";
    try {
      gLapor("Memadam semua gambar…");
      const bil = await padamGambarMajlis(eventIdGambar);
      gGrid.innerHTML = `<p class="col-span-full text-xs text-[#a09088]">Tiada gambar untuk pelanggan ini.</p>`;
      gLapor(`✓ ${bil} gambar dipadam.`);
      storanTepatBait = null; // angka storan lama tidak lagi sah
    } catch (err) {
      console.error("Ralat padam semua:", err);
      gLapor("✗ Gagal memadam. Semak konsol pelayar & sambungan.");
    } finally {
      gPadamSemua.disabled = false;
      gPadamSemua.textContent = teksAsal;
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
    `<span class="rounded-full ${gayaPakej[idPakej] || gayaPakej.basic} text-xs px-2 py-0.5">${esc(pakejEfektif(idPakej, cfgPakejSemasa).nama)}</span>`;

  const hadTeks = ev.photoLimit >= HAD_TANPA_HAD ? "∞" : ev.photoLimit;
  const slugTeks = ev.slug
    ? `<a href="e.html?e=${encodeURIComponent(ev.slug)}" target="_blank" class="text-[#b76e79] hover:underline">/e/${esc(ev.slug)}</a>`
    : `<span class="text-[#a09088] italic">belum ditetapkan</span>`;

  // Baris telefon: pautan wa.me bila boleh dinormalkan, jika tidak teks biasa
  const telefon = telefonEvent(ev);
  const wa = keWaMe(telefon);
  const telefonHtml = telefon
    ? (wa
        ? `<a href="https://wa.me/${wa}" target="_blank" rel="noopener" class="text-[#b76e79] hover:underline">📱 ${esc(telefon)}</a>`
        : `<span>📱 ${esc(telefon)}</span>`)
    : "";

  kad.innerHTML = `
    <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
      <div class="min-w-0">
        <p class="font-medium text-[#5a4a42] truncate">${esc(ev.coupleName) || "(tiada nama)"}</p>
        <p class="text-xs text-[#a09088] truncate">${esc(emel)}</p>
        ${telefonHtml ? `<p class="text-xs text-[#a09088] truncate">${telefonHtml}</p>` : ""}
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
          `<option value="${k}" ${idPakej === k ? "selected" : ""}>${esc(pakejEfektif(k, cfgPakejSemasa).nama)}</option>`
        ).join("")}
      </select>

      <label class="flex items-center gap-1 text-sm text-[#8a7a70]">
        Tamat:
        <input data-act="tarikh" type="date" value="${keNilaiInputTarikh(ev.expiresAt)}"
          class="rounded-lg border border-[#e5d5ca] bg-white px-2 py-1 text-sm" />
      </label>

      ${emel
        ? `<button data-act="reset-kl" class="rounded-lg px-3 py-1.5 text-sm font-medium bg-blue-50 text-blue-700 hover:bg-blue-100">Reset kata laluan</button>`
        : `<button disabled title="Tiada emel pelanggan" class="rounded-lg px-3 py-1.5 text-sm font-medium bg-gray-50 text-gray-400 cursor-not-allowed">Reset kata laluan</button>`
      }

      <button data-act="padam" class="ml-auto rounded-lg px-3 py-1.5 text-sm font-medium bg-red-50 text-red-600 hover:bg-red-100">Padam</button>
    </div>
  `;

  // --- Reset kata laluan pelanggan (hantar emel reset Firebase) ---
  //     Zero-backend: admin tidak menetapkan kata laluan; pelanggan
  //     tetapkan sendiri melalui pautan dalam emel. Tidak mengganggu
  //     sesi log masuk admin.
  kad.querySelector('[data-act="reset-kl"]')?.addEventListener("click", async (e) => {
    if (!confirm(`Hantar emel reset kata laluan ke "${emel}"?`)) return;
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      await sendPasswordResetEmail(auth, emel);
      alert(`Emel reset kata laluan dihantar ke ${emel}.`);
    } catch (err) {
      console.error(err);
      alert("Gagal menghantar emel reset. Pastikan emel pelanggan sah.");
      btn.disabled = false;
    }
  });

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
    if (!PAKEJ[pakejBaru]) return;
    // Guna butiran BERKESAN (override super-admin) — had & ciri.
    const eff = pakejEfektif(pakejBaru, cfgPakejSemasa);
    const hadBaru = hadGambarDBEfektif(pakejBaru, cfgPakejSemasa);
    if (!confirm(`Tukar pakej kepada ${eff.nama}? Had gambar akan jadi ${eff.hadGambar == null ? "tanpa had" : eff.hadGambar}. (Tarikh tamat tidak berubah.)`)) {
      e.currentTarget.value = idPakej; // pulih pilihan
      return;
    }
    try {
      await updateDoc(doc(db, "events", id), {
        package: pakejBaru,
        photoLimit: hadBaru,
        ciri: ciriEfektif(pakejBaru, cfgPakejSemasa), // re-snapshot keupayaan
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
