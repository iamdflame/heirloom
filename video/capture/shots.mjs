// Shot list for the Heirloom demo video. Usage: node shots.mjs [-j 6] [ID …|site|gh|r3d|all]
// Site shots run against `vite preview --port 4400` of main's build (SITE env to override, e.g. production).
import { chromium } from 'playwright';
import { readdirSync, writeFileSync } from 'node:fs';
import { pool, track, ease, OUT } from './capture.mjs';

// node-side waits: page.waitForTimeout can stall while the page clock is faked
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SITE = process.env.SITE ?? 'http://localhost:4400';
const DEMO = process.env.DEMO ?? 'http://localhost:4401';
const site = (hash = '') => `${SITE}/?capture=1${hash}`;

/** constant-velocity scroll with smooth acceleration over the first/last `a` of the move */
export const ramp = (a = 0.18) => {
  const v = 1 / (1 - a);
  return (x) => (x < a ? (v * x * x) / (2 * a) : x > 1 - a ? 1 - (v * (1 - x) ** 2) / (2 * a) : v * (x - a / 2));
};

// the 3D canvases are mounted once the page is idle; wait (in virtual time) until the poster has faded under them
const live3d = (variant) => ({ virtualReady: `[data-poster="${variant}"].opacity-0`, readyHold: 3, settle: 0 });
// the receipt is a lazy chunk: import it up front so the click opens it on the very next frame
const preloadReceipt = async (page) => {
  const f = readdirSync(`${process.env.HOME}/heirloom/site/web/dist/assets`).find((n) => /^Receipt-.*\.js$/.test(n));
  if (f) await page.evaluate((u) => import(u), `/assets/${f}`);
};
const scrollShot = (id, seconds, keys, extra = {}) => ({
  id,
  url: site(),
  seconds,
  settle: 0.25,
  source: `${SITE.includes('localhost') ? 'vite preview of main' : SITE} ?capture=1`,
  ...extra,
  plan: async (page) => ({ scroll: track(keys), ...(extra.planExtra ? await extra.planExtra(page) : {}) }),
});

// section tops at 1920×1080 (node layout.mjs): watch 2104 (h 6070), finding 8173 (1341), register 9514,
// movement 12082 (3229), question 15311 (1349), numbers 16660 (1388), economics 18048 (1496),
// evidence 19544 (1792), finale 22090 (1188), page 23599
const R = ramp();
export const SITE_SHOTS = [
  scrollShot('SH01', 8, [[0, 0]], { ...live3d('hero'), notes: 'hero idle, live 3D movement turning' }),
  scrollShot('SH02', 4, [[0.35, 0], [3.55, 2104]], { ...live3d('hero'), notes: 'hero → pinned "Watch it work"' }),
  scrollShot('SH03', 16, [[0, 2104], [0.6, 2104], [15.2, 7094, R], [16, 7094]], { notes: 'full campaign replay: dial, stamps, Oct 6 connector' }),
  scrollShot('SH04', 9, [[0, 7620], [2.2, 8250, ease.out], [9, 8290, ease.linear]], { notes: 'finding: plates lock, terminal FAIL×3' }),
  {
    ...scrollShot('SH05', 10, [[0, 9640], [1.8, 9950, ease.out]], {
      prepare: preloadReceipt,
      notes: 'register → cursor to CVE-2026-6907 × Django 4.2.30 → click → receipt certificate',
    }),
    plan: async () => {
      // cell centre at document (887, 10423) → viewport y 473 at scroll 9950
      const cx = 887, cy = 10423 - 9950;
      return {
        scroll: track([[0, 9640], [1.8, 9950, ease.out]]),
        cursor: track([[0, [1560, 880]], [0.5, [1560, 880]], [2.9, [cx, cy]]]),
        press: (t) => (t < 3.05 ? 0 : t < 3.17 ? (t - 3.05) / 0.12 : t < 3.4 ? 1 - (t - 3.17) / 0.23 : 0),
        cursorShow: (t) => (t < 0.2 ? t / 0.2 : t < 4 ? 1 : Math.max(0, 1 - (t - 4) / 0.5)),
        events: [
          { t: 3.1, run: (p) => p.mouse.down() },
          { t: 3.2, run: (p) => p.mouse.up() },
          // park the real pointer off the dialog once the cursor has faded
          { t: 4.6, run: (p) => p.mouse.move(1910, 1070) },
        ],
      };
    },
  },
  scrollShot('SH06', 8, [[0, 11900], [7.3, 13800, R], [8, 13800]], { notes: 'method gear train (pinned)' }),
  scrollShot('SH07', 9, [[0, 15100], [9, 15470, R]], { notes: 'question thread' }),
  scrollShot('SH08', 6, [[0, 16330], [1.8, 16700, ease.out], [6, 16740, ease.linear]], { notes: 'proof numbers, count-ups' }),
  scrollShot('SH09', 6, [[0, 17800], [6, 18330, R]], { notes: 'economics cards' }),
  scrollShot('SH10', 6, [[0, 19380], [6, 20020, R]], { notes: 'evidence locker' }),
  scrollShot('SH11', 9, [[0, 21100], [6.2, 22519, R], [9, 22519]], { ...live3d('finale'), notes: 'finale: the movement slows to a stop' }),
  scrollShot('SHM', 8, [[0, 0], [1.4, 0], [8, 3400, R]], {
    w: 390, h: 844, dsf: 3, mobile: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    notes: 'mobile 390×844 @3x (1170×2532): hero → campaign story',
  }),
];

