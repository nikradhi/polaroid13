// ============================================================
//  LOGIK HALAMAN UPLOAD
// ------------------------------------------------------------
//  - Validasi input (nama wajib, jenis & saiz fail)
//  - Anti-spam: cooldown (localStorage) + honeypot
//  - Compress ADAPTIF: satu gambar base64 disimpan dalam `photos.image_url`
//    (tiada Firebase Storage diperlukan)
//  - Hormati tetapan pra-moderasi (settings/majlis)
//  - Preview polaroid langsung sebelum hantar
//  - Ambil semula (retake) / tukar / buang gambar tanpa hilang teks
//  - Kendalian ralat mesra pengguna (Bahasa Melayu)
// ============================================================

import {
  db,
  configSiap,
  collection,
  doc,
  serverTimestamp,
  writeBatch,
  increment,
} from "./firebase.js";
import { createPolaroid, pasangGayaPolaroid } from "./polaroid.js";
import { compressImej, blobKeBase64 } from "./imej.js";
import {
  dapatEventId,
  muatEvent,
  majlisAktif,
  kuotaPenuh,
  terapTema,
  mesejMajlisTakBoleh,
} from "./majlis.js";

pasangGayaPolaroid();

// --- Had & tetapan ---
const SAIZ_FAIL_MAKS = 15 * 1024 * 1024; // 15 MB sebelum compress
const HAD_UCAPAN = 120; // aksara
const COOLDOWN_MS = 45 * 1000; // jeda minimum antara upload (anti-spam)
const KUNCI_COOLDOWN = "polaroid_upload_terakhir"; // kunci localStorage

// --- Rujukan elemen DOM ---
const form = document.getElementById("form-upload");
const inputKamera = document.getElementById("input-kamera");
const inputGaleri = document.getElementById("input-galeri");
const inputNama = document.getElementById("input-nama");
const inputUcapan = document.getElementById("input-ucapan");
const kaunterUcapan = document.getElementById("kaunter-ucapan");
const zonPreview = document.getElementById("zon-preview");
const zonPilihFail = document.getElementById("zon-pilih-fail");
const butangKamera = document.getElementById("butang-kamera");
const butangGaleri = document.getElementById("butang-galeri");
const butangBuang = document.getElementById("butang-buang");
const teksButangKamera = document.getElementById("teks-butang-kamera");
const butangHantar = document.getElementById("butang-hantar");
const kotakStatus = document.getElementById("kotak-status");
const zonTerimaKasih = document.getElementById("zon-terima-kasih");
const inputHoneypot = document.getElementById("input-web"); // perangkap bot (tersembunyi)

const zonMajlisRalat = document.getElementById("zon-majlis-ralat");
const majlisRalatTajuk = document.getElementById("majlis-ralat-tajuk");
const majlisRalatMesej = document.getElementById("majlis-ralat-mesej");
const namaMajlis = document.getElementById("nama-majlis");
const footerGaleri = document.querySelector("footer a[href*='gallery']");
const pautanGaleriTk = document.querySelector("#zon-terima-kasih a[href*='gallery']");

// Simpan fail asal yang dipilih pengguna
let failDipilih = null;
// URL objek preview semasa — disimpan supaya boleh di-revoke bila
// gambar ditukar/dibuang (setiap retake mencipta blob baharu).
let urlPreview = null;
// Benar semasa proses hantar berjalan — kunci butang tukar gambar
// supaya failDipilih tidak berubah di tengah-tengah compressImej().
let sedangHantar = false;

// --- Majlis semasa (multi-tenancy) ---
const eventId = dapatEventId();
let majlis = null; // dokumen events/{eventId}

// ------------------------------------------------------------
//  SEKAT BORANG bila majlis tidak sah / tamat / penuh
// ------------------------------------------------------------
function sekatBorang(tajuk, mesej) {
  form.classList.add("hidden");
  zonPreview.classList.add("hidden");
  const kaki = document.querySelector("footer");
  if (kaki) kaki.classList.add("hidden");
  majlisRalatTajuk.textContent = tajuk;
  majlisRalatMesej.textContent = mesej;
  zonMajlisRalat.classList.remove("hidden");
}

