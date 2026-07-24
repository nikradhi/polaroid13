// ============================================================
//  MODUL TEMA — sumber tunggal untuk rupa halaman majlis
// ------------------------------------------------------------
//  Setiap majlis boleh pilih satu TEMA PRA-SET (warna + font),
//  dan pelanggan Premium boleh ubah sedikit di atasnya
//  (warna utama + pasangan font).
//
//  Cara ia berfungsi: semua styling halaman merujuk CSS custom
//  properties (--warna-utama, --warna-latar, --font-tajuk, ...).
//  Tukar tema = tukar nilai variable sahaja; tiada markup diubah.
//
//  Medan Firestore pada events/{eventId}:
//    theme: {
//      preset: "rose-gold",
//      primaryColor: "#b76e79",
//      headingFont: "Cormorant Garamond",
//      bodyFont: "Lato"
//    }
//  Medan LAMA `themeColor` dikekalkan & disegerakkan dengan
//  theme.primaryColor supaya majlis sedia ada tidak pecah.
//
//  KESELAMATAN: nilai daripada Firestore TIDAK pernah dimasukkan
//  terus ke CSS atau URL font. Warna ditapis oleh warnaSah() dan
//  nama font mesti wujud dalam senarai putih SPEK_FONT.
// ============================================================

// ------------------------------------------------------------
//  SENARAI PUTIH FONT
// ------------------------------------------------------------
//  `spek`   — potongan URL Google Fonts (berat yang benar-benar
//             wujud untuk font itu; berat palsu = URL 400).
//  `tumpuk` — keluarga sandaran kalau font gagal dimuat.
// ------------------------------------------------------------
const SPEK_FONT = {
  "Cormorant Garamond": { spek: "Cormorant+Garamond:ital,wght@0,500;0,600;1,500", tumpuk: "serif" },
  "Playfair Display":   { spek: "Playfair+Display:wght@500;600;700",              tumpuk: "serif" },
  "Great Vibes":        { spek: "Great+Vibes",                                    tumpuk: "cursive" },
  "Marcellus":          { spek: "Marcellus",                                      tumpuk: "serif" },
  "Amiri":              { spek: "Amiri:wght@400;700",                             tumpuk: "serif" },
  "Lato":               { spek: "Lato:wght@400;700",                              tumpuk: "sans-serif" },
  "Inter":              { spek: "Inter:wght@400;500;600",                         tumpuk: "sans-serif" },
  "Karla":              { spek: "Karla:wght@400;600",                             tumpuk: "sans-serif" },
  "Poppins":            { spek: "Poppins:wght@400;600",                           tumpuk: "sans-serif" },
  "Caveat":             { spek: "Caveat:wght@500;600;700",                        tumpuk: "cursive" },
};

// Font yang SUDAH dimuat oleh <link> statik dalam setiap halaman.
// muatFontTema() melangkaunya supaya tema lalai tidak menambah
// sebarang permintaan rangkaian tambahan.
const FONT_STATIK = ["Cormorant Garamond", "Caveat"];

// Font tulisan tangan polaroid — TIDAK boleh ditukar pelanggan.
// Ia identiti visual kad polaroid; tukar = hilang wataknya.
export const FONT_TANGAN = "Caveat";

// ------------------------------------------------------------
//  CORAK LATAR (kertas dinding bunga)
// ------------------------------------------------------------
//  URL dikira daripada import.meta.url, BUKAN ditulis sebagai
//  "img/latar-bunga.jpeg" dalam CSS halaman. Sebabnya:
//
//    e.html boleh dihidang sebagai URL cantik "/e/<slug>" melalui
//    rewrite. url() dalam <style> inline diselesaikan relatif kepada
//    URL DOKUMEN, jadi ia akan tertuju ke "/e/img/latar-bunga.jpeg"
//    dan gagal 404 — corak hilang senyap pada URL cantik sahaja.
//
//    Laluan root-absolut "/img/..." pula memecahkan hosting dalam
//    sub-direktori (GitHub Pages project site).
//
//  Modul ini berada di <root>/js/, jadi "../img/" sentiasa betul
//  untuk ketiga-tiga bentuk hosting. Corak sama diguna oleh js/e.js
//  untuk menyelesaikan pautan sub-halaman.
// ------------------------------------------------------------
export const URL_CORAK = new URL("../img/latar-bunga.jpeg", import.meta.url).href;

