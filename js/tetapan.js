// ============================================================
//  LOGIK TETAPAN MAJLIS (untuk PELANGGAN)
// ------------------------------------------------------------
//  - Log masuk pelanggan (Firebase Auth).
//  - Muat majlis (events) milik pengguna (ownerUid == uid).
//  - Pilih URL unik (slug) dengan semakan langsung ✓/✗.
//  - Isi nama pasangan, tarikh, tema warna, mesej aluan.
//  - Simpan (batch: cipta slugs/{slug} + kemas kini events).
//  - Jana kod QR ke halaman landing majlis.
//
//  KESELAMATAN: pelanggan hanya boleh ubah medan customize event
//  MILIK SENDIRI (dikuatkuasa Firestore rules — lihat firestore.rules).
// ============================================================

import {
  auth,
  db,
  configSiap,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  collection,
  query,
  where,
  limit,
  getDocs,
  getDoc,
  doc,
  updateDoc,
  writeBatch,
} from "./firebase.js";
import { bolehMuatTurun, formatTarikhMajlis } from "./majlis.js";
import { muatTurunZipMajlis, mesejRalatMuatTurun } from "./muat-turun.js";

const HAD_TANPA_HAD = 100000; // selaras dengan super-admin.js

// Warna tema pratetap
const TEMA_PILIHAN = [
  { nama: "Rose Gold", warna: "#b76e79" },
  { nama: "Sage",      warna: "#7c9070" },
  { nama: "Biru Debu", warna: "#6b8cae" },
  { nama: "Lavender",  warna: "#9d8ec2" },
  { nama: "Emas",      warna: "#c9a24b" },
  { nama: "Terracotta",warna: "#c47a5a" },
];

// --- DOM: log masuk ---
const zonLogin = document.getElementById("zon-login");
const formLogin = document.getElementById("form-login");
const inputEmel = document.getElementById("input-emel");
const inputKataLaluan = document.getElementById("input-kata-laluan");
const ralatLogin = document.getElementById("ralat-login");
const butangLogin = document.getElementById("butang-login");

// --- DOM: panel ---
const zonPanel = document.getElementById("zon-panel");
const emelPelanggan = document.getElementById("emel-pelanggan");
const butangKeluar = document.getElementById("butang-keluar");
const zonTiadaMajlis = document.getElementById("zon-tiada-majlis");
const zonMajlis = document.getElementById("zon-majlis");

const infoPakej = document.getElementById("info-pakej");
const infoStatus = document.getElementById("info-status");
const infoTamat = document.getElementById("info-tamat");
const amaranMajlis = document.getElementById("amaran-majlis");

// --- DOM: borang customize ---
const formTetapan = document.getElementById("form-tetapan");
const cSlug = document.getElementById("c-slug");
const slugStatus = document.getElementById("slug-status");
const cNama = document.getElementById("c-nama");
const cTarikh = document.getElementById("c-tarikh");
const cTema = document.getElementById("c-tema");
const swatches = document.getElementById("swatches");
const cWelcome = document.getElementById("c-welcome");
const simpanRalat = document.getElementById("simpan-ralat");
const simpanJaya = document.getElementById("simpan-jaya");
const butangSimpan = document.getElementById("butang-simpan");

// --- DOM: muat turun ZIP ---
const butangMuatTurun = document.getElementById("butang-muat-turun");
const mtKunci = document.getElementById("mt-kunci");
const mtStatus = document.getElementById("mt-status");
const mtBarLuar = document.getElementById("mt-bar-luar");
const mtBarDalam = document.getElementById("mt-bar-dalam");
const mtSandaran = document.getElementById("mt-sandaran");
const mtPautan = document.getElementById("mt-pautan");

// --- DOM: pautan & QR ---
const linkGaleri = document.getElementById("link-galeri");
const linkModerasi = document.getElementById("link-moderasi");
const zonQr = document.getElementById("zon-qr");
const qrcodeEl = document.getElementById("qrcode");
const qrUrl = document.getElementById("qr-url");
const butangCetak = document.getElementById("butang-cetak");

// --- DOM: kad cetak (tersembunyi di skrin, muncul semasa @media print) ---
const cetakNama = document.getElementById("cetak-nama");
const cetakTarikh = document.getElementById("cetak-tarikh");
const cetakGaris = document.getElementById("cetak-garis");
const cetakTagline = document.getElementById("cetak-tagline");
const cetakUrl = document.getElementById("cetak-url");
const cetakQrEl = document.getElementById("cetak-qrcode");