// ------------------------------------------------------------
//  MULAKAN: muat majlis dari ?e=<eventId>
// ------------------------------------------------------------
(async function mulakanMajlis() {
  if (!eventId) {
    sekatBorang(
      "Pautan tidak lengkap",
      "Sila imbas kod QR majlis untuk muat naik gambar."
    );
    return;
  }
  try {
    majlis = await muatEvent(eventId);
  } catch {
    // Rules menolak baca -> majlis tidak aktif
    sekatBorang("Majlis tidak aktif", "Majlis ini belum diaktifkan atau telah tamat tempoh.");
    return;
  }
  if (!majlis) {
    sekatBorang("Majlis tidak dijumpai", "Sila imbas semula kod QR majlis.");
    return;
  }
  if (!majlisAktif(majlis)) {
    sekatBorang("Majlis tidak tersedia", mesejMajlisTakBoleh(majlis));
    return;
  }
  if (kuotaPenuh(majlis)) {
    sekatBorang(
      "Kuota gambar penuh",
      `Majlis ini telah mencapai had ${majlis.photoLimit} gambar. Terima kasih!`
    );
    return;
  }

  // Majlis sah — peribadikan halaman
  terapTema(majlis);
  if (majlis.coupleName) namaMajlis.textContent = majlis.coupleName;
  // Bawa eventId pada pautan galeri
  const urlGaleri = `gallery.html?e=${encodeURIComponent(eventId)}`;
  if (footerGaleri) footerGaleri.href = urlGaleri;
  if (pautanGaleriTk) pautanGaleriTk.href = urlGaleri;
})();

// ------------------------------------------------------------
//  UTILITI STATUS / MESEJ
// ------------------------------------------------------------
function tunjukStatus(mesej, jenis = "info") {
  kotakStatus.textContent = mesej;
  kotakStatus.className = "kotak-status kotak-status--" + jenis;
  kotakStatus.classList.remove("hidden");
}
function sorokStatus() {
  kotakStatus.classList.add("hidden");
}

// ------------------------------------------------------------
//  PAPAR PREVIEW POLAROID
// ------------------------------------------------------------
function paparPreview(fail) {
  // Lepaskan blob preview lama dahulu — tanpa ini setiap kali tetamu
  // "ambil semula" akan meninggalkan satu blob tergantung dalam memori.
  // (Selamat di sini: <img> lama memang akan dibuang serta-merta.)
  if (urlPreview) URL.revokeObjectURL(urlPreview);
  urlPreview = URL.createObjectURL(fail);

  zonPreview.innerHTML = "";
  const kad = createPolaroid({
    imageUrl: urlPreview,
    name: inputNama.value || "Nama anda",
    message: inputUcapan.value,
  });
  zonPreview.appendChild(kad);
}

// Lepaskan blob terakhir bila halaman ditutup.
// e.persisted = halaman masuk bfcache (cth tetamu ke galeri lalu tekan
// "back") — jangan revoke, kerana DOM & preview yang sama akan hidup semula.
window.addEventListener("pagehide", (e) => {
  if (!e.persisted && urlPreview) URL.revokeObjectURL(urlPreview);
});

// Kemas kini teks nama/ucapan pada preview secara langsung
function kemasKiniTeksPreview() {
  if (!failDipilih) return;
  const nama = zonPreview.querySelector(".polaroid__name");
  let msg = zonPreview.querySelector(".polaroid__message");
  const kaki = zonPreview.querySelector(".polaroid__caption");

  if (nama) {
    nama.textContent = inputNama.value.trim()
      ? `— ${inputNama.value.trim()}`
      : "— Nama anda";
  }
  const teksUcapan = inputUcapan.value.trim();
  if (teksUcapan) {
    if (!msg) {
      msg = document.createElement("p");
      msg.className = "polaroid__message";
      kaki.insertBefore(msg, kaki.firstChild);
    }
    msg.textContent = teksUcapan;
  } else if (msg) {
    msg.remove();
  }
}

// ------------------------------------------------------------
//  KEADAAN ZON GAMBAR
// ------------------------------------------------------------
//  Bar tindakan (#zon-tindakan-imej) TIDAK PERNAH tersorok — butang
//  "Ambil gambar" / "Galeri" sudah wujud dan boleh ditekan sebelum
//  sebarang gambar diambil. Yang berubah hanyalah: placeholder <-> preview,
//  label butang kamera, dan kehadiran butang "Buang".
// ------------------------------------------------------------
function kemasKiniKeadaanImej() {
  const ada = !!failDipilih;
  zonPilihFail.classList.toggle("hidden", ada);
  zonPreview.classList.toggle("hidden", !ada);
  butangBuang.classList.toggle("hidden", !ada);
  teksButangKamera.textContent = ada ? "Ambil semula" : "Ambil gambar";
}

