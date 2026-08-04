// ============================================================
//  LOGIK PANEL ADMIN (moderasi)
// ------------------------------------------------------------
//  - Log masuk guna Firebase Auth (Email/Password)
//  - Papar SEMUA gambar (termasuk yang disembunyikan) real-time
//  - Luluskan / Sembunyikan (toggle approved) & Padam gambar
//
//  KESELAMATAN: operasi update/delete hanya dibenarkan oleh
//  Firestore rules untuk pengguna yang telah log masuk. Tetamu
//  awam TIDAK boleh padam/ubah walaupun mereka buka halaman ini.
// ============================================================

import {
  auth,
  db,
  configSiap,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  onSnapshot,
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
} from "./firebase.js";
import { pasangGayaPolaroid } from "./polaroid.js";
import { dapatEventId } from "./majlis.js";
import { bolehGuna } from "./gating.js";

pasangGayaPolaroid();

// --- Majlis yang dimoderasi (multi-tenancy) ---
// Diambil dari ?e=<eventId>; jika tiada, dicari melalui ownerUid.
let eventId = dapatEventId();
let majlis = null;

// --- Rujukan DOM ---
const zonLogin = document.getElementById("zon-login");
const formLogin = document.getElementById("form-login");
const inputEmel = document.getElementById("input-emel");
const inputKataLaluan = document.getElementById("input-kata-laluan");
const ralatLogin = document.getElementById("ralat-login");
const butangLogin = document.getElementById("butang-login");

const zonPanel = document.getElementById("zon-panel");
const emelAdmin = document.getElementById("emel-admin");
const butangKeluar = document.getElementById("butang-keluar");
const senarai = document.getElementById("senarai");
const zonMemuat = document.getElementById("zon-memuat");
const zonKosong = document.getElementById("zon-kosong");
const statSemua = document.getElementById("stat-semua");
const statLulus = document.getElementById("stat-lulus");
const statSembunyi = document.getElementById("stat-sembunyi");
const butangLuluskanSemua = document.getElementById("butang-luluskan-semua");

// --- Ucapan / buku tetamu (Premium+) ---
const zonUcapanAdmin = document.getElementById("zon-ucapan-admin");
const senaraiUcapan = document.getElementById("senarai-ucapan");
const zonUcapanKosong = document.getElementById("zon-ucapan-kosong");
const statUcapan = document.getElementById("stat-ucapan");

let unsub = null; // untuk hentikan langganan bila log keluar
let unsubUcapan = null; // langganan kedua: koleksi guestbook
let idTersembunyi = []; // id gambar approved:false semasa (untuk luluskan pukal)

// Hentikan KEDUA-DUA langganan. Terlepas satu bermakna ia terus membaca
// (dan dicaj) selepas pengguna log keluar.
function hentikanLangganan() {
  if (unsub) { unsub(); unsub = null; }
  if (unsubUcapan) { unsubUcapan(); unsubUcapan = null; }
}

