// ============================================================
//  LOGIK LIVE WALL (paparan projektor/TV)
// ------------------------------------------------------------
//  - Langgan gambar Firestore secara REAL-TIME (onSnapshot)
//  - Slideshow auto: papar satu polaroid besar bergilir-gilir
//  - Bila ada gambar BAHARU dihantar, ia dipaparkan serta-merta
//    dengan lencana "Baru dihantar!"
//  - Keadaan kosong + kendali ralat
// ============================================================

import {
  db,
  configSiap,
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
} from "./firebase.js";
import { NAMA_PENGANTIN } from "./config.js";
import { createPolaroid, pasangGayaPolaroid } from "./polaroid.js";
import {
  dapatEventId,
  muatEvent,
  terapTema,
  mesejMajlisTakBoleh,
} from "./majlis.js";
import { bolehGuna, mesejNaikTaraf } from "./gating.js";

pasangGayaPolaroid();

const MASA_SLIDE = 6000; // 6 saat setiap gambar
const HAD = 60; // bilangan gambar terkini yang dilanggan

// --- Majlis semasa (multi-tenancy) ---
const eventId = dapatEventId();

const pentas = document.getElementById("pentas");
const zonKosong = document.getElementById("zon-kosong");
const zonRalat = document.getElementById("zon-ralat");
const lencanaBaru = document.getElementById("lencana-baru");
const kiraan = document.getElementById("kiraan");
const tajukNama = document.getElementById("tajuk-nama");

// Set nama pengantin (jika diubah dalam config)
if (NAMA_PENGANTIN && NAMA_PENGANTIN !== "Pengantin") {
  tajukNama.textContent = NAMA_PENGANTIN;
}

let semua = []; // {id, name, message, image_url}
let indeks = 0;
let sudahMula = false;
let pemasa = null;
const dilihat = new Set();

// ------------------------------------------------------------
//  PAPAR SATU GAMBAR DI PENTAS
// ------------------------------------------------------------
function papar(i, baru = false) {
  if (!semua.length) return;
  indeks = ((i % semua.length) + semua.length) % semua.length;
  const p = semua[indeks];

  pentas.innerHTML = "";
  const kad = createPolaroid({
    // Gambar base64 penuh; fallback ke thumb_url untuk dokumen lama (jika ada)
    imageUrl: p.image_url || p.thumb_url,
    name: p.name,
    message: p.message,
  });
  pentas.appendChild(kad);

  // Lencana "Baru dihantar!"
  lencanaBaru.classList.toggle("hidden", !baru);
  if (baru) {
    clearTimeout(lencanaBaru._t);
    lencanaBaru._t = setTimeout(() => lencanaBaru.classList.add("hidden"), 5000);
  }
}

function mulaPemasa() {
  clearInterval(pemasa);
  pemasa = setInterval(() => papar(indeks + 1), MASA_SLIDE);
}

function keadaanAdaGambar() {
  zonKosong.classList.add("hidden");
  pentas.classList.remove("hidden");
}

function keadaanKosong() {
  pentas.classList.add("hidden");
  zonKosong.classList.remove("hidden");
  clearInterval(pemasa);
}

// ------------------------------------------------------------
//  LANGGANAN REAL-TIME
// ------------------------------------------------------------
function paparRalatWall(mesej) {
  zonRalat.textContent = mesej;
  zonRalat.classList.remove("hidden");
}

(async function mula() {
  if (!configSiap()) {
    paparRalatWall("Sistem belum dikonfigurasi. Sila hubungi penganjur.");
    return;
  }
  if (!eventId) {
    paparRalatWall("Pautan tidak lengkap. Live Wall perlu pautan majlis (?e=...).");
    return;
  }

  // Muat majlis: perlu untuk gating pakej + tema + nama
  let majlis = null;
  try {
    majlis = await muatEvent(eventId);
  } catch {
    paparRalatWall("Majlis ini tidak aktif atau telah tamat tempoh.");
    return;
  }
  if (!majlis) {
    paparRalatWall("Majlis tidak dijumpai. Sila semak pautan.");
    return;
  }
  if (majlis.status !== "active") {
    paparRalatWall(mesejMajlisTakBoleh(majlis));
    return;
  }

  // --- GATING PAKEJ: Live Wall untuk Premium ke atas ---
  if (!bolehGuna(majlis, "liveWall")) {
    paparRalatWall(
      `Live Wall untuk skrin majlis. ${mesejNaikTaraf("liveWall")} Hubungi admin untuk naik taraf.`
    );
    return;
  }

  // Peribadikan paparan
  terapTema(majlis);
  if (majlis.coupleName) tajukNama.textContent = majlis.coupleName;

  const q = query(
    collection(db, "photos"),
    where("eventId", "==", eventId),
    where("approved", "==", true),
    orderBy("created_at", "desc"),
    limit(HAD)
  );

  onSnapshot(
    q,
    (snap) => {
      zonRalat.classList.add("hidden");

      // Kesan gambar BAHARU (hanya selepas muatan pertama)
      let adaBaru = false;
      snap.docChanges().forEach((ch) => {
        if (ch.type === "added" && sudahMula && !dilihat.has(ch.doc.id)) {
          adaBaru = true;
        }
      });

      // Bina semula senarai (terbaru dahulu)
      semua = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      semua.forEach((p) => dilihat.add(p.id));
      kiraan.textContent = semua.length;

      // Muatan pertama
      if (!sudahMula) {
        sudahMula = true;
        if (semua.length) {
          keadaanAdaGambar();
          papar(0);
          mulaPemasa();
        } else {
          keadaanKosong();
        }
        return;
      }

      // Kemas kini seterusnya
      if (!semua.length) {
        keadaanKosong();
        return;
      }
      keadaanAdaGambar();

      if (adaBaru) {
        // Gambar baharu ialah yang terbaru -> indeks 0
        papar(0, true);
        mulaPemasa(); // reset supaya gambar baharu dipapar penuh
      } else if (!pentas.querySelector(".polaroid")) {
        // Pulih dari keadaan kosong sebelum ini
        papar(0);
        mulaPemasa();
      }
    },
    (err) => {
      console.error("Ralat wall:", err);
      if (String(err.message || "").includes("index")) {
        zonRalat.textContent =
          "Perlu index Firestore. Buka konsol (F12) & klik pautan untuk menciptanya.";
      } else {
        zonRalat.textContent = "Gagal menyambung ke pangkalan data.";
      }
      zonRalat.classList.remove("hidden");
    }
  );
})();

// ------------------------------------------------------------
//  SKRIN PENUH + SEMBUNYI KAWALAN BILA MELAHU
// ------------------------------------------------------------
const butangPenuh = document.getElementById("butang-penuh");
if (butangPenuh) {
  butangPenuh.addEventListener("click", () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  });
}

// Sembunyikan kawalan & kursor selepas 4 saat tiada pergerakan
let pemasaMelahu = null;
const kawalan = document.getElementById("kawalan");
function tunjukKawalan() {
  document.body.classList.remove("melahu");
  kawalan?.classList.remove("opacity-0");
  clearTimeout(pemasaMelahu);
  pemasaMelahu = setTimeout(() => {
    document.body.classList.add("melahu");
    kawalan?.classList.add("opacity-0");
  }, 4000);
}
document.addEventListener("mousemove", tunjukKawalan);
document.addEventListener("touchstart", tunjukKawalan);
tunjukKawalan();
