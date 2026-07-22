// ============================================================
//  KOMPONEN POLAROID (boleh guna semula)
// ------------------------------------------------------------
//  createPolaroid({ imageUrl, name, message }) -> HTMLElement
//
//  Menghasilkan satu kad polaroid klasik:
//    - bingkai putih dengan ruang tebal di bawah untuk tulisan
//    - sudut sedikit membulat + bayang lembut
//    - putaran kecil rawak (-4deg .. +4deg) supaya nampak semula jadi
//    - nama + ucapan guna font tulisan tangan (Caveat)
//
//  KESELAMATAN: semua teks pengguna dimasukkan guna textContent
//  (bukan innerHTML) untuk elak XSS.
// ============================================================

// Hash ringkas & deterministik dari string -> nombor.
// Diguna supaya sudut putaran SAMA setiap kali di-render
// (tidak berkedip / beralih bila galeri dimuat semula).
function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0; // paksa 32-bit int
  }
  return Math.abs(h);
}

// Pulangkan sudut putaran deterministik antara -4 dan +4 darjah,
// berdasarkan seed (nama + url) supaya setiap kad konsisten.
function sudutPutaran(seed) {
  const h = hashString(seed);
  return ((h % 900) / 100 - 4.5) + 0.5; // julat lebih kurang -4 .. +4
}

/**
 * Bina satu elemen polaroid.
 * @param {{imageUrl: string, name: string, message?: string}} data
 * @returns {HTMLElement}
 */
export function createPolaroid({ imageUrl, name, message }) {
  const seed = (name || "") + "|" + (imageUrl || "");
  const rotate = sudutPutaran(seed).toFixed(2);

  // Bekas luar — kad polaroid
  const kad = document.createElement("figure");
  kad.className = "polaroid";
  kad.style.setProperty("--rot", `${rotate}deg`);

  // Bahagian gambar (bingkai putih nipis di atas & tepi)
  const bingkaiImej = document.createElement("div");
  bingkaiImej.className = "polaroid__imgwrap";

  const img = document.createElement("img");
  img.className = "polaroid__img";
  img.src = imageUrl;
  img.loading = "lazy"; // lazy load
  img.decoding = "async";
  img.alt = name ? `Gambar daripada ${name}` : "Gambar tetamu majlis";
  bingkaiImej.appendChild(img);

  // Kaki polaroid — ruang tulisan tangan
  const kaki = document.createElement("figcaption");
  kaki.className = "polaroid__caption";

  if (message && message.trim()) {
    const msg = document.createElement("p");
    msg.className = "polaroid__message";
    msg.textContent = message.trim(); // textContent = selamat dari XSS
    kaki.appendChild(msg);
  }

  const nama = document.createElement("p");
  nama.className = "polaroid__name";
  nama.textContent = name && name.trim() ? `— ${name.trim()}` : "— Tetamu";
  kaki.appendChild(nama);

  kad.appendChild(bingkaiImej);
  kad.appendChild(kaki);

  return kad;
}

// ------------------------------------------------------------
//  Gaya polaroid disuntik sekali sahaja ke <head>.
//  Diletak di sini supaya komponen ini benar-benar "plug & play"
//  di mana-mana halaman yang mengimportnya.
// ------------------------------------------------------------
export function pasangGayaPolaroid() {
  if (document.getElementById("polaroid-style")) return; // sudah dipasang

  const style = document.createElement("style");
  style.id = "polaroid-style";
  style.textContent = `
    .polaroid {
      --rot: 0deg;
      background: #fffdf9;
      padding: 14px 14px 0 14px;
      border-radius: 6px;
      box-shadow: 0 10px 25px -8px rgba(80, 50, 40, 0.35),
                  0 2px 6px rgba(80, 50, 40, 0.15);
      transform: rotate(var(--rot));
      transition: transform .35s ease, box-shadow .35s ease;
      display: inline-block;
      width: 100%;
      margin: 0;
      /* Animasi muncul: fade + sedikit scale */
      animation: polaroidMasuk .6s cubic-bezier(.2,.7,.3,1) both;
    }
    @keyframes polaroidMasuk {
      from { opacity: 0; transform: rotate(var(--rot)) scale(.92) translateY(12px); }
      to   { opacity: 1; transform: rotate(var(--rot)) scale(1) translateY(0); }
    }
    /* Hover effect (desktop) — tegakkan & angkat sedikit */
    @media (hover: hover) {
      .polaroid:hover {
        transform: rotate(0deg) scale(1.03);
        box-shadow: 0 18px 40px -10px rgba(80, 50, 40, 0.45),
                    0 4px 10px rgba(80, 50, 40, 0.2);
        z-index: 5;
      }
    }
    .polaroid__imgwrap {
      background: #eee;
      overflow: hidden;
      border-radius: 3px;
      line-height: 0;
    }
    .polaroid__img {
      width: 100%;
      height: auto;
      display: block;
      object-fit: cover;
    }
    .polaroid__caption {
      padding: 12px 6px 20px 6px;
      text-align: center;
    }
    .polaroid__message {
      font-family: 'Caveat', cursive;
      font-size: 1.4rem;
      line-height: 1.2;
      color: #4a3f3a;
      margin: 0 0 6px 0;
      word-break: break-word;
    }
    .polaroid__name {
      font-family: 'Caveat', cursive;
      font-size: 1.15rem;
      color: #9a6a5a;
      margin: 0;
      word-break: break-word;
    }
  `;
  document.head.appendChild(style);
}
