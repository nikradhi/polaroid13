// ============================================================
//  PHOTOBOOTH 3-SYOT (pustaka boleh guna semula)
// ------------------------------------------------------------
//  Kamera langsung dalam browser (getUserMedia) -> kira detik
//  3-2-1 -> 3 syot berturut-turut -> digabung jadi SATU jalur
//  menegak bergaya photobooth klasik, dengan nama pasangan &
//  tarikh majlis tercetak di kaki jalur.
//
//  Jalur dihantar sebagai SATU gambar biasa ke koleksi `photos`
//  melalui js/hantar-foto.js — laluan tulis yang SAMA dengan
//  muat naik biasa (kunci cooldown & batch atomik dikongsi).
//
//  KUOTA: jalur 480x1480 dimampat ke ~45KB -> base64 ~59 KiB
//  tersimpan, iaitu LEBIH KECIL daripada gambar biasa (~78 KiB)
//  walaupun mengandungi tiga syot. Lihat imej.js SASARAN_JALUR.
//
//  Ciri ini dikunci kepada pakej Premium & Eksklusif melalui
//  bolehGuna(majlis, "photobooth") — corak sama seperti liveWall.
// ============================================================

import { compressImej, LEBAR_JALUR, SASARAN_JALUR } from "./imej.js";
import { formatTarikhMajlis } from "./majlis.js";
import { bolehGuna, bakiGambar, tanpaHad } from "./gating.js";
import {
  HAD_UCAPAN,
  semakKelayakanMajlis,
  bakiCooldown,
  semakBolehHantar,
  hantarFoto,
  mesejRalatHantar,
} from "./hantar-foto.js";

// --- Geometri jalur (semua dalam piksel) ---
const BIL_SYOT = 3;
const PADDING = 16; // bingkai putih kiri/kanan/atas
const JURANG = 10; // jarak antara syot
const TINGGI_KAKI = 100; // ruang nama + tarikh di bawah
const SISI_FOTO = LEBAR_JALUR - PADDING * 2; // 448 — syot PERSEGI
const TINGGI_JALUR =
  PADDING + BIL_SYOT * SISI_FOTO + (BIL_SYOT - 1) * JURANG + TINGGI_KAKI; // 1480

// --- Masa turutan kira detik (ms) ---
const MS_SESAAT = 1000;
const MS_SENYUM = 450;
const MS_KILAT = 220;
const MS_ANTARA_SYOT = 1100;

const WARNA_KERTAS = "#fffdf9"; // sepadan --warna-kad lalai
const WARNA_TEKS = "#4a3f3a";
const WARNA_TARIKH = "#9a6a5a";

