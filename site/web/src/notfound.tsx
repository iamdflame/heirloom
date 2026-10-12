import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Seal } from './components/Seal';
import './index.css';

function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[40rem] flex-col items-start justify-center gap-6 px-6">
      <Seal size={64} />
      <h1 className="text-4xl leading-tight">This accession number is not in the register.</h1>
      <a className="link text-lg" href={import.meta.env.BASE_URL}>
        Back to the register
      </a>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <NotFound />
  </StrictMode>,
);
