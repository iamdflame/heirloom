import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { C, FONT, VERDICT } from '../theme';
import { io, springStamp } from '../lib/anim';
import { LowerThird } from '../components/Overlays';
import { Counter } from '../components/Kinetic';
import { Ground } from '../components/Engraving';
import { Terminal, TermLine } from '../components/Terminal';
import { CapWin, hasNeatlogs, RIGHT } from './CapWin';
import { BACKTEST, EXAMPLE, SITE_URL, terminal } from '../data';
import { SceneProps, Seq } from '../scenes/common';
import { at } from './anchors';

/** Compact backtest for the left column: naive 1 (red) lands on "called…safe", Heirloom 0 (green) on "Zero times". */
const Backtest: React.FC<{ naiveAt: number; heirloomAt: number }> = ({ naiveAt, heirloomAt }) => {
  const frame = useCurrentFrame();
  const row = (label: string, n: number, col: string, t: number, enter: number) => {
    const s = springStamp(frame, t);
    return (
      <div style={{ opacity: io(frame, enter, 18), marginBottom: 34 }}>
        <div style={{ fontFamily: FONT.mono, fontSize: 24, letterSpacing: '0.18em', color: C.muted }}>{label}</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 26 }}>
          <div style={{ position: 'relative', width: 150, fontFamily: FONT.serif, fontSize: 200, lineHeight: 1, color: col, textShadow: `0 0 60px ${col}55` }}>
            <span style={{ position: 'absolute', left: 0, color: C.line, textShadow: 'none', opacity: 1 - Math.min(1, s) }}>·</span>
            <span style={{ display: 'inline-block', opacity: Math.min(1, s * 1.5), transform: `scale(${1.35 - 0.35 * s})`, transformOrigin: '30% 70%' }}>
              <Counter from={0} to={n} at={t} dur={20} />
            </span>
          </div>
          <div style={{ fontFamily: FONT.sans, fontSize: 32, lineHeight: 1.3, color: C.bone }}>
            false “not affected”
            <div style={{ fontFamily: FONT.mono, fontSize: 22, color: C.muted }}>{BACKTEST.v1.cases} known-answer cases</div>
          </div>
        </div>
      </div>
    );
  };
  return (
    <div style={{ position: 'absolute', left: 96, top: 170, width: 660 }}>
      <div style={{ fontFamily: FONT.mono, fontSize: 22, letterSpacing: '0.16em', color: C.brass, marginBottom: 40 }}>KNOWN-ANSWER BACKTEST · evals/results.json</div>
      {row('NAIVE PIPELINE', BACKTEST.v1.false_not_affected, VERDICT.AFFECTED.color, naiveAt, 10)}
      <div style={{ height: 1, width: 560, background: `linear-gradient(90deg, ${C.brass}, transparent)`, margin: '0 0 34px', transform: `scaleX(${io(frame, 20, 40)})`, transformOrigin: '0 0' }} />
      {row('HEIRLOOM', BACKTEST.v2.false_not_affected, VERDICT.FIX_READY.color, heirloomAt, 26)}
    </div>
  );
};

export const S08: React.FC<SceneProps> = ({ frames }) => {
  const t1 = at('S08', 'Every') - 8;
  const tSpan = at('S08', 'neatlogs');
  const t2 = at('S08', 'and') - 8; // "…and every backport links the Entire session…"
  const cp = terminal.checkpoint;
  const lines: TermLine[] = [{ text: `$ entire checkpoint explain ${cp.id}`, at: 14, typed: true, cps: 70, color: C.brassHi, size: 20 }];
  cp.lines.slice(0, 13).forEach((l, i) => lines.push({ text: l, at: 14 + 40 + i * 4, color: l.startsWith('##') || l.startsWith('●') ? C.bone : C.muted, size: 20 }));
  return (
    <AbsoluteFill>
      <Ground ringOpacity={0.04} />
      <Seq from={0} to={t1}>
        <Backtest naiveAt={at('S08', 'called')} heirloomAt={at('S08', 'Zero')} />
        <CapWin id="SH08" {...RIGHT} zoom={1} fx={0.5} fy={0.5} rate={0.65} url={`${SITE_URL} · proof`} />
      </Seq>
      <Seq from={t1} to={t2}>
        {hasNeatlogs() ? (
          <CapWin id="NEATLOGS" x={96} y={92} w={1728} h={870} url="neatlogs · trace" />
        ) : (
          <>
            {/* no owner recording: PR #13's claims table, pushing toward its Span column (the neatlogs trace/span links) */}
            <CapWin id="GH01" x={96} y={92} w={1728} h={870} zoom={1.25} fx={0.62} fy={0.42} startFrom={5.5} rate={0.9} push={0.12} url={`github.com/iamdflame/django/pull/${EXAMPLE.pr} · claims`} />
            <LowerThird at={tSpan - t1 - 30} out={t2 - t1 - 4} kicker="EVERY CLAIM · A NEATLOGS SPAN" title={<>PR #{EXAMPLE.pr}: claim → <span style={{ fontFamily: FONT.mono, color: C.brassHi }}>trace · span</span> link</>} y={760} width={900} />
          </>
        )}
      </Seq>
      <Seq from={t2} to={frames}>
        <div style={{ position: 'absolute', left: 96, top: 118 }}>
          <Terminal at={0} width={660} height={772} title={`entire · ${cp.file.split('/').pop()}`} lines={lines} fontSize={20} />
        </div>
        <CapWin id="GH05" {...RIGHT} zoom={1.45} fx={0.27} fy={0.5} push={0.08} url="github.com/iamdflame/django · commit · Entire-Checkpoint:" />
      </Seq>
    </AbsoluteFill>
  );
};