// Kunci/buka semua kawalan tukar gambar (semasa menghantar)
function setKawalanImejDidayakan(boleh) {
  [zonPilihFail, butangKamera, butangGaleri, butangBuang].forEach((el) => {
    el.disabled = !boleh;
  });
}

// ------------------------------------------------------------
//  PENGENDALI: TERIMA FAIL (pilih kali pertama ATAU ambil semula)
// ------------------------------------------------------------
function terimaFail(fail) {
  // Pemilih fail OS mungkin sudah terbuka sebelum tetamu tekan Hantar;
  // butang yang disabled tidak menutupnya, jadi tolak di sini juga.
  if (sedangHantar) return;
  sorokStatus();

  // Validasi: mesti imej
  if (!fail.type.startsWith("image/")) {
    tunjukStatus("Sila pilih fail gambar sahaja (JPG, PNG, dll).", "gagal");
    return;
  }
  // Validasi: had saiz
  if (fail.size > SAIZ_FAIL_MAKS) {
    tunjukStatus(
      "Gambar terlalu besar (lebih 15MB). Sila pilih gambar lain.",
      "gagal"
    );
    return;
  }

  failDipilih = fail;
  paparPreview(fail);
  kemasKiniKeadaanImej();
}

// Buang gambar & kembali ke keadaan kosong (nama/ucapan dikekalkan)
function buangGambar() {
  if (urlPreview) {
    URL.revokeObjectURL(urlPreview);
    urlPreview = null;
  }
  failDipilih = null;
  zonPreview.innerHTML = "";
  inputKamera.value = "";
  inputGaleri.value = "";
  sorokStatus();
  kemasKiniKeadaanImej();
}

// Satu pengendali dikongsi kedua-dua input.
// e.target.value = "" WAJIB: tanpanya, memilih semula fail yang SAMA
// tidak mencetuskan `change` dan "ambil semula" nampak seperti rosak.
// Rujukan File kekal sah selepas value dikosongkan.
[inputKamera, inputGaleri].forEach((inp) => {
  inp.addEventListener("change", (e) => {
    const fail = e.target.files && e.target.files[0];
    e.target.value = "";
    if (fail) terimaFail(fail);
  });
});

// Butang yang SAMA diguna sebelum & selepas ada gambar
zonPilihFail.addEventListener("click", () => inputKamera.click());
butangKamera.addEventListener("click", () => inputKamera.click());
butangGaleri.addEventListener("click", () => inputGaleri.click());
butangBuang.addEventListener("click", buangGambar);

// Selaraskan keadaan awal (placeholder tunjuk, preview & butang buang sorok)
kemasKiniKeadaanImej();

// ------------------------------------------------------------
//  PENGENDALI: KAUNTER UCAPAN + KEMAS KINI PREVIEW
// ------------------------------------------------------------
inputUcapan.setAttribute("maxlength", String(HAD_UCAPAN));
inputUcapan.addEventListener("input", () => {
  kaunterUcapan.textContent = `${inputUcapan.value.length}/${HAD_UCAPAN}`;
  kemasKiniTeksPreview();
});
inputNama.addEventListener("input", kemasKiniTeksPreview);

