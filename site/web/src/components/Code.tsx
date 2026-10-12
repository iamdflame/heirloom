/** Renders RST ``literal`` spans from advisory titles in mono. */
export function RstTitle({ text }: { text: string }) {
  const parts = text.replace(/\.$/, '').split('``');
  return (
    <>
      {parts.map((p, i) =>
        i % 2 ? (
          <code key={i} className="font-mono text-[0.86em]">
            {p}
          </code>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}