// ---------------------------------------------------------------- GitHub + web (dark, 125 % zoom)
// 125 %: a 1536×864 CSS viewport at DSF 1.25 → 1920×1080 frames
const ZOOM = { w: 1536, h: 864, dsf: 1.25, scheme: 'dark', settle: 0.25 };
const HIDE = `#ghcc, .js-cookie-consent, cookie-consent-banner, [id*="cookie-consent" i], [class*="cookie-banner" i],
  [class*="CookieBanner" i], #onetrust-banner-sdk, .cc-window, .fc-consent-root, #cookie-notice { display: none !important; }`;
/** document y (CSS px) of the innermost element whose text includes `text` (nth match) */
const yOf = (page, text, nth = 0) =>
  page.evaluate(
    ([text, nth]) => {
      const hits = [];
      const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (walk.nextNode()) if (walk.currentNode.nodeValue.includes(text)) hits.push(walk.currentNode.parentElement);
      const el = hits.filter((e) => e.offsetParent !== null)[nth];
      if (!el) throw new Error(`text not found: ${text}`);
      return Math.round(el.getBoundingClientRect().top + scrollY);
    },
    [text, nth],
  );
const maxY = (page) => page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
const gh = (id, url, seconds, keysFn, notes, extra = {}) => ({
  id, url, seconds, notes, source: url, css: HIDE, ...ZOOM, ...extra,
  plan: async (page) => {
    const mx = await maxY(page);
    const keys = (await keysFn(page)).map(([t, y, e]) => [t, Math.max(0, Math.min(mx, y)), e]);
    return { scroll: track(keys) };
  },
});
const GHR = 'https://github.com/iamdflame';
export const WEB_SHOTS = [
  gh('GH01', `${GHR}/django/pull/13`, 10, async (p) => {
    const c = await yOf(p, 'Claims');
    return [[0, 0], [2.6, 0], [6.4, c - 90, R], [10, c - 90]];
  }, 'PR #13: title + verdict table → claims table'),
  gh('GH02', `${GHR}/heirloom/issues/6`, 9, async (p) => {
    const a = await yOf(p, '/heirloom answer adopt-upstream-tests');
    return [[0, 0], [2.6, 0], [6.6, a - 360, R], [9, a - 360]];
  }, 'issue #6: the question → the owner\'s /heirloom answer comment'),
  gh('GH03', `${GHR}/django/pull/19`, 6, async (p) => {
    const n = await yOf(p, 'Per precedent');
    return [[0, n - 620], [3.4, n - 330, R], [6, n - 330]];
  }, 'PR #19: the P001 citation'),
  gh('GH04', `${GHR}/django/pull/21`, 5, async (p) => {
    const n = await yOf(p, 'Stacked on');
    return [[0, n - 600], [3, n - 360, R], [5, n - 360]];
  }, 'PR #21: "Stacked on #20"'),
  gh('GH05', `${GHR}/django/commit/35e2467152f2f463268ab58a672ed6b9bf318fd8`, 5, async (p) => {
    const n = await yOf(p, 'Entire-Checkpoint');
    return [[0, Math.max(0, n - 520)], [3, Math.max(0, n - 420), R], [5, Math.max(0, n - 420)]];
  }, 'backport commit (PR #13) with the Entire-Checkpoint trailer', {
    prepare: async (page) => {
      // expand the commit body if GitHub folded it
      for (const sel of ['button[aria-label*="Show more" i]', 'button:has-text("…")', '.ellipsis-expander']) {
        const b = page.locator(sel).first();
        if (await b.isVisible().catch(() => false)) await b.click().catch(() => {});
      }
      await sleep(600);
    },
  }),
  gh('GH06', `${GHR}/django/pulls`, 5, async () => [[0, 0], [0.8, 0], [4.4, 420, R], [5, 420]], 'fork PR list: 13 open candidate backports'),
  {
    ...gh('EOL01', 'https://endoflife.date/django', 4, async () => [], 'endoflife.date/django: the release table down to the 4.2 row; the site has no dark theme', {
      // 4.2 sits under "Show more unmaintained releases"
      prepare: async (page) => {
        await page.getByRole('button', { name: /unmaintained releases/i }).click().catch(() => {});
        await sleep(600);
      },
    }),
    plan: async (page) => {
      // the page scrolls an inner container on some layouts: use whichever element actually scrolls
      const { sel, y } = await page.evaluate(() => {
        const cand = [document.scrollingElement, ...document.querySelectorAll('*')].filter(
          (e) => e && e.scrollHeight - e.clientHeight > 200 && (e === document.scrollingElement || /(auto|scroll)/.test(getComputedStyle(e).overflowY)),
        );
        const sc = cand[0];
        if (sc !== document.scrollingElement) sc.setAttribute('data-cap-scroll', '');
        const td = [...document.querySelectorAll('table td, table th')].find((e) => /^4\.2\b/.test(e.textContent.trim()));
        const top = td ? td.getBoundingClientRect().top - (sc === document.scrollingElement ? 0 : sc.getBoundingClientRect().top) + sc.scrollTop : 600;
        return { sel: sc === document.scrollingElement ? null : '[data-cap-scroll]', y: Math.round(top) };
      });
      const end = Math.max(0, y - 430);
      return { scrollEl: sel, scroll: track([[0, Math.max(0, end - 260)], [3.4, end, R], [4, end]]) };
    },
  },
  {
    ...gh('CFO01', 'https://app.cfo.ai/s/25vRDQClPxqPWB5g', 8, async () => [], 'cfo.ai shared Base page (light UI; the sign-in prompt closed with its ×)', {
      prepare: async (page) => {
        await sleep(4000);
        // close the "Keep your access" sign-in prompt (its × button), then tag the main scroller
        await page.evaluate(() => {
          const hit = [...document.querySelectorAll('*')].find((e) => e.childElementCount === 0 && e.textContent.trim() === 'Keep your access');
          let box = hit;
          for (let i = 0; box && i < 8 && !box.querySelector('button'); i++) box = box.parentElement;
          box?.querySelector('button')?.click();
          const sc = [...document.querySelectorAll('*')]
            .filter((e) => /(auto|scroll)/.test(getComputedStyle(e).overflowY) && e.scrollHeight - e.clientHeight > 200)
            .sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0];
          if (sc) sc.id ||= '__cap_scroll', sc.setAttribute('data-cap-scroll', '');
        });
        await sleep(800);
      },
    }),
    plan: async (page) => {
      const mx = await page.evaluate(() => {
        const e = document.querySelector('[data-cap-scroll]');
        return e ? e.scrollHeight - e.clientHeight : 0;
      });
      const y = Math.min(mx, 620);
      return { scrollEl: '[data-cap-scroll]', scroll: track([[0, 0], [1.6, 0], [7.2, y, R], [8, y]]) };
    },
  },
];

