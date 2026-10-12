// Frame-perfect page capturer for the Heirloom demo video.
//
// Time: Playwright's fake clock drives JS (timers, rAF, performance.now → Motion's frameloop and three.js),
// and an in-page pump pins every CSS animation / transition / WAAPI animation to the same virtual time.
// Each frame: set scroll + cursor for t, runFor(1000/fps), pump, screenshot (JPEG q92) → ffmpeg pipe.
// So the output is smooth 60 fps however slowly the box renders WebGL.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const OUT = `${process.env.HOME}/video-out/captures`;
export const LAUNCH_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--hide-scrollbars', '--force-color-profile=srgb'];

export const ease = {
  linear: (x) => x,
  inOut: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2), // cubic in-out
  out: (x) => 1 - Math.pow(1 - x, 3),
  // cubic-bezier(0.65,0,0.35,1), the site's in-out
  site: bezier(0.65, 0, 0.35, 1),
};

function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (t) => ((ax * t + bx) * t + cx) * t;
  const sy = (t) => ((ay * t + by) * t + cy) * t;
  return (x) => {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const d = (3 * ax * t + 2 * bx) * t + cx;
      if (Math.abs(d) < 1e-6) break;
      t -= (sx(t) - x) / d;
    }
    return sy(Math.min(1, Math.max(0, t)));
  };
}

/** Piecewise keyframes [[t, value], …] (value: number or [x, y]) with per-segment easing (default in-out). */
export function track(keys, e = ease.site) {
  return (t) => {
    if (!keys.length) return undefined;
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      const [t1, v1, fn] = keys[i];
      const [t0, v0] = keys[i - 1];
      if (t <= t1) {
        const k = (fn ?? e)((t - t0) / Math.max(1e-9, t1 - t0));
        return Array.isArray(v0) ? v0.map((a, j) => a + (v1[j] - a) * k) : v0 + (v1 - v0) * k;
      }
    }
    return keys[keys.length - 1][1];
  };
}

// in-page: the animation pump and the cursor
const PAGE_INIT = () => {
  const seen = new WeakMap();
  window.__capPump = (vnow, step) => {
    for (const a of document.getAnimations()) {
      if (a.timeline !== document.timeline || a.playState === 'finished' || a.playState === 'idle') continue;
      let st = seen.get(a);
      if (st === undefined) {
        // born during the last frame: give it at most one frame of progress
        const ct = Math.min(Math.max(Number(a.currentTime) || 0, 0), step);
        st = vnow - ct;
        seen.set(a, st);
        try { a.pause(); } catch {}
      }
      const ct = (vnow - st) * (a.playbackRate || 1);
      const end = a.effect?.getComputedTiming?.().endTime;
      try {
        if (Number.isFinite(end) && ct >= end) a.finish();
        else a.currentTime = ct;
      } catch {}
    }
  };
  window.__capCursor = (x, y, press, show) => {
    let c = document.getElementById('__cap_cursor');
    if (!c) {
      c = document.createElement('div');
      c.id = '__cap_cursor';
      c.innerHTML = '<i></i><b></b>';
      const s = document.createElement('style');
      s.textContent = `#__cap_cursor{position:fixed;left:0;top:0;width:0;height:0;z-index:2147483647;pointer-events:none;will-change:transform}
#__cap_cursor i{position:absolute;left:-5px;top:-5px;width:10px;height:10px;border-radius:50%;background:#ECE6DA;box-shadow:0 0 0 1px rgba(8,9,10,.55),0 2px 8px rgba(0,0,0,.45)}
#__cap_cursor b{position:absolute;left:-17px;top:-17px;width:34px;height:34px;border-radius:50%;border:1.5px solid #C8A86A;box-sizing:border-box;box-shadow:0 0 12px rgba(200,168,106,.25)}
*{cursor:none!important}`;
      document.documentElement.append(s, c);
    }
    c.style.transform = `translate(${x}px,${y}px)`;
    c.style.opacity = show;
    const r = c.querySelector('b');
    r.style.transform = `scale(${1 - 0.28 * press})`;
    r.style.borderColor = press > 0.01 ? '#E6CB8E' : '#C8A86A';
    r.style.background = `rgba(200,168,106,${0.22 * press})`;
    c.querySelector('i').style.transform = `scale(${1 - 0.2 * press})`;
  };
};

/**
 * Capture one shot.
 * shot = {
 *   id, url, seconds, fps=60, w=1920, h=1080, dsf=1, scheme='dark',
 *   prepare(page, ctx)  // after load, clock still running in real time: wait for readiness, hide banners…
 *   plan(page) → { scroll?: (t)=>y, cursor?: (t)=>[x,y], press?: (t)=>0..1, cursorShow?: (t)=>0..1,
 *                  events?: [{ t, run(page) }], scrollEl?: selector }   // resolved after prepare, before frame 0
 *   settle=0       // virtual seconds to run (paused clock, pumped) before frame 0
 * }
 */
