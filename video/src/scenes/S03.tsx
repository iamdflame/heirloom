import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { C, EASE_IN_OUT, FONT, VERDICT } from '../theme';
import { beats, io, lerp } from '../lib/anim';
import { DatePlates } from '../components/Plates';
import { Terminal, TermLine } from '../components/Terminal';
import { VerdictChip } from '../components/Verdict';
import { KineticTitle } from '../components/Kinetic';
import { Ground } from '../components/Engraving';
import { daysBetween, FINDING, shortDate, terminal, UBUNTU } from '../data';
import { SceneProps } from './common';

export const S03: React.FC<SceneProps> = ({ scale }) => {
  const frame = useCurrentFrame();
  const b = beats(scale);
  const up = io(frame, b(6.0), 56, EASE_IN_OUT);
  const toClaim = io(frame, b(14.2), 40, EASE_IN_OUT);
  const runs = terminal.probe.runs;
  const red = VERDICT.AFFECTED.color;
  const lines: TermLine[] = [];
  runs.forEach((r, i) => {
    const t0 = b(7.2) + i * b(1.6);
    lines.push({ text: `── ${r.file}   ${r.exit}`, at: t0, color: C.muted, size: 22 });
    lines.push({ text: r.test, at: t0 + 10, color: C.bone, size: 22 });
    lines.push({ text: r.assertion, at: t0 + 26, color: red, weight: 500, size: 22 });
    lines.push({ text: r.result, at: t0 + 38, color: red, size: 22 });
  });
  const fix = FINDING.fix_commit.slice(0, 8);
  return (
    <AbsoluteFill>
      <Ground ringOpacity={0.05} glow={1 + up} />
      <AbsoluteFill style={{ opacity: 1 - toClaim, filter: toClaim > 0 ? `blur(${toClaim * 10}px)` : undefined }}>
        <div style={{ position: 'absolute', left: 0, right: 0, top: lerp(380, 40, up), transform: `scale(${lerp(1, 0.8, up)})`, transformOrigin: '50% 0' }}>
          <DatePlates
            at={b(0.3)}
            lockAt={b(3.0)}
            days={daysBetween(FINDING.distro_date, FINDING.advisory_date)}
            left={{ date: shortDate(FINDING.distro_date), text: <>Ubuntu ships its <span style={{ fontFamily: FONT.mono, color: C.brassHi, whiteSpace: 'nowrap' }}>{FINDING.amends}</span> backport</> }}
            right={{ date: shortDate(FINDING.advisory_date), text: <>Django: <span style={{ fontFamily: FONT.mono, color: C.brassHi, whiteSpace: 'nowrap' }}>{FINDING.cve}</span> amends that fix</> }}
          />
        </div>
        {frame >= b(6.2) && (
          <div style={{ position: 'absolute', left: 140, top: 300 }}>
            <Terminal
              at={b(6.3)}
              width={1640}
              height={630}
              title={`${UBUNTU.name} noble · python-django ${UBUNTU.version} · probe hl_cve_2026_87890 · runs ×3`}
              lines={lines}
              fontSize={22}
            />
            <div style={{ position: 'absolute', right: 48, bottom: 40 }}>
              <VerdictChip chip="AFFECTED" at={b(12.9)} size={34} />
            </div>
          </div>
        )}
      </AbsoluteFill>
      {frame >= b(14.2) && (
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 1500, textAlign: 'center' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 40, opacity: io(frame, b(14.4), 30) }}>
              <VerdictChip chip="AFFECTED" at={b(14.4)} size={26} />
            </div>
            <KineticTitle text={FINDING.claim} at={b(14.6)} size={66} align="center" lineHeight={1.18} stagger={2.2} />
            <div style={{ marginTop: 44, fontFamily: FONT.mono, fontSize: 24, color: C.muted, opacity: io(frame, b(16.4), 36) }}>
              hand-written probe, calibrated on Django&apos;s fix commits {fix}^ / {fix}
            </div>
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
