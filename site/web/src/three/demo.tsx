import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import HeroScene, { canRender3D } from './HeroScene';

// Isolated page for screenshots and posters: /three-demo.html?progress=0.3&variant=finale&still=1&text=1
const q = new URLSearchParams(location.search);
const still = q.has('still');
const variant = q.get('variant') === 'finale' ? 'finale' : 'hero';
const shotQ = q.get('shot');
const shot = shotQ === 'orbit' || shotQ === 'macro' || shotQ === 'speed' ? shotQ : undefined;
const fixed = q.get('progress') ?? (shot ? '0' : null);

function Demo() {
  const [p, setP] = useState(fixed ? Number(fixed) : 0);
  useEffect(() => {
    if (fixed) return;
    const on = () => setP(Math.min(1, window.scrollY / Math.max(1, document.body.scrollHeight - innerHeight)));
    addEventListener('scroll', on, { passive: true });
    return () => removeEventListener('scroll', on);
  }, []);
  return (
    <>
      <div style={{ position: 'fixed', inset: 0 }}>
        <HeroScene
          progress={p}
          variant={variant}
          still={still}
          shot={shot}
          onReady={() => setTimeout(() => document.documentElement.setAttribute('data-ready', '1'), 600)}
        />
      </div>
      {q.has('text') && (
        <div style={{ position: 'fixed', left: '6vw', top: '34vh', color: '#ECE6DA', font: '400 88px/1 Georgia, serif', pointerEvents: 'none' }}>
          Old software,
          <br />
          <i style={{ color: '#E6CB8E' }}>kept honest.</i>
          <div style={{ font: '400 14px/1.4 monospace', color: '#9A958A', marginTop: 24 }}>canRender3D() = {String(canRender3D())}</div>
        </div>
      )}
      {!fixed && <div style={{ height: '300vh' }} />}
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Demo />
  </StrictMode>,
);
