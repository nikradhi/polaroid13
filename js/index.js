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
}
