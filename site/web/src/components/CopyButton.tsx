import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

export function CopyButton({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="press inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-chip text-muted hover-ink"
      aria-label={done ? `${label} copied` : `Copy ${label}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          window.setTimeout(() => setDone(false), 1500);
        } catch {
          /* clipboard blocked: the value stays selectable on the page */
        }
      }}
    >
      {done ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
    </button>
  );
}
