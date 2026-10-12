import React from 'react';
import { AbsoluteFill, interpolate, Sequence, useCurrentFrame } from 'remotion';
import { C, EASE_IN_OUT, FONT, VERDICT } from '../theme';
import { io, lerp, springStamp } from '../lib/anim';
import { Plate } from '../components/Plates';
import { VerdictChip } from '../components/Verdict';
import { KineticTitle } from '../components/Kinetic';
import { Ground } from '../components/Engraving';
import { daysBetween, FINDING, shortDate, terminal, UBUNTU } from '../data';
import { SceneProps } from '../scenes/common';
import { CapWin, RIGHT } from './CapWin';
import { at } from './anchors';

const RED = VERDICT.AFFECTED.color;

/** One terminal line typed token by token (2.5 frames per token); FAIL tokens flash red when they land. */
const TokenLine: React.FC<{ text: string; at: number; color: string; size: number; weight?: number }> = ({ text, at: t0, color, size, weight = 400 }) => {
  const frame = useCurrentFrame();
  if (frame < t0) return null;
  const tokens = text.split(/(\s+)/);
  let k = 0;
  return (
    <div style={{ fontFamily: FONT.mono, fontSize: size, lineHeight: 1.45, color, fontWeight: weight, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
      {tokens.map((tok, i) => {
        if (/^\s+$/.test(tok)) return tok;
        const land = t0 + k++ * 2.5;
        if (frame < land) return null;
        const fail = /FAIL/.test(tok);
        const flash = fail ? Math.max(0, 1 - (frame - land) / 18) : 0;
        return (
          <span
            key={i}
            style={
              fail
                ? { color: RED, fontWeight: 600, background: `rgba(255,107,94,${0.12 + 0.5 * flash})`, boxShadow: `0 0 ${30 * flash}px rgba(255,107,94,${0.8 * flash})`, borderRadius: 4, padding: '0 3px' }
                : undefined
            }
          >
            {tok}
          </span>
        );
      })}
    </div>
  );
};

/** The two date plates, stacked, locking with a stamp hit around the glowing "5 DAYS" band. */
const LockPlates: React.FC<{ inAt: number; lockAt: number; width: number }> = ({ inAt, lockAt, width }) => {
  const frame = useCurrentFrame();
  const sA = springStamp(frame, inAt);
  const sB = springStamp(frame, lockAt - 14);
  const contact = lockAt + 4;
  const hit = frame >= contact ? Math.exp(-(frame - contact) / 6) * Math.cos((frame - contact) * 1.6) : 0;
  const band = io(frame, contact, 24);
  const pulse = 0.8 + 0.2 * Math.sin((frame - contact) / 12);
  const flash = frame >= contact ? Math.exp(-(frame - contact) / 10) : 0;
  const days = daysBetween(FINDING.distro_date, FINDING.advisory_date);
  const plate = (date: string, text: React.ReactNode, s: number, dir: number) => (
    <div style={{ opacity: Math.min(1, s * 1.6), transform: `translateY(${(1 - s) * 80 * dir}px) scale(${1.25 - 0.25 * s})` }}>
      <Plate width={width} pad="26px 40px" glow={band * 0.5}>
        <div style={{ fontFamily: FONT.serif, fontSize: 92, color: C.brassHi, lineHeight: 1 }}>{date}</div>
        <div style={{ marginTop: 12, fontFamily: FONT.sans, fontSize: 32, color: C.bone, lineHeight: 1.3 }}>{text}</div>
      </Plate>
    </div>
  );
  return (
    <div style={{ position: 'relative', transform: `translateY(${hit * 7}px)` }}>
      {plate(shortDate(FINDING.distro_date), <>Ubuntu ships its <span style={{ fontFamily: FONT.mono, color: C.brassHi, whiteSpace: 'nowrap' }}>{FINDING.amends}</span> backport</>, sA, -1)}
      <div style={{ position: 'relative', height: 92, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 22,
            height: 48,
            borderRadius: 48,
            transform: `scaleX(${band})`,
            background: `linear-gradient(90deg, ${C.brassLo}, ${C.brassHi}, ${C.brassLo})`,
            boxShadow: `0 0 ${70 * pulse * band}px rgba(230,203,142,${0.6 * pulse * band})`,
          }}
        />
        <div style={{ position: 'relative', fontFamily: FONT.mono, fontWeight: 600, fontSize: 32, color: C.ink, opacity: band, letterSpacing: '0.2em' }}>{days} DAYS</div>
      </div>
      {plate(shortDate(FINDING.advisory_date), <>Django: <span style={{ fontFamily: FONT.mono, color: C.brassHi, whiteSpace: 'nowrap' }}>{FINDING.cve}</span> amends that fix</>, sB, 1)}
      <div style={{ position: 'absolute', left: '50%', top: '50%', width: 10, height: 10, borderRadius: 10, transform: `translate(-50%,-50%) scale(${1 + (1 - flash) * 90})`, border: `2px solid ${C.brassHi}`, opacity: flash * 0.8 }} />
    </div>
  );
};

export const S03: React.FC<SceneProps> = ({ frames }) => {
  const frame = useCurrentFrame();
  const tWe = at('S03', 'We') - 6; // "We took Ubuntu's source package…": the probe
  const tRun = at('S03', 'ran');
  const tClaim = at('S03', 'and') - 4; // "…and the code path Django closed is still reachable"
  const toClaim = io(frame, tClaim, 24, EASE_IN_OUT);
  const runs = terminal.probe.runs;
  const fix = FINDING.fix_commit.slice(0, 8);
  // the log starts typing as soon as the terminal is up (no empty window), three runs before the claim
  const tLog = tWe + 14;
  const per = Math.round((tClaim - tLog) / 3.3);
  return (
    <AbsoluteFill>
      <Ground ringOpacity={0.05} glow={1.4} />
      <AbsoluteFill style={{ opacity: 1 - toClaim, filter: toClaim > 0 ? `blur(${toClaim * 8}px)` : undefined }}>
        {/* left 40%: the date plates lock on "Five days later" */}
        <div style={{ position: 'absolute', left: 96, top: 64, fontFamily: FONT.mono, fontSize: 22, letterSpacing: '0.16em', color: C.brass }}>THE FINDING · {UBUNTU.name.toUpperCase()}</div>
        <div style={{ position: 'absolute', left: 96, top: 150, width: 640 }}>
          <LockPlates inAt={at('S03', 'October') - 10} lockAt={at('S03', 'Five')} width={640} />
          <div style={{ marginTop: 34, opacity: io(frame, tRun, 24), fontFamily: FONT.mono, fontSize: 22, color: C.muted, lineHeight: 1.5 }}>
            probe <span style={{ color: C.bone }}>hl_cve_2026_87890</span> · hand-written
            <br />
            calibrated on Django&apos;s fix <span style={{ color: C.brassHi }}>{fix}^</span> / <span style={{ color: C.brassHi }}>{fix}</span>
          </div>
        </div>
        {/* right 60%: the site's finding section (SH04), then the real noble probe log */}
        <Sequence from={0} durationInFrames={tWe + 10} layout="none">
          <CapWin id="SH04" {...RIGHT} zoom={1} fx={0.515} fy={0.5} rate={1} push={0.02} url="heirloom-proof.vercel.app · the finding" />
        </Sequence>
        {frame >= tWe && (
          <div style={{ position: 'absolute', left: RIGHT.x, top: RIGHT.y, width: RIGHT.w, height: RIGHT.h, opacity: io(frame, tWe, 12) }}>
            <div style={{ position: 'absolute', left: 4, top: -36, fontFamily: FONT.mono, fontSize: 22, color: C.muted, whiteSpace: 'nowrap' }}>
              <span style={{ color: C.brass }}>●</span> {UBUNTU.name} noble · python-django {UBUNTU.version} · runs ×3
            </div>
            <div style={{ position: 'absolute', inset: 0, borderRadius: 18, background: 'linear-gradient(180deg, #111416 0%, #0B0C0D 100%)', border: `1px solid ${C.line}`, boxShadow: '0 40px 120px rgba(0,0,0,0.7), 0 0 0 1px rgba(200,168,106,0.18)', padding: '26px 30px', overflow: 'hidden' }}>
              {runs.map((r, i) => {
                const t0 = tLog + i * per;
                return (
                  <div key={i} style={{ marginBottom: 14 }}>
                    <TokenLine text={`── ${r.file}   ${r.exit}`} at={t0} color={C.muted} size={22} />
                    <TokenLine text={r.test.replace(' (hl_cve', '\n(hl_cve')} at={t0 + 6} color={C.bone} size={22} />
                    <TokenLine text={r.assertion} at={t0 + 22} color={RED} size={22} weight={500} />
                    <TokenLine text={r.result} at={t0 + 36} color={RED} size={22} />
                  </div>
                );
              })}
              <div style={{ position: 'absolute', right: 30, bottom: 26 }}>
                <VerdictChip chip="AFFECTED" at={tLog + 2 * per + 50} size={34} />
              </div>
            </div>
          </div>
        )}
      </AbsoluteFill>
      {/* the claim fills the frame */}
      {frame >= tClaim && (
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 1680, textAlign: 'center', marginTop: -60, transform: `scale(${lerp(1, 1.03, io(frame, tClaim, frames - tClaim, EASE_IN_OUT))})` }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 44, opacity: io(frame, tClaim + 4, 20) }}>
              <VerdictChip chip="AFFECTED" at={tClaim + 4} size={30} />
            </div>
            <KineticTitle text={FINDING.claim} at={tClaim + 8} size={82} align="center" lineHeight={1.16} stagger={1.6} />
            <div style={{ marginTop: 44, fontFamily: FONT.mono, fontSize: 24, color: C.muted, opacity: io(frame, tClaim + 70, 30) }}>
              hand-written probe, calibrated on Django&apos;s fix commits {fix}^ / {fix}
            </div>
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
