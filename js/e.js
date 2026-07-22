// ============================================================
//  LANDING MAJLIS AWAM (e.html)
// ------------------------------------------------------------
//  - Baca slug dari URL: ?e=<slug>  ATAU  path /e/<slug>
//  - Resolusi: slugs/<slug> -> eventId -> events/<eventId>
//  - Jika majlis tidak aktif / tamat / tidak wujud -> papar mesej.
//  - Terap tema warna + mesej aluan; bina butang ke sub-halaman
//    (upload/galeri/wall) dengan ?e=<eventId>.
// ============================================================

import { db, doc, getDoc } from "./firebase.js";
import { formatTarikhMajlis } from "./majlis.js";

const HAD_TANPA_HAD = 100000;

const zonMemuat = document.getElementById("zon-memuat");
const zonRalat = document.getElementById("zon-ralat");
const ralatTajuk = document.getElementById("ralat-tajuk");
const ralatMesej = document.getElementById("ralat-mesej");
const zonLanding = document.getElementById("zon-landing");

const lNama = document.getElementById("l-nama");
const lTarikh = document.getElementById("l-tarikh");
const lWelcome = document.getElementById("l-welcome");
const lUpload = document.getElementById("l-upload");
const lGaleri = document.getElementById("l-galeri");
const lWall = document.getElementById("l-wall");

// ------------------------------------------------------------
//  Dapatkan slug dari URL (sokong query param & path cantik)
// ------------------------------------------------------------
function dapatSlug() {
  const params = new URLSearchParams(location.search);
  let slug = params.get("e");
  if (!slug) {
    const m = location.pathname.match(/\/e\/([^/?#]+)/);
    if (m) slug = decodeURIComponent(m[1]);
  }
  return (slug || "").trim();
}

function paparRalat(tajuk, mesej) {
  zonMemuat.classList.add("hidden");
  zonLanding.classList.add("hidden");
  ralatTajuk.textContent = tajuk;
  ralatMesej.textContent = mesej;
  zonRalat.classList.remove("hidden");
}

// ------------------------------------------------------------
//  Aliran utama
// ------------------------------------------------------------
(async function mula() {
  const slug = dapatSlug();
  if (!slug) {
    paparRalat("Pautan tidak lengkap", "URL majlis tidak sah. Sila imbas semula kod QR.");
    return;
  }

  try {
    // 1) slug -> eventId
    const slugSnap = await getDoc(doc(db, "slugs", slug));
    if (!slugSnap.exists()) {
      paparRalat("Majlis tidak dijumpai", "Pautan ini mungkin salah. Sila semak semula.");
      return;
    }
    const eventId = slugSnap.data().eventId;

    // 2) eventId -> event. Jika status != active, rules akan TOLAK baca
    //    untuk tetamu -> kita anggap majlis tidak aktif.
    let ev;
    try {
      const evSnap = await getDoc(doc(db, "events", eventId));
      if (!evSnap.exists()) {
        paparRalat("Majlis tidak dijumpai", "Maklumat majlis tiada. Hubungi pengantin.");
        return;
      }
      ev = evSnap.data();
    } catch {
      paparRalat("Majlis tidak aktif", "Majlis ini belum diaktifkan atau telah tamat tempoh.");
      return;
    }

    // 3) Semak status & tarikh luput
    const luput = ev.expiresAt?.toDate
      ? ev.expiresAt.toDate().getTime() < Date.now()
      : false;
    if (ev.status !== "active" || luput) {
      paparRalat("Majlis telah tamat", "Majlis ini tidak lagi menerima muat naik gambar. Terima kasih!");
      return;
    }

    // 4) Terap tema + kandungan
    document.documentElement.style.setProperty("--tema", ev.themeColor || "#b76e79");
    lNama.textContent = ev.coupleName || "Majlis Perkahwinan";
    const tarikh = formatTarikhMajlis(ev.weddingDate);
    lTarikh.textContent = tarikh ? `✦ ${tarikh} ✦` : "";
    lWelcome.textContent = ev.welcomeMessage || "";

    // 5) Butang ke sub-halaman (guna eventId).
    //    Laluan dikira dari import.meta.url (modul ini berada di <root>/js/),
    //    jadi ASAS ialah root tapak — betul untuk ketiga-tiga keadaan:
    //    root domain, sub-direktori (GitHub Pages project site), dan URL
    //    cantik /e/<slug> di mana URL pelayar tidak menunjukkan lokasi
    //    sebenar fail. Halaman muat naik = index.html.
    const eid = encodeURIComponent(eventId);
    lUpload.href = new URL(`../index.html?e=${eid}`, import.meta.url).href;
    lGaleri.href = new URL(`../gallery.html?e=${eid}`, import.meta.url).href;
    if (ev.package === "premium") {
      lWall.href = new URL(`../wall.html?e=${eid}`, import.meta.url).href;
      lWall.classList.remove("hidden");
    }

    zonMemuat.classList.add("hidden");
    zonLanding.classList.remove("hidden");
  } catch (err) {
    console.error("Ralat memuat majlis:", err);
    paparRalat("Ralat", "Gagal memuat majlis. Semak sambungan internet anda.");
  }
})();
