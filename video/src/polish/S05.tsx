import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { C, EASE_IN_OUT } from '../theme';
import { beats, io, lerp } from '../lib/anim';
import { KineticTitle } from '../components/Kinetic';
import { CalibrationTriangle, GateChecklist } from '../components/Verdict';
import { Ground } from '../components/Engraving';
import { chipFor, EXAMPLE, exampleCell, GATES, SITE_URL, UBUNTU, UPSTREAM } from '../data';
import { Kicker, SceneProps, Seq } from '../scenes/common';
import { at } from './anchors';
import { CapWin } from './CapWin';

export const S05: React.FC<SceneProps> = ({ scale, frames }) => {
  const frame = useCurrentFrame();
  const b = beats(scale);
  // anchored to the owner's VO: SH05 (register → receipt) on "For each advisory", the triangle's lights on
  // "fails" / "passes", the gates on "and only then", L and the verdict on "is the old version affected?"
  const tCap = at('S05', 'For') - 10;
  const tTri = at('S05', 'proves') - 20;
  const shift = at('S05', 'only') - 10;
  const cell = exampleCell(UPSTREAM.id);
  const noble = exampleCell(UBUNTU.id);
  const side = io(frame, shift, 40, EASE_IN_OUT);
  const gate = (id: string) => cell.gates.find((g) => g.id === id);
  const c4 = noble.gates.find((g) => g.id === 'C4ab')!;
  const gates = [
    { id: 'C1', label: GATES.C1, note: gate('C1')?.detail ?? undefined, ok: !!gate('C1')?.ok },
    { id: 'C2', label: GATES.C2, ok: !!gate('C2')?.ok },
    { id: 'C3', label: GATES.C3, note: gate('C3')?.detail ?? undefined, ok: !!gate('C3')?.ok },
    { id: 'C4', label: GATES.C4ab, note: `${UBUNTU.name} · NOT AFFECTED · ${c4.detail}`, ok: c4.ok },
  ];
  return (
    <AbsoluteFill>
      <Seq from={0} to={tCap}>
        <Ground ringOpacity={0.05} />
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
          <KineticTitle text="Never trust a test" at={b(0.3)} out={tCap - 14} size={150} align="center" />
          <KineticTitle text="that *hasn't* *failed.*" at={at('S05', 'never') - 20} out={tCap - 12} size={150} align="center" />
        </AbsoluteFill>
      </Seq>
      <Seq from={tCap} to={tTri}>
        <CapWin id="SH05" x={96} y={92} w={1728} h={870} zoom={1.05} fx={0.5} fy={0.5} rate={1.6} push={0.06} url={`${SITE_URL} · register → receipt`} />
      </Seq>
      <Seq from={tTri} to={frames}>
        <Ground ringOpacity={0.05} />
        <Kicker opacity={io(frame - tTri, 0, 20)}>
          {EXAMPLE.cve} × {UPSTREAM.name} · RECEIPT
        </Kicker>
        <div style={{ position: 'absolute', left: 0, top: 0, transform: `translate(${lerp(0, -470, side)}px, ${lerp(0, 40, side)}px) scale(${lerp(1, 0.66, side)})`, transformOrigin: '50% 50%', width: 1920, height: 1080 }}>
          <div style={{ position: 'absolute', left: 0, top: 0 }}>
            <CalibrationTriangle
              width={1920}
              height={1080}
              at={0}
              nodes={[
                { key: 'um', label: 'U⁻', sub: 'upstream before fix', outcomes: cell.runs.um.outcomes, x: 520, y: 330, lightsAt: at('S05', 'fails') - tTri },
                { key: 'up', label: 'U⁺', sub: 'after fix', outcomes: cell.runs.up.outcomes, x: 1400, y: 330, lightsAt: at('S05', 'passes') - tTri },
                { key: 'lt', label: 'L', sub: UPSTREAM.name, outcomes: cell.runs.lt.outcomes, x: 960, y: 700, lightsAt: at('S05', 'old') - tTri - 10 },
              ]}
              verdict={{ chip: chipFor(cell.verdict), at: at('S05', 'affected') - tTri }}
            />
          </div>
        </div>
        {frame >= shift && (
          <div style={{ position: 'absolute', left: 900, top: 310 }}>
            <GateChecklist gates={gates} at={shift - tTri + 14} every={b(0.45)} width={900} />
          </div>
        )}
      </Seq>
    </AbsoluteFill>
  );
};