// Imej latar penuh-warna (wallpaper) — BUKAN diwarnakan semula ikut tema.
// Berbeza dengan URL_CORAK (bunga line-art yang diwarna via penapis), imej
// ini sudah ada warna sendiri (pink/hijau atas kertas krim), jadi dipapar
// tanpa penapis. URL dikira sama cara (import.meta.url) untuk URL cantik.
const CORAK_IMEJ = {
  sakura:  new URL("../img/latar-sakura.jpeg",  import.meta.url).href,
  reben:   new URL("../img/latar-reben.jpeg",   import.meta.url).href,
  taburan: new URL("../img/latar-taburan.jpeg", import.meta.url).href,
  botani:  new URL("../img/latar-botani.jpeg",  import.meta.url).href,
};

// ------------------------------------------------------------
//  PILIHAN CORAK LATAR (background)
// ------------------------------------------------------------
//  Selain corak bunga (imej JPEG kongsi), pelanggan boleh pilih
//  corak SVG yang DIJANA dalam kod dan diwarnakan ikut warna tema
//  mereka (themeColor). Kelebihan berbanding fail imej: sifar fail
//  baharu, sifar kos kuota, dan sentiasa "cantik ikut tema" kerana
//  warna disuntik masa apply — bukan warna tetap.
//
//  KESELAMATAN: warna yang disuntik ke SVG mesti sudah melalui
//  warnaSah() (hanya #rgb/#rrggbb), jadi tiada aksara jahat masuk
//  ke url(). id corak pula ditapis oleh latarSah().
//
//  Setiap corak `svg` ada:
//    bina(warna)  — pulangkan rentetan <svg> jubin (tileable).
//    saiz         — saiz jubin CSS (background-size), cth "120px".
// ------------------------------------------------------------

// Bungkus rentetan SVG jadi nilai background CSS jubin berulang.
// encodeURIComponent mengekod '#' warna -> '%23' (data-URI SVG sah).
function svgKeLatar(svg, saiz) {
  const uri = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  return `${uri} 0 0 / ${saiz} repeat`;
}

// Corak-corak SVG. Semua guna `w` (warna tema tertapis) supaya jubin
// ikut warna pelanggan. Opacity rendah supaya halus, tidak melawan teks.
const CORAK_SVG = {
  geo: {
    saiz: "64px",
    bina: (w) =>
      `<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'>` +
      `<rect width='64' height='64' fill='none'/>` +
      `<path d='M0 32 L32 0 L64 32 L32 64 Z' fill='none' stroke='${w}' stroke-width='1.2' opacity='0.18'/>` +
      `<circle cx='32' cy='32' r='2' fill='${w}' opacity='0.22'/>` +
      `</svg>`,
  },
  titik: {
    saiz: "36px",
    bina: (w) =>
      `<svg xmlns='http://www.w3.org/2000/svg' width='36' height='36'>` +
      `<circle cx='9' cy='9' r='2.4' fill='${w}' opacity='0.20'/>` +
      `<circle cx='27' cy='27' r='2.4' fill='${w}' opacity='0.20'/>` +
      `</svg>`,
  },
  dedaun: {
    saiz: "110px",
    bina: (w) =>
      `<svg xmlns='http://www.w3.org/2000/svg' width='110' height='110'>` +
      `<g fill='none' stroke='${w}' stroke-width='1.3' opacity='0.20'>` +
      `<path d='M20 78 Q40 40 68 30 Q46 44 40 74 Q34 52 20 78 Z'/>` +
      `<path d='M40 74 Q40 60 40 44'/>` +
      `<path d='M78 96 Q90 84 102 86'/>` +
      `</g>` +
      `<g fill='${w}' opacity='0.12'>` +
      `<circle cx='90' cy='22' r='3'/><circle cx='16' cy='30' r='2.5'/>` +
      `</g>` +
      `</svg>`,
  },
  jantung: {
    saiz: "48px",
    bina: (w) =>
      `<svg xmlns='http://www.w3.org/2000/svg' width='48' height='48'>` +
      `<path d='M24 32 C24 26 16 24 16 30 C16 34 24 38 24 38 C24 38 32 34 32 30 C32 24 24 26 24 32 Z' ` +
      `fill='${w}' opacity='0.16'/>` +
      `</svg>`,
  },
};

