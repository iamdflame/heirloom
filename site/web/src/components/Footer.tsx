import { Hallmark } from './Hallmark';
import { WaveBand } from './Guilloche';
import { site } from '@/lib/site';
import { WRAP } from '@/lib/layout';

const PHOTOS: [string, string][] = [
  ['Олександр К', 'https://unsplash.com/photos/a-close-up-view-of-a-watch-movement-HmIwomthlWw'],
  ['Min Square_97', 'https://unsplash.com/photos/a-close-up-of-a-clock-with-gold-gears-snk-X32c8tE'],
  ['Ahmed Rajgoli Shoaib Shakeel', 'https://unsplash.com/photos/macro-shot-of-chronograph-watch-FCsA8Adcgr4'],
  ['Laura Ockel', 'https://unsplash.com/photos/gold-and-silver-round-accessory-UQ2Fw_9oApU'],
  ['Daniel Forsman', 'https://unsplash.com/photos/a-hand-pulls-a-card-from-the-librarys-card-catalog-Ph4ZJrwf4x8'],
  ['Igor bispo', 'https://unsplash.com/photos/close-up-of-a-luxury-watch-face-LaFLlEKx1c0'],
];

/** Colophon: who built it with what, the data's age, photo credits (ASSETS.md), type, licence and source. */
export function Footer({ generatedAt }: { generatedAt?: string }) {
  return (
    <footer className="bg-surface/40">
      <WaveBand className="h-6 opacity-40" />
      <div className={`${WRAP} grid gap-10 py-16 md:grid-cols-12`}>
        <div className="flex items-start gap-4 md:col-span-5">
          <Hallmark size={52} />
          <div>
            <p className="display text-3xl">Heirloom</p>
            <p className="mt-1 text-muted">Old software, kept honest.</p>
            <p className="mt-2 font-mono text-[0.72rem] text-muted">
              Record {site.record} · {site.object}
            </p>
            <p className="mt-6 text-[0.95rem] text-ink/85">
              Built with neatlogs · Entire · cfo.ai during neatHack
            </p>
          </div>
        </div>
        <dl className="grid gap-x-6 gap-y-3 text-sm text-muted md:col-span-7 md:grid-cols-[7rem_1fr]">
          <dt className="label">Built</dt>
          <dd>
            neatHack, <span className="whitespace-nowrap">Oct 10–12 2026</span>; the 3D movement is procedural three.js
          </dd>
          {generatedAt && (
            <>
              <dt className="label">Data</dt>
              <dd>
                Generated <span className="font-mono text-[0.85em]">{generatedAt}</span> from evals/*.json and the campaign ledger
              </dd>
            </>
          )}
          <dt className="label">Photographs</dt>
          <dd>
            Unsplash, by{' '}
            {PHOTOS.map(([who, url], i) => (
              <span key={url}>
                <a className="link" href={url}>
                  {who}
                </a>
                {i < PHOTOS.length - 2 ? ', ' : i === PHOTOS.length - 2 ? ' and ' : ''}
              </span>
            ))}
            . Graded for this page.
          </dd>
          <dt className="label">Type</dt>
          <dd>Instrument Serif, Geist and Geist Mono (SIL OFL), self-hosted</dd>
          <dt className="label">Source</dt>
          <dd>
            <a className="link" href={`${site.repo}/tree/main/site/web`}>
              site/web
            </a>{' '}
            · MIT ·{' '}
            <a className="link" href={site.repo}>
              github.com/iamdflame/heirloom
            </a>
          </dd>
        </dl>
      </div>
    </footer>
  );
}