// ---------------------------------------------------------------- 3D beauty renders (three-demo.html?shot=…, vite dev)
const r3d = (id, shot, seconds, notes) => ({
  id, url: `${DEMO}/three-demo.html?shot=${shot}`, seconds, notes, settle: 0,
  source: `site/web three-demo.html?shot=${shot} (vite dev)`,
  virtualReady: 'html[data-ready]',
  readyHold: 3,
  plan: async () => ({ events: [{ t: 0, run: (p) => p.evaluate(() => (window.__shotRestart = true)) }] }),
});
export const R3D_SHOTS = [
  r3d('R3D01', 'orbit', 10, 'slow 70° orbit around the movement'),
  r3d('R3D02', 'macro', 6, 'macro dolly onto the H medallion'),
  r3d('R3D03', 'speed', 5, 'the train winds up to ×7 speed'),
];

export const ALL = [...SITE_SHOTS, ...WEB_SHOTS, ...R3D_SHOTS];

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  let jobs = 6;
  const ji = args.indexOf('-j');
  if (ji >= 0) jobs = +args.splice(ji, 2)[1];
  const want = new Set(args.length ? args : ['all']);
  const pick = ALL.filter((s) => want.has('all') || want.has(s.id) || (want.has('site') && s.id.startsWith('SH')) || (want.has('web') && WEB_SHOTS.includes(s)) || (want.has('r3d') && R3D_SHOTS.includes(s)));
  const res = await pool(chromium, pick, jobs);
  writeFileSync(`${OUT}/.last-run-${Date.now()}.json`, JSON.stringify(res, null, 2));
  console.log(JSON.stringify(res.map((r) => ({ id: r.id, s: r.seconds, err: r.error ?? r.errors?.length })), null, 0));
}
