// ============================================================
//  LOGIK HALAMAN PILIH PAKEJ (wizard jualan)
// ------------------------------------------------------------
//  Aliran: bakal pelanggan pilih pakej -> isi butiran majlis ->
//  isi maklumat diri -> ringkasan -> tekan "Teruskan ke WhatsApp".
//  Butang WhatsApp buka wa.me dengan mesej pra-isi supaya admin
//  boleh setup akaun (super-admin.html) selepas bayaran manual.
//
//  Tiada backend / pembayaran di sini — cuma kumpul pilihan &
//  bina pautan wa.me. Data pakej & no. WhatsApp datang dari
//  js/packages.js (satu sumber kebenaran).
// ============================================================

import {
  PAKEJ,
  PAKEJ_LALAI,
  CIRI_AKAN_DATANG,
  LABEL_CIRI,
  NOMBOR_WHATSAPP,
  hargaPakej,
  promoAktifSekarang,
} from "./packages.js";
import { db, doc, getDoc } from "./firebase.js";

// --- Keadaan wizard ---
let langkahSemasa = 1;          // 1..4
let pakejDipilih = null;        // "basic" | "premium" | "eksklusif" | null
const JUM_LANGKAH = 4;

// Data promosi harga (settings/promo). null = belum dimuat / tiada.
let promoSemasa = null;

// --- Rujukan DOM ---
const kadPakej = document.getElementById("kad-pakej");
const bannerPromo = document.getElementById("banner-promo");
const bannerPromoTajuk = document.getElementById("banner-promo-tajuk");
const bannerPromoTarikh = document.getElementById("banner-promo-tarikh");
const ringkasan = document.getElementById("ringkasan");
const wizardAmaran = document.getElementById("wizard-amaran");
const butangKembali = document.getElementById("butang-kembali");
const butangSeterusnya = document.getElementById("butang-seterusnya");
const butangWasap = document.getElementById("butang-wasap");
const wasapNota = document.getElementById("wasap-nota");

// Input borang
const wNamaPasangan = document.getElementById("w-nama-pasangan");
const wTarikh = document.getElementById("w-tarikh");
const wSlug = document.getElementById("w-slug");
const wNamaAnda = document.getElementById("w-nama-anda");
const wTelefon = document.getElementById("w-telefon");
const wEmel = document.getElementById("w-emel");

// ------------------------------------------------------------
//  LANGKAH 1 — bina kad pakej (harga + ciri + butang Pilih)
// ------------------------------------------------------------
function binaKadPakej() {
  kadPakej.innerHTML = "";

  Object.keys(PAKEJ).forEach((id) => {
    const p = PAKEJ[id];
    const dipilih = id === pakejDipilih;
    const popular = id === "premium"; // pakej disyorkan
    const akanDatang = id === "eksklusif"; // belum boleh ditempah

    const kad = document.createElement("div");
    kad.className =
      "relative rounded-2xl border p-4 flex flex-col " +
      (akanDatang ? "opacity-70 " : "") +
      (dipilih
        ? "border-[#b76e79] bg-[#fdf1f2] ring-2 ring-[#e7c3c9]"
        : "border-[#e5d5ca] bg-white/70");

    // Lencana "Popular"
    if (popular) {
      const pop = document.createElement("span");
      pop.className =
        "absolute -top-2 right-3 rounded-full bg-[#b76e79] text-white text-[10px] px-2 py-0.5";
      pop.textContent = "Popular";
      kad.appendChild(pop);
    }

    // Lencana "Akan datang"
    if (akanDatang) {
      const soon = document.createElement("span");
      soon.className =
        "absolute -top-2 right-3 rounded-full bg-[#a09088] text-white text-[10px] px-2 py-0.5";
      soon.textContent = "Akan datang";
      kad.appendChild(soon);
    }

    // Harga berkesan (mengambil kira promosi jika aktif)
    const hg = hargaPakej(id, promoSemasa);

    // Lencana "Promo" (sudut kiri supaya tak bertindih Popular/Akan datang)
    if (hg.adaPromo) {
      const promo = document.createElement("span");
      promo.className =
        "absolute -top-2 left-3 rounded-full bg-[#b76e79] text-white text-[10px] px-2 py-0.5";
      promo.textContent = "Promo";
      kad.appendChild(promo);
    }

    // Nama pakej
    const nama = document.createElement("p");
    nama.className = "font-serif-elegan text-xl font-semibold text-[#5a4a42]";
    nama.textContent = p.nama;
    kad.appendChild(nama);

    // Harga (papar harga asal dicoret + harga promo bila ada promo)
    const harga = document.createElement("p");
    harga.className = "mb-1";
    harga.innerHTML = hg.adaPromo
      ? `<span class="text-sm text-[#a09088] line-through mr-1">RM${hg.asal}</span>` +
        `<span class="text-2xl font-bold text-[#b76e79]">RM${hg.promo}</span>` +
        `<span class="text-xs text-[#a09088]"> / majlis</span>`
      : `<span class="text-2xl font-bold text-[#b76e79]">RM${hg.asal}</span>` +
        `<span class="text-xs text-[#a09088]"> / majlis</span>`;
    kad.appendChild(harga);

    // Meta: had gambar + tempoh
    const meta = document.createElement("p");
    meta.className = "text-xs text-[#a09088] mb-3";
    meta.textContent =
      `${p.hadGambar == null ? "Gambar tanpa had" : p.hadGambar + " gambar"} · ${p.tempohHari} hari`;
    kad.appendChild(meta);

    // Senarai ciri
    const ul = document.createElement("ul");
    ul.className = "space-y-1 leading-tight text-xs mb-4 flex-1";
    Object.keys(LABEL_CIRI).forEach((namaCiri) => {
      const ada = !!p.ciri?.[namaCiri];
      const akanDatang = CIRI_AKAN_DATANG.includes(namaCiri);
      const li = document.createElement("li");
      li.className = "flex items-start gap-1 " + (ada ? "text-[#5a4a42]" : "text-[#b8aaa1]");
      const ikon = document.createElement("span");
      ikon.textContent = ada ? "✅" : "🔒";
      const teks = document.createElement("span");
      teks.textContent = LABEL_CIRI[namaCiri] + (ada && akanDatang ? " (akan datang)" : "");
      li.appendChild(ikon);
      li.appendChild(teks);
      ul.appendChild(li);
    });
    kad.appendChild(ul);

    // Butang Pilih
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className =
      "rounded-xl py-2.5 font-medium text-sm " +
      (dipilih ? "btn-utama" : "btn-kedua");
    if (akanDatang) {
      // Pakej belum boleh ditempah: lumpuhkan butang & jangan pasang klik.
      btn.disabled = true;
      btn.textContent = "Akan datang";
    } else {
      btn.textContent = dipilih ? "✓ Dipilih" : "Pilih";
      btn.addEventListener("click", () => {
        pakejDipilih = id;
        sembunyiAmaran();
        binaKadPakej(); // render semula supaya serlahan dikemas kini
      });
    }
    kad.appendChild(btn);

    kadPakej.appendChild(kad);
  });
}

