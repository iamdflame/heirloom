import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { C, FONT } from '../theme';
import { io } from '../lib/anim';
import { PrecedentSeal } from '../components/Overlays';
import { Ground } from '../components/Engraving';
import { PRECEDENT, QUERY, SITE_URL } from '../data';
import { SceneProps, Seq } from '../scenes/common';
import { CapWin, RIGHT } from './CapWin';
import { Stat } from './Stat';
import { at } from './anchors';

/** One question: the site thread → issue #6 beside the question count → P001 seal beside the answer → PR #19 reuses it. */
export const S07: React.FC<SceneProps> = ({ frames }) => {
  const frame = useCurrentFrame();
  const t1 = at('S07', 'A') - 8;
  const t2 = at('S07', 'sealed') - 14; // "It sealed the answer as a precedent"
  const t3 = at('S07', 'reused') - 16;
  const reuse = PRECEDENT.applied_by.find((a) => a.cve !== QUERY.asked_by)!;
  const answer = at('S07', 'answered') - t1;
  return (
    <AbsoluteFill>
      <Ground ringOpacity={0.04} />
      <Seq from={0} to={t1}>
        <CapWin id="SH07" x={96} y={92} w={1728} h={870} zoom={1.12} fx={0.55} fy={0.5} startFrom={1.5} push={0.05} url={`${SITE_URL} · the question`} />
      </Seq>
      <Seq from={t1} to={t2}>
        <Stat
          at={0}
          kicker={`${PRECEDENT.kind} · ISSUE #${QUERY.number}`}
          n={1}
          title={<>question in the <i style={{ color: C.brassHi }}>whole campaign</i></>}
          sub={
            <div style={{ fontFamily: FONT.mono, fontSize: 26, color: C.bone, opacity: io(frame - t1, answer, 18) }}>
              /heirloom answer <span style={{ color: C.brassHi }}>{PRECEDENT.answer}</span>
            </div>
          }
        />
        <CapWin id="GH02" {...RIGHT} zoom={1.1} fx={0.4} fy={0.4} startFrom={0.5} rate={1.1} url={`github.com/iamdflame/heirloom/issues/${QUERY.number}`} />
      </Seq>
      <Seq from={t2} to={t3}>
        <div style={{ position: 'absolute', left: 96, top: 64, fontFamily: FONT.mono, fontSize: 22, letterSpacing: '0.16em', color: C.brass }}>
          {PRECEDENT.kind} · ASKED BY {QUERY.asked_by}
        </div>
        <div style={{ position: 'absolute', left: 416 - 190, top: 250 }}>
          <PrecedentSeal at={4} id={PRECEDENT.id} answer={PRECEDENT.answer} size={380} />
        </div>
        <CapWin id="GH02" {...RIGHT} zoom={1.1} fx={0.4} fy={0.7} startFrom={6.5} rate={0.5} enter={false} url={`github.com/iamdflame/heirloom/issues/${QUERY.number}`} />
      </Seq>
      <Seq from={t3} to={frames}>
        <Stat
          at={0}
          kicker={`PRECEDENT ${PRECEDENT.id} · REUSED`}
          big={<span style={{ fontSize: 170 }}>#{reuse.number}</span>}
          title={<>reused it, <i style={{ color: C.brassHi }}>without asking</i></>}
          sub={<span style={{ fontFamily: FONT.mono, fontSize: 26 }}>{reuse.cve}</span>}
        />
        <CapWin id="GH03" {...RIGHT} zoom={1.15} fx={0.4} fy={0.6} startFrom={2} push={0.05} url={`github.com/iamdflame/django/pull/${reuse.number}`} />
      </Seq>
    </AbsoluteFill>
  );
};
