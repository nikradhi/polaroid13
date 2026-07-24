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
import { createPolaroid, pasangGayaPolaroid } from "./polaroid.js";
import { dapatEventId, muatEvent, terapTema } from "./majlis.js";
import {
  cetusMuatTurun,
  namaBersih,
  sambunganDari,
} from "./muat-turun.js";
import { pasangBorangUpload } from "./upload.js";
import { bolehGuna } from "./gating.js";

pasangGayaPolaroid();

const SAIZ_HALAMAN = 12;

// --- Majlis semasa (multi-tenancy) ---
const eventId = dapatEventId();

const zonGaleri = document.getElementById("zon-galeri");
const zonKosong = document.getElementById("zon-kosong");
const zonMemuat = document.getElementById("zon-memuat");
const butangMuatLebih = document.getElementById("butang-muat-lebih");
const kotakRalat = document.getElementById("kotak-ralat");
const inputCari = document.getElementById("input-cari");

// Modal muat naik
const modalUpload = document.getElementById("modal-upload");
const butangBukaUpload = document.getElementById("butang-buka-upload");
const butangKosongUpload = document.getElementById("butang-kosong-upload");
const pautanWall = document.getElementById("pautan-wall");

// Lightbox
const lightbox = document.getElementById("lightbox");
const lbImg = document.getElementById("lb-img");
const lbNama = document.getElementById("lb-nama");
const lbUcapan = document.getElementById("lb-ucapan");

let dokTerakhir = null;
let masihAda = true;
let sedangMemuat = false;

// Simpanan foto dimuat (untuk lightbox & reaksi)
const fotoDimuat = []; // {id, name, message, img, likes, el, kiraEl, butangHati}
let lbIndeks = -1;

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
    tapisCarian(); // pastikan penapis semasa dikekalkan
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
    // Gambar base64 penuh; fallback ke thumb_url untuk dokumen lama (jika ada)
    img: row.image_url || row.thumb_url,
    likes: typeof row.likes === "number" ? row.likes : 0,
  };
  const indeks = fotoDimuat.length;

  const item = document.createElement("div");
  item.className = "masonry-item";
  item.dataset.nama = foto.name.toLowerCase();

  const kad = createPolaroid({
    imageUrl: foto.img,
    name: foto.name,
    message: foto.message,
  });
  // Klik gambar -> buka lightbox
  const imgEl = kad.querySelector(".polaroid__img");
  imgEl.style.cursor = "zoom-in";
  imgEl.addEventListener("click", () => bukaLightbox(indeks));

  // Bar reaksi ❤️
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

  // Butang muat turun ⬇️ — guna gaya pil .reaksi yang sama
  const butangMuat = document.createElement("button");
  butangMuat.className = "reaksi";
  butangMuat.setAttribute("aria-label", `Muat turun gambar daripada ${foto.name}`);
  butangMuat.title = "Muat turun gambar ini";
  // Ikon sahaja (floppy 💾 = "simpan") — jimat ruang dalam bingkai.
  butangMuat.innerHTML = `<span class="ikon">💾</span>`;
  butangMuat.addEventListener("click", () => muatTurunFoto(indeks));
  bar.appendChild(butangMuat);

  // Bar reaksi diletak DALAM bingkai polaroid (ruang putih bawah, selepas nama)
  // — bukan sebagai adik-beradik di luar bingkai. Skop galeri sahaja:
  // wall.js guna createPolaroid() tanpa bar ini, jadi Live Wall tak terkesan.
  const kaki = kad.querySelector(".polaroid__caption");
  kaki.appendChild(bar);
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
    ikon.textContent = "💾";
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

function navigasiLightbox(delta) {
  if (lbIndeks < 0) return;
  let j = lbIndeks + delta;
  if (j < 0) j = fotoDimuat.length - 1;
  if (j >= fotoDimuat.length) j = 0;
  bukaLightbox(j);
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
//  CARIAN (tapis foto dimuat ikut nama)
// ------------------------------------------------------------
function tapisCarian() {
  if (!inputCari) return;
  const q = inputCari.value.trim().toLowerCase();
  let jumpa = 0;
  fotoDimuat.forEach((foto) => {
    const padan = !q || foto.name.toLowerCase().includes(q);
    foto.el.style.display = padan ? "" : "none";
    if (padan) jumpa++;
  });
  const zonTiada = document.getElementById("zon-tiada-carian");
  if (zonTiada) zonTiada.classList.toggle("hidden", jumpa > 0 || !q);
}
if (inputCari) inputCari.addEventListener("input", tapisCarian);

// ------------------------------------------------------------
//  MODAL MUAT NAIK
// ------------------------------------------------------------
function bukaModal() {
  if (!modalUpload) return;
  modalUpload.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}
function tutupModal() {
  if (!modalUpload) return;
  modalUpload.classList.add("hidden");
  document.body.style.overflow = "";
}
if (modalUpload) {
  // Klik latar (bukan kotak) -> tutup
  modalUpload.addEventListener("click", (e) => {
    if (e.target === modalUpload) tutupModal();
  });
  // Butang tutup (×) + "Lihat Galeri" selepas berjaya
  modalUpload.querySelectorAll("[data-tutup-modal]").forEach((el) =>
    el.addEventListener("click", tutupModal)
  );
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modalUpload.classList.contains("hidden")) tutupModal();
  });
}

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
  tapisCarian(); // hormati penapis carian semasa
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
  if (hasilUpload.boleh) {
    butangBukaUpload?.classList.remove("hidden");
    butangKosongUpload?.classList.remove("hidden");
    butangBukaUpload?.addEventListener("click", bukaModal);
    butangKosongUpload?.addEventListener("click", bukaModal);
  }

  // Pautan Live Wall — dedah hanya untuk pakej yang menyokongnya (Premium+).
  if (pautanWall && majlis && bolehGuna(majlis, "liveWall")) {
    pautanWall.href = `wall.html?e=${encodeURIComponent(eventId)}`;
    pautanWall.classList.remove("hidden");
  }

  butangMuatLebih.addEventListener("click", muatGambar);
  muatGambar();
})();
