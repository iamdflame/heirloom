import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { C, FONT } from '../theme';
import { beats, io } from '../lib/anim';
import { LowerThird, PrecedentSeal } from '../components/Overlays';
import { CaptureClip } from '../components/Capture';
import { Ground } from '../components/Engraving';
import { PRECEDENT, QUERY, SITE_URL } from '../data';
import { Kicker, SceneProps, Seq } from './common';

export const S07: React.FC<SceneProps> = ({ scale, frames }) => {
  const frame = useCurrentFrame();
  const b = beats(scale);
  const t1 = b(5.2);
  const t2 = b(10.0);
  const t3 = b(13.4);
  const reuse = PRECEDENT.applied_by.find((a) => a.cve !== QUERY.asked_by)!;
  return (
    <AbsoluteFill>
      <Ground ringOpacity={0.04} />
      <Seq from={0} to={t1}>
        <CaptureClip id="SH07" label="The question thread: one question in the whole campaign" url={`${SITE_URL} · the question`} />
      </Seq>
      <Seq from={t1} to={t2}>
        <CaptureClip id="GH02" label={`Issue #${QUERY.number}: the question → the owner's /heirloom answer ${PRECEDENT.answer}`} url={`github.com/iamdflame/heirloom/issues/${QUERY.number}`} enter={false} />
      </Seq>
      <Seq from={t2} to={t3}>
        <Ground ringOpacity={0.08} glow={1.8} />
        <Kicker>
          {PRECEDENT.kind} · ASKED BY {QUERY.asked_by}
        </Kicker>
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ marginTop: -80 }}>
            <PrecedentSeal at={b(0.6)} id={PRECEDENT.id} answer={PRECEDENT.answer} size={440} />
          </div>
        </AbsoluteFill>
      </Seq>
      <Seq from={t3} to={frames}>
        <CaptureClip id="GH03" label={`PR #${reuse.number} cites ${PRECEDENT.id}`} url={`github.com/iamdflame/django/pull/${reuse.number}`} />
        <LowerThird
          at={b(0.6)}
          out={frames - t3}
          kicker={`PRECEDENT ${PRECEDENT.id} · REUSED`}
          title={
            <>
              <span style={{ fontFamily: FONT.mono, color: C.brassHi }}>PR #{reuse.number}</span> · {reuse.cve}
            </>
          }
          width={760}
        />
      </Seq>
      <div style={{ opacity: io(frame, 0, 1) }} />
    </AbsoluteFill>
  );
};
