// ============================================================
//  BINGKAI JALUR PHOTOBOOTH — 10 motif + "Klasik" (tiada hiasan)
// ------------------------------------------------------------
//  Pustaka TULEN: tiada DOM, tiada Firestore. Setiap bingkai ialah
//  fungsi yang melukis terus pada canvas 2D — BUKAN fail imej,
//  BUKAN SVG data-URI. Sebabnya:
//
//    - Sifar fail baharu, sifar kos kuota (corak sama seperti
//      CORAK_SVG dalam tema.js).
//    - Tiada pemuatan async di tengah aliran syot.
//    - Tiada risiko toBlob() gagal `SecurityError`: melukis <image>
//      luaran ke dalam canvas akan MENCEMARKAN canvas dan mematahkan
//      binaJalur(). Vektor tulen tidak pernah mencemarkan.
//
//  Preseden dalam kod: lukisKaki() dalam photobooth.js sudah melukis
//  hiasan vektor bertinta warna tema (garis—♥—garis) dengan cara ini.
//
//  KUOTA: SASARAN_JALUR hanya 45 KB. Gunakan SENI GARIS JARANG pada
//  margin — motif padat penuh-bleed menaikkan entropi JPEG dan
//  merosakkan kualiti SELURUH jalur, bukan hanya bingkai.
//
//  KESELAMATAN: `warna` datang dari warnaTema() (nilai hex yang
//  dibaca dari CSS custom property), bukan terus dari Firestore.
//  Id bingkai ditapis oleh bingkaiSah() — corak sama seperti
//  latarSah()/fontIdSah() dalam tema.js.
// ============================================================

import { LEBAR_JALUR } from "./imej.js";

// Bilangan syot & jarak antaranya — dikongsi dengan photobooth.js.
export const BIL_SYOT = 3;
export const JURANG = 10;
export const TINGGI_KAKI = 100;

// ------------------------------------------------------------
//  geometriJalur(padding) -> ukuran jalur untuk margin tertentu
// ------------------------------------------------------------
//  Margin BUKAN pemalar: bingkai berhias perlukan ruang lebih luas
//  daripada "Klasik". Kerana syot adalah PERSEGI, margin yang lebih
//  besar menghasilkan foto yang lebih kecil — jadi jalur berhias
//  sebenarnya lebih PENDEK daripada Klasik, bukan lebih tinggi.
//
//    padding 16 (Klasik)  -> foto 448, jalur 1480
//    padding 34 (berhias) -> foto 412, jalur 1390
// ------------------------------------------------------------
export function geometriJalur(padding) {
  const sisi = LEBAR_JALUR - padding * 2;
  const yKaki = padding + BIL_SYOT * sisi + (BIL_SYOT - 1) * JURANG;
  return {
    lebar: LEBAR_JALUR,
    padding,
    sisi,
    yKaki, // y tempat jalur kapsyen bermula
    tinggi: yKaki + TINGGI_KAKI,
  };
}

// ------------------------------------------------------------
//  UTILITI LUKISAN
// ------------------------------------------------------------

