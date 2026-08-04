// ============================================================
//  BUKU TETAMU DIGITAL (guestbook) — ucapan TANPA gambar
// ------------------------------------------------------------
//  Ciri berbayar: Premium & Eksklusif sahaja (flag "guestbook"
//  dalam js/packages.js). Gating di sini hanya menyembunyikan UI —
//  penguatkuasa sebenar ialah ciriGuestbook() dalam firestore.rules.
//
//  KENAPA KOLEKSI BERASINGAN, bukan photos tanpa imej:
//  rules `photos` menuntut image_url tidak kosong DAN kaunter
//  events.photoCount naik +1 dalam commit yang sama. Ucapan teks
//  tidak memakan kuota gambar, jadi ia tidak sepatutnya menolak
//  kaunter itu. Sebab itu laluan tulis di sini ialah addDoc biasa
//  dan BUKAN hantarFoto() / writeBatch dalam js/hantar-foto.js.
//
//  Modul ini DOM-aware (ia memasang borang dalam #modal-guestbook)
//  tetapi tidak tahu apa-apa tentang tab galeri — js/gallery.js yang
//  memanggil dan memaparkan hasilnya.
// ============================================================

import {
  db,
  collection,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  configSiap,
} from "./firebase.js";
import { majlisAktif, mesejMajlisTakBoleh } from "./majlis.js";
import { bolehGuna, mesejNaikTaraf } from "./gating.js";

// Had aksara. Lebih panjang daripada HAD_UCAPAN (120) milik kapsyen
// foto: di sini ucapan ITU kandungan utama, bukan nota kaki gambar.
// Nilai ini MESTI sama dengan had dalam firestore.rules, jika tidak
// tetamu nampak borang menerima teks yang server akan tolak.
export const HAD_UCAPAN_GB = 300;
export const HAD_NAMA_GB = 60;

// Berapa banyak ucapan dibaca sekali. Dokumen teks ~200 bait, jadi
// 100 ucapan ≈ 20 KB — jauh lebih murah daripada satu gambar base64.
const HAD_MUAT = 100;

// ------------------------------------------------------------
//  BACA UCAPAN
// ------------------------------------------------------------
//  Terbaru dahulu, yang diluluskan sahaja. Tiada penomboran:
//  pada skala majlis, satu query memadai.
//
//  Pulangkan { senarai, ralat } — ralat ialah teks Bahasa Melayu
//  siap dipapar, atau null. Tidak melontar (throw) supaya tab
//  guestbook yang gagal tidak merosakkan galeri gambar.
// ------------------------------------------------------------
export async function muatUcapan(eventId) {
  if (!eventId || !configSiap()) {
    return { senarai: [], ralat: "Sistem belum dikonfigurasi." };
  }
  try {
    const snap = await getDocs(
      query(
        collection(db, "guestbook"),
        where("eventId", "==", eventId),
        where("approved", "==", true),
        orderBy("created_at", "desc"),
        limit(HAD_MUAT)
      )
    );
    const senarai = [];
    snap.forEach((d) => {
      const u = d.data();
      senarai.push({ id: d.id, name: u.name || "Tetamu", message: u.message || "" });
    });
    return { senarai, ralat: null };
  } catch (err) {
    console.error("Ralat memuat ucapan:", err);
    // Sama seperti galeri gambar: indeks komposit yang belum dicipta
    // ialah kegagalan paling biasa kali pertama, dan pautan ciptanya
    // hanya kelihatan dalam console pelayar.
    const teks = String(err?.message || "");
    if (teks.includes("index")) {
      return {
        senarai: [],
        ralat:
          "Indeks Firestore untuk ucapan belum dicipta. Buka Console pelayar (F12) " +
          "dan klik pautan 'Create index' yang dipaparkan Firestore.",
      };
    }
    return { senarai: [], ralat: "Gagal memuat ucapan. Sila muat semula halaman." };
  }
}

// ------------------------------------------------------------
//  KAD UCAPAN
// ------------------------------------------------------------
//  Kad teks, bukan polaroid — tiada gambar untuk dibingkai.
//  textContent SAHAJA: nama & mesej ialah teks tetamu yang tidak
//  ditapis di server. Jangan sekali-kali tukar kepada innerHTML.
// ------------------------------------------------------------
export function binaKadUcapan({ name, message }) {
  const kad = document.createElement("article");
  kad.className = "kad-ucapan";

  const teks = document.createElement("p");
  teks.className = "kad-ucapan__mesej";
  teks.textContent = message || "";

  const nama = document.createElement("p");
  nama.className = "kad-ucapan__nama";
  nama.textContent = name || "Tetamu";

  kad.append(teks, nama);
  return kad;
}

