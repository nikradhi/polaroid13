// ============================================================
//  PENGAWAL HALAMAN ROOT (index.html)
// ------------------------------------------------------------
//  Borang muat naik kini hidup DALAM galeri (gallery.html) sebagai
//  modal. Jadi index.html hanya main dua peranan:
//
//   (a) Keserasian pautan lama: index.html?e=<eventId>
//       -> alih terus ke gallery.html?e=<eventId>.
//   (b) Laman pemasaran: bila TIADA ?e= (bakal pelanggan mendarat di
//       root), papar CTA "buat galeri sendiri" -> pakej.html.
// ============================================================

import { dapatEventId } from "./majlis.js";
import { db, doc, getDoc } from "./firebase.js";

const eventId = dapatEventId();

if (eventId) {
  // Pautan lama ke halaman muat naik -> galeri gabungan.
  location.replace(`gallery.html?e=${encodeURIComponent(eventId)}`);
} else {
  // Bakal pelanggan: sembunyikan borang, dedah CTA pakej.
  document.getElementById("form-upload")?.classList.add("hidden");
  document.querySelector("footer")?.classList.add("hidden");

  const zonRalat = document.getElementById("zon-majlis-ralat");
  const tajuk = document.getElementById("majlis-ralat-tajuk");
  const mesej = document.getElementById("majlis-ralat-mesej");
  if (tajuk) tajuk.textContent = "Buat galeri polaroid anda sendiri";
  if (mesej)
    mesej.textContent =
      "Halaman ini untuk tetamu majlis. Nak cipta galeri untuk majlis anda?";
  zonRalat?.classList.remove("hidden");
  document.getElementById("cta-pakej")?.classList.remove("hidden");
  // Bar atas (nama produk + Log masuk) hanya untuk bakal/sedia pelanggan,
  // bukan tetamu majlis — sebab itu ia didedah di sini sahaja.
  document.getElementById("bar-atas")?.classList.remove("hidden");

  // Butang "Cuba Demo" hanya bila majlis demo benar-benar wujud. `slugs`
  // boleh dibaca awam, jadi tiada log masuk diperlukan. Kegagalan dibiar
  // senyap: butang sekadar kekal tersembunyi, halaman tetap berfungsi.
  getDoc(doc(db, "slugs", "demo"))
    .then((snap) => {
      if (snap.exists()) {
        document.getElementById("pautan-demo")?.classList.remove("hidden");
      }
    })
    .catch(() => {});
}
