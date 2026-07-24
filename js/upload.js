// ============================================================
//  LOGIK BORANG MUAT NAIK (pustaka boleh guna semula)
// ------------------------------------------------------------
//  Dahulu ini modul halaman index.html yang auto-jalan. Kini ia
//  sebuah PUSTAKA: borang muat naik hidup di dalam modal pada
//  halaman galeri (gallery.html), jadi logik dibungkus dalam
//  pasangBorangUpload() dan dipanggil oleh js/gallery.js.
//
//  - Validasi input (nama wajib, jenis & saiz fail)
//  - Anti-spam: cooldown (localStorage) + honeypot
//  - Compress ADAPTIF: satu gambar base64 disimpan dalam `photos.image_url`
//    (tiada Firebase Storage diperlukan)
//  - Autolulus: setiap gambar terus tampil (tiada pra-moderasi)
//  - Preview polaroid langsung sebelum hantar
//  - Ambil semula (retake) / tukar / buang gambar tanpa hilang teks
//  - Pada kejayaan: panggil onBerjaya(fotoBaru) supaya galeri boleh
//    memasukkan gambar baharu serta-merta (tanpa refresh).
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
import { majlisAktif, mesejMajlisTakBoleh } from "./majlis.js";
import { bolehUploadLagi, bakiGambar, tanpaHad } from "./gating.js";

pasangGayaPolaroid();

// --- Had & tetapan ---
const SAIZ_FAIL_MAKS = 15 * 1024 * 1024; // 15 MB sebelum compress
const HAD_UCAPAN = 120; // aksara
const COOLDOWN_MS = 45 * 1000; // jeda minimum antara upload (anti-spam)
const KUNCI_COOLDOWN = "polaroid_upload_terakhir"; // kunci localStorage

