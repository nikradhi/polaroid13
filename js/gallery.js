// ============================================================
//  LOGIK HALAMAN GALERI
// ------------------------------------------------------------
//  - Ambil gambar dari Firestore (approved=true) — image_url base64
//  - Susun terbaru dahulu; pagination "Muat lebih"
//  - LIGHTBOX: klik polaroid -> papar gambar besar + navigasi
//  - REAKSI ❤️: tetamu "suka" gambar (kira likes), dedupe localStorage
//  - CARIAN: tapis polaroid dimuat ikut nama
// ============================================================

import {
  db,
  configSiap,
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  doc,
  updateDoc,
  increment,
} from "./firebase.js";
import { dapatEventId, muatEvent, terapTema } from "./majlis.js";
import {
  cetusMuatTurun,
  namaBersih,
  sambunganDari,
} from "./muat-turun.js";
import { pasangBorangUpload } from "./upload.js";
import { pasangPhotobooth } from "./photobooth.js";
import { pasangGuestbook, muatUcapan, binaKadUcapan } from "./guestbook.js";
import { bolehGuna } from "./gating.js";
import { adalahJalur } from "./imej.js";

const SAIZ_HALAMAN = 12;

// Bila tab aktif tiada hasil, muat halaman tambahan secara automatik.
// Pagination berkongsi SATU kursor untuk kedua-dua jenis, jadi tab
// Photobooth boleh kelihatan kosong semata-mata kerana 12 foto terbaru
// kebetulan gambar biasa. Dihadkan kepada 3 halaman (48 foto): setiap
// foto ~78 KiB base64, jadi memuat seluruh majlis secara senyap ialah
// egress sebenar, bukan sekadar kelambatan.
const HALAMAN_AUTO_MAKS = 3;

// --- Majlis semasa (multi-tenancy) ---
const eventId = dapatEventId();

const zonGaleri = document.getElementById("zon-galeri");
const zonKosong = document.getElementById("zon-kosong");
const zonMemuat = document.getElementById("zon-memuat");
const butangMuatLebih = document.getElementById("butang-muat-lebih");
const kotakRalat = document.getElementById("kotak-ralat");
const inputCari = document.getElementById("input-cari");
const zonTab = document.getElementById("zon-tab");
// Carian disorok di belakang ikon dalam bar melekat supaya bar kekal ramping.
const zonCari = document.getElementById("zon-cari");
const butangCariTogol = document.getElementById("butang-cari-togol");
const zonTiadaHasil = document.getElementById("zon-tiada-carian");

// Pil "Tambah" — SATU butang untuk kedua-dua jenis; ia menyasar jenis tab
// yang sedang aktif (lihat kemasButangTambah).
const butangTambah = document.getElementById("butang-tambah");

// Modal muat naik
const modalUpload = document.getElementById("modal-upload");
const butangKosongUpload = document.getElementById("butang-kosong-upload");

// Modal photobooth (Premium+)
const modalPhotobooth = document.getElementById("modal-photobooth");

// Buku tetamu / ucapan (Premium+)
const modalGuestbook = document.getElementById("modal-guestbook");
const zonUcapan = document.getElementById("zon-ucapan");
const zonUcapanKosong = document.getElementById("zon-ucapan-kosong");

// Lightbox
const lightbox = document.getElementById("lightbox");
const lbImg = document.getElementById("lb-img");
const lbNama = document.getElementById("lb-nama");
const lbUcapan = document.getElementById("lb-ucapan");

let dokTerakhir = null;
let masihAda = true;
let sedangMemuat = false;

// Simpanan foto dimuat (untuk lightbox & reaksi)
const fotoDimuat = []; // {id, name, message, img, likes, jenis, el, kiraEl, butangHati}
let lbIndeks = -1;

// Tab aktif: "gambar" (muat naik biasa), "jalur" (photobooth) atau
// "ucapan" (buku tetamu). Tiada nilai "semua" — tab sengaja BERASINGAN,
// tidak pernah bercampur.
let tabAktif = "gambar";

// Apa yang tetamu ini BOLEH buat — menentukan label & keterlihatan pil
// Tambah. Kedua-dua jenis berkongsi semakKelayakanMajlis(), jadi kombinasi
// yang mungkin cuma: dua-dua, gambar sahaja, atau tiada langsung.
let bolehTambahGambar = false;
let bolehTambahJalur = false;
let bolehTulisUcapan = false;
// Pakej menyokong photobooth? BUKAN sama dengan bolehTambahJalur — yang itu
// turut menuntut kamera. Tetamu desktop tanpa kamera masih patut boleh
// MELIHAT tab jalur.
let cirianJalur = false;
// Pakej menyokong buku tetamu? (Premium & Eksklusif)
let cirianUcapan = false;