// Senarai untuk UI + urutan paparan. `jenis`:
//   "imej"  — corak bunga JPEG kongsi (lalai; diwarnakan via corakTapis).
//   "foto"  — wallpaper penuh-warna dari CORAK_IMEJ (tanpa penapis tema).
//   "svg"   — corak dijana, tertinta warna tema.
//   "warna" — tiada corak; warna latar tema sahaja.
export const LATAR_PILIHAN = [
  { id: "bunga",   nama: "Bunga Klasik",  jenis: "imej" },
  { id: "sakura",  nama: "Sakura Air",    jenis: "foto" },
  { id: "reben",   nama: "Reben Pink",    jenis: "foto" },
  { id: "taburan", nama: "Bunga Taburan", jenis: "foto" },
  { id: "botani",  nama: "Botani Vintaj", jenis: "foto" },
  { id: "geo",     nama: "Geometri",      jenis: "svg" },
  { id: "titik",   nama: "Titik Halus",   jenis: "svg" },
  { id: "dedaun",  nama: "Dedaun",        jenis: "svg" },
  { id: "jantung", nama: "Hati Kecil",    jenis: "svg" },
  { id: "kosong",  nama: "Tiada Corak",   jenis: "warna" },
];

const LATAR_LALAI = "bunga";

// ------------------------------------------------------------
//  PASANGAN FONT (pilihan terhad untuk pelanggan Premium)
// ------------------------------------------------------------
//  Sengaja terhad: kebebasan penuh mudah merosakkan reka bentuk.
// ------------------------------------------------------------
export const PASANGAN_FONT = [
  { id: "klasik-elegan",      label: "Klasik Elegan",      tajuk: "Cormorant Garamond", teks: "Lato" },
  { id: "moden-mewah",        label: "Moden Mewah",        tajuk: "Playfair Display",   teks: "Inter" },
  { id: "romantik-kaligrafi", label: "Romantik Kaligrafi", tajuk: "Great Vibes",        teks: "Lato" },
  { id: "minimalis-kemas",    label: "Minimalis Kemas",    tajuk: "Marcellus",          teks: "Karla" },
  { id: "elegan-nusantara",   label: "Elegan Nusantara",   tajuk: "Amiri",              teks: "Poppins" },
];