// ------------------------------------------------------------
//  PASANG PHOTOBOOTH
// ------------------------------------------------------------
//  opts sama seperti pasangBorangUpload():
//    - eventId, majlis, onBerjaya(foto)
//
//  Pulangkan { boleh, sebab, tutup }:
//    - boleh=false + sebab bila majlis tak layak / pakej tak
//      menyokong / pelayar tiada kamera — pemanggil sembunyi butang.
//    - tutup: fungsi pembersihan (hentikan kamera). Pemanggil WAJIB
//      panggil bila modal ditutup, jika tidak lampu kamera kekal menyala.
// ------------------------------------------------------------
export function pasangPhotobooth({ eventId, majlis, onBerjaya } = {}) {
  // --- Gate 1: majlis layak terima gambar? ---
  const kelayakan = semakKelayakanMajlis({ eventId, majlis });
  if (!kelayakan.boleh) return { ...kelayakan, tutup: () => {} };

  // --- Gate 2: pakej menyokong photobooth? (Premium & Eksklusif) ---
  if (!bolehGuna(majlis, "photobooth")) {
    return {
      boleh: false,
      sebab: "Photobooth tersedia dalam pakej Premium ✨",
      tutup: () => {},
    };
  }

  // --- Gate 3: pelayar menyokong kamera langsung? ---
  //  navigator.mediaDevices ialah undefined pada origin TIDAK selamat
  //  (http:// bukan localhost), jadi semakan ini turut menangkap kes itu.
  if (!navigator.mediaDevices?.getUserMedia) {
    return {
      boleh: false,
      sebab: "Pelayar ini tidak menyokong kamera langsung.",
      tutup: () => {},
    };
  }

  const form = document.getElementById("pb-form");
  if (!form) {
    return { boleh: false, sebab: "Borang photobooth tidak dijumpai.", tutup: () => {} };
  }

  // --- Rujukan DOM ---
  const zonKamera = document.getElementById("pb-zon-kamera");
  const video = document.getElementById("pb-video");
  const kiraan = document.getElementById("pb-kiraan");
  const kilat = document.getElementById("pb-kilat");
  const penandaSyot = document.getElementById("pb-penanda-syot");
  const zonPratonton = document.getElementById("pb-zon-pratonton");
  const zonKawalan = document.getElementById("pb-zon-kawalan");
  const butangMula = document.getElementById("pb-butang-mula");
  const butangTukarKamera = document.getElementById("pb-butang-tukar-kamera");
  const butangUlang = document.getElementById("pb-butang-ulang");
  const inputNama = document.getElementById("pb-input-nama");
  const inputUcapan = document.getElementById("pb-input-ucapan");
  const kaunterUcapan = document.getElementById("pb-kaunter-ucapan");
  const inputHoneypot = document.getElementById("pb-input-web");
  const kotakStatus = document.getElementById("pb-kotak-status");
  const butangHantar = document.getElementById("pb-butang-hantar");
  const zonTerimaKasih = document.getElementById("pb-zon-terima-kasih");
  const bakiKuota = document.getElementById("pb-baki-kuota");

  // --- Keadaan modul ---
  let strim = null; // MediaStream aktif
  let arahKamera = "user"; // "user" (selfie) | "environment" (belakang)
  let syot = []; // canvas setiap syot
  let blobJalur = null; // jalur siap, sudah dimampat
  let urlPratonton = null; // objectURL pratonton — di-revoke bila diganti
  let sedangSyot = false;
  let sedangHantar = false;
  let dibatalkan = false; // diset bila modal ditutup di tengah sesi

  const namaPasangan = (majlis?.coupleName || "Majlis Kami").trim();
  const tarikhTeks = formatTarikhMajlis(majlis?.weddingDate || "");

  // ----------------------------------------------------------
  //  UTILITI
  // ----------------------------------------------------------
  const jeda = (ms) => new Promise((r) => setTimeout(r, ms));

  function tunjukStatus(mesej, jenis = "info") {
    kotakStatus.textContent = mesej;
    kotakStatus.className = "kotak-status kotak-status--" + jenis;
    kotakStatus.classList.remove("hidden");
  }
  function sorokStatus() {
    kotakStatus.classList.add("hidden");
  }

  function setKiraan(teks, kecil = false) {
    kiraan.textContent = teks;
    kiraan.classList.toggle("kecil", kecil);
  }

  function setPenanda(bil) {
    [...penandaSyot.children].forEach((s, i) => {
      s.classList.toggle("siap", i < bil);
    });
  }

  function paparBakiKuota(ev) {
    if (!bakiKuota) return;
    if (tanpaHad(ev)) {
      bakiKuota.classList.add("hidden");
      return;
    }
    const baki = bakiGambar(ev);
    const rendah = baki <= 20;
    bakiKuota.textContent = rendah
      ? `📸 Tinggal ${baki} ruang gambar lagi — jangan lepaskan peluang!`
      : `📸 Baki ruang gambar: ${baki}`;
    bakiKuota.className =
      "rounded-xl px-4 py-2.5 text-sm text-center " +
      (rendah
        ? "bg-[#fdf1e7] text-[#8a5a3a]"
        : "bg-[color:var(--tema-lembut,#f6ece6)] text-[color:var(--warna-teks-lembut,#8a7a70)]");
  }
  paparBakiKuota(majlis);

  // Warna tema untuk hiasan kaki jalur. Baca --warna-utama (hex literal),
  // BUKAN --tema: --tema ditakrif sebagai var(--warna-utama) dan
  // penyelesaian var() dalam custom property tak konsisten pada pelayar lama.
  function warnaTema() {
    const g = getComputedStyle(document.documentElement);
    return (g.getPropertyValue("--warna-utama") || "").trim() || "#b08968";
  }

  // Font kanvas WAJIB dipanaskan dahulu: ctx.fillText() TIDAK menunggu
  // font dimuat, ia jatuh senyap ke `cursive` (Comic Sans pada Windows).
  async function muatFontTangan() {
    try {
      await Promise.all([
        document.fonts.load('600 36px "Caveat"'),
        document.fonts.load('500 20px "Caveat"'),
      ]);
      await document.fonts.ready;
    } catch {
      /* jatuh ke cursive — masih boleh dibaca */
    }
  }
  muatFontTangan();

  // ----------------------------------------------------------
  //  KITARAN HAYAT KAMERA
  // ----------------------------------------------------------
  function hentikanKamera() {
    if (strim) {
      strim.getTracks().forEach((t) => t.stop());
      strim = null;
    }
    if (video) video.srcObject = null;
  }

  function mesejRalatKamera(err) {
    switch (err?.name) {
      case "NotAllowedError":
      case "SecurityError":
        return (
          "Kebenaran kamera ditolak. Benarkan akses kamera dalam tetapan " +
          "pelayar, atau guna butang 📷 Gambar untuk muat naik gambar biasa."
        );
      case "NotFoundError":
      case "DevicesNotFoundError":
      case "OverconstrainedError":
        return "Tiada kamera dijumpai pada peranti ini. Sila guna butang 📷 Gambar.";
      case "NotReadableError":
      case "TrackStartError":
        return "Kamera sedang digunakan oleh aplikasi lain. Tutup aplikasi itu dan cuba lagi.";
      default:
        return "Kamera tidak dapat dibuka. Sila cuba lagi, atau guna butang 📷 Gambar.";
    }
  }

  async function mulaKamera() {
    hentikanKamera();
    strim = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: arahKamera,
        width: { ideal: 1280 },
        height: { ideal: 1280 },
      },
      audio: false,
    });
    video.srcObject = strim;
    // Set dalam JS juga — sesetengah versi WKWebView abaikan atribut HTML.
    video.playsInline = true;
    video.muted = true;
    video.classList.toggle("mencermin", arahKamera === "user");
    await video.play();
  }

  async function tukarKamera() {
    if (sedangSyot || sedangHantar) return;
    const arahLama = arahKamera;
    arahKamera = arahKamera === "user" ? "environment" : "user";
    try {
      await mulaKamera();
      sorokStatus();
    } catch (err) {
      // Gagal (cth. laptop tiada kamera belakang) — pulihkan strim asal.
      arahKamera = arahLama;
      try {
        await mulaKamera();
      } catch {
        /* sudah tiada apa nak dipulihkan */
      }
      tunjukStatus("Tiada kamera lain dijumpai pada peranti ini.", "gagal");
    }
  }

  // ----------------------------------------------------------
  //  AMBIL SATU SYOT — potong tengah PERSEGI
  // ------------------------------------------------------------
  //  Potongan persegi menjadikan jalur IDENTIK sama ada video
  //  datang landskap (desktop 1280x720) atau potret (telefon).
  // ----------------------------------------------------------
  function ambilSyot() {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const sisi = Math.min(vw, vh);
    const sx = (vw - sisi) / 2;
    const sy = (vh - sisi) / 2;

    const k = document.createElement("canvas");
    k.width = SISI_FOTO;
    k.height = SISI_FOTO;
    const c = k.getContext("2d");
    // Selfie: cermin imej TERSIMPAN juga, bukan pratonton sahaja —
    // itu yang tetamu lihat semasa berpose.
    if (arahKamera === "user") {
      c.translate(SISI_FOTO, 0);
      c.scale(-1, 1);
    }
    c.drawImage(video, sx, sy, sisi, sisi, 0, 0, SISI_FOTO, SISI_FOTO);
    return k;
  }

  async function kilatkan() {
    kilat.classList.add("nyala");
    await jeda(60);
    kilat.classList.remove("nyala");
    await jeda(MS_KILAT);
  }

  // ----------------------------------------------------------
  //  BINA JALUR — komposit 3 syot + kaki
  // ----------------------------------------------------------
  // Tetapkan font terbesar yang masih muat, dan PENDEKKAN teks dengan "…"
  // jika ia masih terkeluar pada saiz minimum. Wajib: coupleName boleh
  // sampai 80 aksara (maxlength pada tetapan.html) — mengecilkan font
  // sahaja tidak mencukupi, nama panjang tetap terkeluar tepi jalur.
  // Pulangkan teks yang patut dilukis (asal atau sudah dipendekkan).
  const SAIZ_MIN_FONT = 16;
  function teksMuat(c, teks, lebarMaks, saizMula, berat) {
    for (let saiz = saizMula; saiz >= SAIZ_MIN_FONT; saiz -= 2) {
      c.font = `${berat} ${saiz}px "Caveat", cursive`;
      if (c.measureText(teks).width <= lebarMaks) return teks;
    }
    // Font sudah sekecil mungkin — potong sehingga muat bersama "…"
    let potong = teks;
    while (potong.length > 1 && c.measureText(potong + "…").width > lebarMaks) {
      potong = potong.slice(0, -1);
    }
    return potong.trimEnd() + "…";
  }

  function lukisKaki(c, yKaki) {
    const tengah = LEBAR_JALUR / 2;
    const warna = warnaTema();
    c.textAlign = "center";
    c.textBaseline = "alphabetic";

    // Hiasan garis — ♥ — garis (cerminan .hiasan-pemisah pada galeri)
    c.strokeStyle = warna;
    c.lineWidth = 1.4;
    c.beginPath();
    c.moveTo(tengah - 78, yKaki + 20);
    c.lineTo(tengah - 20, yKaki + 20);
    c.moveTo(tengah + 20, yKaki + 20);
    c.lineTo(tengah + 78, yKaki + 20);
    c.stroke();
    c.fillStyle = warna;
    c.font = "14px serif";
    c.fillText("♥", tengah, yKaki + 25);

    const lebarTeksMaks = LEBAR_JALUR - PADDING * 2 - 16;

    // Nama pasangan — kecutkan (dan pendekkan) supaya tak terkeluar tepi
    c.fillStyle = WARNA_TEKS;
    const namaLukis = teksMuat(c, namaPasangan, lebarTeksMaks, 36, "600");
    // Tiada tarikh -> turunkan sedikit supaya kaki tidak berat sebelah
    c.fillText(namaLukis, tengah, yKaki + (tarikhTeks ? 62 : 72));

    if (tarikhTeks) {
      // formatTarikhMajlis() pulangkan teks asal bila format bukan
      // yyyy-mm-dd, jadi tarikh pun perlu dijaga daripada terkeluar.
      c.fillStyle = WARNA_TARIKH;
      const tarikhLukis = teksMuat(c, tarikhTeks, lebarTeksMaks, 20, "500");
      c.fillText(tarikhLukis, tengah, yKaki + 90);
    }
  }

  async function binaJalur() {
    const k = document.createElement("canvas");
    k.width = LEBAR_JALUR;
    k.height = TINGGI_JALUR;
    const c = k.getContext("2d");

    c.fillStyle = WARNA_KERTAS;
    c.fillRect(0, 0, LEBAR_JALUR, TINGGI_JALUR);
    for (let i = 0; i < BIL_SYOT; i++) {
      c.drawImage(syot[i], PADDING, PADDING + i * (SISI_FOTO + JURANG));
    }
    lukisKaki(c, PADDING + BIL_SYOT * SISI_FOTO + (BIL_SYOT - 1) * JURANG);

    // JPEG q0.95 sebagai perantaraan, BUKAN WebP: canvas.toBlob(…,"image/webp")
    // diam-diam pulangkan PNG pada pelayar tanpa sokongan (PNG 0.71 MP ≈ 2 MB).
    const mentah = await new Promise((r) => k.toBlob(r, "image/jpeg", 0.95));

    let blob = await compressImej(mentah, {
      lebarMaks: LEBAR_JALUR,
      sasaranBait: SASARAN_JALUR,
    });
    // Tangga lebar compressImej menyusut kepada SATU nilai bila lebarMaks<=480
    // (lihat lebarCubaan dalam imej.js), jadi kualiti boleh sampai dasar tanpa
    // jalur pernah mengecil. Kecilkan lebar sendiri sebagai pusingan kedua.
    if (blob.size > SASARAN_JALUR * 1.35) {
      blob = await compressImej(mentah, {
        lebarMaks: 400,
        sasaranBait: SASARAN_JALUR,
      });
    }
    return blob;
  }

  function paparJalur(blob) {
    if (urlPratonton) URL.revokeObjectURL(urlPratonton);
    urlPratonton = URL.createObjectURL(blob);
    zonPratonton.innerHTML = "";
    const img = document.createElement("img");
    img.src = urlPratonton;
    img.alt = "Jalur photobooth anda";
    zonPratonton.appendChild(img);
  }

  // ----------------------------------------------------------
  //  SESI SYOT — 3 kali kira detik
  // ----------------------------------------------------------
  async function mulaSesiSyot() {
    if (sedangSyot) return;
    sorokStatus();
    dibatalkan = false;
    syot = [];
    blobJalur = null;
    setPenanda(0);

    // Kamera dimulakan HANYA di sini (gerak isyarat pengguna) — gesaan
    // kebenaran iOS memerlukannya, dan lampu kamera tak menyala tanpa niat.
    try {
      butangMula.disabled = true;
      setKiraan("Membuka kamera…", true);
      await mulaKamera();
    } catch (err) {
      butangMula.disabled = false;
      setKiraan("");
      tunjukStatus(mesejRalatKamera(err), "gagal");
      return;
    }

    sedangSyot = true;
    butangTukarKamera.disabled = true;
    zonPratonton.classList.add("hidden");
    butangUlang.classList.add("hidden");

    try {
      for (let i = 0; i < BIL_SYOT; i++) {
        for (let s = 3; s >= 1; s--) {
          if (dibatalkan) return;
          setKiraan(String(s));
          await jeda(MS_SESAAT);
        }
        if (dibatalkan) return;
        setKiraan("SENYUM! 😄", true);
        await jeda(MS_SENYUM);
        if (dibatalkan) return;

        await kilatkan();
        if (dibatalkan) return;
        syot.push(ambilSyot());
        setPenanda(syot.length);

        if (i < BIL_SYOT - 1) {
          setKiraan(`Syot ${i + 1} daripada ${BIL_SYOT} siap`, true);
          await jeda(MS_ANTARA_SYOT);
        }
      }

      // Kamera tidak diperlukan lagi — padamkan lampu SERTA-MERTA
      // supaya tetamu nampak ia mati semasa mereka menaip nama.
      hentikanKamera();
      setKiraan("");

      setKiraan("Menyusun jalur…", true);
      blobJalur = await binaJalur();
      if (dibatalkan) return;
      setKiraan("");
      paparJalur(blobJalur);

      zonKamera.classList.add("hidden");
      zonPratonton.classList.remove("hidden");
      zonKawalan.classList.add("hidden");
      butangUlang.classList.remove("hidden");
      butangHantar.disabled = false;
      tunjukStatus("Jalur anda siap! Isi nama anda dan hantar.", "berjaya");
      inputNama.focus();
    } finally {
      sedangSyot = false;
      butangMula.disabled = false;
      butangTukarKamera.disabled = false;
      if (dibatalkan) hentikanKamera();
    }
  }

  // Reset penuh ke keadaan "belum mula"
  function ulangSesi() {
    dibatalkan = true; // putuskan mana-mana gelung yang masih berjalan
    hentikanKamera();
    if (urlPratonton) {
      URL.revokeObjectURL(urlPratonton);
      urlPratonton = null;
    }
    syot = [];
    blobJalur = null;
    zonPratonton.innerHTML = "";
    zonPratonton.classList.add("hidden");
    zonKamera.classList.remove("hidden");
    zonKawalan.classList.remove("hidden");
    butangUlang.classList.add("hidden");
    butangHantar.disabled = true;
    setKiraan("");
    setPenanda(0);
    sorokStatus();
  }

  // ----------------------------------------------------------
  //  PENGENDALI
  // ----------------------------------------------------------
  butangMula.addEventListener("click", mulaSesiSyot);
  butangTukarKamera.addEventListener("click", tukarKamera);
  butangUlang.addEventListener("click", ulangSesi);

  inputUcapan.setAttribute("maxlength", String(HAD_UCAPAN));
  inputUcapan.addEventListener("input", () => {
    kaunterUcapan.textContent = `${inputUcapan.value.length}/${HAD_UCAPAN}`;
  });

  // Lampu kamera WAJIB padam bila halaman ditinggalkan. pagehide meliputi
  // bfcache juga — trek kamera tidak dipulihkan oleh bfcache.
  window.addEventListener("pagehide", hentikanKamera);

  // ----------------------------------------------------------
  //  HANTAR
  // ----------------------------------------------------------
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    sorokStatus();

    // Anti-spam: honeypot. Jika terisi -> anggap bot, pura-pura berjaya.
    if (inputHoneypot && inputHoneypot.value) {
      form.classList.add("hidden");
      zonTerimaKasih.classList.remove("hidden");
      return;
    }

    const nama = inputNama.value.trim();
    if (!nama) {
      tunjukStatus("Sila isi nama anda dahulu.", "gagal");
      inputNama.focus();
      return;
    }
    if (!blobJalur) {
      tunjukStatus("Sila ambil jalur photobooth dahulu.", "gagal");
      return;
    }
    // Cooldown DIKONGSI dengan muat naik biasa — kunci localStorage sama.
    const bakiSaat = bakiCooldown();
    if (bakiSaat > 0) {
      tunjukStatus(
        `Terima kasih! Sila tunggu ${bakiSaat} saat sebelum hantar gambar seterusnya.`,
        "info"
      );
      return;
    }
    const bolehHantar = semakBolehHantar();
    if (!bolehHantar.boleh) {
      tunjukStatus(bolehHantar.sebab, "gagal");
      return;
    }

    const ucapan = inputUcapan.value.trim();

    sedangHantar = true;
    butangUlang.disabled = true;
    butangHantar.disabled = true;
    butangHantar.dataset.teksAsal = butangHantar.textContent;
    butangHantar.textContent = "Sedang menghantar…";
    tunjukStatus("Menyimpan gambar…", "info");

    try {
      const foto = await hantarFoto({ eventId, nama, ucapan, blob: blobJalur });
      if (typeof onBerjaya === "function") onBerjaya(foto);

      form.classList.add("hidden");
      kotakStatus.classList.add("hidden");
      zonTerimaKasih.classList.remove("hidden");
    } catch (err) {
      console.error("Ralat photobooth:", err);
      tunjukStatus(mesejRalatHantar(err), "gagal");
      butangHantar.disabled = false;
      butangHantar.textContent = butangHantar.dataset.teksAsal || "Hantar Jalur";
    } finally {
      sedangHantar = false;
      butangUlang.disabled = false;
    }
  });

  // "Buat Jalur Lagi" — kembali ke borang kosong, kekal dalam modal
  const butangUlangSesi = document.getElementById("pb-butang-ulang-sesi");
  if (butangUlangSesi) {
    butangUlangSesi.addEventListener("click", () => {
      form.reset();
      kaunterUcapan.textContent = `0/${HAD_UCAPAN}`;
      butangHantar.textContent = butangHantar.dataset.teksAsal || "Hantar Jalur";
      ulangSesi();
      zonTerimaKasih.classList.add("hidden");
      form.classList.remove("hidden");
    });
  }

  return {
    boleh: true,
    sebab: "",
    // Dipanggil oleh galeri bila modal ditutup — WAJIB, jika tidak
    // lampu kamera kekal menyala selepas tetamu tutup modal.
    tutup: ulangSesi,
  };
}