// ------------------------------------------------------------
//  NAVIGASI LANGKAH
// ------------------------------------------------------------
function tunjukLangkah(n) {
  langkahSemasa = n;

  // Tunjuk hanya seksyen langkah semasa
  for (let i = 1; i <= JUM_LANGKAH; i++) {
    const sec = document.getElementById("langkah-" + i);
    if (sec) sec.classList.toggle("hidden", i !== n);
  }

  // Kemas kini penunjuk kemajuan
  document.querySelectorAll("[data-bulat]").forEach((el) => {
    const i = Number(el.dataset.bulat);
    el.classList.toggle("aktif", i === n);
    el.classList.toggle("selesai", i < n);
  });
  document.querySelectorAll("[data-garis]").forEach((el) => {
    const i = Number(el.dataset.garis);
    el.classList.toggle("selesai", i < n);
  });

  // Butang Kembali: sembunyi di langkah 1
  butangKembali.classList.toggle("invisible", n === 1);

  // Butang Seterusnya: sembunyi di langkah akhir (guna butang WhatsApp)
  butangSeterusnya.classList.toggle("hidden", n === JUM_LANGKAH);

  sembunyiAmaran();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ------------------------------------------------------------
//  VALIDASI setiap langkah sebelum boleh maju
// ------------------------------------------------------------
function validasiLangkah(n) {
  if (n === 1) {
    if (!pakejDipilih) return "Sila pilih satu pakej untuk teruskan.";
  }
  if (n === 2) {
    if (!wNamaPasangan.value.trim()) return "Sila isi nama pasangan.";
    if (!wTarikh.value) return "Sila pilih tarikh majlis.";
  }
  if (n === 3) {
    if (!wNamaAnda.value.trim()) return "Sila isi nama anda.";
    if (!wTelefon.value.trim()) return "Sila isi no. telefon anda.";
  }
  return null; // sah
}

function tunjukAmaran(mesej) {
  wizardAmaran.textContent = mesej;
  wizardAmaran.classList.remove("hidden");
}
function sembunyiAmaran() {
  wizardAmaran.classList.add("hidden");
}

// ------------------------------------------------------------
//  LANGKAH 4 — bina ringkasan + pautan WhatsApp
// ------------------------------------------------------------
function binaRingkasan() {
  const p = PAKEJ[pakejDipilih] || PAKEJ[PAKEJ_LALAI];
  const hg = hargaPakej(pakejDipilih, promoSemasa);
  ringkasan.innerHTML = "";

  const teksHarga = hg.adaPromo
    ? `${p.nama} — RM${hg.promo} (promo, asal RM${hg.asal})`
    : `${p.nama} — RM${hg.asal}`;

  const baris = [
    ["Pakej", teksHarga],
    ["Had gambar", p.hadGambar == null ? "Tanpa had" : `${p.hadGambar} gambar`],
    ["Tempoh aktif", `${p.tempohHari} hari`],
    ["Nama pasangan", wNamaPasangan.value.trim()],
    ["Tarikh majlis", wTarikh.value],
    ["URL pilihan", wSlug.value.trim() || "—"],
    ["Nama anda", wNamaAnda.value.trim()],
    ["No. telefon", wTelefon.value.trim()],
    ["Emel", wEmel.value.trim() || "—"],
  ];

  baris.forEach(([label, nilai]) => {
    const row = document.createElement("div");
    row.className = "flex justify-between gap-3 border-b border-[#f0e6dd] pb-1.5 last:border-0";
    const l = document.createElement("span");
    l.className = "text-[#a09088]";
    l.textContent = label;
    const v = document.createElement("span");
    v.className = "font-medium text-right text-[#5a4a42]";
    v.textContent = nilai;
    row.appendChild(l);
    row.appendChild(v);
    ringkasan.appendChild(row);
  });

  // Bina mesej WhatsApp
  const mesej = binaMesejWasap(p);
  const url = `https://wa.me/${NOMBOR_WHATSAPP}?text=${encodeURIComponent(mesej)}`;
  butangWasap.href = url;

  // Nota: jika no. WhatsApp masih placeholder, beritahu (untuk mod ujian).
  if (/x/i.test(NOMBOR_WHATSAPP)) {
    wasapNota.textContent =
      "⚠️ No. WhatsApp admin belum ditetapkan (placeholder). Pautan belum ke nombor sebenar.";
  } else {
    wasapNota.textContent = "Anda akan dibawa ke WhatsApp dengan mesej tempahan siap ditaip.";
  }
}

function binaMesejWasap(p) {
  const slug = wSlug.value.trim();
  const emel = wEmel.value.trim();
  const hg = hargaPakej(pakejDipilih, promoSemasa);
  const teksPakej = hg.adaPromo
    ? `${p.nama} (RM${hg.promo} promo, asal RM${hg.asal})`
    : `${p.nama} (RM${hg.asal})`;
  const baris = [
    "Hai! Saya nak tempah Polaroid Wedding 📸",
    "",
    `Pakej: ${teksPakej}`,
    `Nama pasangan: ${wNamaPasangan.value.trim()}`,
    `Tarikh majlis: ${wTarikh.value}`,
    slug ? `URL pilihan: ${slug}` : null,
    `Nama saya: ${wNamaAnda.value.trim()}`,
    `No. telefon: ${wTelefon.value.trim()}`,
    emel ? `Emel: ${emel}` : null,
    "",
    "Mohon bantu setup akaun selepas pembayaran. Terima kasih!",
  ].filter((x) => x !== null);
  return baris.join("\n");
}

// ------------------------------------------------------------
//  PASANG PENDENGAR
// ------------------------------------------------------------
butangSeterusnya.addEventListener("click", () => {
  const ralat = validasiLangkah(langkahSemasa);
  if (ralat) {
    tunjukAmaran(ralat);
    return;
  }
  const seterusnya = Math.min(JUM_LANGKAH, langkahSemasa + 1);
  if (seterusnya === JUM_LANGKAH) binaRingkasan();
  tunjukLangkah(seterusnya);
});

butangKembali.addEventListener("click", () => {
  tunjukLangkah(Math.max(1, langkahSemasa - 1));
});

// Sembunyi amaran bila pengguna mula menaip
[wNamaPasangan, wTarikh, wNamaAnda, wTelefon].forEach((el) => {
  el?.addEventListener("input", sembunyiAmaran);
});

// ------------------------------------------------------------
//  PROMOSI — muat settings/promo, papar banner jika aktif
// ------------------------------------------------------------
function formatTarikhBanner(nilai) {
  const dt = nilai && typeof nilai.toDate === "function" ? nilai.toDate()
    : (nilai instanceof Date ? nilai : null);
  if (!dt) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${p(dt.getDate())}/${p(dt.getMonth() + 1)}/${dt.getFullYear()}`;
}

async function muatPromo() {
  try {
    const snap = await getDoc(doc(db, "settings", "promo"));
    if (snap.exists()) promoSemasa = snap.data();
  } catch (err) {
    // Bukan kritikal — jika gagal, harga biasa dipapar.
    console.warn("Gagal memuat promosi:", err);
  }

  // Banner promosi (hanya bila promo aktif)
  if (promoAktifSekarang(promoSemasa)) {
    bannerPromoTajuk.textContent = promoSemasa.tajuk?.trim() || "Promosi harga istimewa!";
    const tamat = formatTarikhBanner(promoSemasa.tamat);
    bannerPromoTarikh.textContent = tamat ? `Sah sehingga ${tamat}` : "";
    bannerPromo.classList.remove("hidden");
  }
}

// --- Mula ---
tunjukLangkah(1);
muatPromo().finally(binaKadPakej);
