# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Polaroid Online Wedding** — guests upload a photo + message from their phone; photos display as classic polaroids. Wedding-scale, zero-cost hosting: no backend, no build step, no Firebase Storage / Blaze plan.

**Language convention:** all code, comments, UI text, and identifiers are in **Bahasa Melayu** (e.g. `tunjukStatus`, `butangHantar`, `zonGaleri`, `gagal`/`berjaya`). Keep new code in Malay to match. User-facing error messages are also Malay.

## Stack & running

Pure **HTML + vanilla JS ES modules + Tailwind (CDN) + Firebase (CDN)**. No `package.json`, no bundler, no lint/test tooling.

Because it uses ES modules, it **must be served over HTTP** (not `file://`):

```bash
npx serve .          # or:
python -m http.server 8000
```

There are **no automated tests** — `README.md` holds a manual test checklist (`Senarai Semak Ujian`). Deploy is drag-and-drop to Netlify or import to Vercel (preset "Other", no build).

### Firebase setup required before it works
1. Paste your project's `firebaseConfig` into [js/config.js](js/config.js) (safe to commit — security comes from rules, not secrecy).
2. Enable **Firestore** (not Storage). Publish [firestore.rules](firestore.rules).
3. Enable **Auth → Email/Password** and create an admin user (only needed for [admin.html](admin.html)).
4. Create the composite index (see below) — easiest by opening `gallery.html`, then clicking the auto-generated link Firestore logs to the browser console (F12).

## Architecture — the important parts

### Images live *inside* Firestore as base64 (no Storage)
The central design constraint: there is no Firebase Storage. Images are compressed client-side and stored as base64 data-URI strings in Firestore documents. **Image size *is* database size** — the free tier's 1 GB is shared by every event, so compression targets are a quota decision, not just a per-document limit.

[js/imej.js](js/imej.js) `compressImej()` is **adaptive**: it steps down width and quality (loops `lebarCubaan` × `kualitiCubaan`) until the blob fits `SASARAN_BAIT`, keeping the smallest result. Current targets: **WebP, `LEBAR_MAKS` 720 px, `SASARAN_BAIT` 60 KB** → ~50–85 KB stored after base64's ~1.37× inflation. WebP is ~30% smaller than JPEG at equal quality; `bolehWebp()` probes canvas support once and falls back to JPEG (Safari/iOS < 14).

Measured on real photos when these targets were introduced: 200–525 KB stored → 49–74 KB, i.e. **~77% smaller**; 1 GB holds ~17,000 photos instead of ~3,900. Raising `LEBAR_MAKS`/`SASARAN_BAIT` raises quota burn proportionally — and there is no second copy: the **Premium ZIP download ships these same 720 px images**.

### Photobooth strips reuse the same pipeline at a different target
The 3-shot photobooth ([js/photobooth.js](js/photobooth.js)) composites three square canvas shots into one **480 × 1480** strip with the couple's name + date drawn in the footer, then feeds it through the *same* `compressImej` → base64 → Firestore path as a normal upload. It passes its own `{lebarMaks: LEBAR_JALUR, sasaranBait: SASARAN_JALUR}` (480 px / 45 KB, declared in [js/imej.js](js/imej.js)) so the strip stores at **~60–80 KiB — smaller than a normal photo** despite holding three shots. Never widen these without redoing the quota arithmetic.

Two non-obvious constraints hold this together:

- **`compressImej`'s width ladder collapses at `lebarMaks <= 480`.** `lebarCubaan = [lebarMaks, 640, 560, 480].filter(...)` leaves a *single* width, so quality can bottom out at q0.48 with the strip never shrinking. `binaJalur()` therefore runs a **second pass at 400 px** when the first result exceeds `SASARAN_JALUR * 1.35`. Remove that guard and noisy/dark strips balloon.
- **The strip must stay under `HAD_LANGKAU_MAMPAT` (95 KiB, [js/super-admin.js](js/super-admin.js)).** Below it, the super-admin "mampat semula" tool skips the strip; above it, the tool re-compresses the strip at the *normal photo* target (60 KB at 3× the pixels) and **permanently destroys the caption**. This is why the target is 45 KB and not something more generous.

Canvas text does **not** wait for webfonts — `ctx.fillText()` silently falls back to `cursive` (Comic Sans on Windows). `muatFontTangan()` warms Caveat via `document.fonts.load()` before any shot is taken. Couple names run to `maxlength="80"`, so `teksMuat()` shrinks the font and then **truncates with `…`**; shrinking alone still overflows the strip edge.

