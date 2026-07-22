// ============================================================
//  UTIL PEMPROSESAN IMEJ (boleh guna semula & diuji)
// ------------------------------------------------------------
//  - kiraDimensi(): kira lebar/tinggi baharu (jaga nisbah aspek)
//  - compressImej(): compress ADAPTIF -> Blob WebP (fallback JPEG)
//      yang dijamin <= sasaran bait (turunkan kualiti/lebar jika perlu)
//  - blobKeBase64(): tukar Blob -> data URI base64
//
//  Sistem ini menyimpan gambar terus DALAM Firestore (base64), jadi
//  SAIZ GAMBAR = SAIZ PANGKALAN DATA. Kuota percuma Firestore ialah
//  1 GB untuk SEMUA majlis, jadi sasaran di bawah dipilih untuk
//  memaksimumkan bilangan gambar yang muat, bukan sekadar untuk
//  kekal di bawah had dokumen 1 MiB.
//
//  Ukuran pada gambar sebenar (720px, sasaran 60KB, WebP):
//    gambar 200-525 KB (JPEG 1080px lama) -> 49-74 KB tersimpan
//    iaitu ~77% lebih kecil; 1 GB muat ~17,000 gambar (dulu ~3,900).
//
//  NOTA: ini satu-satunya salinan gambar — ZIP muat turun pengantin
//  juga menggunakan saiz ini. Menaikkan semula sasaran = menaikkan
//  penggunaan kuota secara terus.
// ============================================================

// Tetapan lalai
export const LEBAR_MAKS = 720; // px
// Sasaran 60KB. Base64 membesarkan ~1.37x -> ~82KB tersimpan.
export const SASARAN_BAIT = 60 * 1000;
// Format utama. WebP ~30% lebih kecil daripada JPEG pada kualiti
// visual yang sama; pelayar lama (Safari/iOS < 14) jatuh ke JPEG.
export const FORMAT_UTAMA = "image/webp";
export const FORMAT_GANTI = "image/jpeg";

/**
 * Kira dimensi baharu dengan mengekalkan nisbah aspek.
 * Hanya kecilkan jika lebih lebar daripada had; tidak membesarkan.
 * @param {number} width
 * @param {number} height
 * @param {number} lebarMaks
 * @returns {{width:number, height:number}}
 */
export function kiraDimensi(width, height, lebarMaks = LEBAR_MAKS) {
  if (width > lebarMaks) {
    height = Math.round((height * lebarMaks) / width);
    width = lebarMaks;
  }
  return { width, height };
}

// Muat fail imej ke elemen Image (dalaman)
function muatImej(fail) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(fail);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Fail ini bukan gambar yang sah."));
    };
    img.src = url;
  });
}

// Adakah pelayar ini boleh menghasilkan WebP melalui canvas?
// Disemak SEKALI sahaja (canvas 1x1) dan hasilnya disimpan — tangga
// mampatan memanggil keBlob() berpuluh kali.
let sokongWebp = null;
async function bolehWebp() {
  if (sokongWebp !== null) return sokongWebp;
  try {
    const c = document.createElement("canvas");
    c.width = 1;
    c.height = 1;
    const b = await new Promise((res) => c.toBlob(res, FORMAT_UTAMA, 0.8));
    // Pelayar yang tidak menyokong WebP memulangkan PNG/JPEG sebaliknya.
    sokongWebp = !!b && b.type === FORMAT_UTAMA;
  } catch {
    sokongWebp = false;
  }
  return sokongWebp;
}

// Lukis imej ke canvas pada lebar tertentu -> Blob (WebP/JPEG) pada
// kualiti tertentu (dalaman)
function keBlob(img, lebarSasaran, kualiti, jenis) {
  const asalW = img.naturalWidth || img.width;
  const asalH = img.naturalHeight || img.height;
  const { width, height } = kiraDimensi(asalW, asalH, lebarSasaran);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d").drawImage(img, 0, 0, width, height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Gagal memproses gambar."))),
      jenis,
      kualiti
    );
  });
}

/**
 * Compress ADAPTIF: pulangkan Blob (WebP, atau JPEG pada pelayar lama)
 * yang dijamin sekecil mungkin. Cuba kekalkan resolusi (turunkan kualiti
 * dahulu), kemudian kecilkan lebar jika masih melebihi sasaran. Berhenti
 * sebaik sahaja <= sasaran.
 * @param {File|Blob} fail
 * @param {{lebarMaks?:number, sasaranBait?:number}} [opts]
 * @returns {Promise<Blob>}
 */
export async function compressImej(fail, opts = {}) {
  const lebarMaks = opts.lebarMaks ?? LEBAR_MAKS;
  const sasaranBait = opts.sasaranBait ?? SASARAN_BAIT;
  const jenis = (await bolehWebp()) ? FORMAT_UTAMA : FORMAT_GANTI;
  const img = await muatImej(fail);

  // Lebar yang lebih besar daripada lebarMaks tiada gunanya — kiraDimensi()
  // tidak membesarkan imej, jadi tangga bermula pada lebarMaks dan menurun.
  const lebarCubaan = [lebarMaks, 640, 560, 480].filter(
    (l, i) => i === 0 || l < lebarMaks
  );
  const kualitiCubaan = [0.8, 0.72, 0.64, 0.56, 0.48];

  let terbaik = null; // simpan yang TERKECIL setakat ini
  for (const lebar of lebarCubaan) {
    for (const q of kualitiCubaan) {
      const blob = await keBlob(img, lebar, q, jenis);
      if (!terbaik || blob.size < terbaik.size) terbaik = blob;
      if (blob.size <= sasaranBait) return blob; // cukup kecil, selesai
    }
  }
  return terbaik; // terkecil yang mampu dicapai (jika tiada yang cukup kecil)
}

/**
 * Tukar Blob -> data URI base64 (untuk disimpan dalam dokumen Firestore).
 * @param {Blob} blob
 * @returns {Promise<string>} cth "data:image/jpeg;base64,...."
 */
export function blobKeBase64(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(new Error("Gagal membaca imej."));
    fr.readAsDataURL(blob);
  });
}
