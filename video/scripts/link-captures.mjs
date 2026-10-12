// Brings V-CAP's clips into the bundle: ~/video-out/captures/*.mp4 and ~/video-out/broll/*.mp4
// → video/public/captures/<ID>.mp4 (hard link, or copy across filesystems), and writes
// src/data/captures.json { ID: { file, seconds, source } } from the manifest (or ffprobe).
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, linkSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';

const root = join(import.meta.dirname, '..');
const outRoot = process.env.VIDEO_OUT ?? join(homedir(), 'video-out');
const dest = join(root, 'public/captures');
const manifestPath = join(outRoot, 'captures/manifest.json');

let manifest = [];
if (existsSync(manifestPath)) {
  const m = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest = Array.isArray(m) ? m : m.clips ?? m.shots ?? Object.values(m);
}
const byId = new Map(manifest.filter((x) => x && x.id).map((x) => [x.id, x]));

const probe = (f) => Number(execFileSync('ffprobe', ['-v', 'quiet', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { encoding: 'utf8' }).trim());

const found = {};
for (const dir of ['captures', 'broll']) {
  const src = join(outRoot, dir);
  if (!existsSync(src)) continue;
  for (const f of readdirSync(src)) {
    if (!f.endsWith('.mp4')) continue;
    const id = basename(f, '.mp4');
    const from = join(src, f);
    const to = join(dest, `${id}.mp4`);
    if (statSync(from).size < 1000) continue;
    // skip clips still being written (no moov atom yet)
    let seconds;
    try { seconds = probe(from); } catch { console.log(`  (skip ${id}: not readable yet)`); if (existsSync(to)) unlinkSync(to); continue; }
    if (!(seconds > 0)) continue;
    if (existsSync(to)) {
      if (statSync(to).ino === statSync(from).ino || (statSync(to).size === statSync(from).size && statSync(to).mtimeMs >= statSync(from).mtimeMs)) {
        // up to date
      } else {
        unlinkSync(to);
      }
    }
    if (!existsSync(to)) {
      try { linkSync(from, to); } catch { copyFileSync(from, to); }
    }
    const m = byId.get(id);
    found[id] = { file: `captures/${id}.mp4`, seconds: Number(seconds.toFixed(3)), source: m?.source ?? dir };
  }
}
// the owner's neatlogs recording, if dropped straight into public/captures
for (const f of readdirSync(dest)) {
  const id = basename(f, '.mp4');
  if (f.endsWith('.mp4') && !found[id]) found[id] = { file: `captures/${f}`, seconds: Number(probe(join(dest, f)).toFixed(3)), source: 'public/captures' };
}
writeFileSync(join(root, 'src/data/captures.json'), JSON.stringify(found, null, 1) + '\n');
console.log(`captures.json: ${Object.keys(found).length} clips · manifest ${existsSync(manifestPath) ? 'present' : 'absent'}`);
for (const [id, v] of Object.entries(found)) console.log(`  ${id.padEnd(9)} ${v.seconds.toFixed(2)}s  ${v.source}`);