// ------------------------------------------------------------
//  UTILITI: escape teks -> selamat untuk innerHTML (elak XSS)
// ------------------------------------------------------------
function esc(s) {
  const d = document.createElement("div");
  d.textContent = s ?? "";
  return d.innerHTML;
}
function formatTarikh(created_at) {
  try {
    const dt = created_at?.toDate ? created_at.toDate() : null;
    if (!dt) return "";
    const p = (n) => String(n).padStart(2, "0");
    return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())} ${p(dt.getHours())}:${p(dt.getMinutes())}`;
  } catch {
    return "";
  }
}

// ------------------------------------------------------------
//  LOG MASUK
// ------------------------------------------------------------
formLogin.addEventListener("submit", async (e) => {
  e.preventDefault();
  ralatLogin.classList.add("hidden");

  if (!configSiap()) {
    ralatLogin.textContent = "Sistem belum dikonfigurasi.";
    ralatLogin.classList.remove("hidden");
    return;
  }

  butangLogin.disabled = true;
  const teksAsal = butangLogin.textContent;
  butangLogin.textContent = "Sedang log masuk…";

  try {
    await signInWithEmailAndPassword(auth, inputEmel.value.trim(), inputKataLaluan.value);
    // onAuthStateChanged akan uruskan paparan panel
  } catch (err) {
    console.error("Ralat log masuk:", err);
    const kod = err.code || "";
    let mesej = "Log masuk gagal. Sila cuba lagi.";
    if (kod.includes("invalid-credential") || kod.includes("wrong-password") || kod.includes("user-not-found")) {
      mesej = "Emel atau kata laluan salah.";
    } else if (kod.includes("invalid-email")) {
      mesej = "Format emel tidak sah.";
    } else if (kod.includes("too-many-requests")) {
      mesej = "Terlalu banyak cubaan. Sila tunggu sebentar.";
    } else if (kod.includes("network")) {
      mesej = "Tiada sambungan internet.";
    } else if (kod.includes("operation-not-allowed")) {
      mesej = "Email/Password belum diaktifkan dalam Firebase Console.";
    } else if (kod.includes("configuration-not-found")) {
      mesej = "Firebase Authentication belum diaktifkan. Aktifkan Email/Password dalam Console.";
    }
    ralatLogin.textContent = mesej;
    ralatLogin.classList.remove("hidden");
    inputKataLaluan.value = "";
  } finally {
    butangLogin.disabled = false;
    butangLogin.textContent = teksAsal;
  }
});

// ------------------------------------------------------------
//  LOG KELUAR
// ------------------------------------------------------------
butangKeluar.addEventListener("click", async () => {
  hentikanLangganan();
  await signOut(auth);
});

// ------------------------------------------------------------
//  PANTAU KEADAAN LOG MASUK
// ------------------------------------------------------------
onAuthStateChanged(auth, async (user) => {
  if (user) {
    // Tentukan majlis mana yang dimoderasi
    const sedia = await sediakanMajlis(user.uid);
    if (!sedia) {
      zonLogin.classList.add("hidden");
      zonPanel.classList.remove("hidden");
      emelAdmin.textContent = user.email || "";
      senarai.innerHTML =
        `<p class="col-span-full text-center text-[#8a7a70] py-12">Tiada majlis untuk akaun ini. Sila hubungi admin.</p>`;
      zonMemuat.classList.add("hidden");
      return;
    }
    zonLogin.classList.add("hidden");
    zonPanel.classList.remove("hidden");
    emelAdmin.textContent = user.email || "";
    // Papar nama majlis yang sedang dimoderasi
    if (majlis?.coupleName) {
      const tajuk = document.querySelector("#zon-panel h1");
      if (tajuk) tajuk.textContent = `Moderasi — ${majlis.coupleName}`;
    }
    // Bawa eventId pada pautan galeri
    const pautanGaleri = document.getElementById("pautan-galeri");
    if (pautanGaleri) {
      pautanGaleri.href = `gallery.html?e=${encodeURIComponent(eventId)}`;
    }
    mulaLangganan();
    // Bahagian ucapan hanya untuk majlis yang pakejnya membukanya.
    if (bolehGuna(majlis, "guestbook")) {
      zonUcapanAdmin?.classList.remove("hidden");
      mulaLanggananUcapan();
    } else {
      zonUcapanAdmin?.classList.add("hidden");
    }
  } else {
    hentikanLangganan();
    zonPanel.classList.add("hidden");
    zonLogin.classList.remove("hidden");
    senarai.innerHTML = "";
    if (senaraiUcapan) senaraiUcapan.innerHTML = "";
    zonUcapanAdmin?.classList.add("hidden");
    eventId = dapatEventId();
    majlis = null;
  }
});

// ------------------------------------------------------------
//  Tentukan majlis: guna ?e=<eventId>, atau cari milik pengguna.
//  Pulangkan true jika majlis sedia untuk dimoderasi.
// ------------------------------------------------------------
async function sediakanMajlis(uid) {
  try {
    if (!eventId) {
      // Cari majlis milik pengguna ini
      const snap = await getDocs(
        query(collection(db, "events"), where("ownerUid", "==", uid), limit(1))
      );
      if (snap.empty) return false;
      eventId = snap.docs[0].id;
      majlis = { id: eventId, ...snap.docs[0].data() };
      return true;
    }
    const d = await getDoc(doc(db, "events", eventId));
    if (!d.exists()) return false;
    majlis = { id: d.id, ...d.data() };
    return true;
  } catch (err) {
    console.error("Ralat memuat majlis:", err);
    return false;
  }
}

// ------------------------------------------------------------
//  LANGGANAN SEMUA GAMBAR (real-time) — hanya untuk admin
// ------------------------------------------------------------
function mulaLangganan() {
  zonMemuat.classList.remove("hidden");
  // Skop majlis + tiada penapis approved -> pemilik nampak SEMUA
  // gambar majlisnya (termasuk yang disembunyikan).
  const q = query(
    collection(db, "photos"),
    where("eventId", "==", eventId),
    orderBy("created_at", "desc")
  );

  unsub = onSnapshot(
    q,
    (snap) => {
      zonMemuat.classList.add("hidden");
      senarai.innerHTML = "";

      let lulus = 0, sembunyi = 0;
      idTersembunyi = [];
      snap.forEach((d) => {
        const p = d.data();
        if (p.approved) lulus++;
        else { sembunyi++; idTersembunyi.push(d.id); }
        senarai.appendChild(binaKad(d.id, p));
      });

      statSemua.textContent = snap.size;
      statLulus.textContent = lulus;
      statSembunyi.textContent = sembunyi;
      zonKosong.classList.toggle("hidden", snap.size > 0);
      kemasKiniButangLuluskanSemua(sembunyi);
    },
    (err) => {
      console.error("Ralat langganan admin:", err);
      zonMemuat.classList.add("hidden");
      senarai.innerHTML =
        `<p class="col-span-full text-center text-red-600">Gagal memuat gambar. Semak rules & sambungan.</p>`;
    }
  );
}

// ------------------------------------------------------------
//  LANGGANAN UCAPAN (buku tetamu) — real-time
// ------------------------------------------------------------
//  Koleksi BERASINGAN daripada photos. Sama seperti gambar: tiada
//  penapis approved, jadi pemilik nampak juga ucapan tersembunyi
//  (dibenarkan oleh cabang pemilik dalam firestore.rules).
// ------------------------------------------------------------
function mulaLanggananUcapan() {
  if (!senaraiUcapan) return;
  const q = query(
    collection(db, "guestbook"),
    where("eventId", "==", eventId),
    orderBy("created_at", "desc")
  );

  unsubUcapan = onSnapshot(
    q,
    (snap) => {
      senaraiUcapan.innerHTML = "";
      snap.forEach((d) => senaraiUcapan.appendChild(binaKadUcapan(d.id, d.data())));
      if (statUcapan) statUcapan.textContent = `${snap.size} ucapan`;
      zonUcapanKosong?.classList.toggle("hidden", snap.size > 0);
    },
    (err) => {
      console.error("Ralat langganan ucapan:", err);
      const teks = String(err?.message || "").includes("index")
        ? "Ucapan memerlukan index Firestore. Buka konsol pelayar (F12) dan klik pautan yang diberi."
        : "Gagal memuat ucapan. Semak rules & sambungan.";
      senaraiUcapan.innerHTML =
        `<p class="col-span-full text-center text-red-600">${esc(teks)}</p>`;
    }
  );
}

// ------------------------------------------------------------
//  KAD MODERASI UCAPAN (teks sahaja — tiada gambar)
// ------------------------------------------------------------
function binaKadUcapan(id, u) {
  const kad = document.createElement("div");
  kad.className =
    "rounded-2xl border bg-white/70 p-3 shadow-sm " +
    (u.approved ? "border-[#e5d5ca]" : "border-red-300 opacity-70");

  const lencana = u.approved
    ? `<span class="rounded-full bg-green-100 text-green-700 text-xs px-2 py-0.5">Dipapar</span>`
    : `<span class="rounded-full bg-red-100 text-red-700 text-xs px-2 py-0.5">Disembunyikan</span>`;

  // esc() pada SETIAP nilai — ini innerHTML dan teks ini datang dari tetamu.
  kad.innerHTML = `
    <div class="flex items-center justify-between gap-2 mb-1.5">
      <p class="font-medium text-sm text-[#5a4a42] truncate">${esc(u.name) || "Tetamu"}</p>
      ${lencana}
    </div>
    <p class="text-sm text-[#8a7a70] mb-1 break-words whitespace-pre-line">${esc(u.message)}</p>
    <p class="text-[11px] text-[#a09088] mb-3">${esc(formatTarikh(u.created_at))}</p>
    <div class="flex gap-2">
      <button data-act="toggle" class="flex-1 rounded-lg py-2 text-sm font-medium ${
        u.approved
          ? "bg-amber-50 text-amber-700 hover:bg-amber-100"
          : "bg-green-50 text-green-700 hover:bg-green-100"
      }">${u.approved ? "Sembunyikan" : "Luluskan"}</button>
      <button data-act="delete" class="rounded-lg px-3 py-2 text-sm font-medium bg-red-50 text-red-600 hover:bg-red-100">Padam</button>
    </div>
  `;

  kad.querySelector('[data-act="toggle"]').addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      await updateDoc(doc(db, "guestbook", id), { approved: !u.approved });
      // UI dikemas kini automatik oleh onSnapshot
    } catch (err) {
      console.error(err);
      alert("Gagal mengemas kini. Sila cuba lagi.");
      btn.disabled = false;
    }
  });

  kad.querySelector('[data-act="delete"]').addEventListener("click", async (e) => {
    if (!confirm(`Padam ucapan daripada "${u.name || "Tetamu"}"? Tindakan ini tidak boleh dibatalkan.`)) return;
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      await deleteDoc(doc(db, "guestbook", id));
    } catch (err) {
      console.error(err);
      alert("Gagal memadam. Sila cuba lagi.");
      btn.disabled = false;
    }
  });

  return kad;
}

// ------------------------------------------------------------
//  LULUSKAN SEMUA (pukal) — tampilkan semua gambar tersembunyi
// ------------------------------------------------------------
//  Mematikan suis pra-moderasi hanya menjejaskan muat naik AKAN
//  DATANG; gambar sedia ada yang approved:false kekal tersembunyi.
//  Butang ini meluluskan kesemuanya dalam satu klik.
// ------------------------------------------------------------
function kemasKiniButangLuluskanSemua(sembunyi) {
  if (!butangLuluskanSemua) return;
  butangLuluskanSemua.classList.toggle("hidden", sembunyi === 0);
  butangLuluskanSemua.textContent = `✓ Luluskan semua yang tersembunyi (${sembunyi})`;
}

if (butangLuluskanSemua) {
  butangLuluskanSemua.addEventListener("click", async () => {
    const ids = [...idTersembunyi]; // salin: snapshot boleh mengubahnya
    if (ids.length === 0) return;
    if (!confirm(`Luluskan ${ids.length} gambar tersembunyi supaya tampil di galeri?`)) return;

    butangLuluskanSemua.disabled = true;
    butangLuluskanSemua.textContent = "Sedang meluluskan…";
    try {
      // Firestore had 500 operasi/batch — pecah kepada kelompok selamat.
      for (let i = 0; i < ids.length; i += 400) {
        const batch = writeBatch(db);
        for (const id of ids.slice(i, i + 400)) {
          batch.update(doc(db, "photos", id), { approved: true });
        }
        await batch.commit();
      }
      // UI dikemas kini automatik oleh onSnapshot.
    } catch (err) {
      console.error("Ralat luluskan semua:", err);
      alert("Gagal meluluskan sebahagian gambar. Sila cuba lagi.");
    } finally {
      butangLuluskanSemua.disabled = false;
      // Label diselaraskan semula oleh kemasKiniButangLuluskanSemua()
      // apabila snapshot seterusnya tiba.
    }
  });
}

// ------------------------------------------------------------
//  BINA KAD MODERASI (guna innerHTML dengan teks di-escape)
// ------------------------------------------------------------
function binaKad(id, p) {
  const kad = document.createElement("div");
  kad.className =
    "rounded-2xl border bg-white/70 overflow-hidden shadow-sm " +
    (p.approved ? "border-[#e5d5ca]" : "border-red-300 opacity-70");

  const lencana = p.approved
    ? `<span class="rounded-full bg-green-100 text-green-700 text-xs px-2 py-0.5">Dipapar</span>`
    : `<span class="rounded-full bg-red-100 text-red-700 text-xs px-2 py-0.5">Disembunyikan</span>`;

  kad.innerHTML = `
    <div class="aspect-square bg-[#f2ede8]">
      <img src="${esc(p.image_url || p.thumb_url)}" alt="Gambar daripada ${esc(p.name)}" loading="lazy" class="w-full h-full object-cover" />
    </div>
    <div class="p-3">
      <div class="flex items-center justify-between gap-2 mb-1">
        <p class="font-medium text-sm text-[#5a4a42] truncate">${esc(p.name) || "Tetamu"}</p>
        ${lencana}
      </div>
      ${p.message ? `<p class="text-sm text-[#8a7a70] mb-1 break-words">${esc(p.message)}</p>` : ""}
      <p class="text-[11px] text-[#a09088] mb-3">${esc(formatTarikh(p.created_at))}</p>
      <div class="flex gap-2">
        <button data-act="toggle" class="flex-1 rounded-lg py-2 text-sm font-medium ${
          p.approved
            ? "bg-amber-50 text-amber-700 hover:bg-amber-100"
            : "bg-green-50 text-green-700 hover:bg-green-100"
        }">${p.approved ? "Sembunyikan" : "Luluskan"}</button>
        <button data-act="delete" class="rounded-lg px-3 py-2 text-sm font-medium bg-red-50 text-red-600 hover:bg-red-100">Padam</button>
      </div>
    </div>
  `;

  // Toggle approved
  kad.querySelector('[data-act="toggle"]').addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      await updateDoc(doc(db, "photos", id), { approved: !p.approved });
      // UI dikemas kini automatik oleh onSnapshot
    } catch (err) {
      console.error(err);
      alert("Gagal mengemas kini. Sila cuba lagi.");
      btn.disabled = false;
    }
  });

  // Padam (dengan pengesahan)
  kad.querySelector('[data-act="delete"]').addEventListener("click", async (e) => {
    if (!confirm(`Padam gambar daripada "${p.name || "Tetamu"}"? Tindakan ini tidak boleh dibatalkan.`)) return;
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      await deleteDoc(doc(db, "photos", id));
    } catch (err) {
      console.error(err);
      alert("Gagal memadam. Sila cuba lagi.");
      btn.disabled = false;
    }
  });

  return kad;
}