// Ucapan buku tetamu. Koleksi BERASINGAN daripada `photos`, jadi ia
// disimpan berasingan daripada fotoDimuat juga — memasukkannya ke sana
// akan menariknya masuk ke lightbox, probe nisbah aspek, ♥ dan SIMPAN,
// yang semuanya tidak bermakna untuk teks.
const ucapanDimuat = []; // {id, name, message, cari, el}
let ucapanSudahMuat = false;
let semulaBorangUcapan = null;
// Teks ralat muatan ucapan (cth indeks belum dicipta), atau "" bila sihat.
// Disimpan supaya mesejnya kekal betul selepas tetamu bertukar tab.
let ralatUcapan = "";

// ------------------------------------------------------------
//  UTILITI: senarai "disukai" dalam localStorage (dedupe)
// ------------------------------------------------------------
const KUNCI_SUKA = "polaroid_disukai";
function setDisukai() {
  try { return new Set(JSON.parse(localStorage.getItem(KUNCI_SUKA) || "[]")); }
  catch { return new Set(); }
}
function tandakanDisukai(id) {
  const s = setDisukai();
  s.add(id);
  localStorage.setItem(KUNCI_SUKA, JSON.stringify([...s]));
}

// ------------------------------------------------------------
//  MUATKAN SATU HALAMAN GAMBAR
// ------------------------------------------------------------
async function muatGambar() {
  if (sedangMemuat || !masihAda) return;
  sedangMemuat = true;
  kotakRalat.classList.add("hidden");
  butangMuatLebih.disabled = true;

  try {
    // Skop majlis (multi-tenancy): hanya gambar majlis ini.
    const syarat = [
      where("eventId", "==", eventId),
      where("approved", "==", true),
      orderBy("created_at", "desc"),
    ];
    if (dokTerakhir) syarat.push(startAfter(dokTerakhir));
    syarat.push(limit(SAIZ_HALAMAN));

    const snap = await getDocs(query(collection(db, "photos"), ...syarat));
    zonMemuat.classList.add("hidden");

    snap.forEach((d) => {
      const row = d.data();
      tambahFoto(d.id, row);
    });

    if (snap.size > 0) dokTerakhir = snap.docs[snap.docs.length - 1];

    if (snap.size < SAIZ_HALAMAN) {
      masihAda = false;
      butangMuatLebih.classList.add("hidden");
    } else {
      butangMuatLebih.classList.remove("hidden");
      butangMuatLebih.disabled = false;
    }

    if (fotoDimuat.length === 0) zonKosong.classList.remove("hidden");
    // Keterlihatan bar tab dinilai dalam tapisGaleri() — ia perlukan kiraan
    // jenis, yang hanya muktamad selepas probe nisbah aspek.
    tapisGaleri(); // pastikan tab + carian semasa dikekalkan
  } catch (err) {
    console.error("Ralat muat galeri:", err);
    zonMemuat.classList.add("hidden");
    if (String(err.message || "").includes("index")) {
      kotakRalat.textContent =
        "Galeri memerlukan index Firestore. Buka konsol pelayar (F12) dan klik pautan yang diberi untuk menciptanya (sekali sahaja).";
    }
    kotakRalat.classList.remove("hidden");
    butangMuatLebih.disabled = false;
  } finally {
    sedangMemuat = false;
  }
}