let eventId = null;   // id majlis pengguna
let eventData = null; // data majlis semasa
let slugSah = false;  // adakah slug semasa dalam input sah & tersedia

// ------------------------------------------------------------
//  UTILITI
// ------------------------------------------------------------
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
// Pembersih semasa MENAIP: huruf kecil, nombor, tanda '-'.
// PENTING: '-' di HUJUNG dikekalkan supaya pengguna boleh taip "ali-"
// sebelum menyambung "siti". (Kalau dibuang, sempang mustahil ditaip.)
function bersihkanSlugMenaip(teks) {
  return (teks || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "") // buang aksara tak sah
    .replace(/\s+/g, "-")          // ruang -> '-'
    .replace(/-+/g, "-")           // '--' -> '-'
    .replace(/^-/, "");            // buang '-' di HADAPAN sahaja
}

// Slug MUKTAMAD (untuk semakan ketersediaan & simpan):
// buang juga '-' yang tergantung di hujung.
function bersihkanSlug(teks) {
  return bersihkanSlugMenaip(teks).replace(/-+$/, "");
}
function mesejRalatAuth(kod = "") {
  if (kod.includes("invalid-credential") || kod.includes("wrong-password") || kod.includes("user-not-found"))
    return "Emel atau kata laluan salah.";
  if (kod.includes("invalid-email")) return "Format emel tidak sah.";
  if (kod.includes("too-many-requests")) return "Terlalu banyak cubaan. Sila tunggu sebentar.";
  if (kod.includes("network")) return "Tiada sambungan internet.";
  if (kod.includes("operation-not-allowed")) return "Email/Password belum diaktifkan dalam Firebase Console.";
  return "Log masuk gagal. Sila cuba lagi.";
}

// ------------------------------------------------------------
//  LOG MASUK
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
  } catch (err) {
    console.error(err);
    ralatLogin.textContent = mesejRalatAuth(err.code);
    ralatLogin.classList.remove("hidden");
    inputKataLaluan.value = "";
  } finally {
    butangLogin.disabled = false;
    butangLogin.textContent = teksAsal;
  }
});

butangKeluar.addEventListener("click", async () => {
  await signOut(auth);
});

// ------------------------------------------------------------
//  PANTAU LOG MASUK -> muat majlis
// ------------------------------------------------------------
onAuthStateChanged(auth, async (user) => {
  if (user) {
    zonLogin.classList.add("hidden");
    zonPanel.classList.remove("hidden");
    emelPelanggan.textContent = user.email || "";
    await muatMajlis(user.uid);
  } else {
    zonPanel.classList.add("hidden");
    zonLogin.classList.remove("hidden");
    zonMajlis.classList.add("hidden");
    zonTiadaMajlis.classList.add("hidden");
    eventId = null; eventData = null;
    // Kunci semula butang muat turun supaya keadaan pengguna sebelum
    // ini tidak tertinggal untuk pengguna seterusnya.
    kemasKiniGateMuatTurun();
  }
});

// ------------------------------------------------------------
//  MUAT MAJLIS MILIK PENGGUNA
// ------------------------------------------------------------
async function muatMajlis(uid) {
  try {
    // where(ownerUid == uid) — rules benarkan pemilik baca event sendiri.
    const q = query(collection(db, "events"), where("ownerUid", "==", uid), limit(1));
    const snap = await getDocs(q);
    if (snap.empty) {
      zonMajlis.classList.add("hidden");
      zonTiadaMajlis.classList.remove("hidden");
      return;
    }
    const d = snap.docs[0];
    eventId = d.id;
    eventData = d.data();
    zonTiadaMajlis.classList.add("hidden");
    zonMajlis.classList.remove("hidden");
    isiBorang();
  } catch (err) {
    console.error("Ralat muat majlis:", err);
    zonMajlis.classList.add("hidden");
    zonTiadaMajlis.classList.remove("hidden");
    zonTiadaMajlis.querySelector("p").textContent =
      "Gagal memuat majlis. Semak sambungan / rules Firestore.";
  }
}