// ------------------------------------------------------------
//  TEMA PRA-SET
// ------------------------------------------------------------
//  PENTING: "rose-gold" mesti mengekalkan nilai hex yang SAMA
//  PERSIS seperti reka bentuk asal sistem. Ia tema lalai, jadi
//  majlis sedia ada nampak 100% tidak berubah.
//
//  Medan pilihan:
//    aksen  — aksen kedua; jika tiada, diterbitkan daripada `utama`.
//    cahaya — pancaran radial di bahagian atas body; jika tiada,
//             diterbitkan daripada `utama`.
//
//  NOTA: pada halaman tetamu, `latar`/`latar2`/`cahaya` tertutup oleh
//  corak bunga yang dipapar penuh. Ia DIKEKALKAN kerana masih dipakai
//  sebagai sandaran jika imej corak gagal dimuat, dan oleh pratonton
//  tema. Identiti visual tema dibawa oleh `corakTapis` + `utama` +
//  warna teks + font.
// ------------------------------------------------------------
export const TEMA_PRASET = [
  {
    id: "rose-gold",
    nama: "Rose Gold",
    huraian: "Mewah & hangat",
    utama: "#b76e79",
    aksen: "#d9a5ac",
    cahaya: "#fbeef0",
    latar: "#fdf8f3",
    latar2: "#f7efe6",
    kad: "#fffdf9",
    teks: "#5a4a42",
    teksLembut: "#8a7a70",
    teksSamar: "#a09088",
    sempadan: "#e5d5ca",
    polaroidTeks: "#4a3f3a",
    polaroidNama: "#9a6a5a",
    corakOpacity: "1",
    corakTapis: "none",
    font: "klasik-elegan",
  },
  {
    id: "sage-green",
    nama: "Sage Hijau",
    huraian: "Semula jadi & tenang",
    utama: "#7c9070",
    aksen: "#b3c4a8",
    cahaya: "#eaf2e6",
    latar: "#f7f9f5",
    latar2: "#eaf0e8",
    kad: "#fffefb",
    teks: "#3f4a3c",
    teksLembut: "#6f7d6b",
    teksSamar: "#93a08f",
    sempadan: "#d8e2d3",
    polaroidTeks: "#3a423a",
    polaroidNama: "#6d8064",
    corakOpacity: "1",
    corakTapis: "grayscale(1) sepia(.35) hue-rotate(52deg) saturate(.75) brightness(1.04)",
    font: "klasik-elegan",
  },
  {
    id: "klasik-mono",
    nama: "Klasik Hitam-Putih",
    huraian: "Elegan & minimalis",
    utama: "#2b2b2b",
    aksen: "#8c8c8c",
    cahaya: "#f0f0f0",
    latar: "#ffffff",
    latar2: "#f3f3f3",
    kad: "#ffffff",
    teks: "#1f1f1f",
    teksLembut: "#5e5e5e",
    teksSamar: "#8c8c8c",
    sempadan: "#dcdcdc",
    polaroidTeks: "#1f1f1f",
    polaroidNama: "#5e5e5e",
    corakOpacity: "1",
    corakTapis: "grayscale(1) brightness(1.03)",
    font: "moden-mewah",
  },
  {
    id: "pastel-dusty",
    nama: "Pastel Dusty",
    huraian: "Lembut & romantik",
    utama: "#c49aa6",
    aksen: "#e3c9d1",
    cahaya: "#f9ebf0",
    latar: "#fdf7f8",
    latar2: "#f5eaee",
    kad: "#fffdfd",
    teks: "#5c4a50",
    teksLembut: "#8b757d",
    teksSamar: "#a8949b",
    sempadan: "#ebd9de",
    polaroidTeks: "#4d3f44",
    polaroidNama: "#a37f8c",
    corakOpacity: "1",
    corakTapis: "none",
    font: "klasik-elegan",
  },
  {
    id: "navy-emas",
    nama: "Navy & Emas",
    huraian: "Formal & diraja",
    utama: "#24406b",
    aksen: "#c9a24b",
    cahaya: "#eef1f7",
    latar: "#fbf9f4",
    latar2: "#f1eee6",
    kad: "#fffefa",
    teks: "#23303f",
    teksLembut: "#5d6b7c",
    teksSamar: "#8b95a1",
    sempadan: "#ded8c9",
    polaroidTeks: "#23303f",
    polaroidNama: "#a5843a",
    corakOpacity: "1",
    corakTapis: "grayscale(1) sepia(.30) hue-rotate(175deg) saturate(.85) brightness(1.02)",
    font: "moden-mewah",
  },
  {
    id: "terakota",
    nama: "Terakota Hangat",
    huraian: "Mesra & tradisional",
    utama: "#c47a5a",
    aksen: "#e5b79c",
    cahaya: "#fbeade",
    latar: "#fdf7f2",
    latar2: "#f6e9df",
    kad: "#fffdf9",
    teks: "#55403a",
    teksLembut: "#87695e",
    teksSamar: "#a68a7d",
    sempadan: "#ebd8c9",
    polaroidTeks: "#4a3a34",
    polaroidNama: "#a3634a",
    corakOpacity: "1",
    corakTapis: "grayscale(1) sepia(.75) hue-rotate(-22deg) saturate(1.5) brightness(.97)",
    font: "klasik-elegan",
  },
];