// ------------------------------------------------------------
//  TAMBAH SATU FOTO KE GALERI
// ------------------------------------------------------------
function tambahFoto(id, row, diAtas = false) {
  const foto = {
    id,
    name: row.name || "Tetamu",
    message: row.message || "",
    // Pra-kira sekali: carian menyala pada SETIAP ketikan dan tapisGaleri()
    // melelar semua foto dimuat (boleh 48+), jadi jangan huruf-kecilkan
    // berulang kali di dalam gelung itu.
    cari: `${row.name || "Tetamu"} ${row.message || ""}`.toLowerCase(),
    // Gambar base64 penuh; fallback ke thumb_url untuk dokumen lama (jika ada)
    img: row.image_url || row.thumb_url,
    likes: typeof row.likes === "number" ? row.likes : 0,
    // Tekaan OPTIMISTIK, bukan keadaan "belum tahu": tab lalai ialah
    // "gambar", jadi nilai neutral akan menyebabkan seluruh galeri berkelip
    // kosong dahulu sebelum probe selesai. Hampir semua foto memang gambar
    // biasa; hanya jalur yang beralih keluar (lihat ukurJenis).
    jenis: "gambar",
  };
  const indeks = fotoDimuat.length;

  const item = document.createElement("div");
  item.className = "masonry-item";
  item.dataset.nama = foto.name.toLowerCase();

  // Kad rata gaya feed (Pinterest/Motion): gambar di atas, tajuk tebal,
  // petikan italic, baris bawah ❤ (kiri) + SIMPAN (kanan). Berbeza dengan
  // gaya polaroid Live Wall (wall.js) yang masih guna createPolaroid().
  const kad = document.createElement("article");
  kad.className = "kad-galeri";

  const imgwrap = document.createElement("div");
  imgwrap.className = "kad-galeri__imgwrap";
  const imgEl = document.createElement("img");
  imgEl.className = "kad-galeri__img";
  imgEl.src = foto.img;
  imgEl.loading = "lazy";
  imgEl.decoding = "async";
  imgEl.alt = `Gambar daripada ${foto.name}`;
  // Klik gambar -> buka lightbox
  imgEl.addEventListener("click", () => bukaLightbox(indeks));
  imgwrap.appendChild(imgEl);
  kad.appendChild(imgwrap);

  const badan = document.createElement("div");
  badan.className = "kad-galeri__badan";

  const tajuk = document.createElement("h3");
  tajuk.className = "kad-galeri__tajuk";
  tajuk.textContent = `Oleh ${foto.name}`; // textContent = selamat XSS
  badan.appendChild(tajuk);

  if (foto.message) {
    const petikan = document.createElement("p");
    petikan.className = "kad-galeri__petikan";
    petikan.textContent = foto.message; // textContent = selamat XSS
    badan.appendChild(petikan);
  }

  // Bar reaksi ❤️ (kiri) + SIMPAN (kanan)
  const bar = document.createElement("div");
  bar.className = "reaksi-bar";
  const disukai = setDisukai().has(id);
  const butangHati = document.createElement("button");
  butangHati.className = "reaksi" + (disukai ? " disukai" : "");
  butangHati.setAttribute("aria-label", "Suka gambar ini");
  butangHati.innerHTML = `<span class="hati">♥</span> <span class="kira">${foto.likes}</span>`;
  const kiraEl = butangHati.querySelector(".kira");
  butangHati.addEventListener("click", () => sukaFoto(indeks));
  bar.appendChild(butangHati);

  // Butang muat turun (SIMPAN) — kekal kelas .reaksi + span .ikon untuk
  // maklum balas muat turun (⬇ → ✓/✕) yang dikawal oleh muatTurunFoto().
  const butangMuat = document.createElement("button");
  butangMuat.className = "reaksi reaksi--simpan";
  butangMuat.setAttribute("aria-label", `Muat turun gambar daripada ${foto.name}`);
  butangMuat.title = "Muat turun gambar ini";
  butangMuat.innerHTML = `<span class="ikon">⬇</span> SIMPAN`;
  butangMuat.addEventListener("click", () => muatTurunFoto(indeks));
  bar.appendChild(butangMuat);

  badan.appendChild(bar);
  kad.appendChild(badan);
  item.appendChild(kad);
  // Foto baharu (hantar dari modal) dimasukkan di ATAS; foto pagination
  // biasa ditambah di bawah. Closure `indeks` kekal betul untuk klik/reaksi
  // kerana ia sepadan dengan kedudukan dalam fotoDimuat (bukan susunan DOM).
  if (diAtas) zonGaleri.insertBefore(item, zonGaleri.firstChild);
  else zonGaleri.appendChild(item);

  foto.el = item;
  foto.kiraEl = kiraEl;
  foto.butangHati = butangHati;
  foto.butangMuat = butangMuat;
  fotoDimuat.push(foto);
  ukurJenis(foto);
}

// ------------------------------------------------------------
//  KENAL PASTI JENIS FOTO (gambar biasa vs jalur photobooth)
// ------------------------------------------------------------
//  photos/{id} tiada medan jenis — firestore.rules mengunci senarai medan
//  dengan hasOnly([...]), jadi menambahnya perlu terbitan manual di Console
//  dan jalur LAMA tetap tidak bertanda. Nisbah aspek pula sudah cukup dan
//  berfungsi retroaktif; lihat adalahJalur() di js/imej.js.
//
//  WAJIB guna objek Image() BERASINGAN, bukan imgEl dalam DOM: imgEl ada
//  loading="lazy", jadi peristiwa `load`-nya TIDAK menyala untuk kad di luar
//  skrin — jalur yang jauh di bawah takkan pernah dikelaskan dan akan hilang
//  daripada tab Photobooth. Probe tidak tertakluk pada `loading`, dan kerana
//  src ialah data URI yang sudah ada dalam ingatan, tiada permintaan
//  rangkaian tambahan.
// ------------------------------------------------------------
function ukurJenis(foto) {
  if (!foto.img) return; // kekal "gambar"

  let probe = new Image();
  probeTertunggak++;
  const siap = (jenis) => {
    foto.jenis = jenis;
    // Lepaskan bitmap ternyahkod (~3.7 MB bagi 720x1280) — tanpa ini,
    // menatal galeri besar mengumpul satu salinan tambahan setiap foto.
    if (probe) {
      probe.onload = probe.onerror = null;
      probe.src = "";
      probe = null;
    }
    if (--probeTertunggak === 0) menungguProbe.splice(0).forEach((r) => r());
    jadualTapis();
  };

  probe.onload = () =>
    siap(adalahJalur(probe.naturalWidth, probe.naturalHeight) ? "jalur" : "gambar");
  // Gagal selamat: gambar rosak kekal dalam tab lalai, bukan lesap ke tab
  // yang tetamu tidak akan cari.
  probe.onerror = () => siap("gambar");
  probe.src = foto.img;
}