// ------------------------------------------------------------
//  ISI BORANG dari data sedia ada
// ------------------------------------------------------------
function isiBorang() {
  // Info pakej
  infoPakej.textContent = eventData.package === "premium" ? "Premium" : "Basic";
  const luput = keDate(eventData.expiresAt) && keDate(eventData.expiresAt).getTime() < Date.now();
  infoStatus.textContent = luput ? "Tamat tempoh" : (eventData.status === "active" ? "Aktif" : "Nyahaktif");
  infoTamat.textContent = formatTarikh(eventData.expiresAt);

  // Amaran jika tidak aktif / luput
  if (luput || eventData.status !== "active") {
    amaranMajlis.textContent = luput
      ? "Majlis anda telah tamat tempoh. Tetamu tidak boleh muat naik gambar. Hubungi admin untuk lanjutkan."
      : "Majlis anda belum diaktifkan. Hubungi admin.";
    amaranMajlis.classList.remove("hidden");
  } else {
    amaranMajlis.classList.add("hidden");
  }

  // Medan customize
  cSlug.value = eventData.slug || "";
  cNama.value = eventData.coupleName || "";
  cTarikh.value = eventData.weddingDate || "";
  cTema.value = eventData.themeColor || "#b76e79";
  cWelcome.value = eventData.welcomeMessage || "";
  tandaSwatchTerpilih(cTema.value);

  // Jika slug sedia ada, anggap sah
  slugSah = !!eventData.slug;
  if (eventData.slug) {
    slugStatus.textContent = "✓ URL semasa anda";
    slugStatus.className = "mt-1 text-xs h-4 text-green-600";
  } else {
    slugStatus.textContent = "";
  }

  // Pautan pantas
  linkGaleri.href = `gallery.html?e=${encodeURIComponent(eventId)}`;
  linkModerasi.href = `admin.html?e=${encodeURIComponent(eventId)}`;

  // Gate muat turun ZIP
  kemasKiniGateMuatTurun();

  // QR
  kemasKiniQr();
}

// ------------------------------------------------------------
//  MUAT TURUN ZIP — gate kelayakan
// ------------------------------------------------------------
//  Pemilikan sebenar sudah dijamin: muatMajlis() hanya memuatkan
//  majlis dengan ownerUid == uid, dan Firestore rules menguatkuasa
//  perkara sama di server. Di sini kita semak syarat PRODUK sahaja
//  (pakej Premium, langganan aktif, tempoh tangguh).
// ------------------------------------------------------------
function kemasKiniGateMuatTurun() {
  if (!butangMuatTurun) return;
  const { boleh, sebab } = bolehMuatTurun(eventData);

  butangMuatTurun.disabled = !boleh;
  mtKunci.classList.toggle("hidden", boleh);
  if (!boleh) mtKunci.textContent = sebab;
}

function mtTunjukStatus(mesej, jenis = "info") {
  if (!mtStatus) return;
  mtStatus.textContent = mesej;
  mtStatus.className = "kotak-status mt-3 kotak-status--" + jenis;
  mtStatus.classList.remove("hidden");
}
function mtTunjukProgres(peratus) {
  mtBarLuar.classList.remove("hidden");
  mtBarDalam.style.width = `${Math.round(peratus)}%`;
}
function mtSorokProgres() {
  mtBarLuar.classList.add("hidden");
  mtBarDalam.style.width = "0%";
}

// Papar pautan sandaran (kalau pelayar sekat muat turun automatik)
function mtTunjukSandaran({ url, nama, saiz }) {
  if (!mtSandaran || !mtPautan) return;
  mtPautan.href = url;
  mtPautan.setAttribute("download", nama);
  mtPautan.textContent = `⬇️ Simpan ${nama} (${(saiz / 1048576).toFixed(1)} MB)`;
  mtSandaran.classList.remove("hidden");
}
function mtSorokSandaran() {
  if (mtSandaran) mtSandaran.classList.add("hidden");
}