// ------------------------------------------------------------
//  PENGENDALI: HANTAR BORANG
// ------------------------------------------------------------
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  sorokStatus();

  // Anti-spam: honeypot. Bot cenderung mengisi semua medan; medan ini
  // tersembunyi daripada manusia, jadi jika terisi -> anggap bot.
  if (inputHoneypot && inputHoneypot.value) {
    // Pura-pura berjaya tanpa menyimpan apa-apa
    form.classList.add("hidden");
    zonTerimaKasih.classList.remove("hidden");
    return;
  }

  // Validasi input pengguna DAHULU (nama & fail) supaya tetamu
  // dapat maklum balas yang tepat tentang apa yang perlu dibetulkan.
  const nama = inputNama.value.trim();
  if (!nama) {
    tunjukStatus("Sila isi nama anda dahulu.", "gagal");
    inputNama.focus();
    return;
  }
  // Validasi fail
  if (!failDipilih) {
    tunjukStatus("Sila pilih atau ambil gambar dahulu.", "gagal");
    return;
  }
  // Anti-spam: cooldown antara upload (halangan client, boleh dipintas)
  const terakhir = Number(localStorage.getItem(KUNCI_COOLDOWN) || 0);
  const baki = COOLDOWN_MS - (Date.now() - terakhir);
  if (terakhir && baki > 0) {
    tunjukStatus(
      `Terima kasih! Sila tunggu ${Math.ceil(baki / 1000)} saat sebelum hantar gambar seterusnya.`,
      "info"
    );
    return;
  }
  // Semak sambungan internet
  if (!navigator.onLine) {
    tunjukStatus(
      "Tiada sambungan internet. Sila semak talian anda dan cuba lagi.",
      "gagal"
    );
    return;
  }
  // Akhir sekali, pastikan sistem sudah dikonfigurasi (isu penyediaan)
  if (!configSiap()) {
    tunjukStatus(
      "Sistem belum dikonfigurasi. Sila hubungi penganjur majlis.",
      "gagal"
    );
    return;
  }

  const ucapan = inputUcapan.value.trim();

  // Masuk keadaan loading — kunci juga butang tukar gambar supaya
  // failDipilih tidak bertukar semasa compressImej() berjalan.
  sedangHantar = true;
  setKawalanImejDidayakan(false);
  butangHantar.disabled = true;
  butangHantar.dataset.teksAsal = butangHantar.textContent;
  butangHantar.textContent = "Sedang menghantar…";
  tunjukStatus("Memproses gambar…", "info");

  try {
    // 1) Compress adaptif -> satu gambar base64 (dijamin muat had dokumen Firestore)
    const blob = await compressImej(failDipilih);
    const imageUrl = await blobKeBase64(blob);

    // 2) Pra-moderasi kini per-majlis (medan pada dokumen events).
    const approved = majlis.preModeration !== true;

    // 3) Simpan gambar + naikkan kaunter majlis dalam SATU batch atomik.
    //    Firestore rules mewajibkan kaunter naik tepat +1 dan tidak
    //    melebihi photoLimit — inilah penguatkuasaan had pakej sebenar.
    tunjukStatus("Menyimpan gambar…", "info");
    const refFoto = doc(collection(db, "photos"));
    const batch = writeBatch(db);
    batch.set(refFoto, {
      name: nama,
      message: ucapan || null,
      image_url: imageUrl,
      approved,
      likes: 0,
      created_at: serverTimestamp(),
      eventId,
    });
    batch.update(doc(db, "events", eventId), { photoCount: increment(1) });
    await batch.commit();

    // Rekod masa untuk cooldown
    localStorage.setItem(KUNCI_COOLDOWN, String(Date.now()));

    // Berjaya!
    form.classList.add("hidden");
    zonPreview.classList.add("hidden");
    kotakStatus.classList.add("hidden");
    zonTerimaKasih.classList.remove("hidden");
    zonTerimaKasih.scrollIntoView({ behavior: "smooth", block: "center" });
  } catch (err) {
    console.error("Ralat upload:", err);
    // permission-denied bermakna rules menolak: kuota penuh, majlis
    // tamat tempoh, atau majlis dinyahaktifkan sejak halaman dibuka.
    if (err?.code === "permission-denied") {
      tunjukStatus(
        "Maaf, majlis ini sudah tidak menerima gambar baharu " +
          "(kuota penuh atau tempoh telah tamat).",
        "gagal"
      );
    } else {
      tunjukStatus(
        "Maaf, gambar gagal dihantar. Sila cuba lagi sebentar.",
        "gagal"
      );
    }
    sedangHantar = false;
    setKawalanImejDidayakan(true);
    butangHantar.disabled = false;
    butangHantar.textContent = butangHantar.dataset.teksAsal || "Hantar";
  }
});

// ------------------------------------------------------------
//  PENGENDALI: HANTAR LAGI (reset borang)
// ------------------------------------------------------------
const butangHantarLagi = document.getElementById("butang-hantar-lagi");
if (butangHantarLagi) {
  butangHantarLagi.addEventListener("click", () => {
    // Reset semua keadaan
    form.reset();
    buangGambar(); // kosongkan gambar + kembalikan placeholder & label butang
    kaunterUcapan.textContent = `0/${HAD_UCAPAN}`;
    sedangHantar = false;
    setKawalanImejDidayakan(true);
    butangHantar.disabled = false;
    butangHantar.textContent = butangHantar.dataset.teksAsal || "Hantar";

    zonTerimaKasih.classList.add("hidden");
    form.classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}