// Pengelasan tak segerak, jadi tambahHalamanAuto() perlu tahu bila semua
// probe halaman semasa sudah selesai — tanpanya ia melihat foto yang masih
// bertanda tekaan optimistik "gambar" dan memuat halaman yang tidak perlu.
let probeTertunggak = 0;
const menungguProbe = [];
function tungguProbe() {
  return probeTertunggak === 0
    ? Promise.resolve()
    : new Promise((r) => menungguProbe.push(r));
}

// Probe untuk satu halaman (12 foto) selesai hampir serentak; kumpulkan
// supaya hanya SATU lintasan penapisan berlaku, bukan 12.
let tapisDijadual = false;
function jadualTapis() {
  if (tapisDijadual) return;
  tapisDijadual = true;
  requestAnimationFrame(() => {
    tapisDijadual = false;
    tapisGaleri();
  });
}

// ------------------------------------------------------------
//  MUAT TURUN SATU GAMBAR
// ------------------------------------------------------------
//  Gambar sudah ada dalam ingatan sebagai data URI (foto.img),
//  jadi tiada bacaan Firestore tambahan.
//
//  Sambungan fail diambil dari MIME data URI — satu majlis boleh
//  mengandungi campuran WebP (baharu) dan JPEG (lama), dan WebP
//  yang dinamakan .jpg tidak boleh dibuka.
// ------------------------------------------------------------
function muatTurunFoto(i) {
  const foto = fotoDimuat[i];
  if (!foto || !foto.img) return;

  const btn = foto.butangMuat;
  const ikon = btn.querySelector(".ikon");

  try {
    const nama = `${namaBersih(foto.name)}.${sambunganDari(foto.img)}`;
    cetusMuatTurun(foto.img, nama, { kunci: foto.id });

    // Maklum balas: muat turun berlaku senyap, jadi tunjukkan ia berjaya.
    ikon.textContent = "✓";
    btn.classList.add("selesai");
  } catch (err) {
    console.error("Ralat muat turun gambar:", err);
    ikon.textContent = "✕";
    btn.classList.add("gagal");
  }

  clearTimeout(foto.pemasaMuat);
  foto.pemasaMuat = setTimeout(() => {
    ikon.textContent = "⬇";
    btn.classList.remove("selesai", "gagal");
  }, 1800);
}

// ------------------------------------------------------------
//  REAKSI ❤️
// ------------------------------------------------------------
async function sukaFoto(i) {
  const foto = fotoDimuat[i];
  if (!foto) return;
  if (setDisukai().has(foto.id)) return; // sudah disukai

  // Kemas kini optimistik
  foto.likes += 1;
  foto.kiraEl.textContent = foto.likes;
  foto.butangHati.classList.add("disukai");
  tandakanDisukai(foto.id);

  try {
    await updateDoc(doc(db, "photos", foto.id), { likes: increment(1) });
  } catch (err) {
    console.error("Ralat suka:", err);
    // Batalkan jika gagal
    foto.likes -= 1;
    foto.kiraEl.textContent = foto.likes;
    foto.butangHati.classList.remove("disukai");
  }
}

