// ============================================================
//  PENGALIH MAJLIS AWAM (e.html)
// ------------------------------------------------------------
//  Sasaran QR/pautan. Tugasnya ringkas: selesaikan slug -> eventId,
//  sahkan majlis aktif & belum tamat, kemudian ALIH terus ke galeri
//  gabungan (gallery.html?e=<eventId>) yang mengandungi galeri + modal
//  muat naik + Live Wall. Tiada lagi skrin landing 3-butang.
//
//  - Baca slug dari URL: ?e=<slug>  ATAU  path /e/<slug>
//  - Resolusi: slugs/<slug> -> eventId -> events/<eventId>
//  - Jika majlis tidak aktif / tamat / tidak wujud -> papar mesej ralat.
// ============================================================

import { db, doc, getDoc } from "./firebase.js";
import { terapTema } from "./majlis.js";

const zonMemuat = document.getElementById("zon-memuat");
const zonRalat = document.getElementById("zon-ralat");
const ralatTajuk = document.getElementById("ralat-tajuk");
const ralatMesej = document.getElementById("ralat-mesej");

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

    // 4) Terap tema (elak kilatan warna berbeza sebelum galeri memuat).
    terapTema(ev);

    // 5) Terus alih ke GALERI GABUNGAN (galeri + modal muat naik) menggunakan
    //    eventId yang telah diselesaikan. Galeri sendiri yang mengendalikan
    //    muat naik, Live Wall (Premium), dan tema. Tiada lagi skrin landing
    //    3-butang. `replace` supaya butang "back" tidak balik ke halaman ini.
    //    Laluan dikira dari import.meta.url (modul di <root>/js/) supaya betul
    //    untuk root domain, sub-direktori, dan URL cantik /e/<slug>.
    const eid = encodeURIComponent(eventId);
    location.replace(new URL(`../gallery.html?e=${eid}`, import.meta.url).href);
    return;
  } catch (err) {
    console.error("Ralat memuat majlis:", err);
    paparRalat("Ralat", "Gagal memuat majlis. Semak sambungan internet anda.");
  }
})();
