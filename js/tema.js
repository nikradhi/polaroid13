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
    corakOpacity: ".22",
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
    corakOpacity: ".14",
    corakTapis: "grayscale(1)",
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
    corakOpacity: ".10",
    corakTapis: "grayscale(1)",
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
    corakOpacity: ".20",
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
    corakOpacity: ".12",
    corakTapis: "grayscale(1)",
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
    corakOpacity: ".16",
    corakTapis: "none",
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

  return {
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
    // Corak bunga: kelegapan & tapis warna ikut tema. Tema berwarna
    // sejuk (sage/navy/mono) menyahwarnakan ros supaya corak jadi
    // tekstur neutral, bukan bunga merah jambu yang bercanggah.
    corakOpacity: praset.corakOpacity ?? ".18",
    corakTapis: praset.corakTapis ?? "none",
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
      --font-tajuk: ${tumpukFont(t.fontTajuk)};
      --font-teks: ${tumpukFont(t.fontTeks)};
      --font-tangan: ${tumpukFont(FONT_TANGAN)};
      /* Alias lama — dirujuk oleh ~20 kelas Tailwind arbitrary
         (text-[color:var(--tema)]) merentasi halaman awam. */
      --tema: var(--warna-utama);
    }

    /* ---- Corak latar (kertas dinding bunga) ----
       OPT-IN melalui atribut pada <body>. Dua mod:
         data-corak="halus" — halaman tetamu: kelegapan rendah supaya
                              warna tema masih menembusi corak.
         data-corak="penuh" — panel pelanggan (tetapan.html): corak penuh,
                              tiada tema untuk ditembusi.
       wall.html sengaja TIADA atribut (latar gelap projektor).

       Lapisan berasingan, bukan lapisan dalam background body, sebab
       shorthand background tidak boleh beri opacity per-lapisan —
       imej JPEG legap akan menutup terus warna latar tema.

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
      background: url("${URL_CORAK}") center / cover no-repeat;
      opacity: calc(var(--corak-opacity) * var(--corak-skala, 1));
      filter: var(--corak-tapis, none);
      pointer-events: none;
    }
    /* Imej ini potret (750x1280). Pada skrin lebar, 'cover' membesarkannya
       ~1.7x jadi motif nampak besar; kurangkan kelegapan supaya ia kekal
       sebagai tekstur, bukan subjek. (Jubin bukan pilihan — fail ini
       bukan jubin seamless, sambungannya kelihatan.)
       Mod "penuh" dikecualikan: di sana corak MEMANG subjeknya. */
    @media (min-width: 768px) {
      body[data-corak="halus"]::before { --corak-skala: .65; }
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