export const TEMA_LALAI = TEMA_PRASET[0];

// ------------------------------------------------------------
//  PENAPIS INPUT
// ------------------------------------------------------------

// Terima hanya #rgb / #rrggbb. Apa-apa selain itu -> null.
// Ini yang menghalang nilai Firestore daripada menyuntik CSS.
export function warnaSah(nilai) {
  if (typeof nilai !== "string") return null;
  const w = nilai.trim();
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(w) ? w : null;
}

// Nama font hanya sah jika ia ada dalam senarai putih.
export function fontSah(nama) {
  // hasOwnProperty.call (bukan Object.hasOwn) — kekal serasi dengan
  // Safari/iOS lama, sama seperti sandaran JPEG dalam js/imej.js.
  return typeof nama === "string" &&
    Object.prototype.hasOwnProperty.call(SPEK_FONT, nama)
    ? nama
    : null;
}

export function cariPraset(id) {
  return TEMA_PRASET.find((t) => t.id === id) || null;
}

// id corak latar hanya sah jika ada dalam LATAR_PILIHAN. Nilai lain
// (termasuk apa-apa dari Firestore) -> null -> jatuh ke lalai "bunga".
export function latarSah(id) {
  return LATAR_PILIHAN.some((l) => l.id === id) ? id : null;
}

// ------------------------------------------------------------
//  gayaLatar(latarId, warna) -> { imej, tapis, opacity }
// ------------------------------------------------------------
//  Terjemah pilihan corak + warna tema kepada nilai CSS untuk
//  lapisan body[data-corak]::before:
//    imej    — nilai `background` (url/gradient/none).
//    tapis   — `filter` (bunga sahaja diwarna via penapis; SVG sudah
//              tertinta jadi "none").
//    opacity — kekuatan lapisan.
//  `warna` DIANDAI sudah ditapis oleh warnaSah() (selamat untuk url()).
//  Dipanggil dengan corakTapis/corakOpacity pra-set untuk kekalkan
//  tingkah laku asal corak bunga.
// ------------------------------------------------------------
export function gayaLatar(latarId, warna, corakTapis = "none", corakOpacity = "1") {
  const pilihan = LATAR_PILIHAN.find((l) => l.id === latarId) || LATAR_PILIHAN[0];

  if (pilihan.jenis === "svg") {
    const c = CORAK_SVG[pilihan.id];
    return {
      imej: svgKeLatar(c.bina(warna), c.saiz),
      tapis: "none",
      opacity: "1",
    };
  }
  if (pilihan.jenis === "foto") {
    // Wallpaper penuh-warna + tinta LEMBUT warna tema di atasnya, supaya
    // gambar kekal jelas tetapi berona ikut tema. Tinta dibina dalam nilai
    // `imej` (dua lapisan background) supaya jubin pratonton DAN lapisan
    // body[data-corak]::before dapat kesan yang sama — tiada var CSS baharu.
    // color-mix: sudah dipakai untuk warna aksen terbitan (lihat bacaTema),
    // jadi selamat untuk apa-apa hex sah (#rgb/#rrggbb) tanpa olah alfa.
    const tint = `color-mix(in srgb, ${warna} 30%, transparent)`;
    return {
      imej: `linear-gradient(${tint}, ${tint}), url("${CORAK_IMEJ[pilihan.id]}") center / cover no-repeat`,
      tapis: "none",
      opacity: "1",
    };
  }
  if (pilihan.jenis === "warna") {
    // Tiada corak: biar kecerunan latar tema (--warna-latar) kelihatan.
    return { imej: "none", tapis: "none", opacity: "1" };
  }
  // "imej" (bunga) — kekal tingkah laku asal: JPEG kongsi + penapis tema.
  return {
    imej: `url("${URL_CORAK}") center / cover no-repeat`,
    tapis: corakTapis,
    opacity: corakOpacity,
  };
}