// ------------------------------------------------------------
//  LIGHTBOX
// ------------------------------------------------------------
function bukaLightbox(i) {
  lbIndeks = i;
  const foto = fotoDimuat[i];
  if (!foto) return;

  lbNama.textContent = `— ${foto.name}`;
  lbUcapan.textContent = foto.message || "";
  lbUcapan.classList.toggle("hidden", !foto.message);

  lbImg.src = foto.img;
  lightbox.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function tutupLightbox() {
  lightbox.classList.add("hidden");
  document.body.style.overflow = "";
  lbIndeks = -1;
}

// Navigasi mengikut apa yang KELIHATAN, bukan seluruh fotoDimuat. Dengan tab
// berasingan, melangkah ikut indeks mentah akan membuka gambar biasa semasa
// tetamu menyemak imbas jalur photobooth — bercampur semula melalui pintu
// belakang. Turut menghormati penapis carian.
function navigasiLightbox(delta) {
  if (lbIndeks < 0) return;
  const n = fotoDimuat.length;
  if (!n) return;
  let j = lbIndeks;
  for (let langkah = 0; langkah < n; langkah++) {
    j = (j + delta + n) % n;
    if (fotoDimuat[j].el.style.display !== "none") {
      bukaLightbox(j);
      return;
    }
  }
}

// Kawalan lightbox
document.getElementById("lb-tutup").addEventListener("click", tutupLightbox);
document.getElementById("lb-prev").addEventListener("click", () => navigasiLightbox(-1));
document.getElementById("lb-next").addEventListener("click", () => navigasiLightbox(1));
lightbox.addEventListener("click", (e) => {
  if (e.target === lightbox) tutupLightbox(); // klik latar -> tutup
});
document.addEventListener("keydown", (e) => {
  if (lightbox.classList.contains("hidden")) return;
  if (e.key === "Escape") tutupLightbox();
  else if (e.key === "ArrowLeft") navigasiLightbox(-1);
  else if (e.key === "ArrowRight") navigasiLightbox(1);
});

// ------------------------------------------------------------
//  PENAPIS GALERI (tab jenis + carian nama)
// ------------------------------------------------------------
//  Kedua-duanya menapis foto yang SUDAH DIMUAT, bukan pertanyaan baharu —
//  corak asal carian dikekalkan. Setiap kad sentiasa tertakluk pada tab:
//  tiada laluan "tunjuk semua", kerana dua tab sengaja tidak bercampur.
// ------------------------------------------------------------
function tapisGaleri() {
  const q = inputCari ? inputCari.value.trim().toLowerCase() : "";
  const ucapanTab = tabAktif === "ucapan";
  let jumpa = 0;
  const kira = { gambar: 0, jalur: 0, ucapan: ucapanDimuat.length };

  fotoDimuat.forEach((foto) => {
    kira[foto.jenis]++;
    const padan = foto.jenis === tabAktif && (!q || foto.cari.includes(q));
    foto.el.style.display = padan ? "" : "none";
    if (padan) jumpa++;
  });

  // Ucapan ditapis berasingan: ia bukan sebahagian fotoDimuat.
  ucapanDimuat.forEach((u) => {
    const padan = ucapanTab && (!q || u.cari.includes(q));
    u.el.style.display = padan ? "" : "none";
    if (padan) jumpa++;
  });

  kemasKiraTab(kira);
  kemasPaparanTab();

  // Satu tab sahaja = bukan tab. Setiap tab dinilai sendiri, kemudian
  // seluruh jalur disembunyikan bila kurang daripada dua yang berguna.
  // Dinilai di sini kerana kiraan `jenis` hanya muktamad selepas probe
  // nisbah aspek selesai, dan tapisGaleri() memang dijalankan semula ketika itu.
  if (zonTab) {
    // Jalur/ucapan "berguna" bila pakej menyokongnya ATAU majlis ini
    // memang sudah ada kandungan jenis itu (cth pakej diturunkan selepas
    // majlis — kandungan lama tidak patut jadi tidak boleh dicapai).
    // "gambar" sentiasa kelihatan: ia tab rumah — menyembunyikannya akan
    // mengurung tetamu dalam tab lain tanpa jalan balik. Majlis tanpa
    // ciri tambahan tetap tidak nampak jalur ini, kerana satu butang
    // sahaja tidak mencukupi (bilNampak < 2 di bawah).
    const nampak = {
      gambar: true,
      jalur: cirianJalur || kira.jalur > 0,
      ucapan: cirianUcapan || ucapanDimuat.length > 0,
    };
    let bilNampak = 0;
    zonTab.querySelectorAll(".tab-galeri__btn").forEach((btn) => {
      const tunjuk = !!nampak[btn.dataset.tab];
      btn.classList.toggle("hidden", !tunjuk);
      if (tunjuk) bilNampak++;
    });
    zonTab.classList.toggle("hidden", bilNampak < 2);
  }
  // Ikon carian hanya bila ada sesuatu untuk dicari.
  butangCariTogol?.classList.toggle(
    "hidden",
    fotoDimuat.length === 0 && ucapanDimuat.length === 0
  );

  if (zonTiadaHasil) {
    // Majlis yang langsung tiada gambar sudah dilindungi oleh #zon-kosong
    // ("Belum Ada Gambar Lagi"); tanpa syarat kedua ini, tetamu nampak DUA
    // mesej "tiada" bertindih. Tab ucapan ada mesej kosongnya sendiri.
    const tunjuk = !ucapanTab && jumpa === 0 && fotoDimuat.length > 0;
    zonTiadaHasil.classList.toggle("hidden", !tunjuk);
    if (tunjuk) zonTiadaHasil.textContent = mesejTiadaHasil(q);
  }

  if (zonUcapanKosong) {
    // "Belum ada ucapan" hanya selepas muatan selesai — sebelum itu
    // senarai kosong bermakna "belum dibaca", bukan "tiada".
    const tunjukKosong =
      ucapanTab && jumpa === 0 && (ucapanSudahMuat || !!ralatUcapan);
    zonUcapanKosong.classList.toggle("hidden", !tunjukKosong);
    if (tunjukKosong) {
      zonUcapanKosong.textContent =
        ralatUcapan ||
        (q
          ? "Tiada ucapan sepadan dengan carian anda."
          : "Belum ada ucapan. Jadilah yang pertama menulis!");
    }
  }
}

// ------------------------------------------------------------
//  TUKAR BEKAS IKUT TAB
// ------------------------------------------------------------
//  Tab Ucapan memakai bekas yang BERBEZA sepenuhnya daripada dua tab
//  gambar. Tanpa penukaran ini, tetamu nampak "Belum Ada Gambar Lagi"
//  dan butang "Muat Lebih Banyak" bertindih atas senarai ucapan —
//  kedua-duanya milik koleksi photos, bukan buku tetamu.
// ------------------------------------------------------------
function kemasPaparanTab() {
  const ucapanTab = tabAktif === "ucapan";
  zonUcapan?.classList.toggle("hidden", !ucapanTab);
  zonGaleri?.classList.toggle("hidden", ucapanTab);
  if (ucapanTab) {
    zonKosong?.classList.add("hidden");
    butangMuatLebih?.classList.add("hidden");
  } else {
    // Keterlihatan sebenar kedua-duanya dimiliki oleh muatGambar();
    // di sini kita hanya pulihkan apa yang tab ucapan sembunyikan,
    // dengan syarat yang SAMA seperti di sana (lihat muatGambar).
    if (fotoDimuat.length === 0) zonKosong?.classList.remove("hidden");
    if (masihAda) butangMuatLebih?.classList.remove("hidden");
  }
}

// Mesej kosong bergantung pada SEBAB ia kosong. Dua paksi:
//
//   q      — carian tidak sepadan, vs tab memang kosong
//   masihAda — ada lagi halaman untuk dimuat, vs semuanya sudah dimuat
//
// Paksi kedua penting: bila masihAda false, butang "Muat Lebih Banyak"
// SUDAH tersembunyi, jadi menyuruh tetamu menekannya menghantar mereka
// mencari butang yang tidak wujud.
function mesejTiadaHasil(q) {
  if (q) {
    return masihAda
      ? 'Tiada nama atau ucapan sepadan dalam gambar yang dimuat. Cuba "Muat Lebih Banyak".'
      : "Tiada nama atau ucapan sepadan dengan carian anda.";
  }
  if (tabAktif === "ucapan") {
    return "Belum ada ucapan dalam buku tetamu majlis ini.";
  }
  if (tabAktif === "jalur") {
    return masihAda
      ? 'Belum ada jalur photobooth dalam gambar yang dimuat. Cuba "Muat Lebih Banyak".'
      : "Majlis ini belum ada jalur photobooth.";
  }
  return masihAda
    ? 'Belum ada gambar biasa dalam gambar yang dimuat. Cuba "Muat Lebih Banyak".'
    : "Majlis ini belum ada gambar biasa.";
}

function kemasKiraTab(kira) {
  if (!zonTab) return;
  zonTab.querySelectorAll(".tab-galeri__btn").forEach((btn) => {
    const el = btn.querySelector(".tab-galeri__kira");
    if (el) el.textContent = kira[btn.dataset.tab] || "";
  });
}

if (inputCari) inputCari.addEventListener("input", tapisGaleri);

// ------------------------------------------------------------
//  TAB JENIS
// ------------------------------------------------------------
async function pilihTab(tab) {
  if (tab === tabAktif || !zonTab) return;
  tabAktif = tab;
  zonTab.querySelectorAll(".tab-galeri__btn").forEach((btn) => {
    const aktif = btn.dataset.tab === tab;
    btn.classList.toggle("aktif", aktif);
    btn.setAttribute("aria-selected", String(aktif));
  });
  tapisGaleri();
  kemasButangTambah();
  // Ucapan dibaca MALAS — hanya bila tab dibuka kali pertama. Tetamu yang
  // datang untuk gambar sahaja tidak patut membayar bacaan koleksi kedua.
  if (tab === "ucapan" && !ucapanSudahMuat) await muatSenaraiUcapan();
  await tambahHalamanAuto();
}

// ------------------------------------------------------------
//  MUAT & PAPAR UCAPAN (buku tetamu)
// ------------------------------------------------------------
async function muatSenaraiUcapan() {
  if (ucapanSudahMuat || !zonUcapan) return;
  ucapanSudahMuat = true; // tetapkan awal: elak dua muatan serentak

  const { senarai, ralat } = await muatUcapan(eventId);
  if (ralat) {
    ucapanSudahMuat = false; // benarkan cuba lagi bila tab dibuka semula
    ralatUcapan = ralat;
    tapisGaleri();
    return;
  }
  ralatUcapan = "";
  senarai.forEach((u) => tambahUcapan(u));
  tapisGaleri();
}

function tambahUcapan(u, diAtas = false) {
  if (!zonUcapan) return;
  const el = binaKadUcapan(u);
  const item = {
    id: u.id,
    name: u.name || "",
    message: u.message || "",
    cari: `${u.name || ""} ${u.message || ""}`.toLowerCase(),
    el,
  };
  if (diAtas) {
    zonUcapan.insertBefore(el, zonUcapan.firstChild);
    ucapanDimuat.unshift(item);
  } else {
    zonUcapan.appendChild(el);
    ucapanDimuat.push(item);
  }
}

// Ucapan baharu daripada borang — muncul serta-merta tanpa muat semula.
function masukkanUcapanBaru(u) {
  tambahUcapan(u, true);
  tapisGaleri();
}

// ------------------------------------------------------------
//  PIL "TAMBAH"
// ------------------------------------------------------------
//  Satu pil menggantikan dua butang: ia menyasar jenis tab yang SEDANG
//  dilihat — tab Gambar → modal muat naik, tab Jalur → modal photobooth.
//  Itu yang membolehkan kita buang baris butang kedua tanpa menambah menu
//  perantara. Label turut berubah supaya tetamu tahu apa yang akan berlaku.
// ------------------------------------------------------------
//  Peta satu tempat untuk ketiga-tiga tab. Label lalai HTML pada
//  #butang-tambah MESTI sepadan dengan label tab "gambar".
const TAB = {
  gambar: { label: "Take a selfie", modal: () => modalUpload,     boleh: () => bolehTambahGambar },
  jalur:  { label: "Photobooth",    modal: () => modalPhotobooth, boleh: () => bolehTambahJalur  },
  ucapan: { label: "Tulis Ucapan",  modal: () => modalGuestbook,  boleh: () => bolehTulisUcapan  },
};

function kemasButangTambah() {
  if (!butangTambah) return;
  const cfg = TAB[tabAktif] || TAB.gambar;
  // Tulis ke <span>, BUKAN textContent butang — butang ada dua anak (＋ dan
  // label) dan textContent akan memusnahkan ikonnya. aria-label pula wajib:
  // teks label disembunyikan di telefon.
  const teks = butangTambah.querySelector(".bar-kawalan__teks");
  if (teks) teks.textContent = cfg.label;
  butangTambah.setAttribute("aria-label", cfg.label);
  butangTambah.classList.toggle("hidden", !cfg.boleh());
}

// Togol kotak carian. MENUTUPNYA mesti turut mengosongkan pertanyaan — jika
// tidak galeri kekal tertapis sedangkan kotak carian sudah hilang dari
// pandangan, dan tetamu tiada cara untuk tahu kenapa gambar "hilang".
butangCariTogol?.addEventListener("click", () => {
  if (!zonCari) return;
  const buka = !zonCari.classList.toggle("hidden");
  butangCariTogol.setAttribute("aria-expanded", String(buka));
  if (buka) {
    inputCari?.focus();
  } else if (inputCari?.value) {
    inputCari.value = "";
    tapisGaleri();
  }
});

butangTambah?.addEventListener("click", () => {
  // Borang ucapan dipulihkan setiap kali dibuka, jika tidak tetamu kedua
  // disambut skrin "Terima Kasih" tetamu pertama.
  if (tabAktif === "ucapan") semulaBorangUcapan?.();
  bukaModal((TAB[tabAktif] || TAB.gambar).modal());
});

// Tab kosong selalunya bermakna "belum dimuat", bukan "tiada" — muat
// beberapa halaman lagi sendiri sebelum menyerah kepada tetamu.
async function tambahHalamanAuto() {
  // Ucapan datang dari koleksi LAIN — memuat halaman `photos` tidak akan
  // sekali-kali mengisi tab ini, jadi tanpa jaga ini ia membazir 3 halaman
  // (48 foto × ~78 KiB base64) setiap kali tab Ucapan dibuka.
  if (tabAktif === "ucapan") return;
  for (let i = 0; i < HALAMAN_AUTO_MAKS; i++) {
    await tungguProbe(); // jenis mesti muktamad sebelum diperiksa
    if (!masihAda) return;
    if (fotoDimuat.some((f) => f.jenis === tabAktif)) return;
    const tabMula = tabAktif;
    await muatGambar();
    if (tabAktif !== tabMula) return; // tetamu bertukar tab semasa memuat
  }
}

if (zonTab) {
  zonTab.querySelectorAll(".tab-galeri__btn").forEach((btn) =>
    btn.addEventListener("click", () => pilihTab(btn.dataset.tab))
  );
}

// ------------------------------------------------------------
//  MODAL (muat naik & photobooth)
// ------------------------------------------------------------
//  Diparameterkan kerana photobooth PERLU cangkuk `semasaTutup`
//  untuk hentikan kamera — tanpanya lampu kamera kekal menyala
//  selepas tetamu tutup modal.
// ------------------------------------------------------------
function bukaModal(el) {
  if (!el) return;
  el.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}
function tutupModal(el) {
  if (!el) return;
  el.classList.add("hidden");
  document.body.style.overflow = "";
}
function pasangModal(el, semasaTutup) {
  if (!el) return;
  const tutup = () => {
    tutupModal(el);
    semasaTutup?.();
  };
  // Klik latar (bukan kotak) -> tutup
  el.addEventListener("click", (e) => {
    if (e.target === el) tutup();
  });
  // Butang tutup (×) + "Lihat Galeri" selepas berjaya
  el.querySelectorAll("[data-tutup-modal]").forEach((b) =>
    b.addEventListener("click", tutup)
  );
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !el.classList.contains("hidden")) tutup();
  });
}
pasangModal(modalUpload);

