import { site, longDate, prNum } from '@/lib/site';
import { CatalogueCard } from './CatalogueCard';

export function Hero() {
  const s = site.summary;
  const v = s.verdicts;
  const read = site.links.prs.find((u) => u.endsWith('/pull/13')) ?? site.links.prs[0];
  const q = site.query;
  return (
    <section
      id="top"
      aria-labelledby="headline"
      className="grid gap-x-10 gap-y-10 pb-16 pt-12 md:grid-cols-12 md:pt-16 lg:items-start lg:pt-14 xl:gap-x-14"
    >
      <div className="grid gap-y-8 md:col-span-11 lg:col-span-7">
        <h1
          id="headline"
          className="text-[2.35rem] leading-[1.06] tracking-[-0.02em] sm:text-5xl lg:text-[3.35rem] xl:text-[3.9rem]"
        >
          Django stopped patching 4.2 on {longDate(site.eol)}. Debian 13 and Ubuntu 24.04 still ship it.
        </h1>
        <p className="max-w-[44ch] text-xl leading-snug text-ink md:text-2xl">
          Heirloom is an agent that keeps end-of-life software patched — and proves which old versions are actually
          vulnerable.
        </p>
        <div className="max-w-measure">
          <p className="text-[1.0625rem] leading-relaxed">
            Django published {s.cves} security advisories for its supported versions after 4.2&rsquo;s end of life.
            Heirloom wrote an independent probe for each, calibrated it on Django&rsquo;s own fix, and ran it on the 4.2
            lines people still run. <strong className="font-medium">{s.prs} are fix ready</strong>: candidate backport
            pull requests whose probe fails ×{s.probe_before} before the fix and passes ×{s.probe_after} after it.{' '}
            <strong className="font-medium">{v.NOT_AFFECTED_PROVEN ?? 0} is proven not affected.</strong>{' '}
            <strong className="font-medium">{v.UNPROVEN ?? 0} are unproven</strong>, and for each it filed the evidence
            instead of guessing. It asked {s.questions === 1 ? 'one question' : `${s.questions} questions`} (
            <a className="link" href={q.issue}>
              {prNum(q.issue)}
            </a>
            ); the answer became precedent {q.precedent.id}, which a later backport reused without asking.
          </p>
          <p className="mt-6 font-mono text-xs leading-relaxed tracking-wide text-muted">
            Record {site.record} · {s.cves} advisories · {site.lines.length} release lines · data generated{' '}
            <time dateTime={site.generated_at}>{site.generated_at}</time> · built during neatHack, Oct 10–12 2026
          </p>
          <div className="mt-6 flex flex-wrap gap-x-8 gap-y-2">
            <a
              href="#register"
              className="press inline-flex min-h-11 items-center text-lg underline decoration-ink/40 underline-offset-[0.2em] hover-underline"
            >
              Open the register
            </a>
            {read && (
              <a
                href={read}
                className="press inline-flex min-h-11 items-center text-lg underline decoration-ink/40 underline-offset-[0.2em] hover-underline"
              >
                Read a backport ({prNum(read)})
              </a>
            )}
          </div>
        </div>
      </div>
      <CatalogueCard className="md:col-span-9 lg:col-span-5 lg:mt-2" />
    </section>
  );
}
