# Assets

## Photography (Unsplash License)
All six are free to use under the [Unsplash License](https://unsplash.com/license) (checked on each photo page on 2026-10-12: "Free to use under the Unsplash License", not Unsplash+). They are credited in the colophon.

| File (`public/photos/`) | Unsplash id | Photographer | Page | Subject |
|---|---|---|---|---|
| `movement-*` | `HmIwomthlWw` | Олександр К (@gidlark) | https://unsplash.com/photos/a-close-up-view-of-a-watch-movement-HmIwomthlWw | macro watch movement |
| `gears-dark-*` | `snk-X32c8tE` | Min Square_97 (@min_square97) | https://unsplash.com/photos/a-close-up-of-a-clock-with-gold-gears-snk-X32c8tE | brass gears on a dark dial |
| `dial-*` | `FCsA8Adcgr4` | Ahmed Rajgoli Shoaib Shakeel (@shoaibsr) | https://unsplash.com/photos/macro-shot-of-chronograph-watch-FCsA8Adcgr4 | engraved (guilloché-style) chronograph dial |
| `gears-brass-*` | `UQ2Fw_9oApU` | Laura Ockel (@viazavier) | https://unsplash.com/photos/gold-and-silver-round-accessory-UQ2Fw_9oApU | brass gears from a pocket-watch movement |
| `archive-*` | `Ph4ZJrwf4x8` | Daniel Forsman (@danielforsman) | https://unsplash.com/photos/a-hand-pulls-a-card-from-the-librarys-card-catalog-Ph4ZJrwf4x8 | card catalogue, Stockholm public library |
| `watch-dark-*` | `LaFLlEKx1c0` | Igor bispo (@eusouigorbispo) | https://unsplash.com/photos/close-up-of-a-luxury-watch-face-LaFLlEKx1c0 | engraved watch face in low light |

**Download.** `unsplash.com/photos/<id>/download?force=true` sits behind a bot check from this box (HTTP 401), so the originals were fetched from the same photos' CDN files (`images.unsplash.com/photo-…?w=2400&q=85`, the URLs the photo pages serve). The originals are not committed.

**Grade.** `node scripts/photos.mjs <dir of <id>.jpg>`: 70% brass duotone (luminance × [1, 0.82, 0.55]) + 30% original colour, darkened (`linear(0.82, −6)`, gamma 1.15) with a radial vignette; resized to 640/1280/1920 and written as AVIF (q50) and WebP (q70). Every file is ≤180 kB (largest: `watch-dark-1920.webp`, 137 kB). `src/data/photos.json` holds the ids, ratios and widths for `srcset`.

## Type (SIL OFL 1.1)
Instrument Serif 400 normal/italic, Geist (variable, 400–600), Geist Mono (variable, 400–500), from fontsource, subset to Latin by `scripts/subset-fonts.sh` (≈66 kB total). Licences in `public/fonts/`.

## Procedural
`scripts/guilloche.mjs` → `public/guilloche/*.svg` (rosettes, wave bands), `public/hallmark.svg`, `public/favicon.svg`. The same generator (`src/lib/guilloche.ts`) draws the inline line-work at runtime.