if (butangMuatTurun) {
  butangMuatTurun.addEventListener("click", async () => {
    mtStatus.classList.add("hidden");
    mtSorokProgres();
    mtSorokSandaran();

    if (!eventId) return;
    // Semak semula sebelum mula (elak keadaan basi selepas tab lama dibuka)
    const { boleh, sebab } = bolehMuatTurun(eventData);
    if (!boleh) {
      kemasKiniGateMuatTurun();
      mtTunjukStatus(sebab, "gagal");
      return;
    }

    butangMuatTurun.disabled = true;
    const teksAsal = butangMuatTurun.textContent;
    butangMuatTurun.textContent = "Sedang memproses…";

    try {
      await muatTurunZipMajlis(eventId, {
        slug: eventData?.slug || "",
        onStatus: mtTunjukStatus,
        onProgres: mtTunjukProgres,
        onSandaran: mtTunjukSandaran,
      });
      mtSorokProgres();
    } catch (err) {
      console.error("Ralat muat turun:", err);
      mtSorokProgres();
      mtTunjukStatus(mesejRalatMuatTurun(err), "gagal");
    } finally {
      butangMuatTurun.textContent = teksAsal;
      kemasKiniGateMuatTurun(); // pulihkan keadaan butang ikut kelayakan
    }
  });
}

// ------------------------------------------------------------
//  SWATCH tema
// ------------------------------------------------------------
TEMA_PILIHAN.forEach((t) => {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "swatch";
  b.style.background = t.warna;
  b.title = t.nama;
  b.dataset.warna = t.warna;
  b.addEventListener("click", () => {
    cTema.value = t.warna;
    tandaSwatchTerpilih(t.warna);
  });
  swatches.appendChild(b);
});
function tandaSwatchTerpilih(warna) {
  swatches.querySelectorAll(".swatch").forEach((s) => {
    s.classList.toggle("terpilih", s.dataset.warna?.toLowerCase() === warna?.toLowerCase());
  });
}
cTema.addEventListener("input", () => tandaSwatchTerpilih(cTema.value));

// ------------------------------------------------------------
//  SEMAKAN SLUG LANGSUNG (debounce)
// ------------------------------------------------------------
let pemasaSlug = null;
cSlug.addEventListener("input", () => {
  // Paksa format bersih semasa menaip (kekalkan '-' di hujung)
  const dipapar = bersihkanSlugMenaip(cSlug.value);
  if (dipapar !== cSlug.value) cSlug.value = dipapar;

  // Slug muktamad yang akan disemak & disimpan
  const bersih = bersihkanSlug(dipapar);

  slugSah = false;
  slugStatus.textContent = "menyemak…";
  slugStatus.className = "mt-1 text-xs h-4 text-[#a09088]";

  clearTimeout(pemasaSlug);
  if (!bersih) {
    slugStatus.textContent = "";
    return;
  }
  if (bersih.length < 3) {
    slugStatus.textContent = "✗ terlalu pendek (min. 3 aksara)";
    slugStatus.className = "mt-1 text-xs h-4 text-red-500";
    return;
  }
  pemasaSlug = setTimeout(() => semakSlug(bersih), 400);
});

async function semakSlug(slug) {
  // Jika sama dengan slug semasa majlis ini -> ok
  if (slug === (eventData?.slug || "")) {
    slugSah = true;
    slugStatus.textContent = "✓ URL semasa anda";
    slugStatus.className = "mt-1 text-xs h-4 text-green-600";
    return;
  }
  try {
    const snap = await getDoc(doc(db, "slugs", slug));
    if (snap.exists()) {
      slugSah = false;
      slugStatus.textContent = "✗ sudah diambil — cuba yang lain";
      slugStatus.className = "mt-1 text-xs h-4 text-red-500";
    } else {
      slugSah = true;
      slugStatus.textContent = "✓ tersedia";
      slugStatus.className = "mt-1 text-xs h-4 text-green-600";
    }
  } catch (err) {
    console.error(err);
    slugSah = false;
    slugStatus.textContent = "Gagal menyemak. Cuba lagi.";
    slugStatus.className = "mt-1 text-xs h-4 text-red-500";
  }
}

