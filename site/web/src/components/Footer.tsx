import { Seal } from './Seal';
import { REPO } from '@/lib/utils';

export function Footer({ generatedAt }: { generatedAt?: string }) {
  return (
    <footer className="mt-24 border-t border-rule">
      <div className="mx-auto grid max-w-[84rem] gap-6 px-5 py-12 md:grid-cols-12 md:px-10">
        <div className="flex items-start gap-3 md:col-span-5">
          <Seal size={40} />
          <p className="text-lg leading-snug">Heirloom — keeps end-of-life software patched</p>
        </div>
        <dl className="grid gap-x-6 gap-y-2 text-sm text-muted md:col-span-7 md:grid-cols-[auto_1fr]">
          <dt className="label">Type</dt>
          <dd>Newsreader, IBM Plex Mono</dd>
          {generatedAt && (
            <>
              <dt className="label">Data</dt>
              <dd>
                Generated <span className="font-mono text-[0.85em]">{generatedAt}</span> from evals/*.json and the
                campaign ledger
              </dd>
            </>
          )}
          <dt className="label">Built</dt>
          <dd>With neatlogs · Entire · cfo.ai during neatHack</dd>
          <dt className="label">Licence</dt>
          <dd>
            MIT ·{' '}
            <a className="link" href={REPO}>
              github.com/iamdflame/heirloom
            </a>
          </dd>
        </dl>
      </div>
    </footer>
  );
}
