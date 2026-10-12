# V-CAP: capture notes

Outputs (git-ignored): `~/video-out/captures/<ID>.mp4` (+ `manifest.json`), `~/video-out/broll/BR0x-*.mp4`.
Contact sheets used for review: `~/video-out/review/<ID>.jpg` (`./review.sh ID t1 t2 …`).

## How it works
- `capture.mjs`: Playwright + chrome-headless-shell (the browsers already installed for `site/web`, Playwright 1.64),
  SwiftShader WebGL. `page.clock.install()` before load; once the page is ready, `pauseAt` and then per frame:
  set scroll + cursor for t → `clock.runFor(1000/60)` → **animation pump** → CDP `Page.captureScreenshot` (JPEG q92)
  → piped to ffmpeg (`image2pipe`, 60 fps, libx264 slow CRF 14, High, yuv420p, BT.709 tags, tv range). No frame
  folders on disk.
- The **animation pump** matters: Playwright's fake clock drives JS (timers, rAF, `performance.now`, so Motion's
  frameloop and three.js), but CSS animations/transitions and WAAPI animations (Motion's hardware-accelerated
  opacity) run on the compositor's real clock. The pump pauses every `document.getAnimations()` entry and sets its
  `currentTime` from virtual time each frame (`finish()` past the end), so the CSS word reveals, the count-ups, and
  the poster/canvas cross-fades are frame-exact too.
- `page.screenshot` waits on a rAF that a paused clock never delivers, so frames come from raw CDP.
- Cursor: an injected bone dot (10 px, `#ECE6DA`) with a 34 px brass ring (`#C8A86A`), eased cubic-bezier
  (0.65,0,0.35,1) paths; the click presses the ring (scale 0.72, brass fill) and fires a real `mouse.down/up`.
  The real pointer follows it, so hover states and the 3D parallax respond. The OS cursor is hidden.
- Scrolls: keyframe tracks; long moves use a constant-velocity ramp with eased ends (`ramp()`), short ones the site's
  in-out bezier. Lenis is off under `?capture=1` (site change, see below) so the capturer owns `scrollY`.
- `pool()` runs shots on up to N browsers in parallel.

## Proof that virtual time drives the 3D
`node proof.mjs` → `~/video-out/proof/proof.json`: frame A, then 2 s of real waiting with the clock paused → frame B
is identical (PSNR inf: nothing advances on real time), then `runFor` 1 s → frame C differs in the 3D hero
(PSNR 22.9 dB; the wheels have turned). Live 3D mounted: true.

## Site changes (query-param guarded, inert in production)
- `?capture=1`: `useSmoothScroll` skips Lenis.
- `three-demo.html?shot=orbit|macro|speed`: scripted camera paths for the beauty renders (`MovementCanvas` `shot`
  prop), restarted at t = 0 by the capturer (`window.__shotRestart`). The demo page is dev-only (not in the build);
  R3D shots run against `vite --port 4401`.

## What I checked and fixed (2–4 frames read per shot)
- **pauseAt race** under load ("Cannot fast-forward to the past"; SH09, SH10 failed): retry with a doubling margin.
- **`page.waitForTimeout` stalls** with a faked clock (SH01/SH02/SH11 hung for minutes): node-side sleeps instead.
- **3D first frame**: while the page waits in real time, R3F queues frames faster than SwiftShader draws them, so the
  first captured frame waits ~90 s for the backlog; later frames cost ~0.9 s alone, 2–3 s with 6 parallel jobs. Just
  slow, not wrong.
- **SH06** overshot the pinned gear train (gears slid under the nav at the end): it now ends at the pin's end (13 800).
- **SH07** overshot (the sticky heading went under the nav): it now ends at 15 470.
- **CFO01**: a "Keep your access" sign-in prompt with a Cloudflare check covered the sheet; closed via its ×. The
  page fits the viewport, so it's an 8 s hold (it renders headless fine; light UI).
- **EOL01**: 4.2 is under "Show more unmaintained releases"; clicked, then scrolled to the 4.2 row. The site has no
  dark theme.
- **R3D**: `waitForSelector('html[data-ready]')` needs `state: 'attached'` (`<html>` counts as "hidden").
- SH03: the dial, tiles stamping in, the date reveals and the Oct 6 connector all animate; no blank frames.
- SH04: plates lock, then the "5 DAYS" band and the terminal FAIL×3 / PASS×3 / FAIL×3, then the claim.
- SH05: cursor → CVE-2026-6907 × Django 4.2.30 (FIX READY) → press → the certificate slides in; the calibration
  triangle's lights fill (FAIL×3, PASS×3, L FAIL×3 → FIX READY). The receipt chunk is pre-imported so it opens on the
  next frame.
- SHM: 390×844 @3x → 1170×2532 (portrait; the phone hero shows the poster, by design: no 3D under 768 px).
- GitHub: dark scheme logged out, 125 % (1536×864 CSS at DSF 1.25), no cookie banner seen (hidden by CSS if served).
  GH03/GH04/GH05 pages are short, so their scrolls clamp to the bottom; the target text is mid-frame throughout.