export function cariPasanganFont(id) {
  return PASANGAN_FONT.find((p) => p.id === id) || null;
}

// Cari id pasangan font daripada sepasang nama font (untuk isi <select>).
export function idPasanganFont(tajuk, teks) {
  const p = PASANGAN_FONT.find((x) => x.tajuk === tajuk && x.teks === teks);
  return p ? p.id : PASANGAN_FONT[0].id;
}

// Bina nilai font-family lengkap berserta sandaran: "'Lato', sans-serif"
function tumpukFont(nama) {
  const f = SPEK_FONT[nama];
  return f ? `'${nama}', ${f.tumpuk}` : "serif";
}

// ------------------------------------------------------------
//  bacaTema(ev) -> objek tema siap guna
// ------------------------------------------------------------
//  Gabungkan pra-set + override pelanggan + sandaran medan lama.
//  Selamat dipanggil dengan null / majlis lama tanpa medan theme.
// ------------------------------------------------------------
export function bacaTema(ev) {
  const t = (ev && typeof ev.theme === "object" && ev.theme) || {};
  const praset = cariPraset(t.preset) || TEMA_LALAI;
  const adaTema = !!(ev && typeof ev.theme === "object" && ev.theme);

  // Keutamaan warna: theme.primaryColor -> (themeColor lama, hanya jika
  // majlis belum pernah simpan objek theme) -> warna pra-set.
  const utama =
    warnaSah(t.primaryColor) ||
    (adaTema ? null : warnaSah(ev?.themeColor)) ||
    praset.utama;

  const pasanganPraset = cariPasanganFont(praset.font) || PASANGAN_FONT[0];
  const fontTajuk = fontSah(t.headingFont) || pasanganPraset.tajuk;
  const fontTeks = fontSah(t.bodyFont) || pasanganPraset.teks;

  // Corak latar: pilihan pelanggan (latarId) diterjemah kepada nilai CSS.
  // Untuk corak bunga, corakTapis/corakOpacity pra-set dikekalkan supaya
  // majlis lama nampak sama; corak SVG diwarna terus guna `utama`.
  const latarId = latarSah(ev?.latarId) || LATAR_LALAI;
  const latar = gayaLatar(
    latarId,
    utama,
    praset.corakTapis ?? "none",
    praset.corakOpacity ?? "1"
  );

  return {
    latarId,
    corakImej: latar.imej,
    preset: praset.id,
    nama: praset.nama,
    utama,
    // Warna terbitan bila pra-set tidak menetapkannya secara eksplisit.
    aksen: praset.aksen || `color-mix(in srgb, ${utama} 55%, #fff)`,
    cahaya: praset.cahaya || `color-mix(in srgb, ${utama} 14%, transparent)`,
    latar: praset.latar,
    latar2: praset.latar2,
    kad: praset.kad,
    teks: praset.teks,
    teksLembut: praset.teksLembut,
    teksSamar: praset.teksSamar,
    sempadan: praset.sempadan,
    polaroidTeks: praset.polaroidTeks,
    polaroidNama: praset.polaroidNama,
    // Corak bunga dipapar PENUH; setiap tema mewarnakan imej yang sama
    // guna filter CSS. Tanpa itu tema Sage/Navy/Mono dapat kertas
    // dinding merah jambu yang bercanggah dengan warna teksnya.
    corakOpacity: latar.opacity,
    corakTapis: latar.tapis,
    fontTajuk,
    fontTeks,
  };
}

