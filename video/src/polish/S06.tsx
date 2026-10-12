import React from 'react';
import { AbsoluteFill } from 'remotion';
import { C, FONT, VERDICT } from '../theme';
import { LowerThird } from '../components/Overlays';
import { Lights } from '../components/Verdict';
import { Ground } from '../components/Engraving';
import { CONNECTOR, shortDate, SITE_URL, SUMMARY, UNPROVEN_N } from '../data';
import { SceneProps, Seq } from '../scenes/common';
import { CapWin, RIGHT } from './CapWin';
import { Stat } from './Stat';
import { at } from './anchors';

/** The campaign: real footage throughout (SH03 full, then GH06 / SH10 / GH04 in the right 60% window). */
export const S06: React.FC<SceneProps> = ({ frames }) => {
  const tH = Math.round((4 / 1.5) * 60) - 2;
  const t1 = at('S06', '13') - 8;
  const t2 = at('S06', 'Where') - 8;
  const t3 = at('S06', 'when') - 14; // "And when a new fix amended one…"
  const mono = (s: React.ReactNode, color: string = C.brassHi) => <span style={{ fontFamily: FONT.mono, color }}>{s}</span>;
  return (
    <AbsoluteFill>
      <Ground ringOpacity={0.04} />
      {/* "Then we let it run the whole campaign": the site hero scrolls down to "Watch it work" (SH02), then the campaign (SH03) */}
      <Seq from={0} to={tH}>
        <CapWin id="SH02" x={96} y={92} w={1728} h={870} zoom={1.08} fx={0.5} fy={0.48} rate={1.5} push={0.03} url={SITE_URL} />
      </Seq>
      <Seq from={tH} to={t1}>
        <CapWin enter={false} id="SH03" x={96} y={92} w={1728} h={972 - 92 - 10} zoom={1.08} fx={0.5} fy={0.48} rate={1.5} push={0.05} url={`${SITE_URL} · watch it work`} />
        <LowerThird
          at={at('S06', '19') - 4 - tH}
          out={t1 - tH - 10}
          kicker="THE CAMPAIGN"
          title={
            <>
              {mono(SUMMARY.cves)} advisories · replayed in publication order
            </>
          }
          y={700}
        />
      </Seq>
      <Seq from={t1} to={t2}>
        <Stat
          at={0}
          kicker="CANDIDATE BACKPORTS"
          n={SUMMARY.prs}
          title="candidate backports"
          sub={
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                <span style={{ fontFamily: FONT.mono, fontSize: 24, color: C.muted, width: 150 }}>before fix</span>
                <Lights outcomes={['FAIL', 'FAIL', 'FAIL']} at={at('S06', 'fails') - t1} every={6} size={26} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                <span style={{ fontFamily: FONT.mono, fontSize: 24, color: C.muted, width: 150 }}>after fix</span>
                <Lights outcomes={['PASS', 'PASS', 'PASS']} at={at('S06', 'passes') - t1} every={6} size={26} />
              </div>
            </div>
          }
        />
        <CapWin id="GH06" {...RIGHT} zoom={1} fx={0.5} fy={0.45} rate={0.8} url="github.com/iamdflame/django/pulls" />
      </Seq>
      <Seq from={t2} to={t3}>
        <Stat at={0} kicker="UNPROVEN" n={UNPROVEN_N} color={VERDICT.UNPROVEN.color} title={<>evidence filed, <i style={{ color: C.brassHi }}>not guessed</i></>} />
        <CapWin id="SH10" {...RIGHT} zoom={1} fx={0.5} fy={0.5} rate={0.75} url={`${SITE_URL} · evidence`} />
      </Seq>
      <Seq from={t3} to={frames}>
        <Stat
          at={0}
          kicker={`FOLLOW-UP FIX · ${shortDate(CONNECTOR.date).toUpperCase()}`}
          big={<span style={{ fontSize: 170 }}>#{CONNECTOR.pr}</span>}
          title={<>stacked on its own backport, <span style={{ fontFamily: FONT.mono, fontSize: 48, color: C.brassHi }}>#{CONNECTOR.on}</span></>}
        />
        <CapWin id="GH04" {...RIGHT} zoom={1.1} fx={0.45} fy={0.45} rate={0.7} push={0.06} url={`github.com/iamdflame/django/pull/${CONNECTOR.pr}`} />
      </Seq>
    </AbsoluteFill>
  );
};
