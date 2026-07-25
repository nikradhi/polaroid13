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
  pakejEfektif,
  badgePakej,
} from "./packages.js";
import { db, doc, getDoc } from "./firebase.js";

// --- Keadaan wizard ---
let langkahSemasa = 1;          // 1..4
let pakejDipilih = null;        // "basic" | "premium" | "eksklusif" | null
const JUM_LANGKAH = 4;

// Data promosi harga (settings/promo). null = belum dimuat / tiada.
let promoSemasa = null;

// Data butiran pakej (settings/pakej). null = belum dimuat / tiada override.
let cfgPakej = null;

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
//  Tagline ringkas ikut id pakej (statik — hiasan sahaja).
//  Id tak dikenali -> "" (tiada tagline).
// ------------------------------------------------------------
const TAGLINE_PAKEJ = {
  basic: "Untuk majlis santai",
  premium: "Pilihan paling popular",
  eksklusif: "Pengalaman penuh",
};

// ------------------------------------------------------------
//  ikonSemak(warna) -> SVG tick bulat kecil (ganti emoji ✅).
//  `warna` = warna hex garisan tick (rose untuk kad terang,
//  emas untuk kad mewah).
// ------------------------------------------------------------
function ikonSemak(warna) {
  const span = document.createElement("span");
  span.className = "shrink-0 mt-0.5";
  span.innerHTML =
    `<svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true">` +
    `<circle cx="10" cy="10" r="9" fill="${warna}" fill-opacity="0.16"/>` +
    `<path d="M6 10.5l2.5 2.5L14 7.5" stroke="${warna}" stroke-width="2" ` +
    `stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  return span;
}

// ------------------------------------------------------------
//  ciriBenar(p) -> senarai kunci ciri yang `true` bagi pakej `p`,
//  mengikut turutan LABEL_CIRI.
// ------------------------------------------------------------
function ciriBenar(p) {
  return Object.keys(LABEL_CIRI).filter((k) => !!p.ciri?.[k]);
}

// ------------------------------------------------------------
//  LANGKAH 1 — bina kad pakej (harga + ciri + butang Pilih)
// ------------------------------------------------------------
function binaKadPakej() {
  kadPakej.innerHTML = "";

  const idPakej = Object.keys(PAKEJ); // turutan: basic -> premium -> eksklusif

  idPakej.forEach((id, i) => {
    const p = pakejEfektif(id, cfgPakej); // butiran berkesan (override super-admin)
    const dipilih = id === pakejDipilih;
    const badge = badgePakej(id, cfgPakej);
    const popular = badge === "popular"; // pakej disyorkan -> kad mewah
    const akanDatang = badge === "akanDatang"; // belum boleh ditempah

    // Warna aksen ikut jenis kad (emas atas kad mewah, rose atas kad terang).
    const warnaSemak = popular ? "#e3c08a" : "#b76e79";

    const kad = document.createElement("div");
    kad.className =
      "relative rounded-3xl border p-5 flex flex-col transition-transform " +
      (akanDatang ? "opacity-70 " : "") +
      (popular ? "kad-mewah z-10 sm:scale-[1.04] sm:-my-1 " : "shadow-sm hover:-translate-y-0.5 ") +
      (popular
        ? dipilih
          ? "ring-2 ring-[#e3c08a]"
          : ""
        : dipilih
          ? "border-[#b76e79] bg-[#fdf1f2] ring-2 ring-[#e7c3c9]"
          : "border-[#ecd9cf] bg-white/80");

    // Lencana "Popular" (pil emas di atas kad mewah)
    if (popular) {
      const pop = document.createElement("span");
      pop.className =
        "badge-emas absolute -top-2 left-1/2 -translate-x-1/2 rounded-full text-[10px] font-semibold px-3 py-0.5";
      pop.textContent = "★ Popular";
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
        "absolute -top-2 left-3 rounded-full bg-[#b76e79] text-white text-[10px] px-2 py-0.5" +
        (popular ? " ring-1 ring-[#e3c08a]" : "");
      promo.textContent = "Promo";
      kad.appendChild(promo);
    }

    // Nama pakej
    const nama = document.createElement("p");
    nama.className =
      "font-serif-elegan text-xl font-semibold " +
      (popular ? "text-[#fdf1f2]" : "text-[#5a4a42]");
    nama.textContent = p.nama;
    kad.appendChild(nama);

    // Tagline ringkas (hiasan)
    const tagline = TAGLINE_PAKEJ[id];
    if (tagline) {
      const tl = document.createElement("p");
      tl.className =
        "text-[11px] mb-2 " + (popular ? "text-[#e7c9cd]" : "text-[#a09088]");
      tl.textContent = tagline;
      kad.appendChild(tl);
    }

    // Harga (papar harga asal dicoret + harga promo bila ada promo)
    const warnaHarga = popular ? "text-[#e3c08a]" : "text-[#b76e79]";
    const warnaCoret = popular ? "text-[#e7c9cd]" : "text-[#a09088]";
    const harga = document.createElement("p");
    harga.className = "mb-2";
    harga.innerHTML = hg.adaPromo
      ? `<span class="text-sm ${warnaCoret} line-through mr-1">RM${hg.asal}</span>` +
        `<span class="text-3xl font-bold ${warnaHarga}">RM${hg.promo}</span>` +
        `<span class="text-xs ${warnaCoret} whitespace-nowrap"> / majlis</span>`
      : `<span class="text-3xl font-bold ${warnaHarga}">RM${hg.asal}</span>` +
        `<span class="text-xs ${warnaCoret} whitespace-nowrap"> / majlis</span>`;
    kad.appendChild(harga);

    // Meta: had gambar + tempoh (pil kecil)
    const meta = document.createElement("p");
    meta.className =
      "inline-block self-start rounded-full px-2.5 py-0.5 text-[11px] mb-4 " +
      (popular ? "bg-white/15 text-[#fdf1f2]" : "bg-[#fbeef0] text-[#8a7a70]");
    meta.textContent =
      `${p.hadGambar == null ? "Gambar tanpa had" : p.hadGambar + " gambar"} · ${p.tempohHari} hari`;
    kad.appendChild(meta);

    // Senarai ciri — sembunyi ciri berkunci; papar "Semua ciri {prev} +"
    const ul = document.createElement("ul");
    ul.className = "space-y-1.5 leading-tight text-xs mb-5 flex-1";

    const ciriIni = ciriBenar(p);
    let ciriPapar = ciriIni; // fallback: senarai penuh ciri disertakan

    if (i > 0) {
      const pPrev = pakejEfektif(idPakej[i - 1], cfgPakej);
      const ciriPrev = ciriBenar(pPrev);
      // Superset? (config memang bersarang; guard untuk kes override jarang)
      const superset = ciriPrev.every((k) => ciriIni.includes(k));
      if (superset) {
        // Baris ringkasan "Semua ciri {namaPrev}"
        const li0 = document.createElement("li");
        li0.className =
          "flex items-start gap-1.5 font-semibold " +
          (popular ? "text-[#fdf1f2]" : "text-[#5a4a42]");
        li0.appendChild(ikonSemak(warnaSemak));
        const t0 = document.createElement("span");
        t0.textContent = `Semua ciri ${pPrev.nama}`;
        li0.appendChild(t0);
        ul.appendChild(li0);
        // Hanya ciri TAMBAHAN berbanding pakej sebelum
        ciriPapar = ciriIni.filter((k) => !ciriPrev.includes(k));
      }
    }

    ciriPapar.forEach((namaCiri) => {
      const li = document.createElement("li");
      li.className =
        "flex items-start gap-1.5 " + (popular ? "text-[#f4dfe2]" : "text-[#5a4a42]");
      li.appendChild(ikonSemak(warnaSemak));
      const teks = document.createElement("span");
      teks.textContent =
        LABEL_CIRI[namaCiri] +
        (CIRI_AKAN_DATANG.includes(namaCiri) ? " (akan datang)" : "");
      li.appendChild(teks);
      ul.appendChild(li);
    });
    kad.appendChild(ul);

    // Butang Pilih
    const btn = document.createElement("button");
    btn.type = "button";
    const kelasButang = popular ? "btn-emas" : dipilih ? "btn-utama" : "btn-kedua";
    btn.className = "rounded-xl py-2.5 font-medium text-sm " + kelasButang;
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
  const p = pakejEfektif(pakejDipilih || PAKEJ_LALAI, cfgPakej);
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
    const [snapPromo, snapPakej] = await Promise.all([
      getDoc(doc(db, "settings", "promo")),
      getDoc(doc(db, "settings", "pakej")),
    ]);
    if (snapPromo.exists()) promoSemasa = snapPromo.data();
    if (snapPakej.exists()) cfgPakej = snapPakej.data();
  } catch (err) {
    // Bukan kritikal — jika gagal, harga & butiran lalai dipapar.
    console.warn("Gagal memuat promosi/butiran pakej:", err);
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