Live Wall renders strips through the same `createPolaroid()` as every other photo, so a 1:3 strip appears among square polaroids. That is accepted, not a bug — filtering it would need a new field on `photos`, which means editing `firestore.rules`' `hasOnly([...])` allowlist and publishing manually in the Console.

### One collection: `photos/{id}` holds everything
Each upload ([js/upload.js](js/upload.js)) writes **one** document, batched with a `photoCount` increment on the event:

- **`photos/{id}`** — `image_url` (the whole image as a base64 data URI), `name`, `message`, `approved`, `likes`, `created_at`, `eventId`.

Gallery paginates 12 at a time, Live Wall subscribes to the newest 60, and moderation loads the whole event — every one of those reads pulls the full image, so egress scales with image size too.

**Legacy fallback:** some read sites still accept `row.thumb_url` (`row.image_url || row.thumb_url`) from an older thumbnail experiment. Harmless; keep it unless you migrate every document.

Do **not** re-introduce a `photos_full` collection to get print-quality downloads without deciding the storage trade-off first — a second copy adds its full size to the 1 GB quota.

### `settings/majlis` — moderation mode toggle
A single settings doc with `preModeration` (boolean). Admin toggles it ([js/admin.js](js/admin.js)); upload reads it to decide `approved: true` (post-moderation, the default — appears immediately) vs `false` (pre-moderation — hidden until approved). Public gallery/wall query `where('approved','==',true)`; admin queries with no filter to see everything.

### Theme + background pattern — [js/tema.js](js/tema.js)
Single source of truth for page look. All styling reads CSS custom properties (`--warna-*`, `--corak-*`, `--font-*`) injected once into `<head>`; changing theme = rewriting variable values, no markup change. The full-page background is a `body[data-corak]::before` fixed layer (opt-in per page via the `data-corak` attribute; `wall.html` deliberately omits it). Its `background` comes from `--corak-imej`.

Customers pick a **background pattern** (`events.latarId`, default `"bunga"`) from `LATAR_PILIHAN`: the shared floral JPEG (`img/latar-bunga.jpeg`, recolored per theme via the `--corak-tapis` CSS filter) **or** an in-code **SVG pattern** tinted with the customer's `themeColor` (zero image files, zero quota — the whole reason SVG over bundled photos). `gayaLatar(latarId, warna)` maps a choice+color to `{imej, tapis, opacity}`. Only validated hex (`warnaSah()`) is ever injected into the SVG `url()`, and `latarSah()` whitelists the id — never inject raw Firestore values into CSS. Adding a new customer-editable field means also adding it to the `hasOnly([...])` allowlist in [firestore.rules](firestore.rules) **and publishing rules in the Console** (no Firebase CLI here).

### Firestore composite index (required)
Gallery, wall, and export all query `where('approved','==',true) + orderBy('created_at','desc')`, which needs a composite index on `photos` (`approved` ASC, `created_at` DESC). Admin uses a single `orderBy` and needs no composite index. All read sites detect the "index" error string and show a Malay hint pointing at the console link.

### Module wiring
[js/firebase.js](js/firebase.js) initializes the app and **re-exports** every Firebase SDK function the app uses, so page scripts import Firestore helpers from `./firebase.js` (not the CDN directly). It exports `db`, `app` (for `getAuth` in admin), and `configSiap()`. To bump the SDK version, change `10.14.1` in **both** import URLs there (and the separate auth import in admin.js).

**The single write path to `photos` is [js/hantar-foto.js](js/hantar-foto.js)** — a DOM-free library shared by `upload.js` and `photobooth.js`. Two things in it must never be duplicated or diverge: the `KUNCI_COOLDOWN` localStorage key (separate keys = guests alternate Gambar/Photobooth with no cooldown at all) and the atomic `writeBatch`, because [firestore.rules](firestore.rules) requires `photoCount` to increment by exactly +1 **in the same commit** — a separate write path is rejected by the server, not merely untidy. `hantarFoto()` takes an already-compressed Blob so each caller owns its own compression target.

Each HTML page loads exactly one page-logic module (`upload.js`, `gallery.js`, `wall.js`, `tetapan.js`, `admin.js`), all of which reuse [js/polaroid.js](js/polaroid.js) (`createPolaroid()` + `pasangGayaPolaroid()` which injects the polaroid CSS once). Polaroid rotation is a deterministic hash of name+url so cards don't jitter on re-render.

## Gotchas

