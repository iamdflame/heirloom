import React from 'react';
import { AbsoluteFill } from 'remotion';
import { C, FONT, VERDICT } from '../theme';
import { beats } from '../lib/anim';
import { LowerThird } from '../components/Overlays';
import { CaptureClip } from '../components/Capture';
import { Ground } from '../components/Engraving';
import { CONNECTOR, shortDate, SITE_URL, SUMMARY, UNPROVEN_N } from '../data';
import { SceneProps, Seq } from './common';

export const S06: React.FC<SceneProps> = ({ scale, frames }) => {
  const b = beats(scale);
  const t1 = b(7.4);
  const t2 = b(12.8);
  const t3 = b(19.0);
  const mono = (s: React.ReactNode, color: string = C.brassHi) => <span style={{ fontFamily: FONT.mono, color }}>{s}</span>;
  return (
    <AbsoluteFill>
      <Ground ringOpacity={0.04} />
      <Seq from={0} to={t1}>
        <CaptureClip id="SH03" label="“Watch it work”: the campaign dial turning, tiles stamping in" url={`${SITE_URL} · watch it work`} />
      </Seq>
      <Seq from={t1} to={t2}>
        <CaptureClip id="GH06" label="The fork's pull-request list: 13 candidate backports" url="github.com/iamdflame/django/pulls" enter={false} />
        <LowerThird
          at={b(0.5)}
          out={t2 - t1 - 6}
          kicker="CANDIDATE BACKPORTS"
          title={
            <>
              {SUMMARY.prs} candidate backports · {mono(`FAIL×${SUMMARY.probe_before}`, VERDICT.AFFECTED.color)} → {mono(`PASS×${SUMMARY.probe_after}`, VERDICT.FIX_READY.color)}
            </>
          }
        />
      </Seq>
      <Seq from={t2} to={t3}>
        <CaptureClip id="SH03" startFrom={7.4} label="“Watch it work”: UNPROVEN tiles file evidence" url={`${SITE_URL} · watch it work`} enter={false} />
        <LowerThird
          at={b(0.5)}
          out={t3 - t2 - 6}
          kicker="UNPROVEN"
          title={
            <>
              {mono(UNPROVEN_N, VERDICT.UNPROVEN.color)} unproven → evidence filed, not guessed
            </>
          }
        />
      </Seq>
      <Seq from={t3} to={frames}>
        <CaptureClip id="GH04" label={`PR #${CONNECTOR.pr}: “Stacked on #${CONNECTOR.on}”`} url={`github.com/iamdflame/django/pull/${CONNECTOR.pr}`} enter={false} />
        <LowerThird
          at={b(1.2)}
          out={frames - t3 - 4}
          kicker="FOLLOW-UP FIX"
          title={
            <>
              {shortDate(CONNECTOR.date)} · stacked on its own backport · {mono(`PR #${CONNECTOR.pr} on #${CONNECTOR.on}`)}
            </>
          }
        />
      </Seq>
    </AbsoluteFill>
  );
};