// ------------------------------------------------------------
//  Gaya asas — nilai LALAI untuk semua variable
// ------------------------------------------------------------
//  Disuntik sekali ke <head> (corak sama seperti pasangGayaPolaroid()).
//  Tujuannya: setiap var() sentiasa ada nilai walaupun sebelum
//  majlis selesai dimuat daripada Firestore, jadi tiada kelipan
//  warna hitam/tanpa gaya semasa halaman mula-mula dibuka.
// ------------------------------------------------------------
export function pasangGayaAsasTema() {
  if (typeof document === "undefined") return;
  if (document.getElementById("gaya-tema")) return;

  const t = bacaTema(null); // = rose-gold, rupa asal sistem
  const style = document.createElement("style");
  style.id = "gaya-tema";
  style.textContent = `
    :root {
      --warna-utama: ${t.utama};
      --warna-aksen: ${t.aksen};
      --warna-cahaya: ${t.cahaya};
      --warna-latar: ${t.latar};
      --warna-latar-2: ${t.latar2};
      --warna-kad: ${t.kad};
      --warna-teks: ${t.teks};
      --warna-teks-lembut: ${t.teksLembut};
      --warna-teks-samar: ${t.teksSamar};
      --warna-sempadan: ${t.sempadan};
      --warna-polaroid-teks: ${t.polaroidTeks};
      --warna-polaroid-nama: ${t.polaroidNama};
      --corak-opacity: ${t.corakOpacity};
      --corak-tapis: ${t.corakTapis};
      --corak-imej: ${t.corakImej};
      --font-tajuk: ${tumpukFont(t.fontTajuk)};
      --font-teks: ${tumpukFont(t.fontTeks)};
      --font-tangan: ${tumpukFont(FONT_TANGAN)};
      /* Alias lama — dirujuk oleh ~20 kelas Tailwind arbitrary
         (text-[color:var(--tema)]) merentasi halaman awam. */
      --tema: var(--warna-utama);
    }

    /* ---- Corak latar (kertas dinding bunga) ----
       OPT-IN: halaman yang meletak atribut data-corak pada <body>.
       wall.html sengaja TIADA atribut (latar gelap projektor).

       Corak dipaparkan PENUH — ia latar halaman, bukan sekadar tekstur.
       Kerana itu warna latar tema (--warna-latar) tidak lagi kelihatan
       pada halaman tetamu; identiti tema dibawa oleh WARNA CORAK
       (--corak-tapis), aksen, warna teks dan font.

       Lapisan berasingan, bukan lapisan dalam background body, sebab
       shorthand background tidak boleh beri opacity/filter per-lapisan.

       position:fixed pada pseudo-element, BUKAN background-attachment:
       fixed — attachment fixed tersekat-sekat/pecah pada iOS Safari.

       z-index:-1 melukis di atas latar kanvas tetapi di bawah kandungan
       aliran. Syarat: <body> tidak boleh mencipta stacking context
       (jangan tambah opacity/transform/filter pada body). */
    body[data-corak]::before {
      content: "";
      position: fixed;
      inset: 0;
      z-index: -1;
      /* Corak dipilih pelanggan (latarId) -> --corak-imej. Sandaran =
         corak bunga kongsi jika var belum ditetapkan. Corak SVG sudah
         tertinta warna tema; corak bunga diwarna via --corak-tapis. */
      background: var(--corak-imej, url("${URL_CORAK}") center / cover no-repeat);
      /* Satu-satunya tombol kalau corak dirasa terlalu kuat kemudian. */
      opacity: var(--corak-opacity);
      /* Mewarnakan imej yang SAMA ikut tema — satu fail JPEG, enam rupa.
         Tanpa ini tema Sage/Navy dapat kertas dinding merah jambu. */
      filter: var(--corak-tapis, none);
      pointer-events: none;
    }
    /* Jangan cetak corak latar. Elemen position:fixed tetap dilukis pada
       muka surat pertama, jadi tanpa ini kad QR cetak (tetapan.html) akan
       terkena lapisan bunga di atasnya. Kad itu ada corak sendiri. */
    @media print {
      body[data-corak]::before { display: none !important; }
    }
  `;
  document.head.appendChild(style);

  // Muat juga font LALAI. Tanpa ini --font-teks mengisytiharkan 'Lato'
  // tetapi fail font tidak pernah diminta, jadi halaman jatuh ke
  // sans-serif sistem sehingga majlis selesai dibaca dari Firestore
  // (dan terus begitu jika majlis gagal dimuat).
  muatFontTema(t.fontTajuk, t.fontTeks, FONT_TANGAN);
}