// Rawak DETERMINISTIK — motif bertabur mesti kekal sama setiap kali
// jalur dilukis semula (tukar bingkai = lukis semula), jika tidak
// hiasan akan melompat-lompat di depan mata tetamu.
function rawak(benih) {
  let s = benih >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// Pendaraban lebar garis untuk jubin PRATONTON sahaja.
//  Jalur sebenar dilukis pada 480px; jubin pemilih lebih kurang 96px.
//  Tanpa pendaraban, garis 1.4px menjadi ~0.28px pada jubin — motif
//  hilang sepenuhnya dan setiap jubin nampak seperti kotak kosong.
//  Ditetapkan oleh lukisPratontonBingkai() dan dipulihkan selepasnya.
let ganda = 1;

function sediaGaris(c, warna, tebal = 1.4, alfa = 0.85) {
  c.strokeStyle = warna;
  c.fillStyle = warna;
  c.lineWidth = tebal * ganda;
  c.globalAlpha = Math.min(1, alfa * (ganda > 1 ? 1.25 : 1));
  c.lineCap = "round";
  c.lineJoin = "round";
}

// Tukar lebar garis di tengah-tengah lukisan — guna ini, JANGAN set
// c.lineWidth terus, jika tidak pendaraban pratonton terlangkau.
function tebalGaris(c, tebal) {
  c.lineWidth = tebal * ganda;
}

// Hati kecil berpusat di (x,y), lebar s.
function hatiKecil(c, x, y, s, isi = true) {
  c.beginPath();
  c.moveTo(x, y + s * 0.32);
  c.bezierCurveTo(x - s * 0.55, y - s * 0.18, x - s * 0.18, y - s * 0.5, x, y - s * 0.18);
  c.bezierCurveTo(x + s * 0.18, y - s * 0.5, x + s * 0.55, y - s * 0.18, x, y + s * 0.32);
  c.closePath();
  isi ? c.fill() : c.stroke();
}

// Kerlipan 4-bucu (bintang halus) berpusat di (x,y), jejari r.
function kerlip(c, x, y, r) {
  c.beginPath();
  c.moveTo(x, y - r);
  c.quadraticCurveTo(x + r * 0.16, y - r * 0.16, x + r, y);
  c.quadraticCurveTo(x + r * 0.16, y + r * 0.16, x, y + r);
  c.quadraticCurveTo(x - r * 0.16, y + r * 0.16, x - r, y);
  c.quadraticCurveTo(x - r * 0.16, y - r * 0.16, x, y - r);
  c.closePath();
  c.fill();
}

// Daun tunggal (elips condong) — blok binaan untuk ranting.
function daun(c, x, y, panjang, lebar, sudut) {
  c.beginPath();
  c.ellipse(x, y, panjang, lebar, sudut, 0, Math.PI * 2);
  c.stroke();
}

// Kuntum ros bergaya: tiga lengkok sepusat yang tidak bercantum.
function kuntumRos(c, x, y, r) {
  for (let i = 0; i < 3; i++) {
    c.beginPath();
    c.arc(x, y, r * (0.3 + i * 0.3), i * 1.9, i * 1.9 + 4.3);
    c.stroke();
  }
}

// Ranting daun menegak sepanjang `tinggi` dari (x,y) ke bawah.
function rantingMenegak(c, x, y, tinggi, arah, bilDaun) {
  c.beginPath();
  c.moveTo(x, y);
  c.quadraticCurveTo(x + arah * 6, y + tinggi * 0.5, x, y + tinggi);
  c.stroke();
  for (let i = 0; i < bilDaun; i++) {
    const t = (i + 0.5) / bilDaun;
    const dy = y + tinggi * t;
    const dx = x + arah * 4 * Math.sin(Math.PI * t);
    daun(c, dx + arah * 7, dy, 8, 3.4, arah > 0 ? -0.5 : 0.5);
  }
}

// ------------------------------------------------------------
//  SENARAI BINGKAI
// ------------------------------------------------------------
//  Setiap entri:
//    id      — kunci stabil (ditapis oleh bingkaiSah)
//    nama    — label Bahasa Melayu untuk UI
//    padding — margin jalur; menentukan saiz foto & tinggi jalur
//    lukis(c, g, warna) — melukis DALAM MARGIN sahaja; null = tiada hiasan
//
//  `g` ialah objek dari geometriJalur(): { lebar, padding, sisi, yKaki, tinggi }
//  Jangan lukis di atas muka — kekal di margin dan penjuru.
// ------------------------------------------------------------
export const BINGKAI_PILIHAN = [
  {
    id: "klasik",
    nama: "Klasik",
    padding: 16,
    lukis: null, // jalur asal — tiada hiasan langsung
  },

  {
    id: "ros",
    nama: "Bunga Ros",
    padding: 34,
    lukis: (c, g, warna) => {
      sediaGaris(c, warna, 2.2, 0.85);
      const m = g.padding;
      const kanan = g.lebar - m;
      const bawah = g.yKaki;
      // Empat penjuru: kuntum + sepasang daun
      const penjuru = [
        [m * 0.55, m * 0.55, 1, 1],
        [kanan + m * 0.45, m * 0.55, -1, 1],
        [m * 0.55, bawah + m * 0.2, 1, -1],
        [kanan + m * 0.45, bawah + m * 0.2, -1, -1],
      ];
      penjuru.forEach(([x, y, sx, sy]) => {
        kuntumRos(c, x, y, 9);
        daun(c, x + sx * 13, y + sy * 11, 8, 3.2, sx * sy * 0.7);
        daun(c, x + sx * 4, y + sy * 17, 7, 2.8, sx * sy * -0.4);
      });
    },
  },

  {
    id: "dedaun",
    nama: "Dedaun",
    padding: 34,
    lukis: (c, g, warna) => {
      sediaGaris(c, warna, 2.0, 0.8);
      const tinggiRanting = (g.yKaki - g.padding) / 3;
      for (let i = 0; i < 3; i++) {
        const y = g.padding + i * tinggiRanting + 8;
        rantingMenegak(c, g.padding * 0.5, y, tinggiRanting - 16, -1, 5);
        rantingMenegak(c, g.lebar - g.padding * 0.5, y, tinggiRanting - 16, 1, 5);
      }
    },
  },

  {
    id: "renda",
    nama: "Renda",
    padding: 34,
    lukis: (c, g, warna) => {
      sediaGaris(c, warna, 1.8, 0.75);
      const r = 7;
      const m = g.padding * 0.5;
      // Skalop mendatar (atas & bawah kawasan foto)
      for (let x = m + r; x < g.lebar - m; x += r * 2) {
        c.beginPath();
        c.arc(x, m, r, Math.PI, 0);
        c.stroke();
        c.beginPath();
        c.arc(x, g.yKaki + m * 0.6, r, 0, Math.PI);
        c.stroke();
      }
      // Skalop menegak (tepi kiri & kanan)
      for (let y = m + r; y < g.yKaki; y += r * 2) {
        c.beginPath();
        c.arc(m, y, r, Math.PI * 0.5, Math.PI * 1.5);
        c.stroke();
        c.beginPath();
        c.arc(g.lebar - m, y, r, Math.PI * 1.5, Math.PI * 0.5);
        c.stroke();
      }
    },
  },

  {
    id: "hati",
    nama: "Hati Bertabur",
    padding: 34,
    lukis: (c, g, warna) => {
      sediaGaris(c, warna, 1.8, 0.7);
      const rnd = rawak(20260801);
      const m = g.padding;
      // Tepi kiri & kanan
      for (let y = m; y < g.yKaki; y += 46) {
        hatiKecil(c, m * 0.5 + (rnd() - 0.5) * 8, y + rnd() * 20, 9 + rnd() * 5);
        hatiKecil(c, g.lebar - m * 0.5 + (rnd() - 0.5) * 8, y + rnd() * 20, 9 + rnd() * 5);
      }
      // Jalur atas
      for (let x = m; x < g.lebar - m; x += 52) {
        hatiKecil(c, x + rnd() * 16, m * 0.5, 8 + rnd() * 4);
      }
    },
  },

  {
    id: "songket",
    nama: "Songket",
    padding: 34,
    lukis: (c, g, warna) => {
      sediaGaris(c, warna, 1.8, 0.85);
      const m = g.padding;
      // Jalur motif belah ketupat — atas dan bawah kawasan foto
      const jalurY = [m * 0.5, g.yKaki + m * 0.55];
      jalurY.forEach((cy) => {
        c.beginPath();
        c.moveTo(m * 0.35, cy - 9);
        c.lineTo(g.lebar - m * 0.35, cy - 9);
        c.moveTo(m * 0.35, cy + 9);
        c.lineTo(g.lebar - m * 0.35, cy + 9);
        c.stroke();
        for (let x = m; x < g.lebar - m * 0.6; x += 26) {
          c.beginPath();
          c.moveTo(x, cy - 6);
          c.lineTo(x + 8, cy);
          c.lineTo(x, cy + 6);
          c.lineTo(x - 8, cy);
          c.closePath();
          c.stroke();
          c.beginPath();
          c.arc(x + 13, cy, 1.6, 0, Math.PI * 2);
          c.fill();
        }
      });
      // Garis nadi menegak di tepi
      c.globalAlpha = 0.5;
      c.beginPath();
      c.moveTo(m * 0.5, m * 0.5 + 14);
      c.lineTo(m * 0.5, g.yKaki + m * 0.55 - 14);
      c.moveTo(g.lebar - m * 0.5, m * 0.5 + 14);
      c.lineTo(g.lebar - m * 0.5, g.yKaki + m * 0.55 - 14);
      c.stroke();
    },
  },

  {
    id: "rebung",
    nama: "Pucuk Rebung",
    padding: 34,
    lukis: (c, g, warna) => {
      sediaGaris(c, warna, 1.9, 0.8);
      const m = g.padding;
      const t = 15; // tinggi segi tiga
      const l = 11; // separuh tapak
      // Segi tiga menghala ke DALAM sepanjang tepi kiri & kanan
      for (let y = m + l; y < g.yKaki - l; y += l * 2.4) {
        c.beginPath();
        c.moveTo(1, y - l);
        c.lineTo(t, y);
        c.lineTo(1, y + l);
        c.stroke();
        c.beginPath();
        c.moveTo(g.lebar - 1, y - l);
        c.lineTo(g.lebar - t, y);
        c.lineTo(g.lebar - 1, y + l);
        c.stroke();
      }
      // Barisan pucuk di jalur atas
      for (let x = m + l; x < g.lebar - m; x += l * 2.4) {
        c.beginPath();
        c.moveTo(x - l, 1);
        c.lineTo(x, t);
        c.lineTo(x + l, 1);
        c.stroke();
      }
    },
  },

  {
    id: "deko",
    nama: "Art Deco",
    padding: 34,
    lukis: (c, g, warna) => {
      sediaGaris(c, warna, 2.0, 0.85);
      const m = g.padding;
      const a = m * 0.34;
      const b = m * 0.62;
      // Dua garis berkembar mengelilingi kawasan foto
      [a, b].forEach((d, i) => {
        tebalGaris(c, i === 0 ? 2.6 : 1.4);
        c.strokeRect(d, d, g.lebar - d * 2, g.yKaki + m - d * 2);
      });
      // Kipas sunburst di empat penjuru
      tebalGaris(c, 1.6);
      const kipas = [
        [b, b, 0],
        [g.lebar - b, b, Math.PI / 2],
        [b, g.yKaki + m - b, -Math.PI / 2],
        [g.lebar - b, g.yKaki + m - b, Math.PI],
      ];
      kipas.forEach(([x, y, putar]) => {
        for (let i = 0; i <= 4; i++) {
          const sudut = putar + (i / 4) * (Math.PI / 2);
          c.beginPath();
          c.moveTo(x, y);
          c.lineTo(x + Math.cos(sudut) * 17, y + Math.sin(sudut) * 17);
          c.stroke();
        }
      });
    },
  },

  {
    id: "reben",
    nama: "Reben",
    padding: 34,
    lukis: (c, g, warna) => {
      sediaGaris(c, warna, 2.2, 0.85);
      const m = g.padding;
      const cx = g.lebar / 2;
      const cy = m * 0.5;
      // Tocang: dua gelung + simpul
      c.beginPath();
      c.ellipse(cx - 13, cy, 12, 7.5, -0.45, 0, Math.PI * 2);
      c.stroke();
      c.beginPath();
      c.ellipse(cx + 13, cy, 12, 7.5, 0.45, 0, Math.PI * 2);
      c.stroke();
      c.beginPath();
      c.arc(cx, cy, 3.4, 0, Math.PI * 2);
      c.stroke();
      // Tali menjuntai ke bawah kedua-dua tepi
      tebalGaris(c, 1.8);
      c.globalAlpha = 0.6;
      [-1, 1].forEach((arah) => {
        c.beginPath();
        c.moveTo(cx + arah * 20, cy + 5);
        c.quadraticCurveTo(
          cx + arah * (g.lebar * 0.32),
          m * 1.6,
          g.lebar / 2 + arah * (g.lebar / 2 - m * 0.5),
          m * 2.4
        );
        c.lineTo(g.lebar / 2 + arah * (g.lebar / 2 - m * 0.5), g.yKaki + m * 0.4);
        c.stroke();
      });
    },
  },

  {
    id: "bintang",
    nama: "Bintang Malam",
    padding: 34,
    lukis: (c, g, warna) => {
      sediaGaris(c, warna, 1.5, 0.72);
      const rnd = rawak(19981224);
      const m = g.padding;
      for (let y = m * 0.4; y < g.yKaki + m; y += 34) {
        kerlip(c, m * 0.5 + (rnd() - 0.5) * 12, y + rnd() * 14, 5 + rnd() * 4);
        kerlip(c, g.lebar - m * 0.5 + (rnd() - 0.5) * 12, y + rnd() * 14, 5 + rnd() * 4);
        c.globalAlpha = 0.35;
        c.beginPath();
        c.arc(m * 0.5 + (rnd() - 0.5) * 16, y + 20, 1.4, 0, Math.PI * 2);
        c.fill();
        c.beginPath();
        c.arc(g.lebar - m * 0.5 + (rnd() - 0.5) * 16, y + 20, 1.4, 0, Math.PI * 2);
        c.fill();
        c.globalAlpha = 0.6;
      }
      for (let x = m; x < g.lebar - m; x += 44) {
        kerlip(c, x + rnd() * 14, m * 0.5, 4.5 + rnd() * 3.5);
      }
    },
  },

  {
    id: "cincin",
    nama: "Cincin & Kalungan",
    padding: 34,
    lukis: (c, g, warna) => {
      sediaGaris(c, warna, 2.4, 0.9);
      const m = g.padding;
      const cx = g.lebar / 2;
      const cy = m * 0.5;
      // Dua cincin bersilang
      c.beginPath();
      c.arc(cx - 8, cy, 9, 0, Math.PI * 2);
      c.stroke();
      c.beginPath();
      c.arc(cx + 8, cy, 9, 0, Math.PI * 2);
      c.stroke();
      // Kalungan daun di kiri & kanan cincin
      tebalGaris(c, 1.8);
      c.globalAlpha = 0.7;
      [-1, 1].forEach((arah) => {
        for (let i = 0; i < 5; i++) {
          const x = cx + arah * (26 + i * 15);
          const y = cy + Math.sin(i * 0.8) * 3;
          daun(c, x, y, 7, 2.8, arah > 0 ? 0.5 : -0.5);
        }
      });
      // Garis halus menyusur tepi
      c.globalAlpha = 0.45;
      tebalGaris(c, 1.5);
      c.beginPath();
      c.moveTo(m * 0.45, m * 1.1);
      c.lineTo(m * 0.45, g.yKaki + m * 0.4);
      c.moveTo(g.lebar - m * 0.45, m * 1.1);
      c.lineTo(g.lebar - m * 0.45, g.yKaki + m * 0.4);
      c.stroke();
    },
  },
];

// ------------------------------------------------------------
//  bingkaiSah(id) / cariBingkai(id)
// ------------------------------------------------------------
//  Allowlist id terkurasi — corak sama seperti latarSah() dan
//  fontIdSah() dalam tema.js. Nilai tak dikenali jatuh ke "klasik".
// ------------------------------------------------------------
export function bingkaiSah(id) {
  return BINGKAI_PILIHAN.some((b) => b.id === id) ? id : null;
}

export function cariBingkai(id) {
  return BINGKAI_PILIHAN.find((b) => b.id === id) || BINGKAI_PILIHAN[0];
}

// ------------------------------------------------------------
//  lukisPratontonBingkai(c, bingkai, warna, lebarJubin)
// ------------------------------------------------------------
//  Lukis jubin pratonton kecil untuk pemilih: kertas + tiga blok
//  kelabu sebagai ganti foto + bingkai sebenar. Guna fungsi lukis()
//  yang SAMA pada skala kecil — jubin mempratonton dirinya sendiri,
//  jadi tiada aset pratonton berasingan yang boleh jadi lapuk.
//  Pulangkan tinggi jubin yang sepadan.
// ------------------------------------------------------------
export function lukisPratontonBingkai(c, bingkai, warna, lebarJubin, warnaKertas) {
  const g = geometriJalur(bingkai.padding);
  const s = lebarJubin / g.lebar;

  c.save();
  c.scale(s, s);
  c.fillStyle = warnaKertas;
  c.fillRect(0, 0, g.lebar, g.tinggi);
  c.fillStyle = "#d9cec6";
  for (let i = 0; i < BIL_SYOT; i++) {
    c.fillRect(g.padding, g.padding + i * (g.sisi + JURANG), g.sisi, g.sisi);
  }
  if (bingkai.lukis) {
    // Tebalkan garis supaya motif kekal kelihatan selepas dikecilkan.
    ganda = 1 / s;
    try {
      bingkai.lukis(c, g, warna);
    } finally {
      ganda = 1; // WAJIB dipulihkan — jalur sebenar guna lebar asal
    }
  }
  c.restore();

  return Math.round(g.tinggi * s);
}

// Tinggi jubin pratonton untuk lebar tertentu — supaya pemanggil boleh
// tetapkan saiz canvas SEBELUM melukis (menetapkan .height mengosongkan
// canvas, jadi melukis dahulu akan terpadam).
export function tinggiPratonton(bingkai, lebarJubin) {
  const g = geometriJalur(bingkai.padding);
  return Math.round((g.tinggi * lebarJubin) / g.lebar);
}
