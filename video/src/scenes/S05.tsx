import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { C, EASE_IN_OUT } from '../theme';
import { beats, io, lerp } from '../lib/anim';
import { KineticTitle } from '../components/Kinetic';
import { CalibrationTriangle, GateChecklist } from '../components/Verdict';
import { CaptureClip } from '../components/Capture';
import { Ground } from '../components/Engraving';
import { chipFor, EXAMPLE, exampleCell, GATES, SITE_URL, UBUNTU, UPSTREAM } from '../data';
import { Kicker, SceneProps, Seq } from './common';

export const S05: React.FC<SceneProps> = ({ scale, frames }) => {
  const frame = useCurrentFrame();
  const b = beats(scale);
  const cut = b(15.0);
  const cell = exampleCell(UPSTREAM.id);
  const noble = exampleCell(UBUNTU.id);
  const side = io(frame, b(11.4), 56, EASE_IN_OUT);
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
      <Seq from={0} to={cut}>
        <Ground ringOpacity={0.05} />
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
          <KineticTitle text="Never trust a test" at={b(0.3)} out={b(3.9)} size={150} align="center" />
          <KineticTitle text="that *hasn't* *failed.*" at={b(0.55)} out={b(3.95)} size={150} align="center" />
        </AbsoluteFill>
        {frame >= b(4.0) && (
          <>
            <Kicker opacity={io(frame, b(4.1), 30)}>
              {EXAMPLE.cve} × {UPSTREAM.name} · RECEIPT
            </Kicker>
            <div style={{ position: 'absolute', left: 0, top: 0, transform: `translate(${lerp(0, -470, side)}px, ${lerp(0, 40, side)}px) scale(${lerp(1, 0.66, side)})`, transformOrigin: '50% 50%', width: 1920, height: 1080 }}>
              <div style={{ position: 'absolute', left: 0, top: 0 }}>
                <CalibrationTriangle
                  width={1920}
                  height={1080}
                  at={b(4.2)}
                  nodes={[
                    { key: 'um', label: 'U⁻', sub: 'upstream before fix', outcomes: cell.runs.um.outcomes, x: 520, y: 330, lightsAt: b(5.5) },
                    { key: 'up', label: 'U⁺', sub: 'after fix', outcomes: cell.runs.up.outcomes, x: 1400, y: 330, lightsAt: b(7.6) },
                    { key: 'lt', label: 'L', sub: UPSTREAM.name, outcomes: cell.runs.lt.outcomes, x: 960, y: 700, lightsAt: b(9.2) },
                  ]}
                  verdict={{ chip: chipFor(cell.verdict), at: b(10.1) }}
                />
              </div>
            </div>
            {frame >= b(11.6) && (
              <div style={{ position: 'absolute', left: 900, top: 310 }}>
                <GateChecklist gates={gates} at={b(11.8)} every={b(0.45)} width={900} />
              </div>
            )}
          </>
        )}
      </Seq>
      <Seq from={cut} to={frames}>
        <Ground ringOpacity={0.04} />
        <CaptureClip id="SH05" label={`Register → ${EXAMPLE.cve} × ${UPSTREAM.name} → receipt certificate`} url={`${SITE_URL} · register`} />
      </Seq>
    </AbsoluteFill>
  );
};