// Callback bila upload berjaya: masukkan gambar baharu di ATAS galeri.
function masukkanFotoBaru(foto) {
  zonKosong.classList.add("hidden");
  tambahFoto(
    foto.id,
    {
      name: foto.name,
      message: foto.message,
      image_url: foto.image_url,
      likes: foto.likes,
    },
    true // diAtas
  );
  // Hormati tab + carian semasa (tapisGaleri juga yang menilai semula
  // keterlihatan bar tab). Jalur baharu yang dihantar sementara tetamu
  // berada di tab "Gambar" tidak akan kelihatan sehingga mereka bertukar tab —
  // itu memang akibat tab yang berasingan, bukan pepijat.
  tapisGaleri();
}

// ------------------------------------------------------------
//  MULA
// ------------------------------------------------------------
function paparRalatMula(mesej) {
  zonMemuat.classList.add("hidden");
  kotakRalat.textContent = mesej;
  kotakRalat.classList.remove("hidden");
}

(async function mula() {
  if (!configSiap()) {
    paparRalatMula("Sistem belum dikonfigurasi. Sila hubungi penganjur majlis.");
    return;
  }
  // Galeri mesti terikat pada satu majlis (multi-tenancy)
  if (!eventId) {
    paparRalatMula("Pautan tidak lengkap. Sila imbas kod QR majlis.");
    return;
  }

  // Muat majlis untuk tema + nama (tidak kritikal jika gagal)
  let majlis = null;
  try {
    majlis = await muatEvent(eventId);
    if (majlis) {
      terapTema(majlis);
      const namaMajlis = document.getElementById("nama-majlis");
      if (namaMajlis && majlis.coupleName) namaMajlis.textContent = majlis.coupleName;

      // Mesej aluan (pilihan) — teks pelanggan, tiada tapisan di server,
      // jadi textContent sahaja. Kekal tersembunyi kalau kosong.
      const mesejAluan = document.getElementById("mesej-aluan");
      const teksAluan = (majlis.welcomeMessage || "").trim();
      if (mesejAluan && teksAluan) {
        mesejAluan.textContent = teksAluan;
        mesejAluan.classList.remove("hidden");
      }
    }
  } catch {
    /* majlis tidak aktif — galeri masih boleh papar gambar diluluskan */
  }

  // Pasang borang muat naik (modal). Jika majlis tak sah/tamat/penuh,
  // butang "Muat Naik" kekal tersembunyi supaya tetamu tak keliru.
  const hasilUpload = pasangBorangUpload({
    eventId,
    majlis,
    onBerjaya: masukkanFotoBaru,
  });
  bolehTambahGambar = hasilUpload.boleh;
  if (bolehTambahGambar) {
    butangKosongUpload?.classList.remove("hidden");
    butangKosongUpload?.addEventListener("click", () => bukaModal(modalUpload));
  }

  // Photobooth — dedah hanya untuk pakej yang menyokongnya (Premium+)
  // DAN pelayar yang ada kamera langsung. Basic tidak nampak apa-apa:
  // tetamu tak boleh naik taraf, jadi mesej naik taraf di sini hanya
  // bunyi bising. Tempatnya di panel pelanggan (tetapan.html).
  const hasilPB = pasangPhotobooth({
    eventId,
    majlis,
    onBerjaya: masukkanFotoBaru,
  });
  bolehTambahJalur = hasilPB.boleh;
  if (bolehTambahJalur) pasangModal(modalPhotobooth, hasilPB.tutup);

  // Keterlihatan TAB jalur ikut pakej sahaja, bukan hasilPB — tetamu desktop
  // tanpa kamera masih patut boleh MELIHAT jalur yang orang lain hantar.
  cirianJalur = !!majlis && bolehGuna(majlis, "photobooth");

  // Buku tetamu — ciri Premium+. Sama prinsip dengan photobooth: tab
  // kelihatan ikut PAKEJ, butang tulis ikut kelayakan hantar (majlis
  // masih aktif & belum luput).
  const hasilGb = pasangGuestbook({
    eventId,
    majlis,
    onBerjaya: masukkanUcapanBaru,
  });
  bolehTulisUcapan = hasilGb.boleh;
  semulaBorangUcapan = hasilGb.semula || null;
  if (bolehTulisUcapan) pasangModal(modalGuestbook);
  cirianUcapan = !!majlis && bolehGuna(majlis, "guestbook");

  kemasButangTambah();

  butangMuatLebih.addEventListener("click", muatGambar);
  muatGambar();
})();