// ------------------------------------------------------------
//  SIMPAN TETAPAN
// ------------------------------------------------------------
formTetapan.addEventListener("submit", async (e) => {
  e.preventDefault();
  simpanRalat.classList.add("hidden");
  simpanJaya.classList.add("hidden");

  if (!eventId) return;

  const slugBaru = bersihkanSlug(cSlug.value);
  if (!slugBaru || slugBaru.length < 3) {
    simpanRalat.textContent = "Sila pilih URL yang sah (min. 3 aksara).";
    simpanRalat.classList.remove("hidden");
    return;
  }
  if (!slugSah) {
    simpanRalat.textContent = "URL belum disahkan tersedia. Sila semak semula.";
    simpanRalat.classList.remove("hidden");
    return;
  }

  const medan = {
    coupleName: cNama.value.trim(),
    weddingDate: cTarikh.value || "",
    themeColor: cTema.value || "#b76e79",
    welcomeMessage: cWelcome.value.trim(),
  };

  butangSimpan.disabled = true;
  const teksAsal = butangSimpan.textContent;
  butangSimpan.textContent = "Menyimpan…";

  try {
    const slugLama = eventData.slug || "";
    if (slugBaru !== slugLama) {
      // Semak sekali lagi supaya tiada perlumbaan (race)
      const semak = await getDoc(doc(db, "slugs", slugBaru));
      if (semak.exists()) {
        throw new Error("SLUG_DIAMBIL");
      }
      // Batch: cipta slug baharu + kemas kini event (atomik)
      const batch = writeBatch(db);
      batch.set(doc(db, "slugs", slugBaru), { eventId });
      batch.update(doc(db, "events", eventId), { ...medan, slug: slugBaru });
      await batch.commit();
      // Nota: slug lama (jika ada) dibiarkan — hanya admin boleh padam.
    } else {
      // Slug tak berubah — kemas kini medan lain sahaja
      await updateDoc(doc(db, "events", eventId), medan);
    }

    // Kemas kini cache tempatan
    eventData = { ...eventData, ...medan, slug: slugBaru };
    simpanJaya.textContent = "✓ Tetapan disimpan!";
    simpanJaya.classList.remove("hidden");
    kemasKiniQr();
  } catch (err) {
    console.error("Ralat simpan:", err);
    simpanRalat.textContent = err.message === "SLUG_DIAMBIL"
      ? "Maaf, URL itu baru sahaja diambil orang lain. Cuba yang lain."
      : "Gagal menyimpan. Semak sambungan / status majlis anda.";
    simpanRalat.classList.remove("hidden");
  } finally {
    butangSimpan.disabled = false;
    butangSimpan.textContent = teksAsal;
  }
});

// ------------------------------------------------------------
//  QR ke halaman landing majlis
// ------------------------------------------------------------
let qr = null;
function kemasKiniQr() {
  if (!eventData?.slug) {
    zonQr.classList.add("hidden");
    return;
  }
  // URL landing awam: e.html?e=<slug> di lokasi hos semasa
  const urlLanding = new URL(`e.html?e=${encodeURIComponent(eventData.slug)}`, window.location.href).href;
  zonQr.classList.remove("hidden");
  qrUrl.textContent = urlLanding;
  qrcodeEl.innerHTML = "";
  qr = new QRCode(qrcodeEl, {
    text: urlLanding,
    width: 220,
    height: 220,
    colorDark: "#5a4a42",
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.M,
  });

  isiKadCetak(urlLanding);
}

// ------------------------------------------------------------
//  KAD CETAK — nama pasangan + tarikh + QR besar + URL
// ------------------------------------------------------------
//  Kad ini sentiasa berada dalam DOM tetapi `display:none` di skrin;
//  hanya @media print yang memaparkannya (lihat tetapan.html).
//  QRCode.js menetapkan saiz canvas secara eksplisit, jadi QR tetap
//  dilukis walaupun bekasnya tersembunyi — tiada perlu jana semasa klik.
// ------------------------------------------------------------
function isiKadCetak(urlLanding) {
  cetakNama.textContent = eventData.coupleName || "Majlis Kami";

  const tarikh = formatTarikhMajlis(eventData.weddingDate || "");
  cetakTarikh.textContent = tarikh;
  cetakTarikh.classList.toggle("hidden", !tarikh);

  cetakUrl.textContent = urlLanding;

  // Aksen kad ikut tema warna majlis
  const tema = eventData.themeColor || "#b76e79";
  cetakNama.style.color = tema;
  cetakGaris.style.background = tema;
  cetakTagline.style.color = tema;

  // QR kedua — lebih besar untuk cetakan (QR panel kekal 220px).
  // 380px, bukan lebih: padding 16mm kad cetak memakan ruang menegak,
  // jadi ini jidar supaya kad tidak melimpah ke muka surat kedua.
  cetakQrEl.innerHTML = "";
  new QRCode(cetakQrEl, {
    text: urlLanding,
    width: 380,
    height: 380,
    colorDark: "#3f3630",
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.M,
  });
}

butangCetak.addEventListener("click", () => {
  if (!eventData?.slug) return; // tiada slug -> kad kosong; #zon-qr pun tersembunyi
  window.print();
});