// ------------------------------------------------------------
//  PASANG BORANG UCAPAN
// ------------------------------------------------------------
//  opts:
//    - eventId : id majlis
//    - majlis  : dokumen events/{eventId}
//    - onBerjaya(ucapan): dipanggil selepas hantar berjaya dengan
//        { id, name, message } supaya galeri boleh sisip kad baharu
//        serta-merta tanpa muat semula.
//
//  Pulangkan { boleh, sebab } — bentuk yang sama dengan
//  pasangPhotobooth() supaya gallery.js boleh sembunyikan butang
//  tanpa perlu tahu sebabnya.
// ------------------------------------------------------------
export function pasangGuestbook({ eventId, majlis, onBerjaya } = {}) {
  // --- Gate 1: majlis masih menerima kiriman? ---
  // Sengaja TIDAK guna semakKelayakanMajlis() daripada hantar-foto.js:
  // fungsi itu turut menyemak kuota gambar (bolehUploadLagi), dan
  // ucapan teks tidak memakan kuota itu. Majlis yang penuh gambar
  // masih patut boleh terima ucapan.
  if (!eventId || !majlisAktif(majlis)) {
    return { boleh: false, sebab: mesejMajlisTakBoleh(majlis) };
  }

  // --- Gate 2: pakej membuka ciri guestbook? (Premium & Eksklusif) ---
  if (!bolehGuna(majlis, "guestbook")) {
    return { boleh: false, sebab: mesejNaikTaraf("guestbook") };
  }

  // --- Gate 3: borang wujud pada halaman ini? ---
  const form = document.getElementById("gb-form");
  if (!form) return { boleh: false, sebab: "Borang ucapan tidak dijumpai." };

  const inputNama = document.getElementById("gb-input-nama");
  const inputUcapan = document.getElementById("gb-input-ucapan");
  const kaunter = document.getElementById("gb-kaunter");
  const kotakStatus = document.getElementById("gb-kotak-status");
  const butangHantar = document.getElementById("gb-butang-hantar");
  const zonTerimaKasih = document.getElementById("gb-zon-terima-kasih");
  const zonBorang = document.getElementById("gb-zon-borang");

  // Guna kelas .kotak-status--* yang sedia ada dalam gallery.html —
  // sama seperti borang muat naik & photobooth.
  function tunjukStatus(mesej, jenis = "info") {
    if (!kotakStatus) return;
    kotakStatus.textContent = mesej || "";
    kotakStatus.className = mesej
      ? `kotak-status kotak-status--${jenis}`
      : "kotak-status hidden";
  }

  function kemasKaunter() {
    if (!kaunter || !inputUcapan) return;
    kaunter.textContent = `${inputUcapan.value.length}/${HAD_UCAPAN_GB}`;
  }
  inputUcapan?.addEventListener("input", kemasKaunter);
  kemasKaunter();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const nama = (inputNama?.value || "").trim();
    const ucapan = (inputUcapan?.value || "").trim();

    if (!nama) {
      tunjukStatus("Sila isi nama anda.", "gagal");
      inputNama?.focus();
      return;
    }
    if (!ucapan) {
      tunjukStatus("Sila tulis ucapan anda.", "gagal");
      inputUcapan?.focus();
      return;
    }
    // Had dikuatkuasa semula di sini kerana maxlength boleh dipintas.
    if (nama.length > HAD_NAMA_GB || ucapan.length > HAD_UCAPAN_GB) {
      tunjukStatus("Nama atau ucapan terlalu panjang.", "gagal");
      return;
    }
    if (!navigator.onLine) {
      tunjukStatus("Tiada sambungan internet. Cuba lagi.", "gagal");
      return;
    }

    if (butangHantar) butangHantar.disabled = true;
    tunjukStatus("Menghantar ucapan…");

    try {
      // Lima medan TEPAT — mesti padan dengan hasOnly([...]) dalam
      // firestore.rules, jika tidak tulisan ditolak server.
      const ref = await addDoc(collection(db, "guestbook"), {
        name: nama,
        message: ucapan,
        approved: true, // autolulus, sama dasar dengan gambar
        created_at: serverTimestamp(),
        eventId,
      });

      form.reset();
      kemasKaunter();
      tunjukStatus("");
      zonBorang?.classList.add("hidden");
      zonTerimaKasih?.classList.remove("hidden");

      onBerjaya?.({ id: ref.id, name: nama, message: ucapan });
    } catch (err) {
      console.error("Ralat menghantar ucapan:", err);
      tunjukStatus(
        err?.code === "permission-denied"
          ? "Majlis ini sudah tamat tempoh atau tidak menerima ucapan."
          : "Gagal menghantar ucapan. Sila cuba lagi.",
        "gagal"
      );
    } finally {
      if (butangHantar) butangHantar.disabled = false;
    }
  });

  // Dipanggil oleh gallery.js setiap kali modal dibuka semula supaya
  // tetamu kedua tidak disambut skrin "terima kasih" tetamu pertama.
  function semulaBorang() {
    zonTerimaKasih?.classList.add("hidden");
    zonBorang?.classList.remove("hidden");
    tunjukStatus("");
  }

  return { boleh: true, sebab: "", semula: semulaBorang };
}