// ------------------------------------------------------------
//  Muat font Google yang diperlukan sahaja
// ------------------------------------------------------------
//  Satu <link> untuk semua font yang diminta. Font yang sudah
//  dimuat oleh <link> statik halaman dilangkau — jadi tema lalai
//  tidak menambah permintaan rangkaian langsung.
// ------------------------------------------------------------
export function muatFontTema(...nama) {
  const perlu = [...new Set(nama.map(fontSah).filter(Boolean))].filter(
    (n) => !FONT_STATIK.includes(n)
  );
  if (!perlu.length) return;

  const url =
    "https://fonts.googleapis.com/css2?" +
    perlu.map((n) => `family=${SPEK_FONT[n].spek}`).join("&") +
    "&display=swap";

  let link = document.getElementById("font-tema");
  if (!link) {
    link = document.createElement("link");
    link.id = "font-tema";
    link.rel = "stylesheet";
    document.head.appendChild(link);
  }
  if (link.href !== url) link.href = url;
}

// ------------------------------------------------------------
//  terapTema(tema, sasaran)
// ------------------------------------------------------------
//  Tulis semua variable pada `sasaran`.
//
//  `sasaran` boleh jadi mana-mana elemen — bukan hanya <html>.
//  Pemilih tema dalam tetapan.html menerapkannya pada kotak
//  PRATONTON sahaja, supaya panel pelanggan sendiri tidak
//  bertukar warna semasa mereka melihat-lihat pilihan.
// ------------------------------------------------------------
export function terapTema(tema, sasaran = document.documentElement) {
  if (!tema || !sasaran) return tema;
  const s = sasaran.style;
  s.setProperty("--warna-utama", tema.utama);
  s.setProperty("--warna-aksen", tema.aksen);
  s.setProperty("--warna-cahaya", tema.cahaya);
  s.setProperty("--warna-latar", tema.latar);
  s.setProperty("--warna-latar-2", tema.latar2);
  s.setProperty("--warna-kad", tema.kad);
  s.setProperty("--warna-teks", tema.teks);
  s.setProperty("--warna-teks-lembut", tema.teksLembut);
  s.setProperty("--warna-teks-samar", tema.teksSamar);
  s.setProperty("--warna-sempadan", tema.sempadan);
  s.setProperty("--warna-polaroid-teks", tema.polaroidTeks);
  s.setProperty("--warna-polaroid-nama", tema.polaroidNama);
  s.setProperty("--corak-opacity", tema.corakOpacity);
  s.setProperty("--corak-tapis", tema.corakTapis);
  s.setProperty("--corak-imej", tema.corakImej);
  s.setProperty("--font-tajuk", tumpukFont(tema.fontTajuk));
  s.setProperty("--font-teks", tumpukFont(tema.fontTeks));
  s.setProperty("--font-tangan", tumpukFont(FONT_TANGAN));
  return tema;
}

// Pasang gaya asas SERTA-MERTA semasa modul dimuat, bukan tunggu
// majlis selesai dibaca dari Firestore. Modul ES dijalankan selepas
// HTML selesai dihurai, jadi <head> sudah wujud — dan halaman terus
// bergaya penuh (tiada kelipan teks tanpa font/warna) semasa menunggu
// rangkaian. terapTemaMajlis() memanggilnya semula kemudian; fungsi
// itu keluar awal jika sudah dipasang.
pasangGayaAsasTema();

// ------------------------------------------------------------
//  Kemudahan: baca + pasang gaya asas + muat font + terap.
//  Ini yang dipanggil oleh terapTema(ev) dalam js/majlis.js.
// ------------------------------------------------------------
export function terapTemaMajlis(ev, sasaran = document.documentElement) {
  pasangGayaAsasTema();
  const tema = bacaTema(ev);
  muatFontTema(tema.fontTajuk, tema.fontTeks);
  terapTema(tema, sasaran);
  return tema;
}
