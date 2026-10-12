# Stock b-roll (third-party footage)

Only Pexels (Pexels License) and Mixkit (Mixkit Stock Video Free License) footage is used. The source files were
downloaded directly from each site's CDN (the URLs below) on 2026-10-12. They were trimmed and graded towards ink/brass
by `broll.sh` (slight desaturation, crushed blacks, warm mids/highs, soft vignette) and written as 1920×1080 H.264 CRF 14
to `~/video-out/broll/`, at the source frame rate. The outputs stay out of git.

| File | Source page | Author | Licence | Source file | Trim |
|---|---|---|---|---|---|
| `BR01-balance-wheel-skeleton.mp4` | https://www.pexels.com/video/close-up-of-watch-mechanism-11965370/ | Quang Viet Nguyen | [Pexels License](https://www.pexels.com/license/) (free to use; attribution not required) | `videos.pexels.com/video-files/11965370/11965370-uhd_3840_2160_24fps.mp4` (3840×2160, 23.976 fps) | 0.4 s + 7.5 s |
| `BR02-balance-wheel-gilt-train.mp4` | https://www.pexels.com/video/close-up-of-clock-mechanism-12163205/ | Quang Viet Nguyen | [Pexels License](https://www.pexels.com/license/) | `videos.pexels.com/video-files/12163205/12163205-uhd_3840_2160_30fps.mp4` (3840×2160, 29.97 fps) | 0.8 s + 9.0 s |
| `BR03-movement-through-caseback.mp4` | https://mixkit.co/free-stock-video/mechanism-of-a-watch-through-a-glass-3652/ | Edgar Fernández (mixkit.co/@edgarfernandez) | [Mixkit Stock Video Free License](https://mixkit.co/license/#videoFree) | `assets.mixkit.co/videos/3652/3652-2160.mp4` (3840×2160, 23.976 fps) | 4.1 s + 6.0 s |

Notes
- BR03 shows the maker's name engraved on the rotor ("Frederique Constant") and an out-of-focus bright shape at the
  right edge; crop or push in if either distracts. BR01/BR02 show "SWISS MADE" engravings only.
- Rejected: Mixkit 3673 "Machinery of a very close watch" (portrait 1080×1920, too small once cropped to 16:9),
  Mixkit 19513 "Gears of a steel watch working" (720p max), Mixkit 3649 (a dial, not a movement),
  Pexels 9966041 (720p max), Pexels 3171546 (2 s).
