import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { C, FONT } from '../theme';
import { beats, io, sec } from '../lib/anim';
import { BacktestSplit } from '../components/Overlays';
import { CaptureClip, hasCapture } from '../components/Capture';
import { Ground, GuillocheRing } from '../components/Engraving';
import { Terminal, TermLine } from '../components/Terminal';
import { BACKTEST, EXAMPLE, terminal } from '../data';
import { Kicker, SceneProps, Seq } from './common';

/** The owner's neatlogs recording goes here (never faked). Drop it in as public/captures/NEATLOGS.mp4. */
const NeatlogsSlot: React.FC = () => {
  const frame = useCurrentFrame();
  if (hasCapture('NEATLOGS')) return <CaptureClip id="NEATLOGS" label="neatlogs trace" url="neatlogs · trace" />;
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div
        style={{
          width: 1600,
          height: 860,
          borderRadius: 20,
          border: `2px dashed ${C.brass}`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 22,
          background: 'rgba(15,17,18,0.8)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div style={{ position: 'absolute', opacity: 0.18, transform: `rotate(${frame * 0.1}deg)` }}>
          <GuillocheRing size={700} at={-999} strokeWidth={0.12} />
        </div>
        <div style={{ fontFamily: FONT.mono, fontSize: 30, letterSpacing: '0.24em', color: C.brassHi }}>OWNER SLOT · 6 s</div>
        <div style={{ fontFamily: FONT.serif, fontSize: 72, color: C.bone }}>neatlogs trace recording</div>
        <div style={{ fontFamily: FONT.mono, fontSize: 24, color: C.muted }}>
          a PR #{EXAMPLE.pr} claim → its trace · drop in video/public/captures/NEATLOGS.mp4
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const S08: React.FC<SceneProps> = ({ scale, frames }) => {
  const b = beats(scale);
  const t1 = b(9.4);
  const t2 = b(12.4);
  const t3 = t2 + sec(6); // the slot is exactly 6 s
  const t4 = t3 + b(2.0);
  const cp = terminal.checkpoint;
  const lines: TermLine[] = [{ text: `$ entire checkpoint explain ${cp.id}`, at: 6, typed: true, cps: 60, color: C.brassHi }];
  cp.lines.slice(0, 14).forEach((l, i) => lines.push({ text: l, at: 6 + 46 + i * 4, color: l.startsWith('##') || l.startsWith('●') ? C.bone : C.muted }));
  return (
    <AbsoluteFill>
      <Ground ringOpacity={0.04} />
      <Seq from={0} to={t1}>
        <Kicker>KNOWN-ANSWER BACKTEST · {BACKTEST.v1.cases} CASES · evals/results.json</Kicker>
        <BacktestSplit at={b(3.4)} v1={BACKTEST.v1} v2={BACKTEST.v2} heirloomDelay={b(7.4) - b(3.4)} />
      </Seq>
      <Seq from={t1} to={t2}>
        <CaptureClip id="GH01" label={`PR #${EXAMPLE.pr}: verdict table → claims table`} url={`github.com/iamdflame/django/pull/${EXAMPLE.pr}`} startFrom={4} />
      </Seq>
      <Seq from={t2} to={t3}>
        <NeatlogsSlot />
      </Seq>
      <Seq from={t3} to={t4}>
        <CaptureClip id="GH05" label="Backport commit: the Entire-Checkpoint: trailer" url="github.com/iamdflame/django · commit" />
      </Seq>
      <Seq from={t4} to={frames}>
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
          <Terminal at={0} width={1500} height={760} title={`entire · ${cp.file}`} lines={lines} fontSize={24} />
        </AbsoluteFill>
      </Seq>
    </AbsoluteFill>
  );
};