- **`likes` IS wired up** ([js/gallery.js](js/gallery.js) `sukaFoto()` → `increment(1)`, dedupe via localStorage). The rule (`likes >= old`) still lets a guest jump the count to any larger number rather than +1; tighten to `likes == resource.data.likes + 1` if it's ever abused.
- **Storage only ever grows unless someone prunes it.** Deleting a photo in the customer panel does *not* decrement `events.photoCount` (and rules don't let the owner fix it), and photos of finished events live forever. The super-admin panel has the three tools that counter this: **mampat semula** (re-compress old photos to WebP, idempotent — skips anything already WebP and under `HAD_LANGKAU_MAMPAT`), **padam gambar majlis tamat** (only operation that reduces storage), and a per-event **↻** button that re-syncs `photoCount` via `getCountFromServer`.
- **`image_url` is exempted from auto-indexing** ([firestore.indexes.json](firestore.indexes.json) `fieldOverrides`). Firestore indexes every field by default (ASC + DESC); those index entries are billed storage and no query ever uses them for the image blob. The exemption must be applied in the Console — this project has no Firebase CLI step.
- **Security model:** `firebaseConfig` is meant to be public; real security is Firestore rules. XSS is avoided by using `textContent` (polaroid.js) or the `esc()` helper (admin.js), never raw `innerHTML` with user text — keep it that way.
- **ZIP export is owner-gated, not password-gated.** `EXPORT_PASSWORD` is gone; `export.html` is now a redirect stub. The download lives inside the customer panel ([tetapan.html](tetapan.html)) behind Firebase Auth — [js/muat-turun.js](js/muat-turun.js) builds the ZIP, and `bolehMuatTurun()` in [js/majlis.js](js/majlis.js) is the single source of truth for eligibility (active status → 30-day grace after `expiresAt` → Premium package). Ownership itself is rules-enforced via `events.ownerUid == request.auth.uid`; never re-introduce a typed "customer ID" — rules cannot verify one.
- **Blob downloads are asynchronous — three rules in [js/muat-turun.js](js/muat-turun.js).** (1) File extensions come from the data URI's MIME via `sambunganDari()`, never hardcoded — an event holds a *mix* of WebP (new) and JPEG (old), and a WebP named `.jpg` won't open. (2) Never `URL.revokeObjectURL()` right after `a.click()`; it aborts the download silently and the UI still says "Berjaya". (3) Never `a.remove()` synchronously either — Chrome loses the `download` attribute and saves the file as a bare blob UUID with no `.zip`. The anchor is removed on a timer and the URL lives until the next download or `pagehide`. A visible fallback link (`#mt-pautan`) is shown regardless, since a silent auto-download failure is otherwise indistinguishable from success.
- **The public gallery is public by design.** Guests read `photos` where `approved == true` without auth, so the ZIP gate is a *feature/subscription* gate, not confidentiality. Hidden photos (`approved == false`) **are** rules-protected to the owning event + super-admin — preserve that clause when editing `firestore.rules`, and keep the `approved == true` check first so public gallery queries skip the `get()` on `events`.
- **Anti-spam** in upload.js is client-side only (localStorage cooldown + honeypot field) — bypassable, not a real control.
- **The super-admin panel has its own colour system, separate from `tema.js`.** `super-admin.html`'s inline `<style>` declares a `--sa-*` token set (light on `:root`, dark on `html.gelap`) plus a *compatibility layer* that re-maps ~30 Tailwind utility classes to those tokens. That layer exists because most of the panel's colour lives in raw utility classes inside `js/super-admin.js` template strings — re-mapping the class beats editing ~200 call sites, and it makes JS-generated markup (event cards, badges, pagination, the storage bar) go dark for free. It wins on **specificity, not source order** (`html.gelap .bg-white\/70` = 0,2,1 vs Tailwind's 0,1,0), which matters because the Play CDN rewrites its stylesheet on every rebuild. Adding a new colour class in `js/super-admin.js` means adding its dark mapping there too, or it silently stays light. Do **not** reuse the `--warna-*` namespace: `terapTema()` in [js/tema.js](js/tema.js) writes those as inline styles on `<html>`, which no stylesheet can beat. The class sits on `<html>` (not `<body>`) because `color-scheme: dark` — what darkens the 12 native `confirm()` dialogs, `<input type="date">` pickers and scrollbars — only applies from the root element. Mode preference is `localStorage` (`polaroid_sa_mod`), never Firestore: `admins/{uid}` is `write:false` in the rules.