// ------------------------------------------------------------
//  PASANG BORANG MUAT NAIK
// ------------------------------------------------------------
//  opts:
//    - eventId : id majlis (untuk tulisan photos + kaunter)
//    - majlis  : dokumen events/{eventId} (untuk kelayakan + kuota)
//    - onBerjaya(foto): callback selepas hantar berjaya. `foto` =
//        { id, name, message, image_url, likes } — galeri guna untuk
//        masukkan gambar baharu di atas senarai serta-merta.
//
//  Pulangkan { boleh, sebab }:
//    - boleh=false + sebab (Bahasa Melayu) bila majlis tak sah/tamat/
//      penuh — pemanggil patut sembunyikan butang "Muat Naik".
//    - boleh=true bila borang berjaya dipasang.
// ------------------------------------------------------------
export function pasangBorangUpload({ eventId, majlis, onBerjaya } = {}) {
  // --- Kelayakan dahulu: jika majlis tak boleh terima gambar, jangan
  //     pasang borang langsung. Pemanggil (galeri) sembunyi butang. ---
  if (!eventId || !majlis) {
    return { boleh: false, sebab: "Majlis tidak dijumpai." };
  }
  if (!majlisAktif(majlis)) {
    return { boleh: false, sebab: mesejMajlisTakBoleh(majlis) };
  }
  if (!bolehUploadLagi(majlis)) {
    return {
      boleh: false,
      sebab:
        "Ruang gambar untuk majlis ini sudah penuh. Terima kasih kerana berkongsi detik indah bersama! 💛",
    };
  }

  // --- Rujukan elemen DOM (dalam modal #modal-upload pada gallery.html) ---
  const form = document.getElementById("form-upload");
  if (!form) return { boleh: false, sebab: "Borang tidak dijumpai." };

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
  const inputHoneypot = document.getElementById("input-web"); // perangkap bot
  const bakiKuota = document.getElementById("baki-kuota");

  // Simpan fail asal yang dipilih pengguna
  let failDipilih = null;
  // URL objek preview semasa — di-revoke bila gambar ditukar/dibuang.
  let urlPreview = null;
  // Benar semasa proses hantar berjalan — kunci butang tukar gambar.
  let sedangHantar = false;

  // ----------------------------------------------------------
  //  PAPAR BAKI KUOTA (hanya pakej berhad, cth Basic)
  // ----------------------------------------------------------
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

  // ----------------------------------------------------------
  //  UTILITI STATUS / MESEJ
  // ----------------------------------------------------------
  function tunjukStatus(mesej, jenis = "info") {
    kotakStatus.textContent = mesej;
    kotakStatus.className = "kotak-status kotak-status--" + jenis;
    kotakStatus.classList.remove("hidden");
  }
  function sorokStatus() {
    kotakStatus.classList.add("hidden");
  }

  // ----------------------------------------------------------
  //  PAPAR PREVIEW POLAROID
  // ----------------------------------------------------------
  function paparPreview(fail) {
    // Lepaskan blob preview lama dahulu supaya tiada blob tergantung.
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

  // Lepaskan blob terakhir bila halaman ditutup (bukan bfcache).
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

  // ----------------------------------------------------------
  //  KEADAAN ZON GAMBAR
  // ----------------------------------------------------------
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

  // ----------------------------------------------------------
  //  PENGENDALI: TERIMA FAIL (pilih kali pertama ATAU ambil semula)
  // ----------------------------------------------------------
  function terimaFail(fail) {
    if (sedangHantar) return;
    sorokStatus();

    if (!fail.type.startsWith("image/")) {
      tunjukStatus("Sila pilih fail gambar sahaja (JPG, PNG, dll).", "gagal");
      return;
    }
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

  // Satu pengendali dikongsi kedua-dua input. value="" WAJIB supaya
  // memilih semula fail yang SAMA masih mencetuskan `change`.
  [inputKamera, inputGaleri].forEach((inp) => {
    inp.addEventListener("change", (e) => {
      const fail = e.target.files && e.target.files[0];
      e.target.value = "";
      if (fail) terimaFail(fail);
    });
  });

  zonPilihFail.addEventListener("click", () => inputKamera.click());
  butangKamera.addEventListener("click", () => inputKamera.click());
  butangGaleri.addEventListener("click", () => inputGaleri.click());
  butangBuang.addEventListener("click", buangGambar);

  // Selaraskan keadaan awal
  kemasKiniKeadaanImej();

  // ----------------------------------------------------------
  //  PENGENDALI: KAUNTER UCAPAN + KEMAS KINI PREVIEW
  // ----------------------------------------------------------
  inputUcapan.setAttribute("maxlength", String(HAD_UCAPAN));
  inputUcapan.addEventListener("input", () => {
    kaunterUcapan.textContent = `${inputUcapan.value.length}/${HAD_UCAPAN}`;
    kemasKiniTeksPreview();
  });
  inputNama.addEventListener("input", kemasKiniTeksPreview);

  // ----------------------------------------------------------
  //  PENGENDALI: HANTAR BORANG
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

    // Validasi input pengguna DAHULU (nama & fail).
    const nama = inputNama.value.trim();
    if (!nama) {
      tunjukStatus("Sila isi nama anda dahulu.", "gagal");
      inputNama.focus();
      return;
    }
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
    if (!navigator.onLine) {
      tunjukStatus(
        "Tiada sambungan internet. Sila semak talian anda dan cuba lagi.",
        "gagal"
      );
      return;
    }
    if (!configSiap()) {
      tunjukStatus(
        "Sistem belum dikonfigurasi. Sila hubungi penganjur majlis.",
        "gagal"
      );
      return;
    }

    const ucapan = inputUcapan.value.trim();

    // Masuk keadaan loading — kunci butang tukar gambar juga.
    sedangHantar = true;
    setKawalanImejDidayakan(false);
    butangHantar.disabled = true;
    butangHantar.dataset.teksAsal = butangHantar.textContent;
    butangHantar.textContent = "Sedang menghantar…";
    tunjukStatus("Memproses gambar…", "info");

    try {
      // 1) Compress adaptif -> satu gambar base64
      const blob = await compressImej(failDipilih);
      const imageUrl = await blobKeBase64(blob);

      // 2) Autolulus: semua gambar terus tampil (tiada pra-moderasi).
      const approved = true;

      // 3) Simpan gambar + naikkan kaunter majlis dalam SATU batch atomik.
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

      // Masukkan gambar baharu ke galeri serta-merta (tanpa refresh).
      if (typeof onBerjaya === "function") {
        onBerjaya({
          id: refFoto.id,
          name: nama,
          message: ucapan || "",
          image_url: imageUrl,
          likes: 0,
        });
      }

      // Berjaya!
      form.classList.add("hidden");
      zonPreview.classList.add("hidden");
      kotakStatus.classList.add("hidden");
      zonTerimaKasih.classList.remove("hidden");
    } catch (err) {
      console.error("Ralat upload:", err);
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

  // ----------------------------------------------------------
  //  PENGENDALI: HANTAR LAGI (reset borang, kekal dalam modal)
  // ----------------------------------------------------------
  const butangHantarLagi = document.getElementById("butang-hantar-lagi");
  if (butangHantarLagi) {
    butangHantarLagi.addEventListener("click", () => {
      form.reset();
      buangGambar();
      kaunterUcapan.textContent = `0/${HAD_UCAPAN}`;
      sedangHantar = false;
      setKawalanImejDidayakan(true);
      butangHantar.disabled = false;
      butangHantar.textContent = butangHantar.dataset.teksAsal || "Hantar";

      zonTerimaKasih.classList.add("hidden");
      form.classList.remove("hidden");
    });
  }

  return { boleh: true, sebab: "" };
}