export async function captureShot(browser, shot, log = console.log) {
  const fps = shot.fps ?? 60;
  const w = shot.w ?? 1920, h = shot.h ?? 1080, dsf = shot.dsf ?? 1;
  const ctx = await browser.newContext({
    viewport: { width: w, height: h },
    deviceScaleFactor: dsf,
    colorScheme: shot.scheme ?? 'dark',
    reducedMotion: 'no-preference',
    isMobile: shot.mobile ?? false,
    hasTouch: shot.mobile ?? false,
    locale: 'en-US',
    timezoneId: 'UTC',
    userAgent: shot.userAgent,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript(PAGE_INIT);
  await page.clock.install({ time: new Date() }); // real now, so relative times ("2 hours ago") read true
  if (shot.css) await page.addInitScript((css) => addEventListener('DOMContentLoaded', () => document.head.append(Object.assign(document.createElement('style'), { textContent: css }))), shot.css);
  await page.goto(shot.url, { waitUntil: 'networkidle', timeout: 90_000 });
  await page.evaluate(() => document.fonts.ready);
  // eager-load every image so nothing pops in mid-shot
  await page.evaluate(async () => {
    document.querySelectorAll('img[loading="lazy"]').forEach((i) => (i.loading = 'eager'));
    await Promise.all([...document.images].map((i) => (i.complete ? null : i.decode().catch(() => null))));
  });
  if (shot.prepare) await shot.prepare(page, ctx);
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.evaluate(() => document.fonts.ready);

  // freeze time: from here on only runFor moves it
  // (under load the page clock can pass `now + margin` before pauseAt lands: retry with a wider margin)
  for (let margin = 100; ; margin *= 2) {
    const now = await page.evaluate(() => Date.now());
    try {
      await page.clock.pauseAt(now + margin);
      break;
    } catch (e) {
      if (margin > 20_000) throw e;
    }
  }
  const plan = (await shot.plan?.(page)) ?? {};
  const cdp = await ctx.newCDPSession(page);
  const step = 1000 / fps;
  const frames = Math.round(shot.seconds * fps);
  const events = [...(plan.events ?? [])].sort((a, b) => a.t - b.t);

  const out = `${OUT}/${shot.id}.mp4`;
  mkdirSync(dirname(out), { recursive: true });
  const ff = spawn('ffmpeg', [
    '-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
    '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
    '-movflags', '+faststart', '-r', String(fps), out,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => ff.on('close', (c) => (c === 0 ? res() : rej(new Error(`ffmpeg exit ${c}`)))));

  const apply = async (t) => {
    const y = plan.scroll?.(t);
    const xy = plan.cursor?.(t);
    await page.evaluate(
      ([y, sel, xy, press, show]) => {
        if (y !== undefined) {
          const el = sel ? document.querySelector(sel) : null;
          if (el) el.scrollTop = y;
          else window.scrollTo({ top: y, behavior: 'instant' });
          window.dispatchEvent(new Event('scroll'));
        }
        if (xy) window.__capCursor(xy[0], xy[1], press, show);
      },
      [y, plan.scrollEl ?? null, xy ?? null, plan.press?.(t) ?? 0, plan.cursorShow?.(t) ?? 1],
    );
    if (xy) await page.mouse.move(xy[0], xy[1]);
  };
  const tick = async () => {
    await page.clock.runFor(step);
    await page.evaluate((s) => window.__capPump(performance.now(), s), step);
  };

  // settle (not recorded)
  const settleFrames = Math.round((shot.settle ?? 0) * fps);
  await apply(0);
  for (let i = 0; i < settleFrames; i++) await tick();

  let ei = 0;
  const t0 = Date.now();
  for (let f = 0; f < frames; f++) {
    const t = f / fps;
    while (ei < events.length && events[ei].t <= t) await events[ei++].run(page);
    await apply(t);
    await tick();
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 92, optimizeForSpeed: false });
    const buf = Buffer.from(data, 'base64');
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if (f % 120 === 0) log(`${shot.id} ${f}/${frames} (${((Date.now() - t0) / Math.max(1, f)).toFixed(0)} ms/frame)`);
  }
  ff.stdin.end();
  await done;
  await ctx.close();
  log(`${shot.id} → ${out} in ${((Date.now() - t0) / 1000).toFixed(0)} s${errors.length ? ` (page errors: ${errors.slice(0, 3).join(' | ')})` : ''}`);
  return { id: shot.id, file: out, seconds: frames / fps, fps, w: w * dsf, h: h * dsf, errors };
}

/** Run shots with up to `jobs` browsers in parallel. */
export async function pool(chromium, shots, jobs = 6) {
  const results = [];
  const queue = [...shots];
  const worker = async () => {
    const browser = await chromium.launch({ args: LAUNCH_ARGS });
    try {
      while (queue.length) {
        const s = queue.shift();
        try {
          results.push(await captureShot(browser, s));
        } catch (e) {
          console.error(`${s.id} FAILED: ${e.stack ?? e}`);
          results.push({ id: s.id, error: String(e) });
        }
      }
    } finally {
      await browser.close();
    }
  };
  await Promise.all(Array.from({ length: Math.min(jobs, shots.length) }, worker));
  return results;
}
